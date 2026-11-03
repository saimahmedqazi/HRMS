import { test, expect } from '@playwright/test';
import { PrismaClient } from '@prisma/client';

test.describe('Leave Management & 2-Step Approval Lifecycle', () => {
  const prisma = new PrismaClient();

  test.beforeAll(async () => {
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
