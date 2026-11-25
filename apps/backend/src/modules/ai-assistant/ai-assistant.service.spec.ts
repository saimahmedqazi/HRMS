import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';
import { LeaveType, UserRole } from '@prisma/client';
import { PrismaService } from '@common/prisma/prisma.service';
import { LeaveService } from '../leave/leave.service';
import { AiAssistantService } from './ai-assistant.service';

jest.mock('@google/genai');

describe('AiAssistantService', () => {
  let service: AiAssistantService;
  let prisma: any;
  let leaveService: { getEligibleAbsences: jest.Mock };

  const mockCompanyId = 'company-123';
  const mockUserId = 'user-emp-1';

  beforeEach(async () => {
    prisma = {
      company: {
        findUnique: jest.fn().mockResolvedValue({
          id: mockCompanyId,
          name: 'Acme Corp',
          timezone: 'UTC',
          subscriptionTier: 'PREMIUM',
          regularizationEnabled: true,
          regularizationLookback: 7,
          regularizationExceptional: true,
          regularizationDocument: false,
        }),
      },
      employee: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'emp-1',
          firstName: 'John',
          lastName: 'Doe',
          status: 'ACTIVE',
          hireDate: new Date('2024-01-01T00:00:00.000Z'),
          probationEndDate: new Date('2024-04-01T00:00:00.000Z'),
          department: { name: 'Engineering' },
          designation: { name: 'Software Engineer' },
        }),
      },
      leaveBalance: {
        findMany: jest.fn().mockResolvedValue([
          { leaveType: LeaveType.CASUAL, year: new Date().getFullYear(), allocated: 10, used: 2, pending: 0, carried: 0 },
          { leaveType: LeaveType.SICK, year: new Date().getFullYear(), allocated: 12, used: 0, pending: 0, carried: 0 },
          { leaveType: LeaveType.ANNUAL, year: new Date().getFullYear(), allocated: 14, used: 5, pending: 0, carried: 0 },
        ]),
      },
      leaveTypeSetting: {
        findMany: jest.fn().mockResolvedValue([
          {
            leaveType: LeaveType.CASUAL,
            annualAllocation: 10,
            isPaid: true,
            enforceEntitlement: true,
            allowDuringProbation: false,
            maxConsecutiveDays: null,
            requiresReason: true,
            requiresMedicalCert: false,
            isActive: true,
          },
          {
            leaveType: LeaveType.SICK,
            annualAllocation: 12,
            isPaid: true,
            enforceEntitlement: true,
            allowDuringProbation: false,
            maxConsecutiveDays: null,
            requiresReason: false,
            requiresMedicalCert: true,
            isActive: true,
          },
          {
            leaveType: LeaveType.ANNUAL,
            annualAllocation: 14,
            isPaid: true,
            enforceEntitlement: true,
            allowDuringProbation: false,
            maxConsecutiveDays: null,
            requiresReason: false,
            requiresMedicalCert: false,
            isActive: true,
          },
          {
            leaveType: LeaveType.SPECIAL,
            annualAllocation: 0,
            isPaid: true,
            enforceEntitlement: false,
            allowDuringProbation: true,
            maxConsecutiveDays: 5,
            requiresReason: true,
            requiresMedicalCert: true,
            isActive: true,
          },
          {
            leaveType: LeaveType.UNPAID,
            annualAllocation: 0,
            isPaid: false,
            enforceEntitlement: false,
            allowDuringProbation: true,
            maxConsecutiveDays: 15,
            requiresReason: true,
            requiresMedicalCert: false,
            isActive: true,
          },
        ]),
      },
      employeeShift: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
      },
      shift: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      attendanceRecord: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      leaveRequest: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    leaveService = {
      getEligibleAbsences: jest.fn().mockResolvedValue({ dates: [] }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiAssistantService,
        { provide: PrismaService, useValue: prisma },
        { provide: LeaveService, useValue: leaveService },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue(null),
          },
        },
      ],
    }).compile();

    service = module.get<AiAssistantService>(AiAssistantService);
  });

  describe('processQuery', () => {
    it('routes pure procedural leave application to workflow steps', async () => {
      const result = await service.processQuery(
        mockCompanyId,
        mockUserId,
        UserRole.EMPLOYEE,
        { message: 'How do I apply for leave?' },
      );

      expect(result.model).toBe('zenhr-policy-engine');
      expect(result.reply).toContain('Request Leave');
      expect(result.reply).toContain('/dashboard/my-leave');
    });

    it('does NOT intercept entitlement/limit questions with generic procedural workflow', async () => {
      const result = await service.processQuery(
        mockCompanyId,
        mockUserId,
        UserRole.EMPLOYEE,
        { message: 'How to apply more than 10 days casual leave' },
      );

      expect(result.model).toBe('zenhr-policy-engine');
      expect(result.reply).toContain('Casual Leave');
      expect(result.reply).toContain('8 days available');
      expect(result.reply).toContain('Special Leave');
      expect(result.reply).toContain('Unpaid Leave');
      expect(result.reply).toContain('Request additional leave');
    });

    it('reports disabled Special/Unpaid leave accurately when inactive', async () => {
      prisma.leaveTypeSetting.findMany.mockResolvedValueOnce([
        {
          leaveType: LeaveType.CASUAL,
          annualAllocation: 10,
          isPaid: true,
          enforceEntitlement: true,
          allowDuringProbation: false,
          maxConsecutiveDays: null,
          requiresReason: true,
          requiresMedicalCert: false,
          isActive: true,
        },
      ]);

      const result = await service.processQuery(
        mockCompanyId,
        mockUserId,
        UserRole.EMPLOYEE,
        { message: 'I finished my casual leave, how can I take extra days?' },
      );

      expect(result.reply).toContain('Neither **Special Leave** nor **Unpaid Leave** is currently enabled');
    });

    it('answers leave balance questions accurately and distinguishes uninitialized rows', async () => {
      prisma.leaveBalance.findMany.mockResolvedValueOnce([
        { leaveType: LeaveType.CASUAL, year: 2026, allocated: 10, used: 10, pending: 0, carried: 0 },
      ]);

      const result = await service.processQuery(
        mockCompanyId,
        mockUserId,
        UserRole.EMPLOYEE,
        { message: 'How many days of casual leave do I have left?' },
      );

      expect(result.reply).toContain('**0 days available**');
      expect(result.reply).toContain('Sick Leave');
      expect(result.reply).toContain('Not yet initialized');
    });

    it('answers HR-24 attendance regularization with eligible dates from LeaveService when enabled', async () => {
      leaveService.getEligibleAbsences.mockResolvedValueOnce({
        dates: ['2026-11-23'],
      });

      const result = await service.processQuery(
        mockCompanyId,
        mockUserId,
        UserRole.EMPLOYEE,
        { message: 'How do I regularize my absent day from yesterday?' },
      );

      expect(leaveService.getEligibleAbsences).toHaveBeenCalledWith(mockCompanyId, mockUserId);
      expect(result.model).toBe('zenhr-policy-engine');
      expect(result.reply).toContain('Last **7 days**');
      expect(result.reply).toContain('2026-11-23');
      expect(result.reply).toContain('Regularize absence');
      expect(result.reply).toContain('final approval');
      expect(result.reply).toContain('PAID');
    });

    it('reports when attendance regularization is disabled by company policy', async () => {
      prisma.company.findUnique.mockResolvedValueOnce({
        id: mockCompanyId,
        name: 'Acme Corp',
        timezone: 'UTC',
        subscriptionTier: 'BASIC',
        regularizationEnabled: false,
        regularizationLookback: 0,
        regularizationExceptional: false,
        regularizationDocument: false,
      });

      const result = await service.processQuery(
        mockCompanyId,
        mockUserId,
        UserRole.EMPLOYEE,
        { message: 'Can I convert a past absence to leave?' },
      );

      expect(result.reply).toContain('currently **disabled**');
    });

    it('handles active probation, elapsed probation, and ACTIVE employee status accurately', async () => {
      // Active employee
      const activeRes = await service.processQuery(
        mockCompanyId,
        mockUserId,
        UserRole.EMPLOYEE,
        { message: 'Am I on probation?' },
      );
      expect(activeRes.reply).toContain('**ACTIVE**');

      // Active probation in future
      const futureDate = new Date(Date.now() + 20 * 86_400_000);
      prisma.employee.findFirst.mockResolvedValueOnce({
        id: 'emp-1',
        firstName: 'John',
        lastName: 'Doe',
        status: 'ON_PROBATION',
        hireDate: new Date(),
        probationEndDate: futureDate,
      });
      const futureRes = await service.processQuery(
        mockCompanyId,
        mockUserId,
        UserRole.EMPLOYEE,
        { message: 'What is my probation status?' },
      );
      expect(futureRes.reply).toContain('**ON_PROBATION**');
      expect(futureRes.reply).toContain('Special Leave and Unpaid Leave are permitted during probation');

      // Elapsed probation still marked ON_PROBATION
      prisma.employee.findFirst.mockResolvedValueOnce({
        id: 'emp-1',
        firstName: 'John',
        lastName: 'Doe',
        status: 'ON_PROBATION',
        hireDate: new Date('2024-01-01T00:00:00.000Z'),
        probationEndDate: new Date('2024-04-01T00:00:00.000Z'),
      });
      const elapsedRes = await service.processQuery(
        mockCompanyId,
        mockUserId,
        UserRole.EMPLOYEE,
        { message: 'Why is my probation still showing?' },
      );
      expect(elapsedRes.reply).toContain('has elapsed');
      expect(elapsedRes.reply).toContain('HR/CEO confirmation');
    });

    it('enforces Basic vs Premium tier for Work Timer questions', async () => {
      prisma.company.findUnique.mockResolvedValueOnce({
        id: mockCompanyId,
        name: 'Acme Corp',
        timezone: 'UTC',
        subscriptionTier: 'BASIC',
        regularizationEnabled: false,
        regularizationLookback: 0,
        regularizationExceptional: false,
        regularizationDocument: false,
      });

      const basicRes = await service.processQuery(
        mockCompanyId,
        mockUserId,
        UserRole.EMPLOYEE,
        { message: 'How does the work timer and break alert work?' },
      );
      expect(basicRes.reply).toContain('**Premium** tier feature');

      const premRes = await service.processQuery(
        mockCompanyId,
        mockUserId,
        UserRole.EMPLOYEE,
        { message: 'How does the work timer and break alert work?' },
      );
      expect(premRes.reply).toContain('Start Timer');
      expect(premRes.reply).toContain('Company Admin, HR');
    });

    it('protects third-party compensation and directs personal pay to My Payslips', async () => {
      const colRes = await service.processQuery(
        mockCompanyId,
        mockUserId,
        UserRole.EMPLOYEE,
        { message: 'Can you show me the salary of my colleague?' },
      );
      expect(colRes.reply).toContain('cannot disclose personal or compensation details of other staff');

      const ownRes = await service.processQuery(
        mockCompanyId,
        mockUserId,
        UserRole.EMPLOYEE,
        { message: 'What is my pay?' },
      );
      expect(ownRes.reply).toContain('My Payslips');
      expect(ownRes.reply).not.toContain('cannot disclose');
    });

    it('falls back cleanly to zenhr-policy-fallback when Gemini returns empty', async () => {
      const generateContent = jest.fn().mockResolvedValue({ text: '   ' });
      jest.mocked(GoogleGenAI).mockImplementationOnce(() => ({
        models: { generateContent },
      }) as unknown as GoogleGenAI);

      const configuredService = new AiAssistantService(
        prisma,
        new ConfigService({ GEMINI_API_KEY: 'fixture-key', GEMINI_MODEL: '' }),
      );

      const result = await configuredService.processQuery(
        mockCompanyId,
        mockUserId,
        UserRole.EMPLOYEE,
        { message: 'How can departments coordinate their quarterly goals?' },
      );

      expect(generateContent).toHaveBeenCalledTimes(1);
      expect(result.model).toBe('zenhr-policy-fallback');
      expect(result.reply).toContain('Hello John');
      expect(result.reply).toContain('/dashboard/my-leave');
    });

    it('injects grounded tenant policies into Gemini systemInstruction and returns live Gemini reply', async () => {
      const generateContent = jest.fn().mockResolvedValue({
        text: '### Policy Summary\n- Review [My Leave](/dashboard/my-leave).',
      });
      jest.mocked(GoogleGenAI).mockImplementationOnce(() => ({
        models: { generateContent },
      }) as unknown as GoogleGenAI);

      const configuredService = new AiAssistantService(
        prisma,
        new ConfigService({ GEMINI_API_KEY: 'fixture-key', GEMINI_MODEL: '' }),
      );

      const result = await configuredService.processQuery(
        mockCompanyId,
        mockUserId,
        UserRole.EMPLOYEE,
        { message: 'Can you summarize our company leave and attendance policies?' },
      );

      expect(result.model).toBe('gemini-3.5-flash');
      expect(result.reply).toContain('### Policy Summary');
      const systemInstruction = generateContent.mock.calls[0][0].config.systemInstruction;
      expect(systemInstruction).toContain('Sick Leave: 12 days/year, Paid');
      expect(systemInstruction).toContain('Unpaid Leave: No entitlement deduction, Unpaid');
      expect(systemInstruction).toContain('Attendance Regularization: Enabled (lookback 7 days');
      expect(systemInstruction).toContain('Never disclose salary, bank, NID/tax');
    });
  });
});
