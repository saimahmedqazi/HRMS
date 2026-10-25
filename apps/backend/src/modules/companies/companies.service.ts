import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

export interface UpdateCompanySettingsDto {
  name?: string;
  phone?: string;
  address?: string;
  city?: string;
  country?: string;
  timezone?: string;
  leaveReasonMandatory?: boolean;
  sickPrescriptionMandatory?: boolean;
  probationMonths?: number;
  logoUrl?: string;
}

@Injectable()
export class CompaniesService {
  constructor(private readonly prisma: PrismaService) {}

  async getMyCompany(companyId: string) {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      include: {
        _count: {
          select: {
            employees: true,
            departments: true,
            teams: true,
          },
        },
      },
    });

    if (!company) throw new NotFoundException('Company not found');
    return company;
  }

  async updateMyCompany(companyId: string, dto: UpdateCompanySettingsDto) {
    const company = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (!company) throw new NotFoundException('Company not found');

    return this.prisma.company.update({
      where: { id: companyId },
      data: dto,
    });
  }
}
