import { randomUUID } from 'node:crypto';
import { DataScope, LeaveType, PrismaClient, UserRole } from '@prisma/client';
import { PrismaService } from '@common/prisma/prisma.service';
import { DataScopeService } from '@common/services/data-scope.service';
import { ApprovalEngineService } from './approval-engine.service';
import { LeaveService } from './leave.service';

const connection = process.env.ZENHR_HR15_TEST_DATABASE_URL;
(connection ? describe : describe.skip)('partial leave on disposable PostgreSQL', () => {
  let db: PrismaClient;
  beforeAll(() => {
    const url = new URL(connection!);
    if (url.protocol !== 'postgresql:' || url.hostname !== '127.0.0.1' ||
        url.pathname !== '/zenhr_hr15_disposable' || url.username !== 'hr15_test') {
      throw new Error('Use the dedicated loopback zenhr_hr15_disposable database.');
    }
    db = new PrismaClient({ datasourceUrl: connection });
  });
  afterAll(async () => { await db?.$disconnect(); });

  it('serializes submissions and final decisions, uses effective dates, and settles each year', async () => {
    const key = randomUUID();
    const company = await db.company.create({ data: { name: 'Fixture', slug: key, email: `${key}@example.test` } });
    const user = await db.user.create({ data: {
      companyId: company.id, email: `hr-${key}@example.test`, passwordHash: 'fixture',
      role: UserRole.HR_MANAGER, dataScope: DataScope.COMPANY,
    } });
    const ceo = await db.user.create({ data: {
      companyId: company.id, email: `ceo-${key}@example.test`, passwordHash: 'fixture',
      role: UserRole.COMPANY_ADMIN, dataScope: DataScope.COMPANY,
    } });
    const employee = await db.employee.create({ data: {
      companyId: company.id, userId: user.id, employeeCode: key, firstName: 'Fixture', lastName: 'HR',
      hireDate: new Date('2024-01-01'),
    } });
    const setting = await db.leaveTypeSetting.create({ data: {
      companyId: company.id, leaveType: LeaveType.ANNUAL, annualAllocation: 10, requiresReason: false,
    } });
    const service = new LeaveService(db as unknown as PrismaService, new ApprovalEngineService(),
      {} as never, {} as never, new DataScopeService());
    const submit = (startDate: string, endDate: string) => service.createLeaveRequest(company.id, user.id, {
      leaveTypeSettingId: setting.id, startDate, endDate,
    });
    const concurrent = await Promise.allSettled([submit('2026-12-28', '2027-01-06'), submit('2026-12-28', '2027-01-06')]);
    expect(concurrent.filter((result) => result.status === 'rejected')).toHaveLength(1);
    const accepted = concurrent.find((result) => result.status === 'fulfilled');
    if (!accepted) throw new Error('No request submitted');
    const id = accepted.value.id;
    const approve = () => service.approveStep1(company.id, id, ceo.id, ceo.role, {
      decision: 'PARTIAL', approvedStart: '2026-12-30', approvedEnd: '2027-01-03', partialReason: 'Year end coverage',
    });
    const decisions = await Promise.allSettled([approve(), approve()]);
    expect(decisions.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
    const saved = await db.leaveRequest.findUniqueOrThrow({ where: { id } });
    expect(saved).toMatchObject({
      totalDays: 10, status: 'APPROVED', approvedDays: 5, step1ActorId: ceo.id,
      balanceDaysByYear: [{ year: 2026, days: 4 }, { year: 2027, days: 6 }],
      approvedDaysByYear: [{ year: 2026, days: 2 }, { year: 2027, days: 3 }],
    });
    const balances = await service.getLeaveBalances(company.id, employee.id, 2026, user);
    expect(balances).toContainEqual(expect.objectContaining({ used: 2, pending: 0, available: 8 }));
    const next = await service.getLeaveBalances(company.id, employee.id, 2027, user);
    expect(next).toContainEqual(expect.objectContaining({ used: 3, pending: 0, available: 7 }));
    const attendance = await db.attendanceRecord.findMany({ where: { employeeId: employee.id }, orderBy: { date: 'asc' } });
    expect(attendance.map(({ date }) => date.toISOString().slice(0, 10)))
      .toEqual(['2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02', '2027-01-03']);
    expect(await db.notification.count({ where: { companyId: company.id, type: 'LEAVE_APPROVED' } })).toBe(1);
    const overlaps = await Promise.allSettled([submit('2027-01-03', '2027-01-04'), submit('2027-01-05', '2027-01-06')]);
    expect(overlaps.map(({ status }) => status)).toEqual(['rejected', 'fulfilled']);
    const released = overlaps[1];
    if (released.status !== 'fulfilled') throw new Error('Released dates were not available');
    const reject = () => service.approveStep1(company.id, released.value.id, ceo.id, ceo.role, {
      decision: 'REJECT', notes: 'No coverage',
    });
    const rejected = await Promise.allSettled([reject(), reject()]);
    expect(rejected.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
    expect(await db.notification.count({ where: { companyId: company.id, type: 'LEAVE_REJECTED' } })).toBe(1);
    expect(await service.getLeaveBalances(company.id, employee.id, 2027, user))
      .toContainEqual(expect.objectContaining({ used: 3, pending: 0, available: 7 }));

  }, 30000);
});
