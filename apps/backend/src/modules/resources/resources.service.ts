import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import {
  ApprovalStatus,
  NotificationType,
  Prisma,
  ResourceRequest,
  ResourceRequestStatus,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '@common/prisma/prisma.service';
import { DataScopeService } from '@common/services/data-scope.service';
import { rethrowMissingRecordAsConflict } from '@common/utils/prisma-conflict';
import { CreateResourceRequestDto } from './dto/create-resource-request.dto';
import { ApproveResourceRequestDto } from './dto/approve-resource-request.dto';
import { FulfillResourceRequestDto } from './dto/fulfill-resource-request.dto';

@Injectable()
export class ResourcesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dataScopeService: DataScopeService,
  ) {}

  /**
   * Submit a new equipment/software resource request.
   */
  async createResourceRequest(
    companyId: string,
    userId: string,
    dto: CreateResourceRequestDto,
  ) {
    const employee = await this.prisma.employee.findFirst({
      where: { companyId, userId, deletedAt: null },
      include: { department: { select: { companyId: true, managerId: true } } },
    });

    if (!employee) {
      throw new NotFoundException('Employee profile not found.');
    }

    // Step 1 approver: department manager if present, else null
    let step1ApproverId: string | null = null;
    if (employee.department?.companyId === companyId && employee.department.managerId) {
      const mgr = await this.prisma.employee.findUnique({
        where: { id: employee.department.managerId, companyId, deletedAt: null },
        select: { userId: true },
      });
      step1ApproverId = mgr?.userId || null;
    }

    const created = await this.prisma.resourceRequest.create({
      data: {
        companyId,
        requestedById: employee.id,
        resourceType: dto.resourceType,
        description: dto.description,
        justification: dto.justification,
        status: ResourceRequestStatus.PENDING,
        step1ApproverId,
        step1Status: ApprovalStatus.PENDING,
      },
      include: {
        requestedBy: {
          include: {
            user: { select: { id: true, email: true, role: true } },
            department: true,
          },
        },
      },
    });

    if (step1ApproverId) {
      await this.prisma.notification.create({
        data: {
          companyId,
          userId: step1ApproverId,
          type: NotificationType.GENERAL,
          title: 'New Resource Request Submitted',
          body: `${employee.firstName} ${employee.lastName} requested resource: ${dto.resourceType}`,
          data: { resourceRequestId: created.id },
        },
      });
    }

    return created;
  }

  /**
   * List resource requests according to role scope.
   */
  async getResourceRequests(
    companyId: string,
    user: { id: string; role: UserRole },
    status?: ResourceRequestStatus,
  ) {
    // Platform roles without a company context should not see any requests
    if (!companyId) {
      return [];
    }
    const scope = await this.dataScopeService.resolveEmployeeScope(this.prisma, companyId, user);
    const where: Prisma.ResourceRequestWhereInput = {
      companyId,
      status,
      requestedBy: scope,
    };
    if (user.role === UserRole.DEPARTMENT_MANAGER || user.role === UserRole.TEAM_LEAD) {
      where.requestedBy = { companyId, deletedAt: null };
      where.OR = [{ requestedBy: scope }, { step1ApproverId: user.id }];
    }

    return this.prisma.resourceRequest.findMany({
      where,
      include: {
        requestedBy: {
          select: {
            id: true,
            userId: true,
            employeeCode: true,
            firstName: true,
            lastName: true,
            department: { select: { id: true, name: true } },
            team: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Approve or reject a resource request (Manager / HR / Admin).
   */
  async approveResourceRequest(
    companyId: string,
    id: string,
    userId: string,
    userRole: UserRole,
    dto: ApproveResourceRequestDto,
  ) {
    if (!companyId) throw new ForbiddenException('Company context required.');
    const request = await this.prisma.resourceRequest.findFirst({
      where: { id, companyId },
      include: { requestedBy: { select: { userId: true, teamId: true, departmentId: true } } },
    });

    if (!request) {
      throw new NotFoundException('Resource request not found.');
    }

    const isOperationsRole =
      userRole === UserRole.SUPER_ADMIN ||
      userRole === UserRole.OPERATION_MANAGER ||
      userRole === UserRole.COMPANY_ADMIN ||
      userRole === UserRole.HR_MANAGER;

    const canAct =
      request.status === ResourceRequestStatus.PENDING ||
      (request.status === ResourceRequestStatus.STEP_1_APPROVED &&
        dto.decision === 'REJECT' &&
        isOperationsRole);
    if (!isOperationsRole) {
      if (userRole !== UserRole.DEPARTMENT_MANAGER && userRole !== UserRole.TEAM_LEAD) {
        throw new ForbiddenException('Not authorized to approve this resource request.');
      }
      if (request.requestedBy.userId === userId) {
        throw new ForbiddenException('You cannot approve your own resource request.');
      }
      if (request.step1ApproverId !== userId) {
        const scope = await this.dataScopeService.resolveEmployeeScope(this.prisma, companyId, {
          id: userId,
          role: userRole,
        });
        const inScope = userRole === UserRole.TEAM_LEAD
          ? scope.teamId && scope.teamId === request.requestedBy.teamId
          : scope.departmentId && scope.departmentId === request.requestedBy.departmentId;
        if (!inScope) throw new ForbiddenException('Not authorized to approve this resource request.');
      }
    }

    if (!canAct) throw new ConflictException('Resource request cannot be actioned at this stage.');

    const rejected = dto.decision === 'REJECT';
    return this.transitionRequest(request, {
      status: rejected ? ResourceRequestStatus.REJECTED : ResourceRequestStatus.STEP_1_APPROVED,
      step1Status: rejected ? ApprovalStatus.REJECTED : ApprovalStatus.APPROVED,
      step1ApprovedAt: new Date(),
      step1Notes: dto.notes,
    }, rejected ? {
      title: 'Resource Request Rejected',
      body: `Your request for ${request.resourceType} was rejected: ${dto.notes || 'No reason provided.'}`,
    } : {
      title: 'Resource Request Approved (Ready for Fulfillment)',
      body: `Your request for ${request.resourceType} has been approved and queued for IT/Operations fulfillment.`,
    });
  }

  /**
   * Fulfill resource request (Operations / HR / Admin).
   */
  async fulfillResourceRequest(
    companyId: string,
    id: string,
    userId: string,
    userRole: UserRole,
    dto: FulfillResourceRequestDto,
  ) {
    const isOperations =
      userRole === UserRole.COMPANY_ADMIN ||
      userRole === UserRole.HR_MANAGER ||
      userRole === UserRole.OPERATION_MANAGER ||
      userRole === UserRole.SUPER_ADMIN;

    if (!isOperations) {
      throw new ForbiddenException('Only Operations, HR, or Company Admins can fulfill resource requests.');
    }

    if (!companyId) throw new ForbiddenException('Company context required.');
    const request = await this.prisma.resourceRequest.findFirst({
      where: { id, companyId },
      include: { requestedBy: { select: { userId: true } } },
    });

    if (!request) {
      throw new NotFoundException('Resource request not found.');
    }

    if (request.status !== ResourceRequestStatus.STEP_1_APPROVED) {
      if (request.status === ResourceRequestStatus.PENDING) {
        throw new BadRequestException('Request must be approved before fulfillment.');
      }
      throw new ConflictException('Resource request cannot be fulfilled at this stage.');
    }

    return this.transitionRequest(request, {
      status: ResourceRequestStatus.FULFILLED,
      step3FulfilledAt: new Date(),
      step3FulfilledBy: userId,
      step3Notes: dto.notes,
    }, {
      title: 'Resource Request Fulfilled',
      body: `Your requested resource (${request.resourceType}) has been fulfilled: ${dto.notes || 'Ready for pickup/use.'}`,
    });
  }

  private async transitionRequest(
    request: Pick<ResourceRequest, 'id' | 'companyId' | 'status'> & { requestedBy: { userId: string } },
    data: Prisma.ResourceRequestUncheckedUpdateInput,
    notification: { title: string; body: string },
  ) {
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.resourceRequest.update({
        where: { id: request.id, companyId: request.companyId, status: request.status },
        data,
      }).catch((error: unknown) => rethrowMissingRecordAsConflict(
        error, 'The resource request changed. Refresh it before trying again.',
      ));

      await tx.notification.create({
        data: {
          companyId: request.companyId,
          userId: request.requestedBy.userId,
          type: NotificationType.GENERAL,
          ...notification,
          data: { resourceRequestId: request.id },
        },
      });

      return updated;
    });
  }
}
