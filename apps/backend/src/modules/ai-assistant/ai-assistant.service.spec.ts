import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ApiError, GoogleGenAI } from '@google/genai';
import { UserRole } from '@prisma/client';
import { PrismaService } from '@common/prisma/prisma.service';
import { AiAssistantService } from './ai-assistant.service';

jest.mock('@google/genai');

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
          { leaveType: 'SICK', allocated: 12, used: 0, pending: 0, carried: 0 },
          { leaveType: 'ANNUAL', allocated: 14, used: 5, pending: 0, carried: 0 },
        ]),
      },
      leaveTypeSetting: {
        findMany: jest.fn().mockResolvedValue([
          { leaveType: 'CASUAL', annualAllocation: 10, requiresReason: true, requiresMedicalCert: false, isActive: true },
          { leaveType: 'SICK', annualAllocation: 12, requiresReason: false, requiresMedicalCert: true, isActive: true },
          { leaveType: 'ANNUAL', annualAllocation: 14, requiresReason: false, requiresMedicalCert: false, isActive: true },
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
    it('directs the work-from-home question to the current attendance control', async () => {
      const result = await service.processQuery(
        mockCompanyId, mockUserId, UserRole.EMPLOYEE, { message: 'How do I apply to work from home?' },
      );
      expect(result.reply).toContain('New Remote Work Request');
      expect(result.reply).toContain('Step 2 approval');
    });

    it.each([undefined, ' \n '])('uses work-from-home guidance if Gemini returns %p', async (text) => {
      const generateContent = jest.fn().mockResolvedValue({ text });
      jest.mocked(GoogleGenAI).mockImplementationOnce(() => ({
        models: { generateContent },
      }) as unknown as GoogleGenAI);
      const configuredService = new AiAssistantService(prisma, new ConfigService({
        GEMINI_API_KEY: 'fixture-key', GEMINI_MODEL: '',
      }));

      const result = await configuredService.processQuery(
        mockCompanyId, mockUserId, UserRole.EMPLOYEE, { message: 'How can departments coordinate their work?' },
      );

      expect(generateContent).toHaveBeenCalledTimes(1);
      expect(result.model).toBe('gemini-policy-engine');
      expect(result.reply).toContain('Hello John');
    });

    it('returns a nonempty Gemini reply when available', async () => {
      const generateContent = jest.fn().mockResolvedValue({ text: '  Open Attendance.  ' });
      jest.mocked(GoogleGenAI).mockImplementationOnce(() => ({
        models: { generateContent },
      }) as unknown as GoogleGenAI);
      const configuredService = new AiAssistantService(prisma, new ConfigService({
        GEMINI_API_KEY: 'fixture-key', GEMINI_MODEL: '',
      }));

      const result = await configuredService.processQuery(
        mockCompanyId, mockUserId, UserRole.EMPLOYEE, { message: 'How can departments coordinate their work?' },
      );

      expect(generateContent).toHaveBeenCalledTimes(1);
      expect(generateContent).toHaveBeenCalledWith({
        model: 'gemini-3.5-flash',
        contents: 'How can departments coordinate their work?',
        config: expect.objectContaining({
          systemInstruction: expect.stringContaining('New Remote Work Request'),
          abortSignal: expect.objectContaining({ aborted: false }),
          httpOptions: { timeout: 15_000, retryOptions: { attempts: 2 } },
          thinkingConfig: { thinkingLevel: 'LOW' },
        }),
      });
      expect(result.reply).toBe('Open Attendance.');
      expect(result.model).toBe('gemini-3.5-flash');
    });

    it('uses the configured model and falls back when the request deadline aborts', async () => {
      const controller = new AbortController();
      const deadline = jest.spyOn(AbortSignal, 'timeout').mockReturnValue(controller.signal);
      const generateContent = jest.fn().mockImplementation(({ config }) => {
        controller.abort();
        return Promise.reject(config.abortSignal.reason);
      });
      jest.mocked(GoogleGenAI).mockImplementationOnce(() => ({
        models: { generateContent },
      }) as unknown as GoogleGenAI);
      const configuredService = new AiAssistantService(prisma, new ConfigService({
        GEMINI_API_KEY: 'fixture-key', GEMINI_MODEL: 'gemini-2.5-flash',
      }));

      try {
        const result = await configuredService.processQuery(
          mockCompanyId, mockUserId, UserRole.EMPLOYEE, { message: 'How can departments coordinate their work?' },
        );
        expect(deadline).toHaveBeenCalledWith(15_000);
        expect(deadline).toHaveBeenCalledWith(5_000);
        expect(generateContent.mock.calls[0][0].model).toBe('gemini-2.5-flash');
        expect(generateContent.mock.calls[0][0].config.abortSignal.aborted).toBe(true);
        expect(generateContent.mock.calls[0][0].config.thinkingConfig).toBeUndefined();
        expect(generateContent).toHaveBeenCalledTimes(1);
        expect(result.model).toBe('gemini-policy-engine');
        expect(result.reply).toContain('Hello John');
      } finally {
        deadline.mockRestore();
      }
    });

    it('uses the default Gemini model when the preferred model is unavailable', async () => {
      const unavailable = Object.assign(new ApiError({ message: 'Unavailable', status: 503 }), { status: 503 });
      const generateContent = jest.fn().mockRejectedValueOnce(unavailable)
        .mockResolvedValueOnce({ text: 'Department managers route leave to the CEO.' });
      jest.mocked(GoogleGenAI).mockImplementationOnce(() => ({
        models: { generateContent },
      }) as unknown as GoogleGenAI);
      const configuredService = new AiAssistantService(prisma, new ConfigService({
        GEMINI_API_KEY: 'fixture-key', GEMINI_MODEL: 'gemini-3.8-flash',
      }));

      const result = await configuredService.processQuery(
        mockCompanyId, mockUserId, UserRole.EMPLOYEE, { message: 'How can departments coordinate their work?' },
      );

      expect(generateContent.mock.calls.map(([request]) => request.model)).toEqual(['gemini-3.8-flash', 'gemini-3.5-flash']);
      expect(generateContent.mock.calls[0][0].config.httpOptions).toEqual({ timeout: 10_000, retryOptions: { attempts: 1 } });
      expect(result).toMatchObject({ model: 'gemini-3.5-flash', reply: 'Department managers route leave to the CEO.' });
    });

    it('answers common policy questions immediately without a Gemini network call', async () => {
      const generateContent = jest.fn();
      jest.mocked(GoogleGenAI).mockImplementationOnce(() => ({
        models: { generateContent },
      }) as unknown as GoogleGenAI);
      const configuredService = new AiAssistantService(prisma, new ConfigService({
        GEMINI_API_KEY: 'fixture-key', GEMINI_MODEL: 'gemini-2.0-flash',
      }));

      const result = await configuredService.processQuery(
        mockCompanyId, mockUserId, UserRole.EMPLOYEE, { message: 'How do I apply to work from home?' },
      );

      expect(generateContent).not.toHaveBeenCalled();
      expect(result).toMatchObject({
        model: 'zenhr-policy-engine',
        reply: expect.stringContaining('New Remote Work Request'),
      });
    });

    it('should answer questions about probation period accurately according to policy', async () => {
      const result = await service.processQuery(
        mockCompanyId,
        mockUserId,
        UserRole.EMPLOYEE,
        { message: 'What is the probation duration before I can request leave?' },
      );

      expect(result.reply).toContain('3-month probation period (90 days');
    });

    it('answers a sick leave balance question with available days rather than annual allocation', async () => {
      const result = await service.processQuery(
        mockCompanyId,
        mockUserId,
        UserRole.EMPLOYEE,
        { message: 'How many days of sick leave do I have left?' },
      );

      expect(result.reply).toContain('Sick Leave: 12 days available');
      expect(result.reply).not.toContain('allocates 12 days of Sick Leave per year');
      expect(prisma.company.findUnique).not.toHaveBeenCalled();
      expect(prisma.leaveTypeSetting.findMany).not.toHaveBeenCalled();
    });

    it('should emphasize mandatory medical doctor prescription for sick leave', async () => {
      const result = await service.processQuery(
        mockCompanyId,
        mockUserId,
        UserRole.EMPLOYEE,
        { message: 'How do I take sick leave?' },
      );

      expect(result.reply).toContain('12 days of Sick Leave per year');
      expect(result.reply).toContain('medical doctor prescription or certificate');
      expect(result.reply).toContain('required when you submit');
      expect(result.reply).not.toContain('14 days of Sick Leave');
      expect(prisma.company.findUnique).not.toHaveBeenCalled();
      expect(prisma.employee.findFirst).not.toHaveBeenCalled();
      expect(prisma.leaveBalance.findMany).not.toHaveBeenCalled();
    });

    it('uses the tenant medical certificate setting instead of claiming it is mandatory', async () => {
      prisma.leaveTypeSetting.findMany.mockResolvedValueOnce([
        { leaveType: 'SICK', annualAllocation: 8, requiresReason: false, requiresMedicalCert: false, isActive: true },
      ]);

      const result = await service.processQuery(
        mockCompanyId,
        mockUserId,
        UserRole.EMPLOYEE,
        { message: 'How do I take sick leave?' },
      );

      expect(result.reply).toContain('8 days of Sick Leave per year');
      expect(result.reply).toContain('does not require a medical certificate');
      expect(result.reply).not.toContain('required when you submit');
    });

    it('uses tenant leave allocations in the Gemini context', async () => {
      const generateContent = jest.fn().mockResolvedValue({ text: 'Please contact HR for details.' });
      jest.mocked(GoogleGenAI).mockImplementationOnce(() => ({
        models: { generateContent },
      }) as unknown as GoogleGenAI);
      const configuredService = new AiAssistantService(prisma, new ConfigService({
        GEMINI_API_KEY: 'fixture-key', GEMINI_MODEL: '',
      }));

      await configuredService.processQuery(
        mockCompanyId,
        mockUserId,
        UserRole.EMPLOYEE,
        { message: 'How do I plan time away from work?' },
      );

      expect(generateContent.mock.calls[0][0].config.systemInstruction).toContain('- Sick Leave: 12 days/year (medical doctor prescription/certificate required).');
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
