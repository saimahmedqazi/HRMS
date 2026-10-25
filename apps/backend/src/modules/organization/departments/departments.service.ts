import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { AuthenticatedUser } from '../../../common/decorators/current-user.decorator';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { UpdateDepartmentDto } from './dto/update-department.dto';

@Injectable()
export class DepartmentsService {
  constructor(private readonly prisma: PrismaService) {}

  private getEffectiveCompanyId(user: AuthenticatedUser): string {
    const companyId = user.supportModeCompanyId || user.companyId;
    if (!companyId) {
      throw new ForbiddenException('Company context required');
    }
    return companyId;
  }

  async listDepartments(user: AuthenticatedUser) {
    const companyId = this.getEffectiveCompanyId(user);

    return this.prisma.department.findMany({
      where: {
        companyId,
        deletedAt: null,
      },
      include: {
        teams: {
          where: { deletedAt: null },
          select: { id: true, name: true, leadId: true },
        },
        _count: {
          select: {
            employees: true,
            teams: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  async getDepartmentById(id: string, user: AuthenticatedUser) {
    const companyId = this.getEffectiveCompanyId(user);

    const department = await this.prisma.department.findFirst({
      where: {
        id,
        companyId,
        deletedAt: null,
      },
      include: {
        teams: {
          where: { deletedAt: null },
          select: {
            id: true,
            name: true,
            leadId: true,
            _count: { select: { employees: true } },
          },
        },
        employees: {
          where: { deletedAt: null },
          select: {
            id: true,
            employeeCode: true,
            firstName: true,
            lastName: true,
            status: true,
            profilePictureUrl: true,
            designation: { select: { id: true, name: true } },
          },
        },
        _count: {
          select: {
            employees: true,
            teams: true,
          },
        },
      },
    });

    if (!department) {
      throw new NotFoundException('Department not found');
    }

    return department;
  }

  async createDepartment(dto: CreateDepartmentDto, user: AuthenticatedUser) {
    const companyId = this.getEffectiveCompanyId(user);

    const existing = await this.prisma.department.findFirst({
      where: {
        companyId,
        name: { equals: dto.name, mode: 'insensitive' },
        deletedAt: null,
      },
    });

    if (existing) {
      throw new ConflictException(`Department '${dto.name}' already exists in your organization`);
    }

    if (dto.managerId) {
      const manager = await this.prisma.employee.findFirst({
        where: { id: dto.managerId, companyId, deletedAt: null },
      });
      if (!manager) {
        throw new BadRequestException('Assigned manager employee record not found in this company');
      }
    }

    return this.prisma.department.create({
      data: {
        companyId,
        name: dto.name,
        description: dto.description,
        managerId: dto.managerId,
      },
    });
  }

  async updateDepartment(id: string, dto: UpdateDepartmentDto, user: AuthenticatedUser) {
    const companyId = this.getEffectiveCompanyId(user);

    const department = await this.prisma.department.findFirst({
      where: { id, companyId, deletedAt: null },
    });
    if (!department) throw new NotFoundException('Department not found');

    if (dto.name && dto.name !== department.name) {
      const duplicate = await this.prisma.department.findFirst({
        where: {
          companyId,
          name: { equals: dto.name, mode: 'insensitive' },
          id: { not: id },
          deletedAt: null,
        },
      });
      if (duplicate) {
        throw new ConflictException(`Department '${dto.name}' already exists in your organization`);
      }
    }

    if (dto.managerId) {
      const manager = await this.prisma.employee.findFirst({
        where: { id: dto.managerId, companyId, deletedAt: null },
      });
      if (!manager) {
        throw new BadRequestException('Assigned manager employee record not found in this company');
      }
    }

    return this.prisma.department.update({
      where: { id },
      data: {
        ...(dto.name ? { name: dto.name } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.managerId !== undefined ? { managerId: dto.managerId } : {}),
      },
    });
  }

  async deleteDepartment(id: string, user: AuthenticatedUser) {
    const companyId = this.getEffectiveCompanyId(user);

    const department = await this.prisma.department.findFirst({
      where: { id, companyId, deletedAt: null },
      include: {
        _count: {
          select: {
            employees: { where: { deletedAt: null } },
            teams: { where: { deletedAt: null } },
          },
        },
      },
    });

    if (!department) throw new NotFoundException('Department not found');

    if (department._count.employees > 0) {
      throw new BadRequestException(
        `Cannot delete department with ${department._count.employees} assigned active employee(s). Please reassign them first.`,
      );
    }

    return this.prisma.department.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
