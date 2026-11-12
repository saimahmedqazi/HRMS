import { test, expect } from '@playwright/test';

test.describe('Payroll Execution & Exceptions Management Lifecycle', () => {
  test('HR Manager executes Monthly Payroll Run -> Employee verifies issued Payslip -> HR inspects Exceptions Queue', async ({ page }) => {
    const signOut = async () => {
      await page.getByTitle('Sign out', { exact: true }).click();
      await expect(page).toHaveURL(/\/login$/);
      await expect(page.getByRole('heading', { name: 'Sign in to ZenHR' })).toBeVisible();
      const cookies = await page.context().cookies();
      expect(cookies.filter(({ name }) => ['access_token', 'refresh_token'].includes(name))).toHaveLength(0);
    };

    // 1. HR Manager Login
    await page.context().clearCookies();
    await page.goto('/login');
    await page.fill('input[type="email"]', 'hr@acme.com');
    await page.fill('input[type="password"]', 'Password@123');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/dashboard', { timeout: 15000 });

    // 2. Navigate to Payroll Management
    await page.click('a[href="/dashboard/payroll"]');
    await page.waitForURL('**/dashboard/payroll');

    await expect(page.getByRole('heading', { name: 'Payroll Management', level: 1 })).toBeVisible();

    // 3. Open Execute Payroll Run Modal
    await page.click('button:has-text("Execute Payroll Run")');
    await expect(page.locator('h3:has-text("Execute Monthly Payroll")')).toBeVisible();

    // Start Execution
    const [payrollRun] = await Promise.all([
      page.waitForResponse((response) => response.url().endsWith('/payroll/runs') && response.request().method() === 'POST'),
      page.getByRole('button', { name: 'Start Execution', exact: true }).click(),
    ]);
    expect(payrollRun.status()).toBe(201);

    // Modal closes after batch computation
    await expect(page.locator('h3:has-text("Execute Monthly Payroll")')).not.toBeVisible({ timeout: 30000 });

    // Verify Payslips Table or Headcount Processed reflects active personnel
    await expect(page.locator('text=Headcount Processed')).toBeVisible();
    await expect(page.locator('button:has-text("Execute Payroll Run")')).toBeVisible();

    // Sign out HR
    await signOut();

    // 4. Employee views issued Payslip
    await page.fill('input[type="email"]', 'employee@acme.com');
    await page.fill('input[type="password"]', 'Password@123');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/dashboard', { timeout: 15000 });

    await page.click('a[href="/dashboard/my-payslips"]');
    await page.waitForURL('**/dashboard/my-payslips');

    await expect(page.getByRole('heading', { name: 'My Payslips', level: 1 })).toBeVisible();
    await expect(page.locator('table')).toBeVisible();
    await expect(page.locator('text=Download PDF').first()).toBeVisible({ timeout: 10000 });

    // Sign out Employee
    await signOut();

    // 5. HR Manager views Attendance Exceptions Queue
    await page.fill('input[type="email"]', 'hr@acme.com');
    await page.fill('input[type="password"]', 'Password@123');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/dashboard', { timeout: 15000 });

    await page.click('a[href="/dashboard/attendance"]');
    await page.waitForURL('**/dashboard/attendance');

    await page.click('a[href="/dashboard/attendance/exceptions"]');
    await page.waitForURL('**/dashboard/attendance/exceptions');

    await expect(page.getByRole('heading', { name: 'HR Exceptions Queue', level: 1 })).toBeVisible();
    await expect(page.locator('table')).toBeVisible();
  });
});
