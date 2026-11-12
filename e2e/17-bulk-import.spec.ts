import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import * as xlsx from 'xlsx';
import { openFixtureDatabase } from './fixture-database';

test('HR downloads the bulk template and an imported employee sets their own password', async ({ page }) => {
  const prisma = openFixtureDatabase();
  const suffix = randomUUID().slice(0, 8);
  const email = `bulk-${suffix}@example.test`;

  try {
    await page.goto('/login');
    await page.locator('input[type="email"]').fill('hr@acme.com');
    await page.locator('input[type="password"]').fill('Password@123');
    await page.getByRole('button', { name: 'Sign In', exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
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
    xlsx.utils.sheet_add_aoa(sheet, [['Bulk', 'Fixture', email, `bulk-${suffix}`, '2026-01-15']], { origin: -1 });
    await page.locator('input[type="file"]').setInputFiles({
      name: 'workforce-import.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' }),
    });
    await page.getByRole('button', { name: 'Validate & Preview Sheet' }).click();
    await page.getByRole('button', { name: 'Confirm Import (1 Employees)' }).click();
    await expect(page.getByText('Imported employees can set their password using')).toBeVisible();

    const imported = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(imported.passwordHash).toBe('!password-setup-required');
    await page.context().clearCookies();
    expect((await page.request.post('/api/v1/auth/forgot-password', { data: { email } })).ok()).toBe(true);
    const account = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(account.passwordResetToken).toBeTruthy();
    const password = `Fixture-${randomUUID()}!`;
    expect((await page.request.post('/api/v1/auth/reset-password', {
      data: { token: account.passwordResetToken, newPassword: password },
    })).ok()).toBe(true);
    expect((await page.request.post('/api/v1/auth/login', { data: { email, password } })).ok()).toBe(true);
    expect((await page.request.get('/api/v1/employees/bulk/template')).status()).toBe(403);
  } finally {
    try {
      await prisma.$transaction([
        prisma.employee.deleteMany({ where: { user: { email } } }),
        prisma.user.deleteMany({ where: { email } }),
      ]);
    } finally {
      await prisma.$disconnect();
    }
  }
});
