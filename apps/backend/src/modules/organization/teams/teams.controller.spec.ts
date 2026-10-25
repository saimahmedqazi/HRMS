import { TeamsController } from './teams.controller';
import { TeamsService } from './teams.service';
import { UserRole } from '@prisma/client';
import { AuthenticatedUser } from '../../../common/decorators/current-user.decorator';

describe('TeamsController', () => {
  let controller: TeamsController;
  let mockTeamsService: jest.Mocked<Partial<TeamsService>>;

  const mockUser: AuthenticatedUser = {
    id: 'user-1',
    email: 'admin@zenhr.test',
    companyId: 'company-1',
    role: UserRole.COMPANY_ADMIN,
  };

  beforeEach(() => {
    mockTeamsService = {
      listTeams: jest.fn(),
      getTeamById: jest.fn(),
      createTeam: jest.fn(),
      updateTeam: jest.fn(),
      deleteTeam: jest.fn(),
    };

    controller = new TeamsController(mockTeamsService as TeamsService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('listTeams', () => {
    it('should list teams in company', async () => {
      const mockList = [{ id: 'team-1', name: 'Frontend Guild' }] as any;
      (mockTeamsService.listTeams as jest.Mock).mockResolvedValue(mockList);

      const result = await controller.listTeams(mockUser, 'dept-1');
      expect(result).toEqual(mockList);
      expect(mockTeamsService.listTeams).toHaveBeenCalledWith(mockUser, 'dept-1');
    });
  });

  describe('createTeam', () => {
    it('should create team in department', async () => {
      const mockCreated = { id: 'team-1', name: 'Frontend Guild' } as any;
      (mockTeamsService.createTeam as jest.Mock).mockResolvedValue(mockCreated);

      const dto = { name: 'Frontend Guild', departmentId: 'dept-1' };
      const result = await controller.createTeam(dto, mockUser);
      expect(result).toEqual(mockCreated);
      expect(mockTeamsService.createTeam).toHaveBeenCalledWith(dto, mockUser);
    });
  });
});
