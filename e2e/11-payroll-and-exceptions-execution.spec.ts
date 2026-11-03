import { test, expect } from '@playwright/test';

test.describe('Payroll Execution & Exceptions Management Lifecycle', () => {
  test('HR Manager executes Monthly Payroll Run -> Employee verifies issued Payslip -> HR inspects Exceptions Queue', async ({ page }) => {
    page.on('console', (msg) => console.log('PAGE LOG:', msg.text()));
    page.on('response', async (res) => {
      if (res.url().includes('/payroll/runs')) {
        console.log('PAYROLL RUNS RES:', res.status(), await res.text().catch(() => ''));
      }
    });

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
    await page.click('button:has-text("Start Execution")');

    // Modal closes after batch computation
    await expect(page.locator('h3:has-text("Execute Monthly Payroll")')).not.toBeVisible({ timeout: 30000 });

    // Verify Payslips Table or Headcount Processed reflects active personnel
    await expect(page.locator('text=Headcount Processed')).toBeVisible();
    await expect(page.locator('button:has-text("Execute Payroll Run")')).toBeVisible();

    // Sign out HR
    await page.locator('button[title="Sign out"]').click();
    await page.waitForURL('**/login', { timeout: 15000 });

    // 4. Employee views issued Payslip
    await page.context().clearCookies();
    await page.goto('/login');
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
    await page.locator('button[title="Sign out"]').click();
    await page.waitForURL('**/login', { timeout: 15000 });

    // 5. HR Manager views Attendance Exceptions Queue
    await page.context().clearCookies();
    await page.goto('/login');
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
