import { test, expect, type Page } from '@playwright/test';
import { openFixtureDatabase } from './fixture-database';

test.describe('Leave form policy', () => {
  const annual = { id: 'annual', leaveType: 'ANNUAL', annualAllocation: 14, isActive: true, requiresReason: false, requiresMedicalCert: false };
  const sick = { id: 'sick', leaveType: 'SICK', annualAllocation: 12, isActive: true, requiresReason: false, requiresMedicalCert: false };
  const certificate = { name: 'medical-fixture.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-fixture') };

  async function mockLeaveForm(page: Page, settings: typeof annual[]) {
    const submissions: string[] = [];
    await page.route('**/api/v1/**', (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      if (path.endsWith('/auth/me')) return route.fulfill({ json: { data: {
        id: 'fixture-employee', role: 'EMPLOYEE', firstName: 'Fixture', lastName: 'Employee', companyId: 'fixture-company',
        employee: { id: 'profile', status: 'ACTIVE' },
      } } });
      if (path.endsWith('/leave/types')) return route.fulfill({ json: { data: settings } });
      if (path.endsWith('/leave/requests') && request.method() === 'POST') {
        submissions.push(request.postData() ?? '');
        return route.fulfill({ status: 201, json: { data: {} } });
      }
      return route.fulfill({ json: { data: [] } });
    });
    await page.goto('/dashboard/my-leave');
    return submissions;
  }

  test('offers only active leave types and explains when all are disabled', async ({ page }) => {
    await mockLeaveForm(page, [{ ...annual, isActive: false }, sick]);
    await page.getByRole('button', { name: 'Request Leave' }).click();
    await expect(page.locator('form select option')).toHaveText(['SICK (12 days/yr)']);
    await expect(page.getByText('Medical Prescription / Certificate (optional)')).toBeVisible();

    await page.unroute('**/api/v1/**');
    await mockLeaveForm(page, [{ ...annual, isActive: false }]);
    await expect(page.getByRole('button', { name: 'Request Leave' })).toBeDisabled();
    await expect(page.getByText('No leave types are currently available.')).toBeVisible();
  });

  test('leaves an optional certificate behind when the employee switches leave type', async ({ page }) => {
    const submissions = await mockLeaveForm(page, [sick, annual]);
    await page.getByRole('button', { name: 'Request Leave' }).click();
    await page.locator('#prescription-file').setInputFiles(certificate);
    await page.locator('form select').selectOption('annual');
    await page.locator('form input[type="date"]').nth(0).fill('2026-12-11');
    await page.locator('form input[type="date"]').nth(1).fill('2026-12-11');
    await page.getByRole('button', { name: 'Submit Leave Request' }).click();
    await expect.poll(() => submissions.length).toBe(1);
    expect(submissions[0]).toContain('annual');
    expect(submissions[0]).not.toContain('medical-fixture.pdf');
  });

  test('shows an actionable error for a missing required certificate', async ({ page }) => {
    const submissions = await mockLeaveForm(page, [{ ...sick, requiresMedicalCert: true }]);
    await page.getByRole('button', { name: 'Request Leave' }).click();
    await page.locator('form input[type="date"]').nth(0).fill('2026-12-11');
    await page.locator('form input[type="date"]').nth(1).fill('2026-12-11');
    await page.getByRole('button', { name: 'Submit Leave Request' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Upload a medical prescription or certificate for this leave type.' })).toBeVisible();
    expect(submissions).toHaveLength(0);
    await page.locator('#prescription-file').setInputFiles(certificate);
    await page.getByRole('button', { name: 'Submit Leave Request' }).click();
    await expect.poll(() => submissions.length).toBe(1);
    expect(submissions[0]).toContain(certificate.name);
  });
});

test.describe('Leave Management & 2-Step Approval Lifecycle', () => {
  test.beforeAll(async () => {
    const prisma = openFixtureDatabase();
    // Reset leave balances for employee@acme.com so test always has full annual quota
    const empUser = await prisma.user.findUnique({
      where: { email: 'employee@acme.com' },
      include: { employee: true },
    });
    if (empUser?.employee) {
      await prisma.leaveBalance.updateMany({
        where: { employeeId: empUser.employee.id },
        data: { used: 0, pending: 0 },
      });
      await prisma.leaveRequest.deleteMany({
        where: {
          employeeId: empUser.employee.id,
          startDate: { gte: new Date('2026-12-01') },
        },
      });
    }
    await prisma.$disconnect();
  });

  test('Concurrent leave submissions cannot reserve more than the first-use balance', async ({ page }) => {
    const prisma = openFixtureDatabase();
    const year = new Date().getUTCFullYear() + 3;
    const reasonPrefix = `Concurrent leave fixture ${Date.now()}`;
    try {
      const employee = await prisma.employee.findFirstOrThrow({
        where: { user: { email: 'employee@acme.com' }, company: { slug: 'acme-corp' } },
        select: { id: true, companyId: true },
      });
      const { companyId, id: employeeId } = employee;
      const leaveType = 'CASUAL';
      const key = { companyId, employeeId, leaveType, year } as const;
      const setting = await prisma.leaveTypeSetting.findUniqueOrThrow({
        where: { companyId_leaveType: { companyId, leaveType } },
      });
      expect(setting.annualAllocation).toBe(10);
      expect(await prisma.leaveBalance.findUnique({
        where: { companyId_employeeId_leaveType_year: key },
      })).toBeNull();

      await page.goto('/login');
      await page.locator('input[type="email"]').fill('employee@acme.com');
      await page.locator('input[type="password"]').fill('Password@123');
      await page.locator('button[type="submit"]').click();
      await page.waitForURL('**/dashboard');

      try {
        const submitted = await Promise.all(['06', '07'].map((month) =>
          page.request.post('/api/v1/leave/requests', {
            data: {
              leaveTypeSettingId: setting.id,
              startDate: `${year}-${month}-01`,
              endDate: `${year}-${month}-10`,
              reason: `${reasonPrefix} ${month}`,
            },
          }),
        ));

        expect(submitted.map((response) => response.status()).sort()).toEqual([201, 400]);
        const declined = submitted.find((response) => response.status() === 400)!;
        expect(await declined.text()).toContain('Requested: 10 days, Available: 0 days.');
        const requests = await prisma.leaveRequest.findMany({
          where: { companyId, employeeId, reason: { startsWith: reasonPrefix } },
        });
        expect(requests).toHaveLength(1);
        const balance = await prisma.leaveBalance.findUniqueOrThrow({
          where: { companyId_employeeId_leaveType_year: key },
        });
        expect(balance).toMatchObject({ pending: 10, used: 0 });

        const cancellation = await page.request.post(`/api/v1/leave/requests/${requests[0].id}/cancel`);
        expect(cancellation.ok()).toBe(true);
        expect(await prisma.leaveBalance.findUniqueOrThrow({
          where: { companyId_employeeId_leaveType_year: key },
        })).toMatchObject({ pending: 0, used: 0 });
      } finally {
        await prisma.$transaction([
          prisma.leaveRequest.deleteMany({ where: { companyId, employeeId, reason: { startsWith: reasonPrefix } } }),
          prisma.leaveBalance.deleteMany({ where: key }),
        ]);
      }
    } finally {
      await prisma.$disconnect();
    }
  });

  test('reserves both leave years atomically and settles both on cancellation or approval', async ({ request, playwright }) => {
    const prisma = openFixtureDatabase();
    const year = new Date().getUTCFullYear() + 5;
    const reason = `Cross-year fixture ${Date.now()}`;
    try {
      const employee = await prisma.employee.findFirstOrThrow({ where: { user: { email: 'employee@acme.com' } } });
      const key = { companyId: employee.companyId, employeeId: employee.id, leaveType: 'CASUAL' as const };
      const setting = await prisma.leaveTypeSetting.findUniqueOrThrow({ where: {
        companyId_leaveType: { companyId: employee.companyId, leaveType: key.leaveType },
      } });
      const balances = { ...key, year: { in: [year, year + 1] } };
      const attendance = { companyId: employee.companyId, employeeId: employee.id, date: { gte: new Date(`${year}-12-31`), lte: new Date(`${year + 1}-01-02`) } };
      const readBalances = () => prisma.leaveBalance.findMany({ where: balances, orderBy: { year: 'asc' }, select: { year: true, pending: true, used: true } });
      expect(await readBalances()).toEqual([]);
      expect(await prisma.attendanceRecord.count({ where: attendance })).toBe(0);
      try {
        await prisma.leaveBalance.create({ data: { ...key, year: year + 1, allocated: 0 } });
        expect((await request.post('/api/v1/auth/login', { data: { email: 'employee@acme.com', password: 'Password@123' } })).ok()).toBe(true);
        const submit = () => request.post('/api/v1/leave/requests', { data: {
          leaveTypeSettingId: setting.id, startDate: `${year}-12-31`, endDate: `${year + 1}-01-02`, reason,
        } });
        const denied = await submit();
        expect(denied.status()).toBe(400);
        expect((await denied.json()).message).toContain(`Insufficient leave balance for ${year + 1}`);
        expect(await readBalances()).toEqual([{ year: year + 1, pending: 0, used: 0 }]);
        await prisma.leaveBalance.updateMany({ where: { ...key, year: year + 1 }, data: { allocated: 2 } });
        const accepted = await submit();
        expect(accepted.status()).toBe(201);
        const { id, totalDays } = (await accepted.json()).data;
        expect(totalDays).toBe(3);
        expect(await readBalances()).toEqual([{ year, pending: 1, used: 0 }, { year: year + 1, pending: 2, used: 0 }]);
        expect((await request.post(`/api/v1/leave/requests/${id}/cancel`)).ok()).toBe(true);
        expect(await readBalances()).toEqual([{ year, pending: 0, used: 0 }, { year: year + 1, pending: 0, used: 0 }]);
        const resubmitted = await submit();
        expect(resubmitted.status()).toBe(201);
        const { id: approvalId } = (await resubmitted.json()).data;
        const scope = { companyId: employee.companyId, employeeId: employee.id };
        await prisma.attendanceRecord.createMany({ data: [
          { ...scope, date: new Date(`${year}-12-31`), status: 'ABSENT', markedBySystem: true },
          { ...scope, date: new Date(`${year + 1}-01-01`), status: 'PRESENT', checkInTime: new Date(`${year + 1}-01-01T09:00:00Z`) },
        ] });
        const approver = await playwright.request.newContext({ baseURL: new URL(resubmitted.url()).origin });
        try {
          for (const [step, email] of [[1, 'team.lead@acme.com'], [2, 'hr@acme.com']]) {
            expect((await approver.post('/api/v1/auth/login', { data: { email, password: 'Password@123' } })).ok()).toBe(true);
            expect((await approver.post(`/api/v1/leave/requests/${approvalId}/step${step}`, { data: { decision: 'APPROVE' } })).ok()).toBe(true);
          }
        } finally {
          await approver.dispose();
        }
        expect(await readBalances()).toEqual([{ year, pending: 0, used: 1 }, { year: year + 1, pending: 0, used: 2 }]);
        const records = await prisma.attendanceRecord.findMany({ where: attendance, orderBy: { date: 'asc' }, select: { status: true, checkInTime: true } });
        expect(records).toEqual([
          { status: 'ON_LEAVE', checkInTime: null },
          { status: 'PRESENT', checkInTime: new Date(`${year + 1}-01-01T09:00:00Z`) },
          { status: 'ON_LEAVE', checkInTime: null },
        ]);
      } finally {
        await prisma.$transaction([
          prisma.leaveRequest.deleteMany({ where: { companyId: key.companyId, employeeId: key.employeeId, reason } }),
          prisma.leaveBalance.deleteMany({ where: balances }),
          prisma.attendanceRecord.deleteMany({ where: attendance }),
        ]);
      }
    } finally {
      await prisma.$disconnect();
    }
  });

  test('automatic and executive approval mark attendance and preserve a holiday', async ({ request }) => {
    const prisma = openFixtureDatabase();
    const year = new Date().getUTCFullYear() + 7;
    const reason = `Attendance approval fixture ${Date.now()}`;
    const start = `${year}-06-01`;
    const end = `${year}-06-02`;
    const dates = { gte: new Date(start), lte: new Date(end) };
    try {
      const [hr, admin] = await Promise.all(['hr@acme.com', 'ceo@acme.com'].map((email) =>
        prisma.employee.findFirstOrThrow({ where: { user: { email } } }),
      ));
      const companyId = hr.companyId;
      const employeeIds = [hr.id, admin.id];
      const scope = { companyId, employeeId: { in: employeeIds } };
      const attendance = { ...scope, date: dates };
      const balance = { ...scope, year, leaveType: 'CASUAL' as const };
      expect(await prisma.attendanceRecord.count({ where: attendance })).toBe(0);
      expect(await prisma.leaveBalance.count({ where: balance })).toBe(0);
      try {
        const setting = await prisma.leaveTypeSetting.findUniqueOrThrow({ where: {
          companyId_leaveType: { companyId, leaveType: 'CASUAL' },
        } });
        const login = (email: string) => request.post('/api/v1/auth/login', { data: { email, password: 'Password@123' } });
        const submit = () => request.post('/api/v1/leave/requests', { data: {
          leaveTypeSettingId: setting.id, startDate: start, endDate: end, reason,
        } });
        await prisma.attendanceRecord.create({ data: { companyId, employeeId: admin.id, date: new Date(end), status: 'HOLIDAY' } });
        expect((await login('hr@acme.com')).ok()).toBe(true);
        const submitted = await submit();
        expect(submitted.status()).toBe(201);
        const hrLeave = (await submitted.json()).data;
        expect(hrLeave.status).toBe('PENDING');
        expect(await prisma.attendanceRecord.count({ where: { ...attendance, employeeId: hr.id } })).toBe(0);

        expect((await login('ceo@acme.com')).ok()).toBe(true);
        const approved = await request.post(`/api/v1/leave/requests/${hrLeave.id}/step1`, { data: { decision: 'APPROVE' } });
        expect(approved.ok()).toBe(true);
        expect((await approved.json()).data.status).toBe('APPROVED');
        const autoApproved = await submit();
        expect(autoApproved.status()).toBe(201);
        expect((await autoApproved.json()).data.status).toBe('APPROVED');

        for (const [employeeId, expected] of [[hr.id, ['ON_LEAVE', 'ON_LEAVE']], [admin.id, ['ON_LEAVE', 'HOLIDAY']]] as const) {
          const records = await prisma.attendanceRecord.findMany({ where: { companyId, employeeId, date: dates }, orderBy: { date: 'asc' } });
          expect(records.map(({ status }) => status)).toEqual(expected);
        }
      } finally {
        await prisma.$transaction([
          prisma.leaveRequest.deleteMany({ where: { ...scope, reason } }),
          prisma.leaveBalance.deleteMany({ where: balance }),
          prisma.attendanceRecord.deleteMany({ where: attendance }),
        ]);
      }
    } finally {
      await prisma.$disconnect();
    }
  });

  test('Probationary Employee is gated from requesting leave with probation notice', async ({ page }) => {
    await page.context().clearCookies();
    await page.goto('/login');
    await page.fill('input[type="email"]', 'newbie@acme.com');
    await page.fill('input[type="password"]', 'Password@123');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/dashboard', { timeout: 15000 });

    // Navigate to Leave
    await page.click('a[href="/dashboard/my-leave"]');
    await page.waitForURL('**/dashboard/my-leave');

    // Verify Active Probation warning
    await expect(page.locator('text=Probation Period Active')).toBeVisible();
    await expect(page.locator('text=Per ZenHR company policy, employees on active 3-month probation cannot submit leave')).toBeVisible();

    // Verify Request Leave button is disabled
    const requestBtn = page.locator('button:has-text("Request Leave")');
    await expect(requestBtn).toBeDisabled();
  });

  test('End-to-End Leave Lifecycle: Employee Applies -> Team Lead Step 1 -> HR Manager Step 2 -> Approved', async ({ page }) => {
    const testReason = `Attending family celebration - ${Date.now()}`;

    // 1. Employee submits leave request
    await page.context().clearCookies();
    await page.goto('/login');
    await page.fill('input[type="email"]', 'employee@acme.com');
    await page.fill('input[type="password"]', 'Password@123');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/dashboard', { timeout: 15000 });

    await page.click('a[href="/dashboard/leave"]');
    await page.waitForURL('**/dashboard/leave');

    // Wait for leave data to load
    await expect(page.locator('text=CASUAL LEAVE').first()).toBeVisible({ timeout: 10000 });

    // Click Request Leave
    await page.click('button:has-text("Request Leave")');
    await expect(page.locator('h3:has-text("Request Leave")')).toBeVisible();

    // Select first leave type
    const select = page.locator('select');
    await expect(select.locator('option').first()).toBeAttached({ timeout: 5000 });
    await select.selectOption({ index: 0 });

    // Fill dates: 2026-12-10 to 2026-12-12
    const dateInputs = page.locator('input[type="date"]');
    await dateInputs.nth(0).fill('2026-12-10');
    await dateInputs.nth(1).fill('2026-12-12');

    // Fill reason
    await page.fill('textarea', testReason);

    // Submit Request
    await page.click('button:has-text("Submit Leave Request")');

    // Verify modal closes and new request appears in table with PENDING status
    await expect(page.locator('h3:has-text("Request Leave")')).not.toBeVisible();
    await expect(page.locator(`text=${testReason}`).first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=PENDING').first()).toBeVisible();

    // Sign out
    await page.locator('button[title="Sign out"]').click();
    await page.waitForURL('**/login', { timeout: 15000 });

    // 2. Team Lead performs Step 1 Approval
    await page.context().clearCookies();
    await page.goto('/login');
    await page.fill('input[type="email"]', 'team.lead@acme.com');
    await page.fill('input[type="password"]', 'Password@123');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/dashboard', { timeout: 15000 });

    await page.click('a[href="/dashboard/leave-approvals"]');
    await page.waitForURL('**/dashboard/leave-approvals');

    // Review button on pending request
    const reviewBtn = page.locator('button:has-text("Review")').first();
    await expect(reviewBtn).toBeVisible({ timeout: 10000 });
    await reviewBtn.click();

    // Modal appears: Adjudicate Leave Request
    await expect(page.locator('h3:has-text("Adjudicate Leave Request")')).toBeVisible();
    await page.fill('textarea', 'Step 1 Approved by Team Lead: Squad coverage confirmed.');
    await page.click('button:has-text("Confirm Approval")');

    // Modal closes
    await expect(page.locator('h3:has-text("Adjudicate Leave Request")')).not.toBeVisible();

    // Sign out
    await page.locator('button[title="Sign out"]').click();
    await page.waitForURL('**/login', { timeout: 15000 });

    // 3. HR Manager performs Step 2 Approval
    await page.context().clearCookies();
    await page.goto('/login');
    await page.fill('input[type="email"]', 'hr@acme.com');
    await page.fill('input[type="password"]', 'Password@123');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/dashboard', { timeout: 15000 });

    await page.click('a[href="/dashboard/leave-approvals"]');
    await page.waitForURL('**/dashboard/leave-approvals');

    // Review button on Step 2 pending request
    const hrReviewBtn = page.locator('button:has-text("Review")').first();
    await expect(hrReviewBtn).toBeVisible({ timeout: 10000 });
    await hrReviewBtn.click();

    // Modal appears
    await expect(page.locator('h3:has-text("Adjudicate Leave Request")')).toBeVisible();
    await page.fill('textarea', 'Step 2 Approved by HR: Annual balance verified.');
    await page.click('button:has-text("Confirm Approval")');

    // Modal closes
    await expect(page.locator('h3:has-text("Adjudicate Leave Request")')).not.toBeVisible();

    // Sign out
    await page.locator('button[title="Sign out"]').click();
    await page.waitForURL('**/login', { timeout: 15000 });

    // 4. Employee verifies final APPROVED status
    await page.context().clearCookies();
    await page.goto('/login');
    await page.fill('input[type="email"]', 'employee@acme.com');
    await page.fill('input[type="password"]', 'Password@123');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/dashboard', { timeout: 15000 });

    await page.click('a[href="/dashboard/leave"]');
    await page.waitForURL('**/dashboard/leave');

    // Request table should now display APPROVED badge for this request
    const approvedRow = page.locator(`tr:has-text("${testReason}")`).first();
    await expect(approvedRow).toBeVisible();
    await expect(approvedRow.locator('text=APPROVED').first()).toBeVisible();
  });
});
