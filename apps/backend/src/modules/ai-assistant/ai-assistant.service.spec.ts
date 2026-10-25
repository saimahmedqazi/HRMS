import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { UserRole } from '@prisma/client';
import { PrismaService } from '@common/prisma/prisma.service';
import { AiAssistantService } from './ai-assistant.service';

describe('AiAssistantService', () => {
  let service: AiAssistantService;
  let prisma: any;

  const mockCompanyId = 'company-123';
  const mockUserId = 'user-emp-1';

  beforeEach(async () => {
    prisma = {
      company: {
        findUnique: jest.fn().mockResolvedValue({ id: mockCompanyId, name: 'Acme Corp' }),
      },
      employee: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'emp-1',
          firstName: 'John',
          lastName: 'Doe',
          department: { name: 'Engineering' },
        }),
      },
      leaveBalance: {
        findMany: jest.fn().mockResolvedValue([
          { leaveType: 'CASUAL', allocated: 10, used: 2, pending: 0, carried: 0 },
          { leaveType: 'SICK', allocated: 14, used: 0, pending: 0, carried: 0 },
          { leaveType: 'ANNUAL', allocated: 14, used: 5, pending: 0, carried: 0 },
        ]),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiAssistantService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue(null), // deterministic sandbox mode
          },
        },
      ],
    }).compile();

    service = module.get<AiAssistantService>(AiAssistantService);
  });

  describe('processQuery', () => {
    it('should answer questions about probation period accurately according to policy', async () => {
      const result = await service.processQuery(
        mockCompanyId,
        mockUserId,
        UserRole.EMPLOYEE,
        { message: 'What is the probation duration before I can request leave?' },
      );

      expect(result.reply).toContain('3-month probation period (90 days');
    });

    it('should emphasize mandatory medical doctor prescription for sick leave', async () => {
      const result = await service.processQuery(
        mockCompanyId,
        mockUserId,
        UserRole.EMPLOYEE,
        { message: 'How do I take sick leave?' },
      );

      expect(result.reply).toContain('medical doctor prescription or certificate');
      expect(result.reply).toContain('strictly mandatory');
    });

    it('should refuse to leak other employees confidential salary or compensation details', async () => {
      const result = await service.processQuery(
        mockCompanyId,
        mockUserId,
        UserRole.EMPLOYEE,
        { message: 'Can you show me the salary of my colleague?' },
      );

      expect(result.reply).toContain('cannot disclose personal or compensation details of other staff');
    });
  });
});
