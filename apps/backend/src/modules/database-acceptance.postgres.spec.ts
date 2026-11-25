import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Prisma, PrismaClient, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '@common/prisma/prisma.service';
import { DataScopeService } from '@common/services/data-scope.service';
import { AttendanceService } from './attendance/attendance.service';
import { WorkTimerService } from './work-timer/work-timer.service';
import { AuthService } from './auth/auth.service';
import { EmployeesService } from './employees/employees.service';
import { DepartmentsService } from './organization/departments/departments.service';
import { TeamsService } from './organization/teams/teams.service';
import { AiAssistantService } from './ai-assistant/ai-assistant.service';
import { LeaveService } from './leave/leave.service';
import { ApprovalEngineService } from './leave/approval-engine.service';

const url = process.env.ZENHR_ACCEPTANCE_PG_URL;
const password = 'FixtureOnly-Pass19!';
const tempPassword = 'FixtureOnly-Temp20!';
const nextPassword = 'FixtureOnly-New21!';
const config = new ConfigService({ app: { jwt: {
  accessSecret: randomUUID(), refreshSecret: randomUUID(),
}, security: { bcryptRounds: 4 } } });

(url ? describe : describe.skip)('Final database acceptance', () => {
  let db: PrismaClient;
  let prisma: PrismaService;
  const scope = new DataScopeService();
  const mail = { sendMail: jest.fn().mockResolvedValue(true) };
  const gateway = {} as never;
  const now = new Date('2026-11-25T01:30:00Z');
  const today = new Date('2026-11-25');
  const yesterday = new Date('2026-11-24');
  const tomorrow = new Date('2026-11-26');
  beforeAll(async () => {
    const target = new URL(url!);
    if (target.protocol !== 'postgresql:' || target.hostname !== '127.0.0.1' ||
      target.port !== '55435' || target.username !== 'hr15_test' || target.pathname !== '/zenhr_acceptance_fresh') {
      throw new Error('Use only the dedicated loopback acceptance database.');
    }
    db = new PrismaClient({ datasourceUrl: url });
    const [identity] = await db.$queryRaw<{ db: string; actor: string }[]>`SELECT current_database() AS db, current_user AS actor`;
    if (identity.db !== 'zenhr_acceptance_fresh' || identity.actor !== 'hr15_test') throw new Error('Unexpected test database');
    prisma = db as unknown as PrismaService;
    jest.useFakeTimers({ doNotFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'setImmediate', 'clearImmediate', 'nextTick', 'queueMicrotask'] });
    jest.setSystemTime(now);
  });
  afterAll(async () => { jest.useRealTimers(); await db?.$disconnect(); });

  async function company() {
    const key = randomUUID();
    return db.company.create({ data: { name: 'Acceptance fixture', slug: key, email: `${key}@example.test`,
      timezone: 'UTC', subscriptionTier: 'PREMIUM', regularizationEnabled: true } });
  }

  async function person(companyId: string, role: UserRole = UserRole.EMPLOYEE, membership: { departmentId?: string; teamId?: string } = {}) {
    const key = randomUUID();
    const user = await db.user.create({ data: { companyId, email: `${key}@example.test`, role,
      passwordHash: await bcrypt.hash(password, 4), dataScope: scope.getScope(role), isEmailVerified: true } });
    const employee = await db.employee.create({ data: { companyId, userId: user.id, employeeCode: key,
      firstName: 'Acceptance', lastName: 'Fixture', hireDate: new Date('2024-01-01'), ...membership } });
    return { user, employee };
  }

  it('serializes duplicate names per tenant and non-overlapping assignments per employee', async () => {
    const [a, b] = await Promise.all([company(), company()]);
    const ceo = (await person(a.id, 'COMPANY_ADMIN')).user;
    const other = (await person(b.id, 'COMPANY_ADMIN')).user;
    const { employee } = await person(a.id);
    const service = new AttendanceService(prisma, scope, mail as never, gateway);
    const policy = { name: 'Primary Shift', effectiveDate: '2026-11-26', startTime: '09:00', endTime: '17:00',
      breakDuration: 60, requiredMinutes: 420, halfDayMinutes: 240, fullDayMinutes: 420, workDays: [1, 2, 3, 4, 5], overtimeEnabled: true };
    const results = await Promise.allSettled([
      service.scheduleShiftPolicy(policy, ceo), service.scheduleShiftPolicy({ ...policy, name: 'primary shift' }, ceo),
      service.scheduleShiftPolicy(policy, other),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual(['fulfilled', 'fulfilled', 'rejected']);
    const shift = await db.shift.findFirstOrThrow({ where: { companyId: a.id } });
    const different = await db.shift.create({ data: { companyId: a.id, name: 'Other', startTime: '10:00', endTime: '18:00', workDays: [1] } });
    const decide = (id: string, date: string) => service.assignShift(id, employee.id, ceo, { effectiveDate: date });
    await Promise.all([decide(different.id, '2026-11-30'), decide(shift.id, '2026-11-26')]);
    const duplicate = await Promise.allSettled([decide(shift.id, '2026-11-26'), decide(different.id, '2026-11-26')]);
    expect(duplicate.map((r) => r.status).sort()).toEqual(['fulfilled', 'rejected']);
    expect(duplicate.find((r) => r.status === 'fulfilled')).toMatchObject({ value: { idempotent: true } });
    const assignments = await db.employeeShift.findMany({ where: { employeeId: employee.id }, orderBy: { effectiveFrom: 'asc' } });
    expect(assignments.map((r) => r.effectiveFrom)).toEqual([tomorrow, new Date('2026-11-30')]);
    expect(assignments[0].effectiveTo?.getTime()).toBe(assignments[1].effectiveFrom.getTime() - 1);
    expect(assignments[1].effectiveTo).toBeNull();
    expect(await db.notification.count({ where: { userId: employee.userId } })).toBe(2);
  });

  it('serializes same-day check-in and assignment, keeps the effective policy and protects overnight attendance', async () => {
    const tenant = await company();
    const ceo = (await person(tenant.id, 'COMPANY_ADMIN')).user;
    const { employee, user } = await person(tenant.id);
    const service = new AttendanceService(prisma, scope, mail as never, gateway);
    const standard = await db.shift.create({ data: { companyId: tenant.id, isDefault: true, name: 'Standard',
      startTime: '08:00', endTime: '16:00', workDays: [1, 2, 3, 4, 5], breakDuration: 60 } });
    const newer = await db.shift.create({ data: { companyId: tenant.id, name: 'Short',
      startTime: '08:00', endTime: '13:00', workDays: [1, 2, 3, 4, 5], breakDuration: 0 } });
    const old = await db.attendanceRecord.create({ data: { companyId: tenant.id, employeeId: employee.id, date: yesterday,
      status: 'PRESENT', punchPolicy: { historical: true }, checkInTime: yesterday, checkOutTime: today } });
    const results = await Promise.allSettled([
      service.assignShift(newer.id, employee.id, ceo, { effectiveDate: '2026-11-25' }),
      service.checkIn({ isRemote: false }, null, user),
    ]);
    expect(results[1].status).toBe('fulfilled');
    const record = await db.attendanceRecord.findFirstOrThrow({ where: { employeeId: employee.id, date: today } });
    expect(record.punchPolicy).toMatchObject({ requiredMinutes: results[0].status === 'fulfilled' ? 300 : 420 });
    expect(await db.attendanceRecord.findUnique({ where: { id: old.id } })).toEqual(old);
    const night = await person(tenant.id);
    await db.attendanceRecord.create({ data: { companyId: tenant.id, employeeId: night.employee.id,
      date: yesterday, status: 'IN_PROGRESS', checkInTime: new Date('2026-11-24T23:00:00Z') } });
    await expect(service.assignShift(standard.id, night.employee.id, ceo, { effectiveDate: '2026-11-25' }))
      .rejects.toThrow('Cannot assign a shift effective today');
  });

  it('waits for the shift mutation before selecting a timer day and protects an active timer', async () => {
    const tenant = await company();
    const ceo = (await person(tenant.id, 'COMPANY_ADMIN')).user;
    const { employee, user } = await person(tenant.id);
    const attendance = new AttendanceService(prisma, scope, mail as never, gateway);
    const service = new WorkTimerService(prisma, mail as never, gateway);
    const overnight = await db.shift.create({ data: { companyId: tenant.id, isDefault: true, name: 'Night',
      startTime: '23:00', endTime: '06:00', workDays: [2, 3], breakDuration: 0 } });
    const day = await db.shift.create({ data: { companyId: tenant.id, name: 'Day',
      startTime: '09:00', endTime: '17:00', workDays: [2, 3], breakDuration: 0 } });
    let release!: () => void;
    let locked!: () => void;
    const ready = new Promise<void>((resolve) => { locked = resolve; });
    const barrier = new Promise<void>((resolve) => { release = resolve; });
    const assignment = db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${'employee-shift:' + tenant.id + ':' + employee.id}, 0))`;
      locked();
      await barrier;
      await tx.employeeShift.create({ data: { companyId: tenant.id, employeeId: employee.id, shiftId: day.id, effectiveFrom: today } });
    });
    await ready;
    let timerFinished = false;
    const timer = service.startTimer(user).finally(() => { timerFinished = true; });
    try {
      await new Promise((resolve) => setTimeout(resolve, 300));
      expect(timerFinished).toBe(false);
    } finally {
      release();
      await assignment;
      await timer;
    }
    expect((await timer).date).toEqual(today);
    await expect(attendance.assignShift(overnight.id, employee.id, ceo, { effectiveDate: '2026-11-25', replaceExisting: true }))
      .rejects.toThrow('Cannot assign a shift effective today');
  });

  it('rotates refresh tokens exactly once through login, change, administrative reset and revocation', async () => {
    const tenant = await company();
    const ceo = (await person(tenant.id, 'COMPANY_ADMIN')).user;
    const { employee, user } = await person(tenant.id);
    const auth = new AuthService(prisma, new JwtService(), config, mail as never, scope);
    const workers = new EmployeesService(prisma, scope, mail as never, {} as never);
    const login = async (secret: string) => {
      const result = await auth.login({ email: user.email, password: secret }, null, 'acceptance');
      if (!('refreshToken' in result)) throw new Error('Unexpected MFA challenge');
      return result;
    };
    const first = await login(password);
    const rotations = await Promise.allSettled(Array.from({ length: 4 }, () => auth.refreshToken(first.refreshToken)));
    expect(rotations.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    await expect(auth.refreshToken(first.refreshToken)).rejects.toThrow('Session expired');
    const changed = await auth.changePassword(user.id, { currentPassword: password, newPassword: nextPassword });
    const afterChange = await auth.refreshToken(changed.refreshToken);
    await workers.resetEmployeePassword(employee.id, { temporaryPassword: tempPassword }, ceo);
    await expect(auth.refreshToken(afterChange.refreshToken)).rejects.toThrow('Session expired');
    expect((await login(tempPassword)).user.mustChangePassword).toBe(true);
    const installed = await auth.changePassword(user.id, { currentPassword: tempPassword, newPassword: password });
    const refreshed = await auth.refreshToken(installed.refreshToken);
    await auth.logout(user.id);
    await expect(auth.refreshToken(refreshed.refreshToken)).rejects.toThrow('Session expired');
    const active = await login(password);
    await db.employee.update({ where: { id: employee.id }, data: { status: 'SUSPENDED' } });
    await expect(auth.refreshToken(active.refreshToken)).rejects.toThrow('Session expired');
  });

  it('cannot restore a password-change session after a concurrent revocation', async () => {
    const tenant = await company();
    const { user } = await person(tenant.id);
    const jwt = new JwtService();
    const auth = new AuthService(prisma, jwt, config, mail as never, scope);
    const sign = jwt.signAsync.bind(jwt);
    let release!: () => void;
    let reached!: () => void;
    const barrier = new Promise<void>((resolve) => { release = resolve; });
    const ready = new Promise<void>((resolve) => { reached = resolve; });
    jest.spyOn(jwt, 'signAsync').mockImplementation(async (...args: Parameters<JwtService['signAsync']>) => {
      reached();
      await barrier;
      return sign(...args);
    });
    const attempt = Promise.allSettled([auth.changePassword(user.id, { currentPassword: password, newPassword: nextPassword })]);
    await ready;
    try {
      await auth.logout(user.id);
      await auth.logout(user.id);
    } finally { release(); }
    expect((await attempt)[0].status).toBe('rejected');
    expect(await db.user.findUnique({ where: { id: user.id } })).toMatchObject({ sessionVersion: 2, refreshTokenHash: null });
  });

  it('keeps directory visibility while exposing status only inside each manager scope', async () => {
    const tenant = await company();
    const dept = await db.department.create({ data: { companyId: tenant.id, name: 'A' } });
    const other = await db.department.create({ data: { companyId: tenant.id, name: 'B' } });
    const team = await db.team.create({ data: { companyId: tenant.id, departmentId: dept.id, name: 'A1' } });
    const sibling = await db.team.create({ data: { companyId: tenant.id, departmentId: dept.id, name: 'A2' } });
    const lead = await person(tenant.id, 'TEAM_LEAD', { departmentId: dept.id, teamId: team.id });
    const outside = await person(tenant.id, 'EMPLOYEE', { departmentId: dept.id, teamId: sibling.id });
    const manager = await person(tenant.id, 'DEPARTMENT_MANAGER', { departmentId: other.id });
    const departments = new DepartmentsService(prisma, new DataScopeService());
    const teams = new TeamsService(prisma, new DataScopeService());
    const employeeView = await departments.getDepartmentById(dept.id, outside.user);
    expect(employeeView.employees.every((member) => !('status' in member))).toBe(true);
    const leadView = await departments.getDepartmentById(dept.id, lead.user);
    expect(leadView.employees.find(({ id }) => id === lead.employee.id)).toHaveProperty('status');
    expect(leadView.employees.find(({ id }) => id === outside.employee.id)).not.toHaveProperty('status');
    const managerView = await teams.getTeamById(team.id, manager.user);
    expect(managerView.employees.every((member) => !('status' in member))).toBe(true);
  });

  it('uses real leave eligibility for read-only AI regularization answers', async () => {
    const tenant = await company();
    const other = await company();
    const { employee, user } = await person(tenant.id);
    const stranger = await person(other.id);
    const input = { companyId: tenant.id, employeeId: employee.id };
    await db.attendanceRecord.createMany({ data: [
      { ...input, date: new Date('2026-11-23'), status: 'ABSENT' },
      { ...input, date: new Date('2026-11-22'), status: 'ABSENT', checkInTime: new Date('2026-11-22T08:00:00Z') },
      { ...input, date: new Date('2026-10-30'), status: 'ABSENT' },
      { companyId: other.id, employeeId: stranger.employee.id, date: new Date('2026-11-20'), status: 'ABSENT' },
    ] });
    await db.payslip.create({ data: { ...input, year: 2026, month: 10, status: 'PAID', baseSalary: 5, netSalary: 5 } });
    const leave = new LeaveService(prisma, new ApprovalEngineService(), {} as never, mail as never, scope);
    const ai = new AiAssistantService(prisma, new ConfigService({}), leave);
    const before = await db.attendanceRecord.findMany({ where: input, orderBy: { date: 'asc' } });
    const reply = await ai.processQuery(tenant.id, user.id, user.role, { message: 'What absence dates can I regularize?' });
    expect(reply.model).toBe('zenhr-policy-engine');
    expect(reply.reply).toContain('2026-11-23');
    for (const date of ['2026-11-22', '2026-10-30', '2026-11-20']) expect(reply.reply).not.toContain(date);
    expect(await db.leaveBalance.count({ where: input })).toBe(0);
    expect(await db.leaveRequest.count({ where: input })).toBe(0);
    expect(await db.attendanceRecord.findMany({ where: input, orderBy: { date: 'asc' } })).toEqual(before);
  });
});
