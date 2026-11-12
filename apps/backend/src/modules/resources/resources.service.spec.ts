import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ApprovalStatus, Prisma, ResourceRequestStatus, UserRole } from '@prisma/client';
import { PrismaService } from '@common/prisma/prisma.service';
import { ResourcesService } from './resources.service';
import { DataScopeService } from '@common/services/data-scope.service';

describe('ResourcesService', () => {
  let service: ResourcesService;
  let prisma: any;

  const mockCompanyId = 'company-123';
  const mockUserId = 'user-emp-1';
  const mockEmployeeId = 'emp-1';

  beforeEach(async () => {
    prisma = {
      employee: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
      },
      resourceRequest: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      notification: {
        create: jest.fn(),
      },
      $transaction: jest.fn((callback) => callback(prisma)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ResourcesService,
        DataScopeService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<ResourcesService>(ResourcesService);
  });

  describe('createResourceRequest', () => {
    it('should throw NotFoundException if employee profile is missing', async () => {
      prisma.employee.findFirst.mockResolvedValue(null);

      await expect(
        service.createResourceRequest(mockCompanyId, mockUserId, {
          resourceType: 'Laptop',
          description: 'MacBook Pro M3 for development',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should create resource request and notify department manager if assigned', async () => {
      prisma.employee.findFirst.mockResolvedValue({
        id: mockEmployeeId,
        firstName: 'Bob',
        lastName: 'Jones',
        department: { companyId: mockCompanyId, managerId: 'mgr-1' },
      });
      prisma.employee.findUnique.mockResolvedValue({ id: 'mgr-1', userId: 'mgr-user-id' });
      prisma.resourceRequest.create.mockResolvedValue({
        id: 'res-1',
        resourceType: 'Laptop',
        status: ResourceRequestStatus.PENDING,
      });

      const result = await service.createResourceRequest(mockCompanyId, mockUserId, {
        resourceType: 'Laptop',
        description: 'MacBook Pro M3 for development',
      });

      expect(prisma.resourceRequest.create).toHaveBeenCalled();
      expect(prisma.employee.findUnique).toHaveBeenCalledWith({
        where: { id: 'mgr-1', companyId: mockCompanyId, deletedAt: null },
        select: { userId: true },
      });
      expect(prisma.notification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'mgr-user-id',
          }),
        }),
      );
      expect(result.id).toBe('res-1');
    });

    it.each([mockCompanyId, 'different-company'])('leaves an unavailable manager unassigned for department %s', async (departmentCompanyId) => {
      prisma.employee.findFirst.mockResolvedValue({
        id: mockEmployeeId,
        department: { companyId: departmentCompanyId, managerId: 'unavailable-manager' },
      });
      prisma.employee.findUnique.mockResolvedValue(null);
      prisma.resourceRequest.create.mockResolvedValue({ id: 'res-2' });

      await service.createResourceRequest(mockCompanyId, mockUserId, {
        resourceType: 'Laptop', description: 'Development workstation',
      });

      expect(prisma.resourceRequest.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ step1ApproverId: null }),
      }));
      expect(prisma.employee.findUnique).toHaveBeenCalledTimes(departmentCompanyId === mockCompanyId ? 1 : 0);
      expect(prisma.notification.create).not.toHaveBeenCalled();
    });
  });

  describe('approveResourceRequest', () => {
    it('should approve resource request and transition status to STEP_1_APPROVED', async () => {
      const mockReq = {
        id: 'res-1',
        companyId: mockCompanyId,
        status: ResourceRequestStatus.PENDING,
        resourceType: 'Laptop',
        step1ApproverId: 'mgr-user-id',
        requestedBy: { userId: mockUserId },
      };
      prisma.resourceRequest.findFirst.mockResolvedValue(mockReq);
      prisma.resourceRequest.update.mockResolvedValue({
        ...mockReq,
        status: ResourceRequestStatus.STEP_1_APPROVED,
        step1Status: ApprovalStatus.APPROVED,
      });

      const result = await service.approveResourceRequest(
        mockCompanyId,
        'res-1',
        'mgr-user-id',
        UserRole.DEPARTMENT_MANAGER,
        { decision: 'APPROVE', notes: 'Approved for Q4 budget' },
      );

      expect(prisma.resourceRequest.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: 'res-1', companyId: mockCompanyId, status: ResourceRequestStatus.PENDING },
      }));
      expect(result.status).toBe(ResourceRequestStatus.STEP_1_APPROVED);
    });

    it('should reject resource request when decision is REJECT', async () => {
      const mockReq = {
        id: 'res-1',
        companyId: mockCompanyId,
        status: ResourceRequestStatus.PENDING,
        resourceType: 'Laptop',
        step1ApproverId: 'mgr-user-id',
        requestedBy: { userId: mockUserId },
      };
      prisma.resourceRequest.findFirst.mockResolvedValue(mockReq);
      prisma.resourceRequest.update.mockResolvedValue({
        ...mockReq,
        status: ResourceRequestStatus.REJECTED,
        step1Status: ApprovalStatus.REJECTED,
      });

      const result = await service.approveResourceRequest(
        mockCompanyId,
        'res-1',
        'mgr-user-id',
        UserRole.DEPARTMENT_MANAGER,
        { decision: 'REJECT', notes: 'Budget exhausted' },
      );

      expect(result.status).toBe(ResourceRequestStatus.REJECTED);
    });

    it('should prevent a DEPARTMENT_MANAGER from self-approving their own resource request', async () => {
      const mockReq = {
        id: 'res-self',
        companyId: mockCompanyId,
        status: ResourceRequestStatus.PENDING,
        resourceType: 'Laptop',
        step1ApproverId: 'mgr-user-id',
        requestedBy: { userId: 'mgr-user-id' },
      };
      prisma.resourceRequest.findFirst.mockResolvedValue(mockReq);

      await expect(
        service.approveResourceRequest(
          mockCompanyId,
          'res-self',
          'mgr-user-id',
          UserRole.DEPARTMENT_MANAGER,
          { decision: 'APPROVE', notes: 'Self approved' },
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('fulfillResourceRequest', () => {
    it('should throw ForbiddenException if user does not have fulfillment privileges', async () => {
      await expect(
        service.fulfillResourceRequest(
          mockCompanyId,
          'res-1',
          mockUserId,
          UserRole.EMPLOYEE,
          { notes: 'Ready' },
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should fulfill resource request when user has operation/admin role', async () => {
      const mockReq = {
        id: 'res-1',
        companyId: mockCompanyId,
        status: ResourceRequestStatus.STEP_1_APPROVED,
        resourceType: 'Laptop',
        requestedBy: { userId: mockUserId },
      };
      prisma.resourceRequest.findFirst.mockResolvedValue(mockReq);
      prisma.resourceRequest.update.mockResolvedValue({
        ...mockReq,
        status: ResourceRequestStatus.FULFILLED,
      });

      const result = await service.fulfillResourceRequest(
        mockCompanyId,
        'res-1',
        'admin-user-id',
        UserRole.COMPANY_ADMIN,
        { notes: 'Delivered' },
      );

      expect(prisma.resourceRequest.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: 'res-1', companyId: mockCompanyId, status: ResourceRequestStatus.STEP_1_APPROVED },
      }));
      expect(result.status).toBe(ResourceRequestStatus.FULFILLED);
    });

    it('reports a competing decision without creating a second notification', async () => {
      prisma.resourceRequest.findFirst.mockResolvedValue({
        id: 'res-1', companyId: mockCompanyId, status: ResourceRequestStatus.STEP_1_APPROVED,
        resourceType: 'Laptop', requestedBy: { userId: mockUserId },
      });
      prisma.resourceRequest.update.mockRejectedValue(new Prisma.PrismaClientKnownRequestError(
        'Record changed', { code: 'P2025', clientVersion: 'test' },
      ));

      await expect(service.fulfillResourceRequest(
        mockCompanyId, 'res-1', 'hr-user-id', UserRole.HR_MANAGER, { notes: 'Delivered' },
      )).rejects.toThrow(ConflictException);
      expect(prisma.notification.create).not.toHaveBeenCalled();
    });
  });
});
