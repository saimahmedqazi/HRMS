import { test, expect } from '@playwright/test';
import { PrismaClient } from '@prisma/client';

test.describe('Daily Punch & Work Timer Lifecycle', () => {
  const prisma = new PrismaClient();

  test.beforeEach(async () => {
    const now = new Date();
    const todayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    await prisma.attendanceRecord.deleteMany({ where: { date: todayUtc } });
    await prisma.workTimerEntry.deleteMany({ where: { date: todayUtc } });
  });

  test.afterAll(async () => {
    await prisma.$disconnect();
  });

  test('Daily Punch Lifecycle: Punch In with GPS/IP -> Verified Checked In -> Punch Out & Conclude', async ({ page }) => {
    // 1. Employee Login
    await page.context().clearCookies();
    await page.goto('/login');
    await page.fill('input[type="email"]', 'employee@acme.com');
    await page.fill('input[type="password"]', 'Password@123');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/dashboard', { timeout: 15000 });

    // 2. Navigate to Attendance
    await page.click('a[href="/dashboard/my-attendance"]');
    await page.waitForURL('**/dashboard/my-attendance');

    // Verify Page Header
    await expect(page.getByRole('heading', { name: 'Attendance & Work Timer', level: 1 })).toBeVisible();

    // Verify Telemetry IP & Lat/Long Coordinates are captured
    await expect(page.locator('text=IP:')).toBeVisible();
    await expect(page.locator('text=Lat/Long:')).toBeVisible();

    // 3. Daily Punch In (Onsite)
    const punchInBtn = page.locator('button:has-text("Punch In Now")');
    await expect(punchInBtn).toBeVisible({ timeout: 10000 });

    // Enter note
    await page.fill('input[placeholder="Optional notes or remarks..."]', 'Onsite morning shift kickoff');
    await punchInBtn.click();

    // Verify Punch In confirmed
    await expect(page.locator('text=You are currently checked in today.')).toBeVisible({ timeout: 10000 });
    const punchOutBtn = page.locator('button:has-text("Punch Out & Conclude Shift")');
    await expect(punchOutBtn).toBeVisible();

    // 4. Punch Out
    await punchOutBtn.click();

    // Verify Shift concluded message
    await expect(page.locator('text=Shift completed for today.')).toBeVisible({ timeout: 10000 });

    // Verify Calendar & Graph are still cleanly rendered
    await expect(page.getByRole('heading', { name: 'Monthly Attendance Calendar' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Attendance Analytics Graph (Present vs. Absent)' })).toBeVisible();
  });

  test('Work Timer Lifecycle: Start Timer -> RUNNING -> Pause Break -> PAUSED -> Resume Work -> Stop & Finalize', async ({ page }) => {
    // 1. Employee Login
    await page.context().clearCookies();
    await page.goto('/login');
    await page.fill('input[type="email"]', 'employee@acme.com');
    await page.fill('input[type="password"]', 'Password@123');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/dashboard', { timeout: 15000 });

    // 2. Navigate to Work Timer
    await page.click('a[href="/dashboard/work-timer"]');
    await page.waitForURL('**/dashboard/work-timer');

    // 3. Start Timer
    const startTimerBtn = page.locator('button:has-text("Start Timer")');
    await expect(startTimerBtn).toBeVisible({ timeout: 10000 });
    await startTimerBtn.click();

    // Verify Timer transitions to RUNNING
    await expect(page.locator('text=Status: RUNNING')).toBeVisible({ timeout: 10000 });
    const pauseBreakBtn = page.locator('button:has-text("Pause Break")');
    await expect(pauseBreakBtn).toBeVisible();

    // 4. Pause Break
    await pauseBreakBtn.click();
    await expect(page.locator('text=Status: PAUSED')).toBeVisible({ timeout: 10000 });
    const resumeWorkBtn = page.locator('button:has-text("Resume Work")');
    await expect(resumeWorkBtn).toBeVisible();

    // 5. Resume Work
    await resumeWorkBtn.click();
    await expect(page.locator('text=Status: RUNNING')).toBeVisible({ timeout: 10000 });

    // 6. Stop & Finalize
    const stopTimerBtn = page.locator('button:has-text("Stop & Finalize")');
    await expect(stopTimerBtn).toBeVisible();
    await stopTimerBtn.click();

    // Verify Timer status is STOPPED and Start Timer is available again
    await expect(page.locator('text=Status: STOPPED')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('button:has-text("Start Timer")')).toBeVisible();
  });
});
