import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import * as xlsx from 'xlsx';
import { openFixtureDatabase } from './fixture-database';
import { signInThroughUi } from './role-session';

test('an unavailable import report leaves file selection usable', async ({ page }) => {
  await page.route('**/api/v1/auth/me', (route) => route.fulfill({
    json: { data: { id: 'fixture-hr', role: 'HR_MANAGER', companyId: 'fixture-company' } },
  }));
  await page.route('**/api/v1/auth/me/modules', (route) => route.fulfill({ json: { data: { allowedModules: ['bulk-import'] } } }));
  await page.route('**/api/v1/notifications', (route) => route.fulfill({ json: { data: [] } }));
  let releaseResponse!: () => void;
  const responseReady = new Promise<void>((resolve) => { releaseResponse = resolve; });
  await page.route('**/api/v1/employees/bulk/jobs/old-import', async (route) => {
    await responseReady;
    await route.fulfill({ status: 403, json: { message: 'Import unavailable' } });
  });

  await page.goto('/dashboard/bulk-import?importJob=old-import');
  const picker = page.locator('input[type=file]');
  try {
    await expect(page.getByText('Checking import status…')).toBeVisible();
    await expect(page.getByText('Employee import queued…')).toHaveCount(0);
    await expect(picker).toBeDisabled();
  } finally {
    releaseResponse();
  }
  await expect(page.getByText('This import is unavailable.', { exact: false })).toBeVisible();
  await expect(picker).toBeEnabled();
  await expect(page).toHaveURL(/importJob=old-import$/);
});

test('HR downloads the bulk template and an imported employee sets their own password', async ({ page }) => {
  test.setTimeout(180_000);
  const prisma = openFixtureDatabase();
  const suffix = randomUUID().slice(0, 8);
  const email = `bulk-${suffix}@example.test`;
  const skippedEmail = `skipped-${suffix}@example.test`;
  const jobIds: string[] = [];

  try {
    await signInThroughUi(page, 'hr@acme.com', 'Password@123');
    await page.goto('/dashboard/bulk-import');

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('link', { name: 'Download Sample Template (.xlsx)' }).click(),
    ]);
    expect(download.suggestedFilename()).toBe('workforce-import-sample.xlsx');
    const workbook = xlsx.read(await readFile(await download.path()), { type: 'buffer' });
    const sheet = workbook.Sheets.Employees;
    expect(xlsx.utils.sheet_to_json(sheet, { header: 1 })[0]).toEqual([
      'firstName', 'lastName', 'email', 'employeeCode', 'hireDate',
      'departmentName', 'designationName', 'baseSalary', 'phone',
    ]);
    xlsx.utils.sheet_add_aoa(sheet, [
      ['Bulk', 'Fixture', email, `bulk-${suffix}`, '2026-01-15'],
      [],
      ['', 'Skipped', skippedEmail, `skipped-${suffix}`, '2026-01-15'],
    ], { origin: -1 });
    const upload = {
      name: 'workforce-import.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' }),
    };
    await page.locator('input[type="file"]').setInputFiles(upload);
    await page.getByRole('button', { name: 'Validate & Preview Sheet' }).click();
    await expect(page.getByRole('row').filter({ hasText: 'Row 4' })).toContainText('First name is required');
    const [submission] = await Promise.all([
      page.waitForResponse((response) => response.url().endsWith('/employees/bulk/execute') && response.request().method() === 'POST'),
      page.getByRole('button', { name: 'Confirm Import (1 Employees)' }).click(),
    ]);
    expect(submission.status()).toBe(202);
    const { id } = (await submission.json()).data;
    jobIds.push(id);
    await expect(page.getByRole('status')).toContainText('1 imported · 1 failed');
    await page.reload();
    await expect(page.getByRole('status')).toContainText('1 imported · 1 failed');
    await expect(page.getByText('Imported employees can set their password using')).toBeVisible();
    await expect(page.getByRole('row').filter({ hasText: 'Row 4' })).toContainText('First name is required');
    const [report] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Download error report' }).click(),
    ]);
    expect(report.suggestedFilename()).toBe('bulk-import-errors.csv');
    expect(await readFile(await report.path(), 'utf8')).toContain('"4","firstName","First name is required"');

    const imported = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(imported.passwordHash).toBe('!password-setup-required');
    expect(await prisma.user.findUnique({ where: { email: skippedEmail } })).toBeNull();
    const retry = await page.request.post('/api/v1/employees/bulk/execute', { multipart: { file: upload } });
    expect(retry.status()).toBe(202);
    const retryId = (await retry.json()).data.id;
    jobIds.push(retryId);
    await expect.poll(async () => {
      const result = await page.request.get(`/api/v1/employees/bulk/jobs/${retryId}`);
      return (await result.json()).data;
    }).toMatchObject({ status: 'COMPLETED', importedCount: 0, failedCount: 2 });

    await page.context().clearCookies();
    await signInThroughUi(page, 'ceo@acme.com', 'Password@123');
    expect((await page.request.get(`/api/v1/employees/bulk/jobs/${id}`)).status()).toBe(404);

    await page.context().clearCookies();
    expect((await page.request.post('/api/v1/auth/forgot-password', { data: { email } })).ok()).toBe(true);
    const account = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(account.passwordResetToken).toBeTruthy();
    const password = `Fixture-${randomUUID()}!`;
    expect((await page.request.post('/api/v1/auth/reset-password', {
      data: { token: account.passwordResetToken, newPassword: password },
    })).ok()).toBe(true);
    await signInThroughUi(page, email, password);
    expect((await page.request.get('/api/v1/employees/bulk/template')).status()).toBe(403);
    expect((await page.request.get(`/api/v1/employees/bulk/jobs/${id}`)).status()).toBe(403);
  } finally {
    try {
      await prisma.$transaction([
        prisma.bulkImportJob.deleteMany({ where: { id: { in: jobIds } } }),
        prisma.employee.deleteMany({ where: { user: { email: { in: [email, skippedEmail] } } } }),
        prisma.user.deleteMany({ where: { email: { in: [email, skippedEmail] } } }),
      ]);
    } finally {
      await prisma.$disconnect();
    }
  }
});

