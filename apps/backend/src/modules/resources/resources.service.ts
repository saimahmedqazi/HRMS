import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import {
  ApprovalStatus,
  NotificationType,
  ResourceRequestStatus,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '@common/prisma/prisma.service';
import { CreateResourceRequestDto } from './dto/create-resource-request.dto';
import { ApproveResourceRequestDto } from './dto/approve-resource-request.dto';
import { FulfillResourceRequestDto } from './dto/fulfill-resource-request.dto';

@Injectable()
export class ResourcesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Submit a new equipment/software resource request.
   */
  async createResourceRequest(
    companyId: string,
    userId: string,
    dto: CreateResourceRequestDto,
  ) {
    const employee = await this.prisma.employee.findFirst({
      where: { companyId, userId },
      include: { department: true },
    });

    if (!employee) {
      throw new NotFoundException('Employee profile not found.');
    }

    // Step 1 approver: department manager if present, else null
    let step1ApproverId: string | null = null;
    if (employee.department?.managerId) {
      const mgr = await this.prisma.employee.findUnique({
        where: { id: employee.department.managerId },
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
            user: true,
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
    const where: any = { companyId };
    if (status) {
      where.status = status;
    }

    if (user.role === UserRole.EMPLOYEE) {
      const emp = await this.prisma.employee.findFirst({
        where: { companyId, userId: user.id },
      });
      where.requestedById = emp?.id || 'none';
    }

    return this.prisma.resourceRequest.findMany({
      where,
      include: {
        requestedBy: {
          include: {
            department: true,
            team: true,
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
    const request = await this.prisma.resourceRequest.findFirst({
      where: { id, companyId },
      include: { requestedBy: { include: { user: true } } },
    });

    if (!request) {
      throw new NotFoundException('Resource request not found.');
    }

    if (request.status !== ResourceRequestStatus.PENDING) {
      throw new BadRequestException('Resource request is not pending approval.');
    }

    const isAuthorized =
      userRole === UserRole.COMPANY_ADMIN ||
      userRole === UserRole.HR_MANAGER ||
      userRole === UserRole.DEPARTMENT_MANAGER ||
      request.step1ApproverId === userId;

    if (!isAuthorized) {
      throw new ForbiddenException('Not authorized to approve this resource request.');
    }

    if (dto.decision === 'REJECT') {
      const rejected = await this.prisma.resourceRequest.update({
        where: { id },
        data: {
          status: ResourceRequestStatus.REJECTED,
          step1Status: ApprovalStatus.REJECTED,
          step1ApprovedAt: new Date(),
          step1Notes: dto.notes,
        },
      });

      await this.prisma.notification.create({
        data: {
          companyId,
          userId: request.requestedBy.userId,
          type: NotificationType.GENERAL,
          title: 'Resource Request Rejected',
          body: `Your request for ${request.resourceType} was rejected: ${dto.notes || 'No reason provided.'}`,
          data: { resourceRequestId: id },
        },
      });

      return rejected;
    }

    const approved = await this.prisma.resourceRequest.update({
      where: { id },
      data: {
        status: ResourceRequestStatus.STEP_1_APPROVED,
        step1Status: ApprovalStatus.APPROVED,
        step1ApprovedAt: new Date(),
        step1Notes: dto.notes,
      },
    });

    await this.prisma.notification.create({
      data: {
        companyId,
        userId: request.requestedBy.userId,
        type: NotificationType.GENERAL,
        title: 'Resource Request Approved (Ready for Fulfillment)',
        body: `Your request for ${request.resourceType} has been approved and queued for IT/Operations fulfillment.`,
        data: { resourceRequestId: id },
      },
    });

    return approved;
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

    const request = await this.prisma.resourceRequest.findFirst({
      where: { id, companyId },
      include: { requestedBy: { include: { user: true } } },
    });

    if (!request) {
      throw new NotFoundException('Resource request not found.');
    }

    if (request.status !== ResourceRequestStatus.STEP_1_APPROVED) {
      throw new BadRequestException('Request must be approved before fulfillment.');
    }

    const fulfilled = await this.prisma.resourceRequest.update({
      where: { id },
      data: {
        status: ResourceRequestStatus.FULFILLED,
        step3FulfilledAt: new Date(),
        step3FulfilledBy: userId,
        step3Notes: dto.notes,
      },
    });

    await this.prisma.notification.create({
      data: {
        companyId,
        userId: request.requestedBy.userId,
        type: NotificationType.GENERAL,
        title: 'Resource Request Fulfilled',
        body: `Your requested resource (${request.resourceType}) has been fulfilled: ${dto.notes || 'Ready for pickup/use.'}`,
        data: { resourceRequestId: id },
      },
    });

    return fulfilled;
  }
}
