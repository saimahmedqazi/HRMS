import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
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

    if (dto.timezone !== undefined) {
      if (typeof dto.timezone !== 'string' || !dto.timezone.trim()) {
        throw new BadRequestException('Enter a valid time zone, such as Asia/Karachi.');
      }
      try {
        new Intl.DateTimeFormat('en-US', { timeZone: dto.timezone });
      } catch {
        throw new BadRequestException('Enter a valid time zone, such as Asia/Karachi.');
      }
    }

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
        if (key === 'name' && typeof dto[key] === 'string' && dto[key].trim() === '') {
          continue; // Prevent blanking out the organization name
        }
        safeData[key] = dto[key];
      }
    }

    return this.prisma.company.update({
      where: { id: companyId },
      data: safeData,
    });
  }
}
