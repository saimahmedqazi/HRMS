import { ConflictException } from '@nestjs/common';
import { PrismaClient, LeaveType } from '@prisma/client';
import { ApprovalEngineService } from './approval-engine.service';
import { LeaveService } from './leave.service';

function getLoopbackPgUrl(): string | null {
  const raw = process.env.ZENHR_PG_TEST_URL || process.env.ZENHR_E2E_DATABASE_URL || process.env.DATABASE_URL;
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (['postgres:', 'postgresql:'].includes(url.protocol) && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) {
      return raw;
    }
  } catch {
    return null;
  }
  return null;
}

const pgUrl = getLoopbackPgUrl();
const describePg = pgUrl ? describe : describe.skip;

describePg('LeaveService PostgreSQL Advisory Lock & Concurrency Regression (DEF-01 / HR-07)', () => {
  let prisma: PrismaClient;
  let leaveService: LeaveService;
  let companyId: string;
  let userId: string;
  let employeeId: string;
  let leaveTypeSettingId: string;

  beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: pgUrl! });
    await prisma.$connect();

    const mailService = { sendMail: jest.fn().mockResolvedValue(undefined) } as any;
    const dataScopeService = { resolveEmployeeScope: jest.fn() } as any;
    const storage = { uploadFile: jest.fn(), deleteFile: jest.fn() } as any;
    const approvalEngine = new ApprovalEngineService();

    leaveService = new LeaveService(prisma as any, approvalEngine, storage, mailService, dataScopeService);

    const suffix = `pgreg_${Date.now()}`;
    const company = await prisma.company.create({
      data: { name: `PG Reg ${suffix}`, slug: suffix, email: `${suffix}@qa.test` },
    });
    companyId = company.id;

    const user = await prisma.user.create({
      data: {
        email: `${suffix}@qa.test`,
        passwordHash: 'hash',
        role: 'EMPLOYEE',
        dataScope: 'SELF',
        companyId,
      },
    });
    userId = user.id;

    await prisma.user.create({
      data: {
        email: `hr-${suffix}@qa.test`,
        passwordHash: 'hash',
        role: 'HR_MANAGER',
        dataScope: 'COMPANY',
        companyId,
      },
    });

    const employee = await prisma.employee.create({
      data: {
        companyId,
        userId,
        employeeCode: `EMP-${suffix}`,
        firstName: 'PG',
        lastName: 'Tester',
        hireDate: new Date('2025-01-01'),
        status: 'ACTIVE',
      },
    });
    employeeId = employee.id;

    const lts = await prisma.leaveTypeSetting.create({
      data: { companyId, leaveType: LeaveType.ANNUAL, annualAllocation: 20, requiresReason: true },
    });
    leaveTypeSettingId = lts.id;

    await prisma.leaveBalance.createMany({
      data: [
        { companyId, employeeId, leaveType: LeaveType.ANNUAL, year: 2026, allocated: 20, pending: 0, used: 0 },
        { companyId, employeeId, leaveType: LeaveType.ANNUAL, year: 2027, allocated: 20, pending: 0, used: 0 },
      ],
    });
  });

  afterAll(async () => {
    if (companyId) {
      await prisma.leaveRequest.deleteMany({ where: { companyId } });
      await prisma.leaveBalance.deleteMany({ where: { companyId } });
      await prisma.leaveTypeSetting.deleteMany({ where: { companyId } });
      await prisma.employee.deleteMany({ where: { companyId } });
      await prisma.user.deleteMany({ where: { companyId } });
      await prisma.company.deleteMany({ where: { id: companyId } });
    }
    await prisma.$disconnect();
  });

  it('executes real PostgreSQL advisory lock without void deserialization error and reserves cross-year days', async () => {
    const req = await leaveService.createLeaveRequest(companyId, userId, {
      leaveTypeSettingId,
      startDate: '2026-12-30',
      endDate: '2027-01-06',
      reason: 'Cross-year PG regression',
    });

    expect(req.totalDays).toBe(8);
    expect(req.balanceDaysByYear).toEqual([
      { year: 2026, days: 2 },
      { year: 2027, days: 6 },
    ]);

    const balances = await prisma.leaveBalance.findMany({
      where: { companyId, employeeId, leaveType: LeaveType.ANNUAL },
      orderBy: { year: 'asc' },
    });
    expect(balances.map((b) => ({ year: b.year, pending: b.pending }))).toEqual([
      { year: 2026, pending: 2 },
      { year: 2027, pending: 6 },
    ]);
  });

  it('serializes concurrent overlapping leave requests in PostgreSQL so only one succeeds', async () => {
    const outcomes = await Promise.allSettled([
      leaveService.createLeaveRequest(companyId, userId, {
        leaveTypeSettingId,
        startDate: '2027-07-05',
        endDate: '2027-07-07',
        reason: 'Concurrent A',
      }),
      leaveService.createLeaveRequest(companyId, userId, {
        leaveTypeSettingId,
        startDate: '2027-07-06',
        endDate: '2027-07-08',
        reason: 'Concurrent B',
      }),
    ]);

    const fulfilled = outcomes.filter((o) => o.status === 'fulfilled');
    const rejected = outcomes.filter((o): o is PromiseRejectedResult => o.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBeInstanceOf(ConflictException);
  });
});
