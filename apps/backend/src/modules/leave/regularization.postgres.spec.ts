import { randomUUID } from 'node:crypto';
import { PrismaClient, UserRole, LeaveType } from '@prisma/client';
import { PrismaService } from '@common/prisma/prisma.service';
import { lockEmployeeLeave } from '@common/utils/leave-locks';
import { DataScopeService } from '@common/services/data-scope.service';
import { ApprovalEngineService } from './approval-engine.service';
import { LeaveService } from './leave.service';

const connection = process.env.ZENHR_HR15_TEST_DATABASE_URL;
(connection ? describe : describe.skip)('exceptional leave and regularization on disposable PostgreSQL', () => {
  let db: PrismaClient;
  let service: LeaveService;
  beforeAll(() => {
    const target = new URL(connection!);
    if (target.protocol !== 'postgresql:' || target.hostname !== '127.0.0.1' ||
        target.username !== 'hr15_test' || !['/zenhr_hr15_disposable', '/zenhr_hr15_fresh'].includes(target.pathname)) {
      throw new Error('Use the dedicated loopback test cluster.');
    }
    db = new PrismaClient({ datasourceUrl: connection });
    service = new LeaveService(db as unknown as PrismaService, new ApprovalEngineService(),
      {} as never, {} as never, new DataScopeService());
    jest.useFakeTimers({ doNotFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'setImmediate', 'clearImmediate', 'nextTick', 'queueMicrotask'] });
    jest.setSystemTime(new Date('2027-01-05T15:00:00Z'));
  });
  afterAll(async () => { jest.useRealTimers(); await db?.$disconnect(); });

  async function fixture(type: LeaveType) {
    const key = randomUUID();
    const company = await db.company.create({ data: { slug: key, name: 'Fixture', email: `${key}@example.test`,
      timezone: 'Asia/Karachi', regularizationEnabled: true, regularizationExceptional: true } });
    const makeUser = (role: UserRole) => db.user.create({ data: { email: `${role}-${key}@example.test`,
      companyId: company.id, passwordHash: 'fixture', role, dataScope: 'COMPANY' } });
    const [applicant, ceo, hr] = await Promise.all([makeUser(UserRole.HR_MANAGER), makeUser(UserRole.COMPANY_ADMIN),
      db.user.create({ data: { companyId: company.id, email: `reviewer-${key}@example.test`, passwordHash: 'fixture',
        role: UserRole.HR_MANAGER, dataScope: 'COMPANY' } })]);
    const employee = await db.employee.create({ data: { companyId: company.id, userId: applicant.id,
      hireDate: new Date('2025-01-01'), employeeCode: key, firstName: 'Fixture', lastName: 'Employee' } });
    const dates = ['2026-12-29', '2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02'];
    const scope = { companyId: company.id, employeeId: employee.id };
    await db.attendanceRecord.createMany({ data: dates.map((date) => ({ ...scope, date: new Date(date), status: 'ABSENT' })) });
    const setting = await db.leaveTypeSetting.create({ data: { companyId: company.id, leaveType: type,
      isPaid: type !== 'UNPAID', enforceEntitlement: type === 'CASUAL', annualAllocation: type === 'CASUAL' ? 5 : 0 } });
    if (type === 'UNPAID') await db.leaveBalance.createMany({ data: [2026, 2027].map((year) => ({
      ...scope, leaveType: 'CASUAL', year, allocated: 5, used: 5,
    })) });
    const submit = (startDate = dates[0], endDate = dates[4], mode: 'RETROSPECTIVE' | 'PROSPECTIVE' = 'RETROSPECTIVE') =>
      service.createLeaveRequest(company.id, applicant.id, { leaveTypeSettingId: setting.id,
        startDate, endDate, mode, reason: 'Unexpected family emergency' });
    const approve = (id: string) => service.approveStep1(company.id, id, ceo.id, ceo.role, {
      decision: 'PARTIAL', approvedStart: dates[1], approvedEnd: dates[3], partialReason: 'Verified three dates',
    });
    return { company, applicant, ceo, hr, employee, dates, setting, scope, submit, approve };
  }

  it.each([LeaveType.UNPAID, LeaveType.CASUAL])('settles cross-year partial retrospective %s exactly once', async (type) => {
    const f = await fixture(type);
    const { company, applicant, employee, dates, scope } = f;
    expect((await service.getEligibleAbsences(company.id, applicant.id)).dates).toEqual(dates);
    await expect(f.submit(dates[0], dates[4], 'PROSPECTIVE')).rejects.toThrow('Use Regularize Absence');
    const submitted = await Promise.allSettled([f.submit(), f.submit()]);
    expect(submitted.map(({ status }) => status).sort()).toEqual(['fulfilled', 'rejected']);
    const winner = submitted.find((result) => result.status === 'fulfilled');
    if (!winner) throw new Error('No request created');
    const request = winner.value;
    expect((await service.getEligibleAbsences(company.id, applicant.id)).dates).toEqual([]);
    expect(request.balanceDaysByYear).toEqual([{ year: 2026, days: 3 }, { year: 2027, days: 2 }]);
    if (type === 'UNPAID') {
      await expect(service.approveStep1(company.id, request.id, f.hr.id, f.hr.role, { decision: 'APPROVE' }))
        .rejects.toThrow('Only the CEO');
      await db.leaveTypeSetting.update({ where: { id: f.setting.id }, data: { isActive: false, enforceEntitlement: true } });
    }
    const finalized = await Promise.allSettled([f.approve(request.id), f.approve(request.id)]);
    expect(finalized.map(({ status }) => status).sort()).toEqual(['fulfilled', 'rejected']);
    const saved = await db.leaveRequest.findUniqueOrThrow({ where: { id: request.id } });
    expect(saved).toMatchObject({ status: 'APPROVED', approvedDays: 3, step1ActorId: f.ceo.id,
      approvedDaysByYear: [{ year: 2026, days: 2 }, { year: 2027, days: 1 }],
      policySnapshot: { isPaid: type !== 'UNPAID', enforceEntitlement: type === 'CASUAL' } });
    const rows = await db.attendanceRecord.findMany({ where: scope, orderBy: { date: 'asc' } });
    expect(rows.map(({ status }) => status)).toEqual(['ABSENT', 'ON_LEAVE', 'ON_LEAVE', 'ON_LEAVE', 'ABSENT']);
    expect((await service.getEligibleAbsences(company.id, applicant.id)).dates).toEqual([dates[0], dates[4]]);
    const balances = await db.leaveBalance.findMany({ where: scope, orderBy: { year: 'asc' } });
    expect(balances.map(({ leaveType, pending, used }) => ({ leaveType, pending, used }))).toEqual(
      (type === 'UNPAID' ? [5, 5] : [2, 1]).map((used) => ({ leaveType: 'CASUAL', pending: 0, used })));
    const audits = await db.auditLog.findMany({ where: { companyId: company.id, entity: 'AttendanceRecord' } });
    expect(audits).toHaveLength(3);
    expect(audits[0]).toMatchObject({ userId: f.ceo.id, oldValues: { status: 'ABSENT' },
      newValues: { employeeId: employee.id, leaveRequestId: saved.id, status: 'ON_LEAVE' } });
    expect(await db.notification.count({ where: { companyId: company.id, type: 'LEAVE_APPROVED',
      data: { path: ['leaveRequestId'], equals: saved.id } } })).toBe(1);
  }, 30000);

  it('enforces disabled policies, company-local lookback, supporting documents and ownership', async () => {
    const f = await fixture(LeaveType.UNPAID);
    await service.updateLeaveType(f.company.id, f.setting.id, { isActive: false });
    await expect(f.submit()).rejects.toThrow('inactive');
    await expect(service.updateLeaveType(f.company.id, f.setting.id, { isPaid: true })).rejects.toThrow('incompatible');
    await service.updateLeaveType(f.company.id, f.setting.id, { isActive: true });
    await expect(service.getEligibleAbsences(f.company.id, f.ceo.id)).rejects.toThrow('profile not found');
    await service.updateRegularizationPolicy(f.company.id, { regularizationEnabled: false });
    await expect(f.submit()).rejects.toThrow('disabled');
    await service.updateRegularizationPolicy(f.company.id, { regularizationEnabled: true, regularizationLookback: 3 });
    // It is already January 6 in Karachi. January 2 is outside the three-day window.
    jest.setSystemTime(new Date('2027-01-05T20:00:00Z'));
    try {
      await expect(f.submit(f.dates[4], f.dates[4])).rejects.toThrow('lookback');
      expect((await service.getEligibleAbsences(f.company.id, f.applicant.id)).dates).toEqual([]);
    } finally {
      jest.setSystemTime(new Date('2027-01-05T15:00:00Z'));
    }
    await service.updateRegularizationPolicy(f.company.id, { regularizationLookback: 30, regularizationDocument: true });
    await expect(f.submit()).rejects.toThrow('supporting document');
    await service.updateRegularizationPolicy(f.company.id, { regularizationDocument: false });
    await expect(f.submit('2027-01-04', '2027-01-04')).rejects.toThrow('Every historical date');
    await expect(f.submit('2027-01-04', '2027-01-05')).rejects.toThrow('only past dates');
    await db.attendanceRecord.updateMany({ where: { ...f.scope, date: new Date(f.dates[1]) },
      data: { status: 'HALF_DAY', checkInTime: new Date('2026-12-30T04:00:00Z') } });
    await expect(f.submit()).rejects.toThrow('Every historical date');
    expect((await service.getEligibleAbsences(f.company.id, f.applicant.id)).dates).not.toContain(f.dates[1]);
    expect(await db.leaveRequest.count({ where: f.scope })).toBe(0);
  }, 30000);

  it('blocks final conversion when payroll is paid while approval waits for the payroll lock', async () => {
    const f = await fixture(LeaveType.CASUAL);
    const request = await f.submit();
    const slip = await db.payslip.create({ data: { ...f.scope, month: 12, year: 2026,
      baseSalary: 1000, netSalary: 1000, status: 'GENERATED' } });
    let release!: () => void;
    let locked!: () => void;
    const ready = new Promise<void>((resolve) => { locked = resolve; });
    const barrier = new Promise<void>((resolve) => { release = resolve; });
    const finalizing = db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${'zenhr-payroll:' + f.company.id}, 0))`;
      locked();
      await barrier;
      await tx.payslip.update({ where: { id: slip.id }, data: { status: 'PAID' } });
    });
    await ready;
    const approving = f.approve(request.id);
    release();
    await finalizing;
    await expect(approving).rejects.toThrow('paid payroll period');
    expect(await db.leaveRequest.findUnique({ where: { id: request.id } })).toMatchObject({ status: 'PENDING' });
    expect(await db.attendanceRecord.count({ where: { ...f.scope, status: 'ON_LEAVE' } })).toBe(0);
    expect(await db.leaveBalance.findMany({ where: f.scope, orderBy: { year: 'asc' }, select: { pending: true, used: true } }))
      .toEqual([{ pending: 3, used: 0 }, { pending: 2, used: 0 }]);
    expect(await db.payslip.findUnique({ where: { id: slip.id } })).toMatchObject({ status: 'PAID', netSalary: slip.netSalary });
  }, 30000);

  it('rejects conversion when a timer was created under the same employee lock', async () => {
    const f = await fixture(LeaveType.UNPAID);
    const request = await f.submit();
    await db.$transaction(async (tx) => {
      await lockEmployeeLeave(tx, f.scope.companyId, f.scope.employeeId);
      await tx.workTimerEntry.create({ data: { ...f.scope, date: new Date('2026-12-31'),
        startedAt: new Date('2026-12-31T12:00:00Z') } });
    });
    await expect(f.approve(request.id)).rejects.toThrow('no punch or work timer');
    expect(await db.leaveRequest.findUnique({ where: { id: request.id } })).toMatchObject({ status: 'PENDING' });
    expect(await db.attendanceRecord.count({ where: { ...f.scope, status: 'ON_LEAVE' } })).toBe(0);
  }, 30000);
});
