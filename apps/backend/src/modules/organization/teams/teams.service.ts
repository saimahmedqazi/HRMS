import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { AuthenticatedUser } from '../../../common/decorators/current-user.decorator';
import { CreateTeamDto } from './dto/create-team.dto';
import { UpdateTeamDto } from './dto/update-team.dto';

@Injectable()
export class TeamsService {
  constructor(private readonly prisma: PrismaService) {}

  private getEffectiveCompanyId(user: AuthenticatedUser): string {
    const companyId = user.supportModeCompanyId || user.companyId;
    if (!companyId) {
      throw new ForbiddenException('Company context required');
    }
    return companyId;
  }

  async listTeams(user: AuthenticatedUser, departmentId?: string) {
    const companyId = this.getEffectiveCompanyId(user);

    return this.prisma.team.findMany({
      where: {
        companyId,
        ...(departmentId ? { departmentId } : {}),
        deletedAt: null,
      },
      include: {
        department: { select: { id: true, name: true } },
        _count: {
          select: { employees: true },
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  async getTeamById(id: string, user: AuthenticatedUser) {
    const companyId = this.getEffectiveCompanyId(user);

    const team = await this.prisma.team.findFirst({
      where: { id, companyId, deletedAt: null },
      include: {
        department: { select: { id: true, name: true } },
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
          select: { employees: true },
        },
      },
    });

    if (!team) {
      throw new NotFoundException('Team not found');
    }

    return team;
  }

  async createTeam(dto: CreateTeamDto, user: AuthenticatedUser) {
    const companyId = this.getEffectiveCompanyId(user);

    // Verify department exists in company
    const department = await this.prisma.department.findFirst({
      where: { id: dto.departmentId, companyId, deletedAt: null },
    });
    if (!department) {
      throw new BadRequestException('Target department does not exist in this company');
    }

    // Check unique team name in company
    const existing = await this.prisma.team.findFirst({
      where: {
        companyId,
        name: { equals: dto.name, mode: 'insensitive' },
        deletedAt: null,
      },
    });
    if (existing) {
      throw new ConflictException(`Team '${dto.name}' already exists in your organization`);
    }

    // Verify lead employee if provided
    if (dto.leadId) {
      const lead = await this.prisma.employee.findFirst({
        where: { id: dto.leadId, companyId, deletedAt: null },
      });
      if (!lead) {
        throw new BadRequestException('Assigned team lead employee record not found in this company');
      }
    }

    return this.prisma.team.create({
      data: {
        companyId,
        departmentId: dto.departmentId,
        name: dto.name,
        description: dto.description,
        leadId: dto.leadId,
      },
    });
  }

  async updateTeam(id: string, dto: UpdateTeamDto, user: AuthenticatedUser) {
    const companyId = this.getEffectiveCompanyId(user);

    const team = await this.prisma.team.findFirst({
      where: { id, companyId, deletedAt: null },
    });
    if (!team) throw new NotFoundException('Team not found');

    if (dto.name && dto.name !== team.name) {
      const duplicate = await this.prisma.team.findFirst({
        where: {
          companyId,
          name: { equals: dto.name, mode: 'insensitive' },
          id: { not: id },
          deletedAt: null,
        },
      });
      if (duplicate) {
        throw new ConflictException(`Team '${dto.name}' already exists in your organization`);
      }
    }

    if (dto.departmentId) {
      const dept = await this.prisma.department.findFirst({
        where: { id: dto.departmentId, companyId, deletedAt: null },
      });
      if (!dept) throw new BadRequestException('Target department not found in this company');
    }

    if (dto.leadId) {
      const lead = await this.prisma.employee.findFirst({
        where: { id: dto.leadId, companyId, deletedAt: null },
      });
      if (!lead) throw new BadRequestException('Assigned team lead not found in this company');
    }

    return this.prisma.team.update({
      where: { id },
      data: {
        ...(dto.departmentId ? { departmentId: dto.departmentId } : {}),
        ...(dto.name ? { name: dto.name } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.leadId !== undefined ? { leadId: dto.leadId } : {}),
      },
    });
  }

  async deleteTeam(id: string, user: AuthenticatedUser) {
    const companyId = this.getEffectiveCompanyId(user);

    const team = await this.prisma.team.findFirst({
      where: { id, companyId, deletedAt: null },
      include: {
        _count: {
          select: { employees: { where: { deletedAt: null } } },
        },
      },
    });

    if (!team) throw new NotFoundException('Team not found');

    if (team._count.employees > 0) {
      throw new BadRequestException(
        `Cannot delete team with ${team._count.employees} assigned active employee(s). Reassign them first.`,
      );
    }

    return this.prisma.team.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
