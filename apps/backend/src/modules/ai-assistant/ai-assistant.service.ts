import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiError, GoogleGenAI, ThinkingLevel } from '@google/genai';
import { UserRole } from '@prisma/client';
import { PrismaService } from '@common/prisma/prisma.service';
import { ChatRequestDto } from './dto/chat-request.dto';

const DEFAULT_GEMINI_MODEL = 'gemini-3.5-flash';
const GEMINI_TIMEOUT_MS = 15_000;
const PREFERRED_MODEL_TIMEOUT_MS = 5_000;
const GEMINI_MIN_SERVER_TIMEOUT_MS = 10_000;

@Injectable()
export class AiAssistantService {
  private readonly logger = new Logger(AiAssistantService.name);
  private aiClient: GoogleGenAI | null = null;
  private readonly modelName: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    const apiKey = this.configService.get<string>('GEMINI_API_KEY');
    this.modelName = this.configService.get<string>('GEMINI_MODEL')?.trim() || DEFAULT_GEMINI_MODEL;
    if (apiKey && !apiKey.includes('mock') && !apiKey.includes('placeholder')) {
      this.aiClient = new GoogleGenAI({ apiKey });
    } else {
      this.logger.warn(
        'GEMINI_API_KEY unconfigured; operating in deterministic HR policy sandbox simulation mode.',
      );
    }
  }

  private async requestGemini(systemInstruction: string, question: string) {
    if (!this.aiClient) return;
    const deadline = AbortSignal.timeout(GEMINI_TIMEOUT_MS);
    const models = this.modelName === DEFAULT_GEMINI_MODEL
      ? [DEFAULT_GEMINI_MODEL]
      : [this.modelName, DEFAULT_GEMINI_MODEL];

    for (const model of models) {
      if (deadline.aborted) return;
      const useDefault = model === DEFAULT_GEMINI_MODEL;
      const abortSignal = useDefault ? deadline : AbortSignal.any([deadline, AbortSignal.timeout(PREFERRED_MODEL_TIMEOUT_MS)]);
      try {
        const response = await this.aiClient.models.generateContent({
          model,
          contents: question,
          config: {
            systemInstruction,
            abortSignal,
            httpOptions: {
              timeout: useDefault ? GEMINI_TIMEOUT_MS : GEMINI_MIN_SERVER_TIMEOUT_MS,
              retryOptions: { attempts: useDefault ? 2 : 1 },
            },
            ...(useDefault && { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }),
          },
        });
        const reply = response.text?.trim();
        if (reply) return { reply, model };
        this.logger.warn('Gemini returned no visible text');
      } catch (error) {
        const status = error instanceof ApiError ? error.status : undefined;
        const reason = abortSignal.aborted ? 'request deadline reached' : status ? `HTTP ${status}` : 'request failed';
        this.logger.warn(`Gemini ${reason}`);
        if (status && status !== 404 && status !== 408 && status !== 429 && status < 500) return;
      }
    }
  }

  /**
   * Process conversational HR policy queries with grounded tenant context and security guardrails.
   */
  async processQuery(
    companyId: string,
    userId: string,
    userRole: UserRole,
    dto: ChatRequestDto,
  ) {
    // 1. Fetch Company & Employee Context
    const company = await this.prisma.company.findUnique({ where: { id: companyId } });
    const employee = await this.prisma.employee.findFirst({
      where: { companyId, userId },
      include: {
        department: true,
        designation: true,
      },
    });

    // 2. Fetch User's Leave Balances
    const currentYear = new Date().getFullYear();
    const balances = employee
      ? await this.prisma.leaveBalance.findMany({
          where: { companyId, employeeId: employee.id, year: currentYear },
        })
      : [];

    const casualBalance = balances.find((b) => b.leaveType === 'CASUAL');
    const sickBalance = balances.find((b) => b.leaveType === 'SICK');
    const annualBalance = balances.find((b) => b.leaveType === 'ANNUAL');

    // 3. Construct System Prompt with ZenHR Policy Knowledge & Guardrails
    const systemPrompt = `
You are ZenHR AI, an intelligent, empathetic, and professional HR policy assistant for ${company?.name || 'ZenHR Enterprise'}.
Your role is to assist employees and managers with clear, accurate answers about company policies, leave, attendance, and operational workflows.

ORGANIZATIONAL POLICIES:
1. Probation Period: New employees have a standard 3-month probation period (90 days from hire date). Leave requests are locked during probation.
2. Leave Allocations:
   - Casual Leave: 10 days/year. Reason required.
   - Sick Leave: 14 days/year. Medical doctor prescription/certificate is strictly mandatory.
   - Annual Leave: 14 days/year.
3. Approval Line:
   - Employees route to Team Lead (Step 1) -> HR Manager (Step 2).
   - Team Leads route to Department Manager (Step 1) -> HR Manager (Step 2).
   - Department Managers route directly to CEO / Company Admin.
4. Attendance & Timer:
   - Work Timer tracks active hours and breaks.
   - Accumulated break time exceeding 60 minutes triggers real-time alerts to the Team Lead and Department Manager.
   - Overtime is computed on checkout when work exceeds standard shift hours.
5. Remote Work / Work From Home (WFH):
   - Employees can request remote work permission from the Attendance page by clicking "New Remote Work Request".
   - Standing remote work requests require a two-tier approval: Step 1 (Team Lead) -> Step 2 (Department Manager / HR).
   - Once approved, employees can check in remotely from anywhere without triggering the unauthorized check-in exception.

EMPLOYEE CONTEXT:
- Name: ${employee ? `${employee.firstName} ${employee.lastName}` : 'Administrator'}
- Role: ${userRole}
- Department: ${employee?.department?.name || 'General'}
- Available Leave Balances:
  - Casual: ${casualBalance ? casualBalance.allocated + casualBalance.carried - casualBalance.used - casualBalance.pending : 10} days
  - Sick: ${sickBalance ? sickBalance.allocated + sickBalance.carried - sickBalance.used - sickBalance.pending : 14} days
  - Annual: ${annualBalance ? annualBalance.allocated + annualBalance.carried - annualBalance.used - annualBalance.pending : 14} days

SECURITY & PRIVACY RULES:
- Never disclose salary, compensation, or personal performance records of ANY other employee.
- If asked about another employee's private details, state: "For privacy and compliance reasons, I cannot disclose personal or compensation details of other staff members."
- Keep responses concise, supportive, and formatted in bullet points where appropriate.
`;

    // 4. If live Gemini API key is configured, invoke Gemini API
    const liveReply = await this.requestGemini(systemPrompt, dto.message);
    if (liveReply) return liveReply;

    // 5. Intelligent Deterministic Sandbox Fallback
    const query = dto.message.toLowerCase();
    let reply = '';

    if (query.includes('probation')) {
      reply = `According to ${company?.name || 'ZenHR'} policy, all newly hired employees undergo a 3-month probation period (90 days from hire date). During active probation, regular leave requests are locked. For medical or emergency absences, please consult HR directly.`;
    } else if (query.includes('sick') || query.includes('doctor') || query.includes('prescription')) {
      reply = `You have 14 days of Sick Leave allocated annually. Important: To request Sick Leave, uploading an official medical doctor prescription or certificate (PDF/JPG/PNG) is strictly mandatory during submission.`;
    } else if (query.includes('balance') || query.includes('how many days')) {
      const availCasual = casualBalance
        ? casualBalance.allocated + (casualBalance.carried || 0) - casualBalance.used - (casualBalance.pending || 0)
        : 10;
      const availSick = sickBalance
        ? sickBalance.allocated + (sickBalance.carried || 0) - sickBalance.used - (sickBalance.pending || 0)
        : 14;
      const availAnnual = annualBalance
        ? annualBalance.allocated + (annualBalance.carried || 0) - annualBalance.used - (annualBalance.pending || 0)
        : 14;
      reply = `Here is your current leave balance:\n• Casual Leave: ${availCasual} days available\n• Sick Leave: ${availSick} days available\n• Annual Leave: ${availAnnual} days available`;
    } else if (query.includes('break') || query.includes('timer') || query.includes('alert')) {
      reply = `The ZenHR Work Timer tracks your active time and breaks. If your cumulative break time exceeds 60 minutes in a single shift, a real-time overstay notification is broadcast to your Team Lead and Department Manager.`;
    } else if (
      query.includes('work from home') ||
      query.includes('remote') ||
      query.includes('wfh') ||
      query.includes('home')
    ) {
      reply = `To apply to work from home (Remote Work):\n1. Open **Attendance** or **My Attendance** on your dashboard.\n2. In Remote Work Requests, click **New Remote Work Request**.\n3. Enter the start date, end date, and reason.\n4. Submit the request for Step 1 recommendation and Step 2 approval.\n\nOnce approved, you can punch in remotely without triggering HR exceptions.`;
    } else if (
      (query.includes('salary') || query.includes('compensation') || query.includes('earns') || query.includes('pay')) &&
      !query.includes('my salary') && !query.includes('my pay') && !query.includes('my compensation')
    ) {
      reply = `For privacy and data compliance reasons, I cannot disclose personal or compensation details of other staff members. You can review your own personal payslips under the My Payslips tab.`;
    } else {
      reply = `Hello ${employee?.firstName || 'there'}! I am your ZenHR AI Assistant. I can help answer questions regarding your leave balances, probation guidelines, attendance policies, and approval workflows. How can I assist you today?`;
    }

    return { reply, model: 'gemini-policy-engine' };
  }
}
