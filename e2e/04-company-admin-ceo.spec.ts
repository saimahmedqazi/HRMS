import { test, expect } from '@playwright/test';
import { useRoleSession } from './role-session';

test('Billing waits for subscription details and can recover from a failed request', async ({ page }) => {
  await page.route('**/api/v1/auth/me', (route) => route.fulfill({
    json: { data: { id: 'fixture-admin', role: 'COMPANY_ADMIN', companyId: 'fixture-company' } },
  }));
  await page.route('**/api/v1/auth/me/modules', (route) => route.fulfill({ json: { data: { allowedModules: ['billing'] } } }));
  await page.route('**/api/v1/notifications', (route) => route.fulfill({ json: { data: [] } }));
  await page.route('**/api/v1/subscriptions/current', (route) => route.fulfill({
    json: { data: { tier: 'PREMIUM', status: 'ACTIVE' } },
  }));
  let finishRequest!: () => void;
  const firstRequest = new Promise<void>((resolve) => { finishRequest = resolve; });
  await page.route('**/api/v1/subscriptions/current', async (route) => {
    await firstRequest;
    await route.fulfill({ status: 503, json: { message: 'Unavailable' } });
  }, { times: 1 });

  try {
    await page.goto('/dashboard/billing');
    await expect(page.getByText('Loading subscription details…')).toBeVisible();
    await expect(page.getByText('BASIC PLAN', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Billing Portal' })).toHaveCount(0);
  } finally {
    finishRequest();
  }
  await expect(page.getByText('Subscription details couldn’t load.')).toBeVisible();
  await expect(page.getByRole('button', { name: /Upgrade to Premium/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByText('PREMIUM PLAN', { exact: true })).toBeVisible();
});

test('Billing displays the 14-day trial end instead of the 30-day cycle end', async ({ page }) => {
  await page.route('**/api/v1/auth/me', (route) => route.fulfill({
    json: { data: { id: 'fixture-admin', role: 'COMPANY_ADMIN', companyId: 'fixture-company' } },
  }));
  await page.route('**/api/v1/auth/me/modules', (route) => route.fulfill({
    json: { data: { allowedModules: ['billing'] } },
  }));
  await page.route('**/api/v1/notifications', (route) => route.fulfill({ json: { data: [] } }));
  await page.route('**/api/v1/subscriptions/current', (route) => route.fulfill({
    json: {
      data: {
        tier: 'BASIC',
        status: 'TRIALING',
        currentPeriodStart: '2026-11-15T00:00:00.000Z',
        currentPeriodEnd: '2026-12-15T00:00:00.000Z',
        trialEnd: '2026-11-29T00:00:00.000Z',
      },
    },
  }));

  const authResponse = page.waitForResponse((response) =>
    new URL(response.url()).pathname === '/api/v1/auth/me');
  const subscriptionResponse = page.waitForResponse((response) =>
    new URL(response.url()).pathname === '/api/v1/subscriptions/current');
  await page.goto('/dashboard/billing');
  await Promise.all([authResponse, subscriptionResponse]);

  await expect(page.getByText('Trial Start Date')).toBeVisible();
  await expect(page.getByText('Free Trial Ends')).toBeVisible();
  await expect(page.getByText('Nov 29, 2026', { exact: true })).toBeVisible();
  await expect(page.getByText('Dec 15, 2026', { exact: true })).toHaveCount(0);
});

test.describe('Company Admin (CEO) End-to-End Suite', () => {
  useRoleSession('ceo@acme.com', 'Password@123');

  test('Executive Dashboard displays KPIs and workforce analytics charts', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('Executive Dashboard');

    // 4 KPI Cards
    await expect(page.locator('text=Total Employees')).toBeVisible();
    await expect(page.locator('text=Present Today')).toBeVisible();
    await expect(page.locator('text=Pending Approvals')).toBeVisible();
    await expect(page.locator('text=Attendance Exceptions')).toBeVisible();

    // Recharts Visualizations
    await expect(page.locator('text=7-Day Workforce Attendance Trend')).toBeVisible();
    await expect(page.locator('text=Department Headcount Distribution')).toBeVisible();
  });

  test('Employees directory and employee detail page with Login IP & Geolocation Telemetry', async ({ page }) => {
    await page.click('a[href="/dashboard/employees"]');
    await page.waitForURL('**/dashboard/employees');
    await expect(page.locator('h1')).toContainText('Employee Directory');

    // Find and click on an employee record (e.g. Arthur Pendelton or Hannah Ross)
    const employeeCard = page.locator('a[href*="/dashboard/employees/"]').first();
    await expect(employeeCard).toBeVisible();
    await employeeCard.click();

    // Verify Employee Detail page
    await page.waitForURL('**/dashboard/employees/*', { timeout: 10000 });
    await expect(page.locator('text=Job Details')).toBeVisible();
    await expect(page.locator('text=Personal Demographics')).toBeVisible();

    // Verify Audited Login IP & Geolocation Telemetry card
    await expect(page.locator('text=Last Login IP & Geolocation Telemetry')).toBeVisible();
    await expect(page.locator('text=Logged in from IP')).toBeVisible();
    await expect(page.locator('text=Login IP Address')).toBeVisible();
    await expect(page.locator('text=Latitude & Longitude')).toBeVisible();
    await expect(page.locator('text=Login Date & Time')).toBeVisible();
  });

  test('Departments page displays company departments', async ({ page }) => {
    await page.click('a[href="/dashboard/departments"]');
    await page.waitForURL('**/dashboard/departments');
    await expect(page.locator('h1')).toContainText('Organization Structure');
    await expect(page.locator('text=Engineering').first()).toBeVisible();
    await expect(page.locator('text=Human Resources').first()).toBeVisible();
  });

  test('Attendance page features complete Punch, Work Timer, Analytics Graph, Calendar, and HR IP Whitelist', async ({ page }) => {
    await page.click('a[href="/dashboard/attendance"]');
    await page.waitForURL('**/dashboard/attendance');
    await expect(page.locator('h1')).toContainText('Attendance & Work Timer');

    // 4 Attendance KPI Summary Cards
    await expect(page.locator('text=Present (Onsite)').first()).toBeVisible();
    await expect(page.locator('text=Present (Remote)').first()).toBeVisible();
    await expect(page.locator('text=Absent Count').first()).toBeVisible();
    await expect(page.locator('text=Exceptions / Pending').first()).toBeVisible();

    // Punch and Work Timer cards
    await expect(page.getByRole('heading', { name: 'Daily Punch' })).toBeVisible();
    await expect(page.locator('text=Work Timer (Premium)')).toBeVisible();

    // Network IP and Lat/Long coordinates telemetry banner
    await expect(page.locator('text=IP:').first()).toBeVisible();
    await expect(page.locator('text=Lat/Long:').first()).toBeVisible();

    // Attendance Analytics Graph (Present vs. Absent)
    await expect(page.locator('text=Attendance Analytics Graph (Present vs. Absent)')).toBeVisible();

    // Monthly Attendance Calendar Grid
    const calendarHeading = page.getByRole('heading', { name: 'Monthly Attendance Calendar' });
    await expect(calendarHeading).toBeVisible();
    const calendar = calendarHeading.locator('xpath=../../..');
    for (const day of ['Sun', 'Mon', 'Sat']) {
      await expect(calendar.getByText(day, { exact: true })).toBeVisible();
    }

    // HR IP Whitelist (Office & Remote / Hybrid WFH Access Control) panel
    await expect(page.locator('text=HR IP Whitelist (Office & Remote / Hybrid WFH Access Control)')).toBeVisible();
    await expect(page.locator('input[placeholder*="IP Address"]')).toBeVisible();

    // Test adding an IP to whitelist
    await page.fill('input[placeholder*="IP Address"]', '192.168.1.100');
    await page.fill('input[placeholder*="Label"]', 'E2E Test Hybrid Office Router');
    await page.click('button:has-text("Add IP to Whitelist")');

    // Wait for the added IP to appear in the table
    await expect(page.locator('text=192.168.1.100')).toBeVisible({ timeout: 10000 });
  });

  test('Billing page displays the active tier, billing dates, and Stripe portal', async ({ page }) => {
    await page.click('a[href="/dashboard/billing"]');
    await page.waitForURL('**/dashboard/billing');
    await expect(page.locator('h1')).toContainText('Billing & Subscription Plans');

    // Active Tier Badge
    await expect(page.getByText('PREMIUM PLAN', { exact: true })).toBeVisible();

    // Billing Cycle Start Date & Next Renewal Date
    await expect(page.locator('text=Billing Cycle Start Date')).toBeVisible();
    await expect(page.locator('text=Next Billing / Renewal Date')).toBeVisible();
    await expect(page.locator('text=$149.00 USD / month')).toBeVisible();

    // Stripe Billing Portal button
    await expect(page.locator('button:has-text("Billing Portal")')).toBeVisible();
  });

  test('Settings page updates Organization Profile and Leave Policies', async ({ page }) => {
    await page.click('a[href="/dashboard/settings"]');
    await page.waitForURL('**/dashboard/settings');
    await expect(page.locator('h1')).toContainText('Platform & Tenant Settings');

    // Organization Profile Tab
    await expect(page.getByRole('button', { name: 'Organization Profile', exact: true })).toBeVisible();
    await expect(page.locator('text=Tenant Organization Details')).toBeVisible();

    // Save Organization Settings
    await page.click('button:has-text("Save Organization Settings")');
    await expect(page.locator('text=Organization profile settings saved.')).toBeVisible();

    // Leave Policies Tab
    await page.click('button:has-text("Company Policies")');
    await expect(page.locator('text=Company Leave Quotas & Compliance Rules')).toBeVisible();
    await expect(page.locator('text=CASUAL LEAVE')).toBeVisible();
  });

  test('Organization profile can clear optional fields without saving placeholder values', async ({ page }) => {
    const endpoint = '/api/v1/companies/me';
    const original = await page.request.get(endpoint);
    expect(original.ok()).toBe(true);
    const { phone, industry, size } = (await original.json()).data;
    try {
      const fixture = '+1 555 0101';
      expect((await page.request.patch(endpoint, { data: { phone: fixture, industry: null, size: null } })).ok()).toBe(true);
      await page.goto('/dashboard/settings');
      const phoneField = page.getByLabel('Phone Number', { exact: true });
      await expect(phoneField).toHaveValue(fixture);
      await expect(page.getByLabel('Industry Sector')).toHaveValue('');
      await expect(page.getByLabel('Organization Size')).toHaveValue('');
      await phoneField.clear();
      const [saved] = await Promise.all([
        page.waitForResponse((response) => new URL(response.url()).pathname === endpoint && response.request().method() === 'PATCH'),
        page.getByRole('button', { name: 'Save Organization Settings' }).click(),
      ]);
      expect(saved.ok()).toBe(true);
      expect(saved.request().postDataJSON()).toEqual({ phone: null });
      await expect(page.getByText('Organization profile settings saved.')).toBeVisible();
      await page.reload();
      await expect(phoneField).toBeEnabled();
      await expect(phoneField).toHaveValue('');
      expect((await (await page.request.get(endpoint)).json()).data).toMatchObject({ phone: null, industry: null, size: null });
    } finally {
      expect((await page.request.patch(endpoint, { data: { phone, industry, size } })).ok()).toBe(true);
    }
  });
});
