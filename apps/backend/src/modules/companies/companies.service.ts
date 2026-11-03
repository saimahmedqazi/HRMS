import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

export interface UpdateCompanySettingsDto {
  name?: string;
  phone?: string;
  address?: string;
  website?: string;
  industry?: string;
  size?: string;
  timezone?: string;
  locale?: string;
  logoUrl?: string;
}

@Injectable()
export class CompaniesService {
  constructor(private readonly prisma: PrismaService) {}

  async getMyCompany(companyId: string) {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      include: {
        subscriptions: {
          take: 1,
          orderBy: { createdAt: 'desc' },
        },
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

    const safeData: Record<string, any> = {};
    const allowedFields: (keyof UpdateCompanySettingsDto)[] = [
      'name',
      'phone',
      'address',
      'website',
      'industry',
      'size',
      'timezone',
      'locale',
      'logoUrl',
    ];

    for (const key of allowedFields) {
      if (dto[key] !== undefined) {
        safeData[key] = dto[key];
      }
    }

    return this.prisma.company.update({
      where: { id: companyId },
      data: safeData,
    });
  }
}
