import { Test, TestingModule } from '@nestjs/testing';
import { TeamsService } from './teams.service';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { AuthenticatedUser } from '../../../common/decorators/current-user.decorator';
import { ConflictException, BadRequestException, NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';

describe('TeamsService', () => {
  let service: TeamsService;

  const mockPrisma: any = {
    team: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    department: {
      findFirst: jest.fn(),
    },
    employee: {
      findFirst: jest.fn(),
    },
  };

  const mockUser: AuthenticatedUser = {
    id: 'user-admin',
    email: 'admin@acme.com',
    role: UserRole.COMPANY_ADMIN,
    companyId: 'comp-1',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TeamsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<TeamsService>(TeamsService);
    jest.clearAllMocks();
  });

  describe('createTeam', () => {
    it('should throw BadRequestException if target department does not exist', async () => {
      mockPrisma.department.findFirst.mockResolvedValueOnce(null);

      await expect(
        service.createTeam({ departmentId: 'dept-invalid', name: 'Frontend Team' }, mockUser),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw ConflictException if team name already exists in company', async () => {
      mockPrisma.department.findFirst.mockResolvedValueOnce({ id: 'dept-1' });
      mockPrisma.team.findFirst.mockResolvedValueOnce({ id: 'existing-team' });

      await expect(
        service.createTeam({ departmentId: 'dept-1', name: 'Frontend Team' }, mockUser),
      ).rejects.toThrow(ConflictException);
    });

    it('should create team successfully', async () => {
      mockPrisma.department.findFirst.mockResolvedValueOnce({ id: 'dept-1' });
      mockPrisma.team.findFirst.mockResolvedValueOnce(null);
      mockPrisma.team.create.mockResolvedValueOnce({
        id: 'team-1',
        name: 'Frontend Team',
        departmentId: 'dept-1',
        companyId: 'comp-1',
      });

      const result = await service.createTeam(
        { departmentId: 'dept-1', name: 'Frontend Team' },
        mockUser,
      );
      expect(result.id).toBe('team-1');
      expect(result.name).toBe('Frontend Team');
    });
  });

  describe('deleteTeam', () => {
    it('should throw BadRequestException if team still has assigned active members', async () => {
      mockPrisma.team.findFirst.mockResolvedValueOnce({
        id: 'team-1',
        _count: { employees: 5 },
      });

      await expect(service.deleteTeam('team-1', mockUser)).rejects.toThrow(BadRequestException);
    });

    it('should soft delete team if no active members', async () => {
      mockPrisma.team.findFirst.mockResolvedValueOnce({
        id: 'team-empty',
        _count: { employees: 0 },
      });
      mockPrisma.team.update.mockResolvedValueOnce({ id: 'team-empty', deletedAt: new Date() });

      const result = await service.deleteTeam('team-empty', mockUser);
      expect(result.id).toBe('team-empty');
    });
  });
});
