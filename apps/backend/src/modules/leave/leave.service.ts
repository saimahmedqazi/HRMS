import { attendanceDayStart, getAttendanceDay } from '@common/utils/attendance-date';
import { lockEmployeeLeave } from '@common/utils/leave-locks';
import { RegularizationPolicyDto } from './dto/regularization-policy.dto';
import { approvedLeaveOverlapping } from './effective-leave-range';
import 'multer';
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import {
  ApprovalStatus,
  AuditAction,
  AttendanceStatus,
  EmployeeStatus,
  LeaveStatus,
  LeaveRequest,
  LeaveType,
  NotificationType,
  Prisma,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '@common/prisma/prisma.service';
import { StorageService } from '@common/storage/storage.service';
import { MailService } from '@common/mail/mail.service';
import { DataScopeService } from '@common/services/data-scope.service';
import { ApprovalEngineService, RequesterContext } from './approval-engine.service';
import { CreateLeaveRequestDto } from './dto/create-leave-request.dto';
import { ApproveStepDto } from './dto/approve-step.dto';
import { UpdateLeaveTypeDto } from './dto/update-leave-type.dto';
import { PASSWORD_SETUP_REQUIRED } from '@common/utils/password-policy';

const availableApprover = {
  deletedAt: null,
  NOT: [
    { passwordHash: PASSWORD_SETUP_REQUIRED },
    { employee: { is: { OR: [
      { deletedAt: { not: null } },
      { status: { in: [EmployeeStatus.SUSPENDED, EmployeeStatus.TERMINATED, EmployeeStatus.RESIGNED] } },
    ] } } },
  ],
} satisfies Prisma.UserWhereInput;

const leaveEmployee = {
  id: true,
  userId: true,
  employeeCode: true,
  firstName: true,
  lastName: true,
  department: { select: { id: true, name: true } },
  team: { select: { id: true, name: true } },
  user: { select: { id: true, email: true, role: true } },
} as const;

const dayMs = 86_400_000;
const isExceptional = (type: LeaveType) => type === LeaveType.SPECIAL || type === LeaveType.UNPAID;
const policyFields = {
  regularizationEnabled: true, regularizationLookback: true,
  regularizationExceptional: true, regularizationDocument: true, timezone: true,
} as const;
const eligibleAbsence = {
  status: AttendanceStatus.ABSENT, checkInTime: null, checkOutTime: null,
  workMinutes: 0, overtimeMinutes: 0, remoteReviewPending: false, remoteRejected: false,
} satisfies Prisma.AttendanceRecordWhereInput;
type RequestPolicy = { isPaid: boolean; enforceEntitlement: boolean; exceptional: boolean };

type LeaveBalanceDays = { year: number; days: number };

function splitLeaveBalanceDays(start: Date, end: Date, totalDays: number): LeaveBalanceDays[] {
  const result: LeaveBalanceDays[] = [];
  const cursor = new Date(start);
  for (let year = start.getUTCFullYear(); year < end.getUTCFullYear(); year++) {
    const nextYear = new Date(cursor);
    nextYear.setUTCFullYear(year + 1, 0, 1);
    const days = (nextYear.getTime() - cursor.getTime()) / 86_400_000;
    result.push({ year, days });
    totalDays -= days;
    cursor.setTime(nextYear.getTime());
  }
  result.push({ year: end.getUTCFullYear(), days: totalDays });
  return result;
}

@Injectable()
export class LeaveService {
  private readonly logger = new Logger(LeaveService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly approvalEngine: ApprovalEngineService,
    private readonly storageService: StorageService,
    private readonly mailService: MailService,
    private readonly dataScopeService: DataScopeService,
  ) {}

  private async getLeaveReadScope(
    companyId: string,
    user: { id: string; role: UserRole },
  ): Promise<Prisma.LeaveRequestWhereInput> {
    const scope = await this.dataScopeService.resolveEmployeeScope(this.prisma, companyId, user);
    if (user.role === UserRole.TEAM_LEAD || user.role === UserRole.DEPARTMENT_MANAGER) {
      return {
        companyId,
        employee: { companyId, deletedAt: null },
        OR: [
          { employee: scope },
          { step1ApproverId: user.id },
        ],
      };
    }
    return { companyId, employee: scope };
  }

  private canReadPrescription(user: { id: string; role: UserRole }, requesterId: string): boolean {
    return requesterId === user.id ||
      user.role === UserRole.HR_MANAGER ||
      user.role === UserRole.COMPANY_ADMIN ||
      user.role === UserRole.SUPER_ADMIN;
  }

  private async updatePendingLeaveRequest(
    tx: Prisma.TransactionClient,
    request: Pick<LeaveRequest, 'id' | 'companyId' | 'step1Status' | 'step2Status'>,
    data: Prisma.LeaveRequestUncheckedUpdateInput,
  ) {
    try {
      return await tx.leaveRequest.update({
        where: {
          id: request.id,
          companyId: request.companyId,
          status: LeaveStatus.PENDING,
          step1Status: request.step1Status,
          step2Status: request.step2Status,
        },
        data,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new ConflictException('The leave request changed. Refresh it before trying again.');
      }
      throw error;
    }
  }

  private async companyLeavePolicy(tx: Pick<Prisma.TransactionClient, 'company'>, companyId: string) {
    const company = await tx.company.findUnique({ where: { id: companyId }, select: policyFields });
    if (!company) throw new NotFoundException('Company not found.');
    return company;
  }

  async getRegularizationPolicy(companyId: string) {
    return this.companyLeavePolicy(this.prisma, companyId);
  }

  async updateRegularizationPolicy(companyId: string, dto: RegularizationPolicyDto) {
    return this.prisma.company.update({ where: { id: companyId }, data: dto, select: policyFields });
  }

  private async lockHistoricalPayroll(tx: Prisma.TransactionClient, companyId: string) {
    const key = `zenhr-payroll:${companyId}`;
    await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
  }

  private async eligibleHistoricalRecords(tx: Prisma.TransactionClient, companyId: string, employeeId: string, start: Date, end: Date, timezone: string) {
    const scope = { companyId, employeeId, date: { gte: start, lte: end } };
    const periods: { month: number; year: number }[] = [];
    for (let period = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1)); period <= end;
      period.setUTCMonth(period.getUTCMonth() + 1)) {
      periods.push({ month: period.getUTCMonth() + 1, year: period.getUTCFullYear() });
    }
    const [records, timers, paid] = await Promise.all([
      tx.attendanceRecord.findMany({ where: { ...scope, ...eligibleAbsence }, select: { id: true, date: true } }),
      // A timer row is work evidence even if its duration has not yet been recorded.
      tx.workTimerEntry.findMany({
        where: { companyId, employeeId, OR: [
          { date: scope.date },
          { startedAt: { lt: attendanceDayStart(new Date(+end + dayMs), timezone) },
            OR: [{ stoppedAt: null }, { stoppedAt: { gt: attendanceDayStart(start, timezone) } }] },
        ] },
        select: { date: true, startedAt: true, stoppedAt: true },
      }),
      tx.payslip.findMany({ where: { companyId, status: 'PAID', OR: periods }, select: { month: true, year: true } }),
    ]);
    const blocked = new Set(paid.map(({ year, month }) => `${year}-${month}`));
    return {
      records: records.filter(({ date }) => {
        if (blocked.has(`${date.getUTCFullYear()}-${date.getUTCMonth() + 1}`)) return false;
        if (!timers.length) return true;
        const start = attendanceDayStart(date, timezone);
        const next = attendanceDayStart(new Date(+date + dayMs), timezone);
        return !timers.some((timer) => +timer.date === +date ||
          (timer.startedAt < next && (!timer.stoppedAt || timer.stoppedAt > start)));
      }),
      paid: paid.length > 0,
    };
  }

  async getEligibleAbsences(companyId: string, userId: string) {
    const policy = await this.companyLeavePolicy(this.prisma, companyId);
    const employee = await this.prisma.employee.findFirst({
      where: { companyId, userId, deletedAt: null }, select: { id: true },
    });
    if (!employee) throw new NotFoundException('Employee profile not found.');
    const today = getAttendanceDay(new Date(), policy.timezone).date;
    if (!policy.regularizationEnabled) return { ...policy, dates: [] };
    const start = new Date(+today - policy.regularizationLookback * dayMs);
    const end = new Date(+today - dayMs);
    const [{ records }, existing] = await Promise.all([
      this.eligibleHistoricalRecords(this.prisma, companyId, employee.id, start, end, policy.timezone),
      this.prisma.leaveRequest.findMany({
        where: { companyId, employeeId: employee.id, OR: [
          { status: LeaveStatus.PENDING, startDate: { lte: end }, endDate: { gte: start } },
          approvedLeaveOverlapping(start, end),
        ] },
        select: { startDate: true, endDate: true, approvedStart: true, approvedEnd: true },
      }),
    ]);
    const dates = records.filter(({ date }) => !existing.some((request) =>
      date >= (request.approvedStart ?? request.startDate) && date <= (request.approvedEnd ?? request.endDate)))
      .map(({ date }) => date.toISOString().slice(0, 10)).sort();
    return { ...policy, dates };
  }

  private async assertHistoricalRange(tx: Prisma.TransactionClient, companyId: string, employeeId: string, start: Date, end: Date, timezone: string) {
    await this.lockHistoricalPayroll(tx, companyId);
    const result = await this.eligibleHistoricalRecords(tx, companyId, employeeId, start, end, timezone);
    if (result.paid) throw new ConflictException('Attendance cannot be regularized in a paid payroll period.');
    if (result.records.length !== (+end - +start) / dayMs + 1) {
      throw new ConflictException('Every historical date must have an absence with no punch or work timer activity.');
    }
    return result.records;
  }

  private async applyApprovedAttendance(tx: Prisma.TransactionClient, request: LeaveRequest, start: Date, end: Date, actorId: string, now: Date) {
    const policy = await this.companyLeavePolicy(tx, request.companyId);
    const today = getAttendanceDay(now, policy.timezone).date;
    // Legacy pending requests keep their original workflow but historical writes need the same safeguards.
    if (request.retrospective || start < today) {
      const historicalEnd = request.retrospective ? end : new Date(Math.min(+end, +today - dayMs));
      if (historicalEnd >= today) throw new ConflictException('Retrospective leave must cover past dates only.');
      const records = await this.assertHistoricalRange(tx, request.companyId, request.employeeId, start, historicalEnd, policy.timezone);
      for (const record of records) {
        const changed = await tx.attendanceRecord.updateMany({
          where: { id: record.id, companyId: request.companyId, employeeId: request.employeeId, ...eligibleAbsence },
          data: { status: AttendanceStatus.ON_LEAVE },
        });
        if (changed.count !== 1) throw new ConflictException('Attendance changed before this leave could be approved.');
      }
      await tx.auditLog.createMany({ data: records.map(({ id, date }) => ({
        companyId: request.companyId, userId: actorId, action: AuditAction.UPDATE,
        entity: 'AttendanceRecord', entityId: id, createdAt: now,
        oldValues: { status: AttendanceStatus.ABSENT },
        newValues: { status: AttendanceStatus.ON_LEAVE, employeeId: request.employeeId, leaveRequestId: request.id,
          date: date.toISOString(), reason: request.reason, requestedStart: request.startDate.toISOString(),
          requestedEnd: request.endDate.toISOString(), approvedStart: start.toISOString(), approvedEnd: end.toISOString() },
      })) });
    }
    if (!request.retrospective && end >= today) {
      await this.markApprovedLeaveAttendance(tx, { ...request, startDate: start < today ? today : start, endDate: end });
    }
  }

  private approvalRange(request: LeaveRequest, dto: ApproveStepDto, step: 1 | 2) {
    const scopeStart = (step === 2 && request.step1ApprovedStart) || request.startDate;
    const scopeEnd = (step === 2 && request.step1ApprovedEnd) || request.endDate;
    const reason = dto.partialReason?.trim();
    const parse = (value?: string) => {
      if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
      const date = new Date(value);
      return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? date : null;
    };
    const start = dto.decision === 'PARTIAL' ? parse(dto.approvedStart) : scopeStart;
    const end = dto.decision === 'PARTIAL' ? parse(dto.approvedEnd) : scopeEnd;
    if (dto.decision === 'PARTIAL' && (!start || !end || start < scopeStart || end > scopeEnd ||
        start > end || (+start === +scopeStart && +end === +scopeEnd) || !reason || reason.length < 3)) {
      throw new BadRequestException('Choose a shorter date range within the approval scope and explain why it was reduced.');
    }
    const partial = +start! !== +request.startDate || +end! !== +request.endDate;
    const days = partial ? this.approvalEngine.calculateTotalDays(start!, end!) : request.totalDays;
    const allocation = partial ? splitLeaveBalanceDays(start!, end!, days)
      : (request.balanceDaysByYear as LeaveBalanceDays[] | null) ?? [{ year: request.startDate.getFullYear(), days }];
    return { start: start!, end: end!, partial, days, allocation, reason: dto.decision === 'PARTIAL' ? reason : undefined };
  }

  private finalApproval(range: ReturnType<LeaveService['approvalRange']>) {
    return { approvedStart: range.start, approvedEnd: range.end, approvedDays: range.days, approvedDaysByYear: range.allocation };
  }

  private approvedNotification(request: LeaveRequest, range: ReturnType<LeaveService['approvalRange']>) {
    const reasons = [request.step1PartialReason, range.reason].filter(Boolean).join(' ');
    return range.partial ? {
      title: 'Leave Request Partially Approved',
      body: `Of ${request.totalDays} requested days, ${range.days} were approved (${range.start.toISOString().slice(0, 10)} to ${range.end.toISOString().slice(0, 10)}). ${reasons}`.trim(),
    } : { title: 'Leave Request Fully Approved', body: `Your leave request for ${request.totalDays} day(s) has been approved.` };
  }

  private async settleLeaveBalances(
    tx: Prisma.TransactionClient,
    request: Pick<LeaveRequest, 'companyId' | 'employeeId' | 'startDate' | 'totalDays' | 'balanceDaysByYear' | 'policySnapshot'> & {
      leaveTypeSetting: { leaveType: LeaveType };
    },
    approved: boolean | LeaveBalanceDays[],
  ): Promise<void> {
    if ((request.policySnapshot as RequestPolicy | null)?.enforceEntitlement === false) return;
    // Older requests reserved every day against their original start-year balance.
    const allocations = (request.balanceDaysByYear as LeaveBalanceDays[] | null) ?? [
      { year: request.startDate.getFullYear(), days: request.totalDays },
    ];
    const used = Array.isArray(approved) ? approved : approved ? allocations : [];
    const years = [...new Set([...allocations, ...used].map(({ year }) => year))].sort((a, b) => a - b);
    for (const year of years) {
      const pending = allocations.find((item) => item.year === year)?.days ?? 0;
      const consumed = used.find((item) => item.year === year)?.days ?? 0;
      const key = { companyId: request.companyId, employeeId: request.employeeId,
        leaveType: request.leaveTypeSetting.leaveType, year };
      if (consumed > pending) {
        // A legacy request may have reserved every day in its start year.
        const changed = await tx.$executeRaw`
          UPDATE "leave_balances" SET "pending" = "pending" - ${pending},
            "used" = "used" + ${consumed}, "updatedAt" = CURRENT_TIMESTAMP
          WHERE "companyId" = ${key.companyId} AND "employeeId" = ${key.employeeId}
            AND "leaveType" = ${key.leaveType}::"LeaveType" AND "year" = ${year}
            AND "pending" >= ${pending}
            AND "allocated" + "carried" - "used" - "pending" >= ${consumed - pending}`;
        if (!changed) throw new ConflictException(`Insufficient unreserved leave for ${year} to narrow this legacy request.`);
      } else {
        const result = await tx.leaveBalance.updateMany({
          where: { ...key, pending: { gte: pending } },
          data: { pending: { decrement: pending }, ...(consumed > 0 && { used: { increment: consumed } }) },
        });
        if (result.count !== 1) throw new ConflictException(`The leave reservation for ${year} is unavailable.`);
      }
    }
  }

  private async markApprovedLeaveAttendance(
    tx: Prisma.TransactionClient,
    request: Pick<LeaveRequest, 'companyId' | 'employeeId' | 'startDate' | 'endDate'>,
  ): Promise<void> {
    const { companyId, employeeId, startDate, endDate } = request;
    const data = { status: AttendanceStatus.ON_LEAVE, markedBySystem: true };
    const records: Prisma.AttendanceRecordCreateManyInput[] = [];
    for (let day = startDate.getTime(); day <= endDate.getTime(); day += 86_400_000) {
      records.push({ companyId, employeeId, date: new Date(day), ...data });
    }
    await tx.attendanceRecord.createMany({ data: records, skipDuplicates: true });
    await tx.attendanceRecord.updateMany({
      where: {
        companyId, employeeId, date: { gte: startDate, lte: endDate },
        checkInTime: null, markedBySystem: true, status: AttendanceStatus.ABSENT,
      },
      data: { ...data, notes: null },
    });
  }

  /**
   * Ensure default leave types exist for a company.
   */
  async ensureDefaultLeaveTypes(companyId: string) {
    if (!companyId) {
      throw new ForbiddenException('Company context required.');
    }

    const existing = await this.prisma.leaveTypeSetting.findMany({
      where: { companyId },
    });
    if (!existing.some(({ leaveType }) => !isExceptional(leaveType)) || !existing.some(({ leaveType }) => leaveType === LeaveType.SPECIAL) ||
        !existing.some(({ leaveType }) => leaveType === LeaveType.UNPAID)) {
      await this.prisma.leaveTypeSetting.createMany({
        skipDuplicates: true,
        data: [
          ...[LeaveType.SPECIAL, LeaveType.UNPAID].filter((leaveType) => !existing.some((setting) => setting.leaveType === leaveType))
            .map((leaveType) => ({ companyId, leaveType, isActive: false, isPaid: leaveType === LeaveType.SPECIAL, enforceEntitlement: false })),
          ...(existing.some(({ leaveType }) => !isExceptional(leaveType)) ? [] : [
          {
            companyId,
            leaveType: LeaveType.CASUAL,
            annualAllocation: 10,
            requiresReason: true,
            requiresMedicalCert: false,
          },
          {
            companyId,
            leaveType: LeaveType.SICK,
            annualAllocation: 14,
            requiresReason: true,
            requiresMedicalCert: true,
          },
          {
            companyId,
            leaveType: LeaveType.ANNUAL,
            annualAllocation: 14,
            requiresReason: false,
            requiresMedicalCert: false,
          },
          ]),
        ],
      });
    }
    return this.prisma.leaveTypeSetting.findMany({
      where: { companyId },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Get all leave types for a company.
   */
  async getLeaveTypes(companyId: string) {
    return this.ensureDefaultLeaveTypes(companyId);
  }

  /**
   * Update a leave type setting.
   */
  async updateLeaveType(
    companyId: string,
    id: string,
    dto: UpdateLeaveTypeDto,
  ) {
    const setting = await this.prisma.leaveTypeSetting.findFirst({
      where: { id, companyId },
    });
    if (!setting) {
      throw new NotFoundException('Leave type setting not found.');
    }

    const exceptional = isExceptional(setting.leaveType);
    if ((!exceptional && (dto.isPaid !== undefined || dto.enforceEntitlement !== undefined ||
        dto.allowDuringProbation !== undefined || dto.maxConsecutiveDays !== undefined)) ||
        (setting.leaveType === LeaveType.UNPAID && dto.isPaid === true) ||
        (exceptional && dto.requiresReason === false) ||
        (exceptional && (dto.enforceEntitlement ?? setting.enforceEntitlement) === false &&
          ((dto.annualAllocation ?? setting.annualAllocation) > 0 || (dto.carryForwardDays ?? setting.carryForwardDays) > 0))) {
      throw new BadRequestException('These leave policy options are incompatible with this leave type.');
    }
    return this.prisma.leaveTypeSetting.update({
      where: { id },
      data: dto,
    });
  }

  /**
   * Get current leave balances for an employee.
   */
  async getLeaveBalances(
    companyId: string,
    employeeId: string,
    year: number | undefined,
    user: { id: string; role: UserRole },
  ) {
    if (!companyId || !employeeId) {
      return [];
    }

    const scope = await this.dataScopeService.resolveEmployeeScope(this.prisma, companyId, user);
    const emp = await this.prisma.employee.findFirst({
      where: {
        ...scope,
        OR: [{ id: employeeId }, { userId: employeeId }],
      },
    });

    if (!emp) {
      return [];
    }

    const resolvedEmployeeId = emp.id;
    const targetYear = year || new Date().getFullYear();
    const [settings, balances] = await Promise.all([
      this.prisma.leaveTypeSetting.findMany({ where: { companyId, isActive: true, enforceEntitlement: true } }),
      this.prisma.leaveBalance.findMany({ where: { companyId, employeeId: resolvedEmployeeId, year: targetYear } }),
    ]);
    return settings.map((setting) => {
      const balance = balances.find((item) => item.leaveType === setting.leaveType);
      return balance
        ? { ...balance, initialized: true, available: balance.allocated + balance.carried - balance.used - balance.pending }
        : { id: `uninitialized-${setting.id}-${targetYear}`, leaveType: setting.leaveType, year: targetYear, initialized: false };
    });
  }

  /**
   * Submit a new leave request.
   */
  async createLeaveRequest(
    companyId: string,
    userId: string,
    dto: CreateLeaveRequestDto,
    file?: Express.Multer.File,
  ) {
    // 1. Fetch employee profile
    const employee = await this.prisma.employee.findFirst({
      where: { companyId, userId, deletedAt: null },
      include: {
        user: true,
        department: true,
        team: true,
      },
    });

    if (!employee) {
      throw new NotFoundException('Employee profile not found for user.');
    }

    const setting = await this.prisma.leaveTypeSetting.findFirst({
      where: { id: dto.leaveTypeSettingId, companyId },
    });
    if (!setting?.isActive) throw new BadRequestException('Selected leave type is inactive or does not exist.');
    const exceptional = isExceptional(setting.leaveType);
    const policySnapshot: RequestPolicy = {
      exceptional, isPaid: setting.leaveType !== LeaveType.UNPAID && (!exceptional || setting.isPaid),
      enforceEntitlement: !exceptional || setting.enforceEntitlement,
    };
    this.approvalEngine.assertCanRequestLeave({
      status: employee.status, hireDate: employee.hireDate, probationEndDate: employee.probationEndDate,
      role: exceptional ? UserRole.EMPLOYEE : employee.user.role, allowDuringProbation: exceptional && setting.allowDuringProbation,
    });

    const retrospective = dto.mode === 'RETROSPECTIVE';
    const reason = dto.reason?.trim();
    if (((exceptional || retrospective) && (!reason || reason.length < 3)) || (setting.requiresReason && !reason)) {
      throw new BadRequestException('Enter a meaningful explanation for this leave request.');
    }
    const totalDays = this.approvalEngine.calculateTotalDays(dto.startDate, dto.endDate);
    const startDate = new Date(dto.startDate);
    const endDate = new Date(dto.endDate);
    startDate.setUTCHours(0, 0, 0, 0);
    endDate.setUTCHours(0, 0, 0, 0);
    const balanceDaysByYear = splitLeaveBalanceDays(startDate, endDate, totalDays);

    const company = await this.companyLeavePolicy(this.prisma, companyId);
    const today = getAttendanceDay(new Date(), company.timezone).date;
    if (retrospective) {
      if (!company.regularizationEnabled) throw new ForbiddenException('Retrospective leave is disabled by company policy.');
      if (endDate >= today || startDate < new Date(+today - company.regularizationLookback * dayMs)) {
        throw new BadRequestException('Select only past dates within the company lookback window. Submit current or future dates separately.');
      }
      if (exceptional && !company.regularizationExceptional) {
        throw new ForbiddenException('Exceptional leave is not enabled for retrospective requests.');
      }
    } else if (startDate < today) {
      throw new BadRequestException('Use Regularize Absence for past dates and submit current or future dates separately.');
    }
    if (exceptional && setting.maxConsecutiveDays != null && totalDays > setting.maxConsecutiveDays) {
      throw new BadRequestException(`This leave type allows at most ${setting.maxConsecutiveDays} consecutive days.`);
    }
    if ((setting.requiresMedicalCert || (retrospective && company.regularizationDocument)) && !file) {
      throw new BadRequestException('A supporting document is required for this request.');
    }

    const reportingIds = [employee.team?.leadId, employee.department?.managerId, employee.reportingManagerId]
      .filter((id): id is string => Boolean(id));
    const candidates = await this.prisma.user.findMany({
      where: {
        ...availableApprover, companyId, id: { not: userId },
        OR: [
          { role: { in: [UserRole.HR_MANAGER, UserRole.COMPANY_ADMIN] } },
          { role: { in: [UserRole.TEAM_LEAD, UserRole.DEPARTMENT_MANAGER] }, employee: { is: { id: { in: reportingIds } } } },
        ],
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { id: true, role: true, employee: { select: { id: true } } },
    });
    const reportingUser = (id?: string | null) => id ? candidates.find((candidate) => candidate.employee?.id === id)?.id : undefined;
    const hrUser = candidates.find(({ role }) => role === UserRole.HR_MANAGER);
    const ceoUser = candidates.find(({ role }) => role === UserRole.COMPANY_ADMIN);

    const requesterContext: RequesterContext = {
      id: employee.id,
      userId: employee.userId,
      status: employee.status,
      hireDate: employee.hireDate,
      role: employee.user.role,
      leadUserId: reportingUser(employee.team?.leadId),
      deptManagerUserId: reportingUser(employee.department?.managerId),
      reportingManagerUserId: reportingUser(employee.reportingManagerId),
    };

    const approvers = this.approvalEngine.resolveApprovers(
      requesterContext,
      hrUser?.id,
      ceoUser?.id,
    );

    if (exceptional) {
      if (!ceoUser) throw new BadRequestException('Exceptional leave requires an independent CEO reviewer.');
      if (approvers.step1ApproverId === ceoUser.id) {
        approvers.step1Status = ApprovalStatus.PENDING;
        approvers.step2Status = ApprovalStatus.SKIPPED;
        approvers.step2ApproverId = null;
      } else {
        if (!approvers.step1ApproverId) approvers.step1Status = ApprovalStatus.SKIPPED;
        approvers.step2Status = ApprovalStatus.PENDING;
        approvers.step2ApproverId = ceoUser.id;
      }
    } else if (retrospective && approvers.step1Status === ApprovalStatus.SKIPPED && approvers.step2Status === ApprovalStatus.SKIPPED) {
      const independent = ceoUser ?? hrUser;
      if (!independent) throw new BadRequestException('Retrospective leave requires an independent reviewer.');
      approvers.step2Status = ApprovalStatus.PENDING;
      approvers.step2ApproverId = independent.id;
    }
    const isAutoApproved =
      approvers.step1Status === ApprovalStatus.SKIPPED &&
      approvers.step2Status === ApprovalStatus.SKIPPED;
    if ((approvers.step1Status === ApprovalStatus.PENDING && !approvers.step1ApproverId) ||
        (approvers.step2Status === ApprovalStatus.PENDING && !approvers.step2ApproverId)) {
      throw new BadRequestException('No eligible leave approver is available. Contact your company administrator.');
    }

    const balanceKey = {
      companyId,
      employeeId: employee.id,
      leaveType: setting.leaveType,
    };
    const prescriptionFolder = `zenhr/companies/${companyId}/prescriptions`;
    const medicalCertUrl = file
      ? (await this.storageService.uploadFile(file, { folder: prescriptionFolder, authenticated: true })).url
      : undefined;

    const leaveRequest = await this.prisma.$transaction(async (tx) => {
      await lockEmployeeLeave(tx, companyId, employee.id);
      const overlap = await tx.leaveRequest.findFirst({
        where: { companyId, employeeId: employee.id, OR: [
          { status: LeaveStatus.PENDING, startDate: { lte: endDate }, endDate: { gte: startDate } },
          approvedLeaveOverlapping(startDate, endDate),
        ] },
        select: { startDate: true, endDate: true, approvedStart: true, approvedEnd: true, status: true },
      });
      if (overlap) {
        throw new ConflictException(`Leave overlaps an existing ${overlap.status.toLowerCase()} request (${(overlap.approvedStart ?? overlap.startDate).toISOString().slice(0, 10)} to ${(overlap.approvedEnd ?? overlap.endDate).toISOString().slice(0, 10)}).`);
      }
      if (retrospective) await this.assertHistoricalRange(tx, companyId, employee.id, startDate, endDate, company.timezone);
      for (const { year, days } of policySnapshot.enforceEntitlement ? balanceDaysByYear : []) {
        const yearlyKey = { ...balanceKey, year };
        await tx.leaveBalance.createMany({
          data: { ...yearlyKey, allocated: setting.annualAllocation },
          skipDuplicates: true,
        });

        // PostgreSQL rechecks the balance predicate after any competing write commits.
        const reserved = await tx.$executeRaw`
          UPDATE "leave_balances"
          SET "pending" = "pending" + ${isAutoApproved ? 0 : days},
              "used" = "used" + ${isAutoApproved ? days : 0},
              "updatedAt" = CURRENT_TIMESTAMP
          WHERE "companyId" = ${balanceKey.companyId}
            AND "employeeId" = ${balanceKey.employeeId}
            AND "leaveType" = ${balanceKey.leaveType}::"LeaveType"
            AND "year" = ${year}
            AND "allocated" + "carried" - "used" - "pending" >= ${days}
        `;
        if (reserved === 0) {
          const balance = await tx.leaveBalance.findUnique({
            where: { companyId_employeeId_leaveType_year: yearlyKey },
          });
          const availableDays = balance ? balance.allocated + balance.carried - balance.used - balance.pending : 0;
          throw new BadRequestException(
            `Insufficient leave balance for ${year}. Requested: ${days} days, Available: ${availableDays} days.`,
          );
        }
      }

      const created = await tx.leaveRequest.create({
        data: {
          companyId,
          employeeId: employee.id,
          leaveTypeSettingId: setting.id,
          startDate,
          endDate,
          totalDays,
          balanceDaysByYear,
          policySnapshot,
          retrospective,
          reason: dto.reason,
          medicalCertUrl,
          status: isAutoApproved ? LeaveStatus.APPROVED : LeaveStatus.PENDING,
          step1ApproverId: approvers.step1ApproverId,
          step1Status: approvers.step1Status,
          step2ApproverId: approvers.step2ApproverId,
          step2Status: approvers.step2Status,
          ...(isAutoApproved
            ? {
                finalStatus: ApprovalStatus.APPROVED,
                finalApproverId: userId,
                finalApprovedAt: new Date(),
              }
            : {}),
        },
        include: {
          leaveTypeSetting: true,
          employee: {
            include: {
              user: { select: { id: true, email: true, role: true } },
            },
          },
        },
      });

      if (isAutoApproved) await this.markApprovedLeaveAttendance(tx, created);

      // In-app notification for Step 1 approver
      const targetApproverId =
        approvers.step1Status === ApprovalStatus.PENDING
          ? approvers.step1ApproverId
          : approvers.step2ApproverId;

      if (targetApproverId) {
        await tx.notification.create({
          data: {
            companyId,
            userId: targetApproverId,
            type: NotificationType.LEAVE_SUBMITTED,
            title: 'New Leave Request Awaiting Approval',
            body: `${employee.firstName} ${employee.lastName} submitted a ${setting.leaveType} leave request for ${totalDays} day(s).`,
            data: { leaveRequestId: created.id },
          },
        });
      }

      return created;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted }).catch(async (error: unknown) => {
      if (medicalCertUrl) {
        try {
          await this.storageService.deleteFile(medicalCertUrl, [prescriptionFolder]);
        } catch {
          this.logger.warn('Could not delete the attachment for a failed leave submission.');
        }
      }
      throw error;
    });

    return leaveRequest;
  }

  /**
   * Scoped retrieval of leave requests.
   */
  async getLeaveRequests(
    companyId: string,
    user: { id: string; role: UserRole },
    filter?: {
      status?: LeaveStatus;
      employeeId?: string;
    },
  ) {
    if (!companyId) return [];
    const scope = await this.getLeaveReadScope(companyId, user);
    const requests = await this.prisma.leaveRequest.findMany({
      where: {
        ...scope,
        ...(filter?.status ? { status: filter.status } : {}),
        ...(filter?.employeeId && user.role !== UserRole.EMPLOYEE ? { employeeId: filter.employeeId } : {}),
      },
      include: {
        leaveTypeSetting: true,
        employee: { select: leaveEmployee },
      },
      orderBy: { createdAt: 'desc' },
    });
    const reviewerIds = [...new Set(requests.flatMap((request) => [request.step1ApproverId, request.step2ApproverId]).filter((id): id is string => Boolean(id)))];
    const reviewers = reviewerIds.length ? await this.prisma.user.findMany({
      where: { companyId, id: { in: reviewerIds } },
      select: { id: true, role: true, email: true, employee: { select: { firstName: true, lastName: true } } },
    }) : [];
    return requests.map((request) => {
      const assigned = (id: string | null) => {
        const reviewer = reviewers.find((item) => item.id === id);
        return reviewer ? { name: [reviewer.employee?.firstName, reviewer.employee?.lastName].filter(Boolean).join(' ') || reviewer.email, role: reviewer.role } : null;
      };
      return {
        ...request,
        step1AssignedReviewer: assigned(request.step1ApproverId),
        step2AssignedReviewer: assigned(request.step2ApproverId),
        ...(!this.canReadPrescription(user, request.employee.userId) ? { medicalCertUrl: null } : {}),
        ...(request.employee.userId === user.id ? {
          step1Notes: request.step1Status === ApprovalStatus.REJECTED ? request.step1Notes : null,
          step2Notes: request.step2Status === ApprovalStatus.REJECTED ? request.step2Notes : null,
          finalNotes: null,
        } : {}),
      };
    });
  }

  /**
   * Get single leave request details.
   */
  async getLeaveRequestById(
    companyId: string,
    id: string,
    user: { id: string; role: UserRole },
  ) {
    if (!companyId) throw new NotFoundException('Leave request not found.');
    const scope = await this.getLeaveReadScope(companyId, user);
    const request = await this.prisma.leaveRequest.findFirst({
      where: { id, ...scope },
      include: {
        leaveTypeSetting: true,
        employee: { select: leaveEmployee },
      },
    });

    if (!request) {
      throw new NotFoundException('Leave request not found.');
    }

    return {
      ...request,
      ...(!this.canReadPrescription(user, request.employee.userId) ? { medicalCertUrl: null } : {}),
      ...(request.employee.userId === user.id ? {
        step1Notes: request.step1Status === ApprovalStatus.REJECTED ? request.step1Notes : null,
        step2Notes: request.step2Status === ApprovalStatus.REJECTED ? request.step2Notes : null,
        finalNotes: null,
      } : {}),
    };
  }

  /**
   * Step 1 Approver Decision (Team Lead / Dept Manager).
   */
  private async decisionActor(tx: Prisma.TransactionClient, companyId: string, userId: string) {
    const actor = await tx.user.findFirst({
      where: { id: userId, OR: [{ companyId }, { role: UserRole.SUPER_ADMIN }] },
      select: { id: true, email: true, role: true, employee: { select: { firstName: true, lastName: true } } },
    });
    if (!actor) throw new ForbiddenException('Reviewer not found in this company.');
    return { id: actor.id, name: [actor.employee?.firstName, actor.employee?.lastName].filter(Boolean).join(' ') || actor.email, role: actor.role };
  }

  async approveStep1(
    companyId: string,
    id: string,
    userId: string,
    userRole: UserRole,
    dto: ApproveStepDto,
  ) {
    if (!companyId) throw new NotFoundException('Leave request not found.');
    const request = await this.prisma.leaveRequest.findFirst({
      where: { id, companyId },
      include: { leaveTypeSetting: true, employee: { include: { user: true } } },
    });

    if (!request) {
      throw new NotFoundException('Leave request not found.');
    }

    if (
      request.status !== LeaveStatus.PENDING ||
      request.step1Status !== ApprovalStatus.PENDING
    ) {
      throw new BadRequestException('Step 1 approval is not pending for this request.');
    }

    if (request.employee.userId === userId ||
        !this.approvalEngine.canApprove(1, request, { id: userId, role: userRole })) {
      throw new ForbiddenException('You are not authorized to approve Step 1 of this request.');
    }

    const ceoRequired = (request.policySnapshot as RequestPolicy | null)?.exceptional &&
      request.step2Status === ApprovalStatus.SKIPPED;
    if (ceoRequired && userRole !== UserRole.COMPANY_ADMIN) {
      throw new ForbiddenException('Only the CEO can make the final exceptional leave decision.');
    }

    if (dto.decision === 'REJECT') {
      return this.prisma.$transaction(async (tx) => {
      await lockEmployeeLeave(tx, companyId, request.employeeId);
        const actor = await this.decisionActor(tx, companyId, userId);
      if (ceoRequired && actor.role !== UserRole.COMPANY_ADMIN) throw new ForbiddenException('CEO reviewer required.');
        const updated = await this.updatePendingLeaveRequest(tx, request, {
          step1ActorId: actor.id, step1ActorName: actor.name, step1ActorRole: actor.role,
          step1Status: ApprovalStatus.REJECTED,
          step1ApprovedAt: new Date(),
          step1Notes: dto.notes,
          status: LeaveStatus.REJECTED,
        });

        await this.settleLeaveBalances(tx, request, false);

        await tx.notification.create({
          data: {
            companyId,
            userId: request.employee.userId,
            type: NotificationType.LEAVE_REJECTED,
            title: 'Leave Request Rejected (Step 1)',
            body: `Your leave request was rejected at Step 1: ${dto.notes || 'No reason provided.'}`,
            data: { leaveRequestId: id },
          },
        });

        return updated;
      });
    }

    const range = this.approvalRange(request, dto, 1);
    return this.prisma.$transaction(async (tx) => {
      await lockEmployeeLeave(tx, companyId, request.employeeId);
      const isFinal = request.step2Status === ApprovalStatus.SKIPPED;
      const actor = await this.decisionActor(tx, companyId, userId);
      if (ceoRequired && actor.role !== UserRole.COMPANY_ADMIN) throw new ForbiddenException('CEO reviewer required.');

      const updated = await this.updatePendingLeaveRequest(tx, request, {
        step1ActorId: actor.id, step1ActorName: actor.name, step1ActorRole: actor.role,
        step1Status: ApprovalStatus.APPROVED,
        step1ApprovedStart: range.start,
        step1ApprovedEnd: range.end,
        step1PartialReason: range.reason,
        ...(isFinal ? this.finalApproval(range) : {}),
        step1ApprovedAt: new Date(),
        step1Notes: dto.notes,
        status: isFinal ? LeaveStatus.APPROVED : LeaveStatus.PENDING,
        finalStatus: isFinal ? ApprovalStatus.APPROVED : ApprovalStatus.PENDING,
        finalApproverId: isFinal ? userId : null,
        finalApprovedAt: isFinal ? new Date() : null,
      });

      if (isFinal) {
        await this.settleLeaveBalances(tx, request, range.allocation);
        await this.applyApprovedAttendance(tx, request, range.start, range.end, userId, updated.finalApprovedAt ?? new Date());

        await tx.notification.create({
          data: {
            companyId,
            userId: request.employee.userId,
            type: NotificationType.LEAVE_APPROVED,
            ...this.approvedNotification(request, range),
            data: { leaveRequestId: id },
          },
        });
      } else {
        // Notify Step 2 approver
        const eligible = await tx.user.findMany({
          where: {
            ...availableApprover, companyId, id: { not: request.employee.userId },
            role: { in: (request.policySnapshot as RequestPolicy | null)?.exceptional
              ? [UserRole.COMPANY_ADMIN] : [UserRole.HR_MANAGER, UserRole.COMPANY_ADMIN] },
          },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          select: { id: true, role: true },
        });
        const recipient = eligible.find(({ id }) => id === request.step2ApproverId) ??
          eligible.find(({ role }) => role === UserRole.HR_MANAGER) ?? eligible[0];
        if (recipient) {
          await tx.notification.create({
            data: {
              companyId,
              userId: recipient.id,
              type: NotificationType.LEAVE_SUBMITTED,
              title: 'Leave Request Awaiting Final Approval (Step 2)',
              body: `A leave request from ${request.employee.firstName} ${request.employee.lastName} passed Step 1. Review ${range.days} day(s) from ${range.start.toISOString().slice(0, 10)} to ${range.end.toISOString().slice(0, 10)}.`,
              data: { leaveRequestId: id },
            },
          });
        }
      }

      return updated;
    });
  }

  /**
   * Step 2 Approver Decision (HR Manager / Executive).
   */
  async approveStep2(
    companyId: string,
    id: string,
    userId: string,
    userRole: UserRole,
    dto: ApproveStepDto,
  ) {
    if (!companyId) throw new NotFoundException('Leave request not found.');
    const request = await this.prisma.leaveRequest.findFirst({
      where: { id, companyId },
      include: { leaveTypeSetting: true, employee: { include: { user: true } } },
    });

    if (!request) {
      throw new NotFoundException('Leave request not found.');
    }

    if (
      request.status !== LeaveStatus.PENDING ||
      (request.step1Status !== ApprovalStatus.APPROVED &&
        request.step1Status !== ApprovalStatus.SKIPPED) ||
      request.step2Status !== ApprovalStatus.PENDING
    ) {
      throw new BadRequestException('Step 2 approval is not pending for this request.');
    }

    if (request.employee.userId === userId ||
        !this.approvalEngine.canApprove(2, request, { id: userId, role: userRole })) {
      throw new ForbiddenException('You are not authorized to approve Step 2 of this request.');
    }

    const ceoRequired = (request.policySnapshot as RequestPolicy | null)?.exceptional &&
      true;
    if (ceoRequired && userRole !== UserRole.COMPANY_ADMIN) {
      throw new ForbiddenException('Only the CEO can make the final exceptional leave decision.');
    }

    if (dto.decision === 'REJECT') {
      return this.prisma.$transaction(async (tx) => {
      await lockEmployeeLeave(tx, companyId, request.employeeId);
        const actor = await this.decisionActor(tx, companyId, userId);
      if (ceoRequired && actor.role !== UserRole.COMPANY_ADMIN) throw new ForbiddenException('CEO reviewer required.');
        const updated = await this.updatePendingLeaveRequest(tx, request, {
          step2ActorId: actor.id, step2ActorName: actor.name, step2ActorRole: actor.role,
          step2Status: ApprovalStatus.REJECTED,
          step2ApprovedAt: new Date(),
          step2Notes: dto.notes,
          status: LeaveStatus.REJECTED,
        });

        await this.settleLeaveBalances(tx, request, false);

        await tx.notification.create({
          data: {
            companyId,
            userId: request.employee.userId,
            type: NotificationType.LEAVE_REJECTED,
            title: 'Leave Request Rejected by HR (Step 2)',
            body: `Your leave request was rejected at Step 2: ${dto.notes || 'No reason provided.'}`,
            data: { leaveRequestId: id },
          },
        });

        return updated;
      });
    }

    const range = this.approvalRange(request, dto, 2);
    return this.prisma.$transaction(async (tx) => {
      await lockEmployeeLeave(tx, companyId, request.employeeId);
      const actor = await this.decisionActor(tx, companyId, userId);
      if (ceoRequired && actor.role !== UserRole.COMPANY_ADMIN) throw new ForbiddenException('CEO reviewer required.');
      const updated = await this.updatePendingLeaveRequest(tx, request, {
        step2ActorId: actor.id, step2ActorName: actor.name, step2ActorRole: actor.role,
        step2Status: ApprovalStatus.APPROVED,
        step2PartialReason: range.reason,
        ...this.finalApproval(range),
        step2ApprovedAt: new Date(),
        step2Notes: dto.notes,
        status: LeaveStatus.APPROVED,
        finalStatus: ApprovalStatus.APPROVED,
        finalApproverId: userId,
        finalApprovedAt: new Date(),
      });

      await this.settleLeaveBalances(tx, request, range.allocation);
      await this.applyApprovedAttendance(tx, request, range.start, range.end, userId, updated.finalApprovedAt ?? new Date());

      await tx.notification.create({
        data: {
          companyId,
          userId: request.employee.userId,
          type: NotificationType.LEAVE_APPROVED,
          ...this.approvedNotification(request, range),
          data: { leaveRequestId: id },
        },
      });

      return updated;
    });
  }

  /**
   * Cancel a pending leave request.
   */
  async cancelLeaveRequest(companyId: string, id: string, userId: string) {
    if (!companyId) throw new NotFoundException('Leave request not found.');
    const employee = await this.prisma.employee.findFirst({
      where: { companyId, userId },
    });
    if (!employee) {
      throw new NotFoundException('Employee not found.');
    }

    const request = await this.prisma.leaveRequest.findFirst({
      where: { id, companyId, employeeId: employee.id },
      include: { leaveTypeSetting: true },
    });

    if (!request) {
      throw new NotFoundException('Leave request not found.');
    }

    if (request.status !== LeaveStatus.PENDING) {
      throw new BadRequestException('Only pending leave requests can be cancelled.');
    }

    return this.prisma.$transaction(async (tx) => {
      await lockEmployeeLeave(tx, companyId, request.employeeId);
      const updated = await this.updatePendingLeaveRequest(tx, request, {
        status: LeaveStatus.CANCELLED,
        cancelledAt: new Date(),
        cancelledById: userId,
      });

      await this.settleLeaveBalances(tx, request, false);

      return updated;
    });
  }

  /**
   * Get direct prescription download / view URL for HR.
   */
  async getPrescriptionDownload(
    companyId: string,
    id: string,
    user: { id: string; role: UserRole },
  ) {
    if (!companyId) throw new NotFoundException('Leave request not found.');
    const request = await this.prisma.leaveRequest.findFirst({
      where: { id, companyId, employee: { companyId } },
      include: { employee: { select: { userId: true } } },
    });

    if (!request) {
      throw new NotFoundException('Leave request not found.');
    }

    // Allowed: HR Manager, Company Admin, Super Admin, or the requester
    if (!this.canReadPrescription(user, request.employee.userId)) {
      throw new ForbiddenException('You do not have permission to view this medical document.');
    }

    if (!request.medicalCertUrl) {
      throw new NotFoundException('No medical document attached to this request.');
    }

    return {
      leaveRequestId: request.id,
      medicalCertUrl: this.storageService.getDownloadUrl(request.medicalCertUrl, [
        `zenhr/companies/${companyId}/prescriptions`,
        'prescriptions',
      ]),
    };
  }
}
