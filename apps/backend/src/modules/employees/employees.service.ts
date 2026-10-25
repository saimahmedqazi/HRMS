import 'multer';
import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { DataScopeService } from '../../common/services/data-scope.service';
import { MailService } from '../../common/mail/mail.service';
import { StorageService, DEFAULT_IMAGE_MIMES, DEFAULT_DOCUMENT_MIMES } from '../../common/storage/storage.service';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import {
  UserRole,
  EmployeeStatus,
  AuditAction,
  NotificationType,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { UpdateStatusDto } from './dto/update-status.dto';
import { CreateEmergencyContactDto } from './dto/create-emergency-contact.dto';

export interface EmployeeQueryFilter {
  search?: string;
  departmentId?: string;
  teamId?: string;
  status?: EmployeeStatus;
  page?: number;
  limit?: number;
}

@Injectable()
export class EmployeesService {
  private readonly logger = new Logger(EmployeesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly dataScopeService: DataScopeService,
    private readonly mailService: MailService,
    private readonly storageService: StorageService,
  ) {}

  private getEffectiveCompanyId(user: AuthenticatedUser): string {
    const companyId = user.supportModeCompanyId || user.companyId;
    if (!companyId) {
      throw new ForbiddenException('Company context required');
    }
    return companyId;
  }

  async listEmployees(user: AuthenticatedUser, query: EmployeeQueryFilter = {}) {
    const companyId = this.getEffectiveCompanyId(user);
    const userId = (user.id || user.sub)!;

    // Caller's employee context for data scope
    const callerEmployee = await this.prisma.employee.findFirst({
      where: { userId },
      select: { id: true, departmentId: true, teamId: true },
    });

    const scopeFilter = this.dataScopeService.applyScope(user, {
      departmentId: callerEmployee?.departmentId || undefined,
      teamId: callerEmployee?.teamId || undefined,
      employeeId: callerEmployee?.id || undefined,
    });

    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const skip = (page - 1) * limit;

    const whereClause: any = {
      companyId,
      deletedAt: null,
      ...(scopeFilter.departmentId ? { departmentId: scopeFilter.departmentId } : {}),
      ...(scopeFilter.teamId ? { teamId: scopeFilter.teamId } : {}),
      ...(scopeFilter.id ? { id: scopeFilter.id } : {}),
      ...(query.departmentId ? { departmentId: query.departmentId } : {}),
      ...(query.teamId ? { teamId: query.teamId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              { firstName: { contains: query.search, mode: 'insensitive' } },
              { lastName: { contains: query.search, mode: 'insensitive' } },
              { employeeCode: { contains: query.search, mode: 'insensitive' } },
              { user: { email: { contains: query.search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };

    const [total, items] = await Promise.all([
      this.prisma.employee.count({ where: whereClause }),
      this.prisma.employee.findMany({
        where: whereClause,
        include: {
          department: { select: { id: true, name: true } },
          designation: { select: { id: true, name: true } },
          team: { select: { id: true, name: true } },
          reportingManager: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              user: { select: { email: true } },
            },
          },
          user: {
            select: {
              id: true,
              email: true,
              role: true,
              lastLoginAt: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    return {
      items,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getEmployeeById(id: string, user: AuthenticatedUser) {
    const companyId = this.getEffectiveCompanyId(user);
    const userId = (user.id || user.sub)!;

    const employee = await this.prisma.employee.findFirst({
      where: { id, companyId, deletedAt: null },
      include: {
        department: true,
        designation: true,
        team: true,
        reportingManager: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            profilePictureUrl: true,
            designation: { select: { name: true } },
            user: { select: { email: true } },
          },
        },
        subordinates: {
          where: { deletedAt: null },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            status: true,
            profilePictureUrl: true,
            designation: { select: { name: true } },
          },
        },
        emergencyContacts: true,
        documents: true,
        leaveBalances: true,
        user: {
          select: {
            id: true,
            email: true,
            role: true,
            dataScope: true,
            isEmailVerified: true,
            lastLoginAt: true,
            lastLoginCity: true,
            lastLoginCountry: true,
            twoFaEnabled: true,
          },
        },
      },
    });

    if (!employee) throw new NotFoundException('Employee not found');

    // Self scope check
    if (user.role === UserRole.EMPLOYEE && employee.userId !== userId) {
      throw new ForbiddenException('You can only view your own profile');
    }

    return employee;
  }

  async onboardEmployee(dto: CreateEmployeeDto, user: AuthenticatedUser) {
    const companyId = this.getEffectiveCompanyId(user);

    // 1. Check email uniqueness
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });
    if (existingUser) {
      throw new ConflictException(`User with email '${dto.email}' already exists`);
    }

    // 2. Validate department, designation, team belong to company
    if (dto.departmentId) {
      const dept = await this.prisma.department.findFirst({
        where: { id: dto.departmentId, companyId, deletedAt: null },
      });
      if (!dept) throw new BadRequestException('Invalid department ID for this organization');
    }

    if (dto.designationId) {
      const desig = await this.prisma.designation.findFirst({
        where: { id: dto.designationId, companyId },
      });
      if (!desig) throw new BadRequestException('Invalid designation ID for this organization');
    }

    if (dto.teamId) {
      const team = await this.prisma.team.findFirst({
        where: { id: dto.teamId, companyId, deletedAt: null },
      });
      if (!team) throw new BadRequestException('Invalid team ID for this organization');
    }

    // 3. Validate reporting manager
    if (dto.reportingManagerId) {
      const manager = await this.prisma.employee.findFirst({
        where: { id: dto.reportingManagerId, companyId, deletedAt: null },
      });
      if (!manager) throw new BadRequestException('Reporting manager not found in this company');
    }

    // 4. Generate next employee code
    const count = await this.prisma.employee.count({ where: { companyId } });
    const employeeCode = `EMP-${String(count + 1).padStart(3, '0')}`;

    // 5. Generate random initial password
    const tempPassword = `ZenHR@${crypto.randomBytes(3).toString('hex')}!`;
    const passwordHash = await bcrypt.hash(tempPassword, 10);
    const role = dto.role || UserRole.EMPLOYEE;
    const dataScope = this.dataScopeService.getScope(role);

    // 6. Execute atomic creation
    const result = await this.prisma.$transaction(async (tx) => {
      // Create user account
      const newUser = await tx.user.create({
        data: {
          companyId,
          email: dto.email.toLowerCase(),
          passwordHash,
          role,
          dataScope,
          isEmailVerified: true,
        },
      });

      // Create employee profile
      const employee = await tx.employee.create({
        data: {
          companyId,
          userId: newUser.id,
          employeeCode,
          firstName: dto.firstName,
          lastName: dto.lastName,
          phone: dto.phone,
          dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : null,
          gender: dto.gender,
          nationality: dto.nationality,
          address: dto.address,
          city: dto.city,
          country: dto.country,
          hireDate: dto.hireDate ? new Date(dto.hireDate) : new Date(),
          probationEndDate: new Date(Date.now() + 90 * 86400000), // 3 months default
          status: EmployeeStatus.ON_PROBATION,
          departmentId: dto.departmentId,
          designationId: dto.designationId,
          teamId: dto.teamId,
          reportingManagerId: dto.reportingManagerId,
          baseSalary: dto.salary ? dto.salary : undefined,
        },
      });

      // Assign default shift if one exists
      const defaultShift = await tx.shift.findFirst({
        where: { companyId, isDefault: true },
      });
      if (defaultShift) {
        await tx.employeeShift.create({
          data: {
            employeeId: employee.id,
            shiftId: defaultShift.id,
            effectiveFrom: new Date(),
          },
        });
      }

      // Initialize leave balances for all active leave types
      const leaveTypes = await tx.leaveTypeSetting.findMany({
        where: { companyId, isActive: true },
      });
      if (leaveTypes.length > 0) {
        await tx.leaveBalance.createMany({
          data: leaveTypes.map((lt) => ({
            companyId,
            employeeId: employee.id,
            leaveType: lt.leaveType,
            year: new Date().getFullYear(),
            allocated: lt.annualAllocation,
            used: 0,
            pending: 0,
            carried: 0,
          })),
        });
      }

      return { user: newUser, employee, tempPassword };
    });

    // Send welcome credentials email
    await this.mailService.sendMail({
      to: dto.email,
      subject: 'Welcome to ZenHR — Your Account Credentials',
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Welcome to ZenHR, ${dto.firstName}!</h2>
          <p>Your employee profile has been created.</p>
          <p><strong>Employee Code:</strong> ${result.employee.employeeCode}</p>
          <p><strong>Login Email:</strong> ${dto.email}</p>
          <p><strong>Temporary Password:</strong> <code>${result.tempPassword}</code></p>
          <p>Please log in and update your password immediately.</p>
        </div>
      `,
    });

    return {
      id: result.employee.id,
      employeeCode: result.employee.employeeCode,
      firstName: result.employee.firstName,
      lastName: result.employee.lastName,
      email: result.user.email,
      role: result.user.role,
      status: result.employee.status,
      tempPassword: result.tempPassword,
    };
  }

  async updateEmployee(id: string, dto: UpdateEmployeeDto, user: AuthenticatedUser) {
    const companyId = this.getEffectiveCompanyId(user);
    const userId = (user.id || user.sub)!;

    const employee = await this.prisma.employee.findFirst({
      where: { id, companyId, deletedAt: null },
    });
    if (!employee) throw new NotFoundException('Employee not found');

    // Self update restrictions
    if (user.role === UserRole.EMPLOYEE) {
      if (employee.userId !== userId) {
        throw new ForbiddenException('You can only update your own profile');
      }
      // Employees can only update personal contact info and avatar
      return this.prisma.employee.update({
        where: { id },
        data: {
          phone: dto.phone,
          address: dto.address,
          city: dto.city,
          country: dto.country,
          profilePictureUrl: dto.profilePictureUrl,
        },
      });
    }

    // Validate reporting manager doesn't create circular reference
    if (dto.reportingManagerId) {
      if (dto.reportingManagerId === id) {
        throw new BadRequestException('An employee cannot be their own reporting manager');
      }
      const mgr = await this.prisma.employee.findFirst({
        where: { id: dto.reportingManagerId, companyId, deletedAt: null },
      });
      if (!mgr) throw new BadRequestException('Reporting manager not found in this company');
    }

    return this.prisma.employee.update({
      where: { id },
      data: {
        ...(dto.firstName ? { firstName: dto.firstName } : {}),
        ...(dto.lastName ? { lastName: dto.lastName } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
        ...(dto.address !== undefined ? { address: dto.address } : {}),
        ...(dto.city !== undefined ? { city: dto.city } : {}),
        ...(dto.country !== undefined ? { country: dto.country } : {}),
        ...(dto.departmentId !== undefined ? { departmentId: dto.departmentId } : {}),
        ...(dto.designationId !== undefined ? { designationId: dto.designationId } : {}),
        ...(dto.teamId !== undefined ? { teamId: dto.teamId } : {}),
        ...(dto.reportingManagerId !== undefined ? { reportingManagerId: dto.reportingManagerId } : {}),
        ...(dto.salary !== undefined ? { baseSalary: dto.salary } : {}),
        ...(dto.profilePictureUrl !== undefined ? { profilePictureUrl: dto.profilePictureUrl } : {}),
      },
    });
  }

  async updateStatus(id: string, dto: UpdateStatusDto, user: AuthenticatedUser) {
    const companyId = this.getEffectiveCompanyId(user);
    const callerId = (user.id || user.sub)!;

    const employee = await this.prisma.employee.findFirst({
      where: { id, companyId, deletedAt: null },
      include: {
        user: true,
        reportingManager: { select: { id: true, user: { select: { email: true } } } },
      },
    });

    if (!employee) throw new NotFoundException('Employee not found');

    const previousStatus = employee.status;
    const newStatus = dto.status;

    if (previousStatus === newStatus) {
      return employee;
    }

    // Update status
    const updated = await this.prisma.employee.update({
      where: { id },
      data: { status: newStatus },
    });

    // Write audit log
    await this.prisma.auditLog.create({
      data: {
        companyId,
        userId: callerId,
        action: AuditAction.STATUS_CHANGE,
        entity: 'Employee',
        entityId: id,
        newValues: {
          employeeCode: employee.employeeCode,
          employeeName: `${employee.firstName} ${employee.lastName}`,
          previousStatus,
          newStatus,
          reason: dto.reason,
          changedBy: user.email,
        },
      },
    });

    // In-app notification to employee
    await this.prisma.notification.create({
      data: {
        companyId,
        userId: employee.userId,
        type: NotificationType.STATUS_CHANGED,
        title: 'Employment Status Update',
        body: `Your employment status has been updated from ${previousStatus} to ${newStatus}.${dto.reason ? ` Reason: ${dto.reason}` : ''}`,
        data: { employeeId: id, previousStatus, newStatus },
      },
    });

    // In-app notification to reporting manager if one exists
    if (employee.reportingManager && employee.reportingManager.user) {
      await this.prisma.notification.create({
        data: {
          companyId,
          userId: employee.reportingManager.id,
          type: NotificationType.STATUS_CHANGED,
          title: `Reportee Status Update: ${employee.firstName} ${employee.lastName}`,
          body: `${employee.firstName} ${employee.lastName}'s status changed to ${newStatus}.`,
          data: { employeeId: id, newStatus },
        },
      });
    }

    // Email notification
    await this.mailService.sendMail({
      to: employee.user.email,
      subject: `Status Update: ${newStatus}`,
      html: `
        <p>Dear ${employee.firstName},</p>
        <p>Your employment status in ZenHR has been updated to <strong>${newStatus}</strong>.</p>
        ${dto.reason ? `<p><strong>Reason:</strong> ${dto.reason}</p>` : ''}
      `,
    });

    // If SUSPENDED or TERMINATED, lock user account & invalidate session
    if (newStatus === EmployeeStatus.SUSPENDED || newStatus === EmployeeStatus.TERMINATED) {
      await this.prisma.user.update({
        where: { id: employee.userId },
        data: {
          lockedUntil: new Date('9999-12-31'),
          refreshTokenHash: null,
        },
      });
    } else if (previousStatus === EmployeeStatus.SUSPENDED && newStatus === EmployeeStatus.ACTIVE) {
      // Re-activate user account
      await this.prisma.user.update({
        where: { id: employee.userId },
        data: {
          lockedUntil: null,
        },
      });
    }

    return updated;
  }

  async getOrgChart(id: string, user: AuthenticatedUser) {
    const companyId = this.getEffectiveCompanyId(user);

    const rootEmployee = await this.prisma.employee.findFirst({
      where: { id, companyId, deletedAt: null },
      include: {
        designation: { select: { name: true } },
        department: { select: { name: true } },
        subordinates: {
          where: { deletedAt: null },
          include: {
            designation: { select: { name: true } },
            department: { select: { name: true } },
            subordinates: {
              where: { deletedAt: null },
              include: {
                designation: { select: { name: true } },
                department: { select: { name: true } },
              },
            },
          },
        },
      },
    });

    if (!rootEmployee) throw new NotFoundException('Employee not found');
    return rootEmployee;
  }

  // Emergency Contacts
  async addEmergencyContact(
    employeeId: string,
    dto: CreateEmergencyContactDto,
    user: AuthenticatedUser,
  ) {
    const companyId = this.getEffectiveCompanyId(user);
    const userId = (user.id || user.sub)!;

    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, companyId, deletedAt: null },
    });
    if (!employee) throw new NotFoundException('Employee not found');

    if (user.role === UserRole.EMPLOYEE && employee.userId !== userId) {
      throw new ForbiddenException('You can only manage your own emergency contacts');
    }

    return this.prisma.emergencyContact.create({
      data: {
        employeeId,
        name: dto.name,
        relationship: dto.relationship,
        phone: dto.phone,
        email: dto.email,
        address: dto.address,
      },
    });
  }

  async deleteEmergencyContact(
    employeeId: string,
    contactId: string,
    user: AuthenticatedUser,
  ) {
    const companyId = this.getEffectiveCompanyId(user);
    const userId = (user.id || user.sub)!;

    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, companyId, deletedAt: null },
    });
    if (!employee) throw new NotFoundException('Employee not found');

    if (user.role === UserRole.EMPLOYEE && employee.userId !== userId) {
      throw new ForbiddenException('You can only manage your own emergency contacts');
    }

    return this.prisma.emergencyContact.delete({
      where: { id: contactId },
    });
  }

  // Cloud Storage File Uploads
  async uploadAvatar(
    employeeId: string,
    file: Express.Multer.File,
    user: AuthenticatedUser,
  ) {
    const companyId = this.getEffectiveCompanyId(user);
    const userId = (user.id || user.sub)!;

    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, companyId, deletedAt: null },
    });
    if (!employee) throw new NotFoundException('Employee not found');

    if (user.role === UserRole.EMPLOYEE && employee.userId !== userId) {
      throw new ForbiddenException('You can only upload your own profile picture');
    }

    const upload = await this.storageService.uploadFile(file, {
      folder: `zenhr/companies/${companyId}/avatars`,
      allowedMimeTypes: DEFAULT_IMAGE_MIMES,
      maxSizeBytes: 5 * 1024 * 1024, // 5MB
    });

    const updated = await this.prisma.employee.update({
      where: { id: employeeId },
      data: { profilePictureUrl: upload.url },
    });

    return {
      profilePictureUrl: updated.profilePictureUrl,
      size: upload.size,
    };
  }

  async uploadDocument(
    employeeId: string,
    file: Express.Multer.File,
    name: string,
    type: string,
    user: AuthenticatedUser,
  ) {
    const companyId = this.getEffectiveCompanyId(user);
    const userId = (user.id || user.sub)!;

    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, companyId, deletedAt: null },
    });
    if (!employee) throw new NotFoundException('Employee not found');

    if (user.role === UserRole.EMPLOYEE && employee.userId !== userId) {
      throw new ForbiddenException('You can only upload your own documents');
    }

    const upload = await this.storageService.uploadFile(file, {
      folder: `zenhr/companies/${companyId}/documents`,
      allowedMimeTypes: DEFAULT_DOCUMENT_MIMES,
      maxSizeBytes: 10 * 1024 * 1024, // 10MB
    });

    const doc = await this.prisma.employeeDocument.create({
      data: {
        employeeId,
        companyId,
        name: name || file.originalname,
        type: type || 'OTHER',
        fileUrl: upload.url,
      },
    });

    return doc;
  }

  async listDocuments(employeeId: string, user: AuthenticatedUser) {
    const companyId = this.getEffectiveCompanyId(user);
    const userId = (user.id || user.sub)!;

    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, companyId, deletedAt: null },
    });
    if (!employee) throw new NotFoundException('Employee not found');

    if (user.role === UserRole.EMPLOYEE && employee.userId !== userId) {
      throw new ForbiddenException('You can only view your own documents');
    }

    return this.prisma.employeeDocument.findMany({
      where: { employeeId, companyId },
      orderBy: { uploadedAt: 'desc' },
    });
  }

  async deleteDocument(
    employeeId: string,
    documentId: string,
    user: AuthenticatedUser,
  ) {
    const companyId = this.getEffectiveCompanyId(user);

    const doc = await this.prisma.employeeDocument.findFirst({
      where: { id: documentId, employeeId, companyId },
    });
    if (!doc) throw new NotFoundException('Document not found');

    return this.prisma.employeeDocument.delete({
      where: { id: documentId },
    });
  }
}
