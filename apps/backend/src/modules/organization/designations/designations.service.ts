import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { AuthenticatedUser } from '../../../common/decorators/current-user.decorator';
import { CreateDesignationDto } from './dto/create-designation.dto';
import { UpdateDesignationDto } from './dto/update-designation.dto';

@Injectable()
export class DesignationsService {
  constructor(private readonly prisma: PrismaService) {}

  private getEffectiveCompanyId(user: AuthenticatedUser): string {
    const companyId = user.supportModeCompanyId || user.companyId;
    if (!companyId) {
      throw new ForbiddenException('Company context required');
    }
    return companyId;
  }

  async listDesignations(user: AuthenticatedUser) {
    const companyId = this.getEffectiveCompanyId(user);

    return this.prisma.designation.findMany({
      where: { companyId },
      include: {
        _count: {
          select: { employees: true },
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  async getDesignationById(id: string, user: AuthenticatedUser) {
    const companyId = this.getEffectiveCompanyId(user);

    const designation = await this.prisma.designation.findFirst({
      where: { id, companyId },
      include: {
        _count: {
          select: { employees: true },
        },
      },
    });

    if (!designation) {
      throw new NotFoundException('Designation not found');
    }

    return designation;
  }

  async createDesignation(dto: CreateDesignationDto, user: AuthenticatedUser) {
    const companyId = this.getEffectiveCompanyId(user);

    const existing = await this.prisma.designation.findFirst({
      where: {
        companyId,
        name: { equals: dto.name, mode: 'insensitive' },
      },
    });

    if (existing) {
      throw new ConflictException(`Designation '${dto.name}' already exists in your organization`);
    }

    return this.prisma.designation.create({
      data: {
        companyId,
        name: dto.name,
        description: dto.description,
      },
    });
  }

  async updateDesignation(id: string, dto: UpdateDesignationDto, user: AuthenticatedUser) {
    const companyId = this.getEffectiveCompanyId(user);

    const designation = await this.prisma.designation.findFirst({
      where: { id, companyId },
    });
    if (!designation) throw new NotFoundException('Designation not found');

    if (dto.name && dto.name !== designation.name) {
      const duplicate = await this.prisma.designation.findFirst({
        where: {
          companyId,
          name: { equals: dto.name, mode: 'insensitive' },
          id: { not: id },
        },
      });
      if (duplicate) {
        throw new ConflictException(`Designation '${dto.name}' already exists in your organization`);
      }
    }

    return this.prisma.designation.update({
      where: { id },
      data: {
        ...(dto.name ? { name: dto.name } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
      },
    });
  }

  async deleteDesignation(id: string, user: AuthenticatedUser) {
    const companyId = this.getEffectiveCompanyId(user);

    const designation = await this.prisma.designation.findFirst({
      where: { id, companyId },
      include: {
        _count: { select: { employees: true } },
      },
    });

    if (!designation) throw new NotFoundException('Designation not found');

    if (designation._count.employees > 0) {
      throw new BadRequestException(
        `Cannot delete designation assigned to ${designation._count.employees} employee(s). Reassign them first.`,
      );
    }

    return this.prisma.designation.delete({
      where: { id },
    });
  }
}
