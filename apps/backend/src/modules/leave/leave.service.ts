import 'multer';
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import {
  ApprovalStatus,
  LeaveStatus,
  LeaveType,
  NotificationType,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '@common/prisma/prisma.service';
import { StorageService } from '@common/storage/storage.service';
import { MailService } from '@common/mail/mail.service';
import { ApprovalEngineService, RequesterContext } from './approval-engine.service';
import { CreateLeaveRequestDto } from './dto/create-leave-request.dto';
import { ApproveStepDto } from './dto/approve-step.dto';
import { UpdateLeaveTypeDto } from './dto/update-leave-type.dto';

@Injectable()
export class LeaveService {
  private readonly logger = new Logger(LeaveService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly approvalEngine: ApprovalEngineService,
    private readonly storageService: StorageService,
    private readonly mailService: MailService,
  ) {}

  /**
   * Ensure default leave types exist for a company.
   */
  async ensureDefaultLeaveTypes(companyId: string) {
    const existing = await this.prisma.leaveTypeSetting.findMany({
      where: { companyId },
    });
    if (existing.length === 0) {
      await this.prisma.leaveTypeSetting.createMany({
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
  async getLeaveBalances(companyId: string, employeeId: string, year?: number) {
    const targetYear = year || new Date().getFullYear();
    const settings = await this.ensureDefaultLeaveTypes(companyId);

    // Fetch existing balances
    const balances = await this.prisma.leaveBalance.findMany({
      where: {
        companyId,
        employeeId,
        year: targetYear,
      },
    });

    // Ensure all leave types have a balance record
    for (const setting of settings) {
      const exists = balances.find((b) => b.leaveType === setting.leaveType);
      if (!exists) {
        const created = await this.prisma.leaveBalance.create({
          data: {
            companyId,
            employeeId,
            leaveType: setting.leaveType,
            year: targetYear,
            allocated: setting.annualAllocation,
            used: 0,
            pending: 0,
            carried: 0,
          },
        });
        balances.push(created);
      }
    }

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
      where: { companyId, userId },
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

    // 6. Check leave balance
    const currentYear = new Date(dto.startDate).getFullYear();
    let balance = await this.prisma.leaveBalance.findUnique({
      where: {
        companyId_employeeId_leaveType_year: {
          companyId,
          employeeId: employee.id,
          leaveType: setting.leaveType,
          year: currentYear,
        },
      },
    });

    if (!balance) {
      balance = await this.prisma.leaveBalance.create({
        data: {
          companyId,
          employeeId: employee.id,
          leaveType: setting.leaveType,
          year: currentYear,
          allocated: setting.annualAllocation,
          used: 0,
          pending: 0,
          carried: 0,
        },
      });
    }

    const availableDays = balance.allocated + balance.carried - balance.used - balance.pending;
    if (totalDays > availableDays) {
      throw new BadRequestException(
        `Insufficient leave balance. Requested: ${totalDays} days, Available: ${availableDays} days.`,
      );
    }

    // 7. Medical certificate requirement
    let medicalCertUrl: string | undefined = undefined;
    if (file) {
      const uploadResult = await this.storageService.uploadFile(file, { folder: 'prescriptions' });
      medicalCertUrl = uploadResult.url;
    }

    if (setting.requiresMedicalCert && !medicalCertUrl) {
      throw new BadRequestException(
        'A medical prescription/certificate document is required for this leave type.',
      );
    }

    // 8. Resolve reporting line approvers
    let leadUserId: string | null = null;
    if (employee.team?.leadId) {
      const leadEmp = await this.prisma.employee.findUnique({
        where: { id: employee.team.leadId },
      });
      leadUserId = leadEmp?.userId || null;
    }

    let deptManagerUserId: string | null = null;
    if (employee.department?.managerId) {
      const mgrEmp = await this.prisma.employee.findUnique({
        where: { id: employee.department.managerId },
      });
      deptManagerUserId = mgrEmp?.userId || null;
    }

    const reportingManagerUserId = employee.reportingManager?.userId || null;

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

    // 9. Execute transaction: create request + update balance pending days
    const leaveRequest = await this.prisma.$transaction(async (tx) => {
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
          status: LeaveStatus.PENDING,
          step1ApproverId: approvers.step1ApproverId,
          step1Status: approvers.step1Status,
          step2ApproverId: approvers.step2ApproverId,
          step2Status: approvers.step2Status,
        },
        include: {
          leaveTypeSetting: true,
          employee: {
            include: {
              user: true,
            },
          },
        },
      });

      await tx.leaveBalance.update({
        where: { id: balance.id },
        data: {
          pending: { increment: totalDays },
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
    const where: any = { companyId };

    if (filter?.status) {
      where.status = filter.status;
    }

    if (user.role === UserRole.EMPLOYEE) {
      const emp = await this.prisma.employee.findFirst({
        where: { companyId, userId: user.id },
      });
      where.employeeId = emp?.id || 'none';
    } else if (filter?.employeeId) {
      where.employeeId = filter.employeeId;
    }

    return this.prisma.leaveRequest.findMany({
      where,
      include: {
        leaveTypeSetting: true,
        employee: {
          include: {
            user: true,
            department: true,
            team: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Get single leave request details.
   */
  async getLeaveRequestById(companyId: string, id: string) {
    const request = await this.prisma.leaveRequest.findFirst({
      where: { id, companyId },
      include: {
        leaveTypeSetting: true,
        employee: {
          include: {
            user: true,
            department: true,
            team: true,
          },
        },
      },
    });

    if (!request) {
      throw new NotFoundException('Leave request not found.');
    }

    return request;
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

    if (!this.approvalEngine.canApprove(1, request, { id: userId, role: userRole })) {
      throw new ForbiddenException('You are not authorized to approve Step 1 of this request.');
    }

    const currentYear = new Date(request.startDate).getFullYear();

    if (dto.decision === 'REJECT') {
      return this.prisma.$transaction(async (tx) => {
        const updated = await tx.leaveRequest.update({
          where: { id },
          data: {
            step1Status: ApprovalStatus.REJECTED,
            step1ApprovedAt: new Date(),
            step1Notes: dto.notes,
            status: LeaveStatus.REJECTED,
          },
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

      const updated = await tx.leaveRequest.update({
        where: { id },
        data: {
          step1Status: ApprovalStatus.APPROVED,
          step1ApprovedAt: new Date(),
          step1Notes: dto.notes,
          status: isFinal ? LeaveStatus.APPROVED : LeaveStatus.PENDING,
          finalStatus: isFinal ? ApprovalStatus.APPROVED : ApprovalStatus.PENDING,
          finalApproverId: isFinal ? userId : null,
          finalApprovedAt: isFinal ? new Date() : null,
        },
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
    const request = await this.prisma.leaveRequest.findFirst({
      where: { id, companyId },
      include: { leaveTypeSetting: true, employee: { include: { user: true } } },
    });

    if (!request) {
      throw new NotFoundException('Leave request not found.');
    }

    if (
      request.status !== LeaveStatus.PENDING ||
      request.step1Status !== ApprovalStatus.APPROVED ||
      request.step2Status !== ApprovalStatus.PENDING
    ) {
      throw new BadRequestException('Step 2 approval is not pending for this request.');
    }

    if (!this.approvalEngine.canApprove(2, request, { id: userId, role: userRole })) {
      throw new ForbiddenException('You are not authorized to approve Step 2 of this request.');
    }

    const currentYear = new Date(request.startDate).getFullYear();

    if (dto.decision === 'REJECT') {
      return this.prisma.$transaction(async (tx) => {
        const updated = await tx.leaveRequest.update({
          where: { id },
          data: {
            step2Status: ApprovalStatus.REJECTED,
            step2ApprovedAt: new Date(),
            step2Notes: dto.notes,
            status: LeaveStatus.REJECTED,
          },
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
      const updated = await tx.leaveRequest.update({
        where: { id },
        data: {
          step2Status: ApprovalStatus.APPROVED,
          step2ApprovedAt: new Date(),
          step2Notes: dto.notes,
          status: LeaveStatus.APPROVED,
          finalStatus: ApprovalStatus.APPROVED,
          finalApproverId: userId,
          finalApprovedAt: new Date(),
        },
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
      const updated = await tx.leaveRequest.update({
        where: { id },
        data: {
          status: LeaveStatus.CANCELLED,
          cancelledAt: new Date(),
          cancelledById: userId,
        },
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
    const request = await this.prisma.leaveRequest.findFirst({
      where: { id, companyId },
      include: { employee: true },
    });

    if (!request) {
      throw new NotFoundException('Leave request not found.');
    }

    // Allowed: HR Manager, Company Admin, Super Admin, or the requester
    const isAuthorized =
      user.role === UserRole.HR_MANAGER ||
      user.role === UserRole.COMPANY_ADMIN ||
      user.role === UserRole.SUPER_ADMIN ||
      request.employee.userId === user.id;

    if (!isAuthorized) {
      throw new ForbiddenException('You do not have permission to view this medical document.');
    }

    if (!request.medicalCertUrl) {
      throw new NotFoundException('No medical document attached to this request.');
    }

    return {
      leaveRequestId: request.id,
      medicalCertUrl: request.medicalCertUrl,
    };
  }
}