test('manual onboarding skips a bulk-imported code and allocates distinct codes concurrently', async ({ request }) => {
  const prisma = openFixtureDatabase();
  const suffix = randomUUID().slice(0, 12);
  const adminEmail = `onboarding-admin-${suffix}@example.test`;

  try {
    const registration = await request.post('/api/v1/auth/register', { data: {
      companyName: `Onboarding Fixture ${suffix}`,
      adminFirstName: 'Fixture', adminLastName: 'Admin', adminEmail,
      adminPassword: 'OnboardingFixture@123',
    } });
    expect(registration.status()).toBe(201);
    const { companyId } = (await registration.json()).data.user;
    const [sick, annual] = await Promise.all([
      prisma.leaveTypeSetting.findUniqueOrThrow({ where: { companyId_leaveType: { companyId, leaveType: 'SICK' } } }),
      prisma.leaveTypeSetting.findUniqueOrThrow({ where: { companyId_leaveType: { companyId, leaveType: 'ANNUAL' } } }),
    ]);
    expect((await request.patch(`/api/v1/leave/types/${sick.id}`, { data: { annualAllocation: 3 } })).ok()).toBe(true);
    expect((await request.patch(`/api/v1/leave/types/${annual.id}`, { data: { isActive: false } })).ok()).toBe(true);

    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, xlsx.utils.aoa_to_sheet([
      ['firstName', 'lastName', 'email', 'employeeCode', 'hireDate'],
      ['Imported', 'Fixture', `onboarding-import-${suffix}@example.test`, 'EMP-003', '2025-01-15'],
    ]), 'Employees');
    const submitted = await request.post('/api/v1/employees/bulk/execute', { multipart: { file: {
      name: 'onboarding-fixture.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' }),
    } } });
    expect(submitted.status()).toBe(202);
    const { id } = (await submitted.json()).data;
    await expect.poll(async () => {
      const result = await request.get(`/api/v1/employees/bulk/jobs/${id}`);
      return (await result.json()).data;
    }).toMatchObject({ status: 'COMPLETED', importedCount: 1 });

    const responses = await Promise.all([1, 2, 3].map((index) => request.post('/api/v1/employees', { data: {
      firstName: 'Manual', lastName: 'Fixture', email: `onboarding-manual-${suffix}-${index}@example.test`,
    } })));
    expect(responses.map((response) => response.status())).toEqual([201, 201, 201]);
    const codes = await Promise.all(responses.map(async (response) => (await response.json()).data.employeeCode));
    expect(codes.sort()).toEqual(['EMP-004', 'EMP-005', 'EMP-006']);

    const employees = await prisma.employee.findMany({
      where: { companyId, employeeCode: { in: ['EMP-003', ...codes] } },
      include: { leaveBalances: { orderBy: { leaveType: 'asc' } }, shifts: true },
    });
    const shift = await prisma.shift.findFirstOrThrow({ where: { companyId, isDefault: true } });
    const year = new Date().getFullYear();
    expect(employees).toHaveLength(4);
    for (const employee of employees) {
      expect(employee.leaveBalances).toMatchObject([{ leaveType: 'CASUAL', year, allocated: 10 }, { leaveType: 'SICK', year, allocated: 3 }]);
      expect(employee.shifts).toMatchObject([{ shiftId: shift.id }]);
    }
    const importedEmployee = employees.find(({ employeeCode }) => employeeCode === 'EMP-003')!;
    const balances = await request.get(`/api/v1/leave/balances?employeeId=${importedEmployee.id}`);
    expect(balances.ok()).toBe(true);
    expect((await balances.json()).data.map(({ leaveType }: { leaveType: string }) => leaveType).sort()).toEqual(['CASUAL', 'SICK']);
  } finally {
    try {
      const company = await prisma.company.findUnique({ where: { email: adminEmail }, select: { id: true } });
      if (company) {
        await prisma.$transaction([
          prisma.employee.deleteMany({ where: { companyId: company.id } }),
          prisma.user.deleteMany({ where: { companyId: company.id } }),
          prisma.company.delete({ where: { id: company.id } }),
        ]);
      }
    } finally {
      await prisma.$disconnect();
    }
  }
});
