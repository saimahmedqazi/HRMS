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

  /**
   * Ensure default leave types exist for a company.
   */
  async ensureDefaultLeaveTypes(companyId: string) {
    const existing = await this.prisma.leaveTypeSetting.findMany({
      where: { companyId },
    });
    if (existing.length === 0) {
      await this.prisma.leaveTypeSetting.createMany({
        skipDuplicates: true,
        data: [
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
    const settings = await this.ensureDefaultLeaveTypes(companyId);

    if (settings.length > 0) {
      await this.prisma.leaveBalance.createMany({
        data: settings.map((setting) => ({
          companyId,
          employeeId: resolvedEmployeeId,
          leaveType: setting.leaveType,
          year: targetYear,
          allocated: setting.annualAllocation,
        })),
        skipDuplicates: true,
      });
    }

    const balances = await this.prisma.leaveBalance.findMany({
      where: {
        companyId,
        employeeId: resolvedEmployeeId,
        year: targetYear,
      },
    });

    return balances.map((b) => ({
      ...b,
      available: b.allocated + b.carried - b.used - b.pending,
    }));
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
        reportingManager: true,
      },
    });

    if (!employee) {
      throw new NotFoundException('Employee profile not found for user.');
    }

    // 2. Probation gating assertion
    this.approvalEngine.assertCanRequestLeave({
      status: employee.status,
      hireDate: employee.hireDate,
      role: employee.user.role,
    });

    // 3. Find leave type setting
    const setting = await this.prisma.leaveTypeSetting.findFirst({
      where: { id: dto.leaveTypeSettingId, companyId },
    });
    if (!setting || !setting.isActive) {
      throw new BadRequestException('Selected leave type is inactive or does not exist.');
    }

    // 4. Validate reason if required
    if (setting.requiresReason && (!dto.reason || dto.reason.trim().length === 0)) {
      throw new BadRequestException('A reason is mandatory for this leave type.');
    }

    // 5. Calculate total days
    const totalDays = this.approvalEngine.calculateTotalDays(dto.startDate, dto.endDate);

    if (setting.requiresMedicalCert && !file) {
      throw new BadRequestException(
        'A medical prescription/certificate document is required for this leave type.',
      );
    }

    // Resolve reporting line approvers
    let leadUserId: string | null = null;
    if (employee.team?.leadId) {
      const leadEmp = await this.prisma.employee.findUnique({
        where: { id: employee.team.leadId, companyId, deletedAt: null },
      });
      leadUserId = leadEmp?.userId || null;
    }

    let deptManagerUserId: string | null = null;
    if (employee.department?.managerId) {
      const mgrEmp = await this.prisma.employee.findUnique({
        where: { id: employee.department.managerId, companyId, deletedAt: null },
      });
      deptManagerUserId = mgrEmp?.userId || null;
    }

    const reportingManager = employee.reportingManager;
    const reportingManagerUserId = reportingManager?.companyId === companyId && !reportingManager.deletedAt
      ? reportingManager.userId
      : null;

    const hrUser = await this.prisma.user.findFirst({
      where: { companyId, role: UserRole.HR_MANAGER },
    });
    const ceoUser = await this.prisma.user.findFirst({
      where: { companyId, role: UserRole.COMPANY_ADMIN },
    });

    const requesterContext: RequesterContext = {
      id: employee.id,
      userId: employee.userId,
      status: employee.status,
      hireDate: employee.hireDate,
      role: employee.user.role,
      leadUserId,
      deptManagerUserId,
      reportingManagerUserId,
    };

    const approvers = this.approvalEngine.resolveApprovers(
      requesterContext,
      hrUser?.id,
      ceoUser?.id,
    );

    const isAutoApproved =
      approvers.step1Status === ApprovalStatus.SKIPPED &&
      approvers.step2Status === ApprovalStatus.SKIPPED;

    const balanceKey = {
      companyId,
      employeeId: employee.id,
      leaveType: setting.leaveType,
      year: new Date(dto.startDate).getFullYear(),
    };
    const prescriptionFolder = `zenhr/companies/${companyId}/prescriptions`;
    const medicalCertUrl = file
      ? (await this.storageService.uploadFile(file, { folder: prescriptionFolder, authenticated: true })).url
      : undefined;

    const leaveRequest = await this.prisma.$transaction(async (tx) => {
      await tx.leaveBalance.createMany({
        data: { ...balanceKey, allocated: setting.annualAllocation },
        skipDuplicates: true,
      });

      // PostgreSQL rechecks the balance predicate after any competing write commits.
      const reserved = await tx.$executeRaw`
        UPDATE "leave_balances"
        SET "pending" = "pending" + ${isAutoApproved ? 0 : totalDays},
            "used" = "used" + ${isAutoApproved ? totalDays : 0},
            "updatedAt" = CURRENT_TIMESTAMP
        WHERE "companyId" = ${balanceKey.companyId}
          AND "employeeId" = ${balanceKey.employeeId}
          AND "leaveType" = ${balanceKey.leaveType}::"LeaveType"
          AND "year" = ${balanceKey.year}
          AND "allocated" + "carried" - "used" - "pending" >= ${totalDays}
      `;
      if (reserved === 0) {
        const balance = await tx.leaveBalance.findUnique({
          where: { companyId_employeeId_leaveType_year: balanceKey },
        });
        const availableDays = balance ? balance.allocated + balance.carried - balance.used - balance.pending : 0;
        throw new BadRequestException(
          `Insufficient leave balance. Requested: ${totalDays} days, Available: ${availableDays} days.`,
        );
      }

      const created = await tx.leaveRequest.create({
        data: {
          companyId,
          employeeId: employee.id,
          leaveTypeSettingId: setting.id,
          startDate: new Date(dto.startDate),
          endDate: new Date(dto.endDate),
          totalDays,
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
    return requests.map((request) => this.canReadPrescription(user, request.employee.userId)
      ? request
      : { ...request, medicalCertUrl: null });
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

    return this.canReadPrescription(user, request.employee.userId)
      ? request
      : { ...request, medicalCertUrl: null };
  }

  /**
   * Step 1 Approver Decision (Team Lead / Dept Manager).
   */
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

    const currentYear = new Date(request.startDate).getFullYear();

    if (dto.decision === 'REJECT') {
      return this.prisma.$transaction(async (tx) => {
        const updated = await this.updatePendingLeaveRequest(tx, request, {
          step1Status: ApprovalStatus.REJECTED,
          step1ApprovedAt: new Date(),
          step1Notes: dto.notes,
          status: LeaveStatus.REJECTED,
        });

        // Restore pending days
        await tx.leaveBalance.updateMany({
          where: {
            companyId,
            employeeId: request.employeeId,
            leaveType: request.leaveTypeSetting.leaveType,
            year: currentYear,
          },
          data: {
            pending: { decrement: request.totalDays },
          },
        });

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

    // Decision === APPROVE
    return this.prisma.$transaction(async (tx) => {
      const isFinal = request.step2Status === ApprovalStatus.SKIPPED;

      const updated = await this.updatePendingLeaveRequest(tx, request, {
        step1Status: ApprovalStatus.APPROVED,
        step1ApprovedAt: new Date(),
        step1Notes: dto.notes,
        status: isFinal ? LeaveStatus.APPROVED : LeaveStatus.PENDING,
        finalStatus: isFinal ? ApprovalStatus.APPROVED : ApprovalStatus.PENDING,
        finalApproverId: isFinal ? userId : null,
        finalApprovedAt: isFinal ? new Date() : null,
      });

      if (isFinal) {
        // Move from pending to used
        await tx.leaveBalance.updateMany({
          where: {
            companyId,
            employeeId: request.employeeId,
            leaveType: request.leaveTypeSetting.leaveType,
            year: currentYear,
          },
          data: {
            pending: { decrement: request.totalDays },
            used: { increment: request.totalDays },
          },
        });

        await tx.notification.create({
          data: {
            companyId,
            userId: request.employee.userId,
            type: NotificationType.LEAVE_APPROVED,
            title: 'Leave Request Fully Approved',
            body: `Your leave request for ${request.totalDays} day(s) has been approved.`,
            data: { leaveRequestId: id },
          },
        });
      } else {
        // Notify Step 2 approver
        if (request.step2ApproverId) {
          await tx.notification.create({
            data: {
              companyId,
              userId: request.step2ApproverId,
              type: NotificationType.LEAVE_SUBMITTED,
              title: 'Leave Request Awaiting Final Approval (Step 2)',
              body: `A leave request from ${request.employee.firstName} ${request.employee.lastName} passed Step 1 and requires HR approval.`,
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

    const currentYear = new Date(request.startDate).getFullYear();

    if (dto.decision === 'REJECT') {
      return this.prisma.$transaction(async (tx) => {
        const updated = await this.updatePendingLeaveRequest(tx, request, {
          step2Status: ApprovalStatus.REJECTED,
          step2ApprovedAt: new Date(),
          step2Notes: dto.notes,
          status: LeaveStatus.REJECTED,
        });

        // Restore pending days
        await tx.leaveBalance.updateMany({
          where: {
            companyId,
            employeeId: request.employeeId,
            leaveType: request.leaveTypeSetting.leaveType,
            year: currentYear,
          },
          data: {
            pending: { decrement: request.totalDays },
          },
        });

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

    // Step 2 APPROVE -> Final Approval
    return this.prisma.$transaction(async (tx) => {
      const updated = await this.updatePendingLeaveRequest(tx, request, {
        step2Status: ApprovalStatus.APPROVED,
        step2ApprovedAt: new Date(),
        step2Notes: dto.notes,
        status: LeaveStatus.APPROVED,
        finalStatus: ApprovalStatus.APPROVED,
        finalApproverId: userId,
        finalApprovedAt: new Date(),
      });

      // Move pending to used
      await tx.leaveBalance.updateMany({
        where: {
          companyId,
          employeeId: request.employeeId,
          leaveType: request.leaveTypeSetting.leaveType,
          year: currentYear,
        },
        data: {
          pending: { decrement: request.totalDays },
          used: { increment: request.totalDays },
        },
      });

      await tx.notification.create({
        data: {
          companyId,
          userId: request.employee.userId,
          type: NotificationType.LEAVE_APPROVED,
          title: 'Leave Request Fully Approved',
          body: `Your leave request for ${request.totalDays} day(s) has been approved by HR.`,
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

    const currentYear = new Date(request.startDate).getFullYear();

    return this.prisma.$transaction(async (tx) => {
      const updated = await this.updatePendingLeaveRequest(tx, request, {
        status: LeaveStatus.CANCELLED,
        cancelledAt: new Date(),
        cancelledById: userId,
      });

      await tx.leaveBalance.updateMany({
        where: {
          companyId,
          employeeId: employee.id,
          leaveType: request.leaveTypeSetting.leaveType,
          year: currentYear,
        },
        data: {
          pending: { decrement: request.totalDays },
        },
      });

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
