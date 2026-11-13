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
import { lockEmployeeOnboarding } from '../../common/prisma/employee-onboarding-lock';
import { initializeEmployeePolicies } from '../../common/prisma/initialize-employee-policies';
import { DataScopeService } from '../../common/services/data-scope.service';
import { MailService } from '../../common/mail/mail.service';
import { StorageService, DEFAULT_IMAGE_MIMES, DEFAULT_DOCUMENT_MIMES } from '../../common/storage/storage.service';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { getLoginNetworkLocation } from '../../common/utils/login-network-location';
import { getProbationEndDate, parseEmployeeDate } from '../../common/utils/employee-dates';
import {
  UserRole,
  Employee,
  EmployeeStatus,
  AuditAction,
  NotificationType,
  Prisma,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { CreateEmployeeDto, EMPLOYEE_ONBOARDING_ROLES } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { UpdateStatusDto } from './dto/update-status.dto';
import { CreateEmergencyContactDto } from './dto/create-emergency-contact.dto';

const SELF_SERVICE_FIELDS = new Set([
  'phone', 'address', 'city', 'country', 'dateOfBirth', 'gender', 'nationality', 'profilePictureUrl',
]);

function normalizeOptionalText(value: string | null | undefined): string | null | undefined {
  return value === undefined ? undefined : value?.trim() || null;
}

function omitSensitiveEmployeeFields<T extends Pick<Employee,
  'baseSalary' | 'bankAccountNumber' | 'bankName' | 'bankBranch' | 'nidNumber' | 'taxId'
>>(employee: T) {
  const { baseSalary, bankAccountNumber, bankName, bankBranch, nidNumber, taxId, ...profile } = employee;
  return profile;
}

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
    const scopeFilter = await this.dataScopeService.resolveEmployeeScope(this.prisma, companyId, user);

    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const skip = (page - 1) * limit;

    const whereClause: any = {
      ...(query.departmentId ? { departmentId: query.departmentId } : {}),
      ...(query.teamId ? { teamId: query.teamId } : {}),
      ...scopeFilter,
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              { firstName: { contains: query.search.trim(), mode: 'insensitive' } },
              { lastName: { contains: query.search.trim(), mode: 'insensitive' } },
              { employeeCode: { contains: query.search.trim(), mode: 'insensitive' } },
              { user: { email: { contains: query.search.trim(), mode: 'insensitive' } } },
              ...(query.search.trim().includes(' ')
                ? [
                    {
                      AND: [
                        { firstName: { contains: query.search.trim().split(/\s+/)[0], mode: 'insensitive' } },
                        { lastName: { contains: query.search.trim().split(/\s+/).slice(1).join(' '), mode: 'insensitive' } },
                      ],
                    },
                  ]
                : []),
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

    const manager = user.role === UserRole.TEAM_LEAD || user.role === UserRole.DEPARTMENT_MANAGER;
    const callerId = user.id || user.sub;
    return {
      items: manager ? items.map((employee) => employee.userId === callerId
        ? employee
        : omitSensitiveEmployeeFields(employee)) : items,
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
    const scope = await this.dataScopeService.resolveEmployeeScope(this.prisma, companyId, user);

    const employee = await this.prisma.employee.findFirst({
      where: { id, AND: [scope] },
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
          where: scope,
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
        documents: { where: { companyId } },
        leaveBalances: true,
        user: {
          select: {
            id: true,
            email: true,
            role: true,
            dataScope: true,
            isEmailVerified: true,
            lastLoginAt: true,
            lastLoginIp: true,
            lastLoginUserAgent: true,
            twoFaEnabled: true,
          },
        },
      },
    });

    if (!employee) throw new NotFoundException('Employee not found');

    const profile = {
      ...employee,
      probationEndDate: employee.status === EmployeeStatus.ON_PROBATION
        ? getProbationEndDate(employee.hireDate)
        : employee.probationEndDate,
      user: employee.user ? {
        ...employee.user,
        ...getLoginNetworkLocation(employee.user.lastLoginIp),
      } : null,
    };

    if (
      (user.role === UserRole.TEAM_LEAD || user.role === UserRole.DEPARTMENT_MANAGER) &&
      employee.userId !== (user.id || user.sub)
    ) {
      return omitSensitiveEmployeeFields(profile);
    }

    return profile;
  }

  async onboardEmployee(dto: CreateEmployeeDto, user: AuthenticatedUser) {
    const companyId = this.getEffectiveCompanyId(user);
    const role = dto.role || UserRole.EMPLOYEE;
    if (!EMPLOYEE_ONBOARDING_ROLES.includes(role)) {
      throw new ForbiddenException('This role cannot be assigned through employee onboarding');
    }

    const hireDate = dto.hireDate ? parseEmployeeDate(dto.hireDate) : new Date();
    if (!hireDate) throw new BadRequestException('Hire date must be a valid calendar date (YYYY-MM-DD).');
    const dateOfBirth = dto.dateOfBirth ? parseEmployeeDate(dto.dateOfBirth) : null;
    if (dto.dateOfBirth && (!dateOfBirth || dateOfBirth.getTime() > Date.now())) {
      throw new BadRequestException('Date of birth must be a valid date that is not in the future.');
    }

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

    // Generate the initial password before opening the database transaction.
    const tempPassword = `ZenHR@${crypto.randomBytes(3).toString('hex')}!`;
    const passwordHash = await bcrypt.hash(tempPassword, 10);
    const dataScope = this.dataScopeService.getScope(role);

    const result = await this.prisma.$transaction(async (tx) => {
      await lockEmployeeOnboarding(tx, companyId);
      const existingEmployees = await tx.employee.findMany({ where: { companyId }, select: { employeeCode: true } });
      const usedCodes = new Set(existingEmployees.map(({ employeeCode }) => employeeCode.toUpperCase()));
      let employeeNumber = existingEmployees.length + 1;
      let employeeCode = `EMP-${String(employeeNumber).padStart(3, '0')}`;
      while (usedCodes.has(employeeCode)) {
        employeeNumber++;
        employeeCode = `EMP-${String(employeeNumber).padStart(3, '0')}`;
      }

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
          dateOfBirth,
          gender: dto.gender,
          nationality: dto.nationality,
          address: dto.address,
          city: dto.city,
          country: dto.country,
          hireDate,
          probationEndDate: getProbationEndDate(hireDate),
          status: EmployeeStatus.ON_PROBATION,
          departmentId: dto.departmentId,
          designationId: dto.designationId,
          teamId: dto.teamId,
          reportingManagerId: dto.reportingManagerId,
          baseSalary: dto.salary,
        },
      });

      await initializeEmployeePolicies(tx, companyId, employee.id);

      return { user: newUser, employee, tempPassword };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });

    // Send welcome credentials email
    const welcomeEmailSent = await this.mailService.sendMail({
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
      welcomeEmailSent,
    };
  }

  async updateEmployee(id: string, dto: UpdateEmployeeDto, user: AuthenticatedUser) {
    const companyId = this.getEffectiveCompanyId(user);
    const userId = (user.id || user.sub)!;

    const employee = await this.prisma.employee.findFirst({
      where: { id, companyId, deletedAt: null },
    });
    if (!employee) throw new NotFoundException('Employee not found');

    const isHrOrAdmin =
      user.role === UserRole.SUPER_ADMIN ||
      user.role === UserRole.COMPANY_ADMIN ||
      user.role === UserRole.HR_MANAGER;

    if (!isHrOrAdmin) {
      if (employee.userId !== userId) {
        throw new ForbiddenException('You can only update your own profile');
      }
      if (Object.entries(dto).some(([field, value]) => value !== undefined && !SELF_SERVICE_FIELDS.has(field))) {
        throw new ForbiddenException('Contact HR to change your official name or employment details.');
      }
    }

    const dateOfBirth = dto.dateOfBirth === undefined ? undefined : dto.dateOfBirth ? new Date(dto.dateOfBirth) : null;
    if (dateOfBirth && (!Number.isFinite(dateOfBirth.getTime()) || dateOfBirth.getTime() > Date.now())) {
      throw new BadRequestException('Enter a valid date of birth in the past or today.');
    }

    if (!isHrOrAdmin) {
      return this.prisma.employee.update({
        where: { id, companyId, userId, deletedAt: null },
        data: {
          phone: normalizeOptionalText(dto.phone),
          address: normalizeOptionalText(dto.address),
          city: normalizeOptionalText(dto.city),
          country: normalizeOptionalText(dto.country),
          dateOfBirth,
          gender: normalizeOptionalText(dto.gender),
          nationality: normalizeOptionalText(dto.nationality),
          profilePictureUrl: dto.profilePictureUrl,
        },
      });
    }

    // Validate department, designation, team belong to company when provided
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
      where: { id, companyId, deletedAt: null },
      data: {
        ...(dto.firstName ? { firstName: dto.firstName } : {}),
        ...(dto.lastName ? { lastName: dto.lastName } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
        ...(dto.address !== undefined ? { address: dto.address } : {}),
        ...(dto.city !== undefined ? { city: dto.city } : {}),
        ...(dto.country !== undefined ? { country: dto.country } : {}),
        ...(dateOfBirth !== undefined ? { dateOfBirth } : {}),
        ...(dto.gender !== undefined ? { gender: dto.gender } : {}),
        ...(dto.nationality !== undefined ? { nationality: dto.nationality } : {}),
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
        user: { select: { email: true } },
        reportingManager: { select: { id: true, userId: true, user: { select: { email: true } } } },
      },
    });

    if (!employee) throw new NotFoundException('Employee not found');

    const previousStatus = employee.status;
    const newStatus = dto.status;

    if (previousStatus === newStatus) {
      const { user: employeeUser, reportingManager, ...profile } = employee;
      return profile;
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
    if (employee.reportingManager && employee.reportingManager.userId) {
      await this.prisma.notification.create({
        data: {
          companyId,
          userId: employee.reportingManager.userId,
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
    const scope = await this.dataScopeService.resolveEmployeeScope(this.prisma, companyId, user);
    const chartFields = {
      id: true,
      employeeCode: true,
      firstName: true,
      lastName: true,
      profilePictureUrl: true,
      reportingManagerId: true,
      designation: { select: { name: true } },
      department: { select: { name: true } },
    } as const;

    const rootEmployee = await this.prisma.employee.findFirst({
      where: { id, AND: [scope] },
      select: {
        ...chartFields,
        subordinates: {
          where: scope,
          select: {
            ...chartFields,
            subordinates: {
              where: scope,
              select: chartFields,
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

    const isHrOrAdmin =
      user.role === UserRole.SUPER_ADMIN ||
      user.role === UserRole.COMPANY_ADMIN ||
      user.role === UserRole.HR_MANAGER;

    // NEW: check if caller is a manager of this employee's dept/team
    let isManagerOfEmployee = false;
    if (!isHrOrAdmin && employee.userId !== userId) {
      if (user.role === UserRole.DEPARTMENT_MANAGER || user.role === UserRole.TEAM_LEAD) {
        const callerEmp = await this.prisma.employee.findFirst({
          where: { companyId, userId },
          select: { departmentId: true, teamId: true },
        });
        isManagerOfEmployee =
          (user.role === UserRole.DEPARTMENT_MANAGER &&
            !!callerEmp?.departmentId &&
            callerEmp.departmentId === employee.departmentId) ||
          (user.role === UserRole.TEAM_LEAD &&
            !!callerEmp?.teamId &&
            callerEmp.teamId === employee.teamId);
      }
    }

    if (!isHrOrAdmin && employee.userId !== userId && !isManagerOfEmployee) {
      throw new ForbiddenException(
        'You can only manage emergency contacts for employees in your team or department',
      );
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

    const isHrOrAdmin =
      user.role === UserRole.SUPER_ADMIN ||
      user.role === UserRole.COMPANY_ADMIN ||
      user.role === UserRole.HR_MANAGER;

    // Check if caller is a manager of this employee's dept/team
    let isManagerOfContact = false;
    if (!isHrOrAdmin && employee.userId !== userId) {
      if (user.role === UserRole.DEPARTMENT_MANAGER || user.role === UserRole.TEAM_LEAD) {
        const callerEmp = await this.prisma.employee.findFirst({
          where: { companyId, userId },
          select: { departmentId: true, teamId: true },
        });
        isManagerOfContact =
          (user.role === UserRole.DEPARTMENT_MANAGER &&
            !!callerEmp?.departmentId &&
            callerEmp.departmentId === employee.departmentId) ||
          (user.role === UserRole.TEAM_LEAD &&
            !!callerEmp?.teamId &&
            callerEmp.teamId === employee.teamId);
      }
    }

    if (!isHrOrAdmin && employee.userId !== userId && !isManagerOfContact) {
      throw new ForbiddenException(
        'You can only manage emergency contacts for employees in your team or department',
      );
    }

    const contact = await this.prisma.emergencyContact.findFirst({
      where: { id: contactId, employeeId },
    });
    if (!contact) throw new NotFoundException('Emergency contact not found');

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

    const isHrOrAdmin =
      user.role === UserRole.SUPER_ADMIN ||
      user.role === UserRole.COMPANY_ADMIN ||
      user.role === UserRole.HR_MANAGER;

    // Check if caller is a manager of this employee's dept/team
    let isManagerForAvatar = false;
    if (!isHrOrAdmin && employee.userId !== userId) {
      if (user.role === UserRole.DEPARTMENT_MANAGER || user.role === UserRole.TEAM_LEAD) {
        const callerEmp = await this.prisma.employee.findFirst({
          where: { companyId, userId },
          select: { departmentId: true, teamId: true },
        });
        isManagerForAvatar =
          (user.role === UserRole.DEPARTMENT_MANAGER &&
            !!callerEmp?.departmentId &&
            callerEmp.departmentId === employee.departmentId) ||
          (user.role === UserRole.TEAM_LEAD &&
            !!callerEmp?.teamId &&
            callerEmp.teamId === employee.teamId);
      }
    }

    if (!isHrOrAdmin && employee.userId !== userId && !isManagerForAvatar) {
      throw new ForbiddenException(
        'You can only upload avatars for employees in your team or department',
      );
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

    const isHrOrAdmin =
      user.role === UserRole.SUPER_ADMIN ||
      user.role === UserRole.COMPANY_ADMIN ||
      user.role === UserRole.HR_MANAGER;

    // Check if caller is a manager of this employee's dept/team
    let isManagerForDocs = false;
    if (!isHrOrAdmin && employee.userId !== userId) {
      if (user.role === UserRole.DEPARTMENT_MANAGER || user.role === UserRole.TEAM_LEAD) {
        const callerEmp = await this.prisma.employee.findFirst({
          where: { companyId, userId },
          select: { departmentId: true, teamId: true },
        });
        isManagerForDocs =
          (user.role === UserRole.DEPARTMENT_MANAGER &&
            !!callerEmp?.departmentId &&
            callerEmp.departmentId === employee.departmentId) ||
          (user.role === UserRole.TEAM_LEAD &&
            !!callerEmp?.teamId &&
            callerEmp.teamId === employee.teamId);
      }
    }

    if (!isHrOrAdmin && employee.userId !== userId && !isManagerForDocs) {
      throw new ForbiddenException(
        'You can only upload documents for employees in your team or department',
      );
    }

    const upload = await this.storageService.uploadFile(file, {
      folder: `zenhr/companies/${companyId}/documents`,
      authenticated: true,
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
    const scope = await this.dataScopeService.resolveEmployeeScope(this.prisma, companyId, user);

    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, AND: [scope] },
      select: { id: true },
    });
    if (!employee) throw new NotFoundException('Employee not found');

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
    const doc = await this.getScopedDocument(employeeId, documentId, user);
    await this.storageService.deleteFile(doc.fileUrl, [`zenhr/companies/${doc.companyId}/documents`]);

    return this.prisma.employeeDocument.delete({
      where: { id: doc.id, companyId: doc.companyId, employeeId },
    });
  }

  async getDocumentDownload(employeeId: string, documentId: string, user: AuthenticatedUser) {
    const doc = await this.getScopedDocument(employeeId, documentId, user);
    return this.storageService.getDownloadUrl(doc.fileUrl, [`zenhr/companies/${doc.companyId}/documents`]);
  }

  private async getScopedDocument(employeeId: string, documentId: string, user: AuthenticatedUser) {
    const companyId = this.getEffectiveCompanyId(user);
    const scope = await this.dataScopeService.resolveEmployeeScope(this.prisma, companyId, user);
    const document = await this.prisma.employeeDocument.findFirst({
      where: { id: documentId, employeeId, companyId, employee: scope },
    });
    if (!document) throw new NotFoundException('Document not found');
    return document;
  }
}
