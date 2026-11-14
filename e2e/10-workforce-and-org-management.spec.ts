import { test, expect } from '@playwright/test';
import { openFixtureDatabase } from './fixture-database';

test('Employee profile can recover from an outage and handles a missing record', async ({ page }) => {
  let profileAttempts = 0;
  await page.route('**/api/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/auth/me')) return route.fulfill({ json: { data: { id: 'lead', role: 'TEAM_LEAD', companyId: 'acme' } } });
    if (path.endsWith('/auth/me/modules')) return route.fulfill({ json: { data: { allowedModules: ['team-members'] } } });
    if (path.endsWith('/employees/missing')) return route.fulfill({ status: 404, json: { message: 'Employee not found' } });
    if (path.endsWith('/employees/evan')) {
      profileAttempts += 1;
      if (profileAttempts === 1) return route.fulfill({ status: 503, json: { message: 'Unavailable' } });
      return route.fulfill({ json: { data: {
        id: 'evan', employeeCode: 'EMP-005', firstName: 'Evan', lastName: 'Wright', status: 'ACTIVE', hireDate: '2025-01-15',
      } } });
    }
    return route.fulfill({ json: { data: [] } });
  });

  await page.goto('/dashboard/employees/evan');
  await expect(page.getByText('The employee profile couldn’t load.')).toBeVisible();
  await expect(page.getByText('Employee profile not found.')).toHaveCount(0);
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByRole('heading', { name: 'Evan Wright' })).toBeVisible();

  await page.goto('/dashboard/employees/missing');
  await expect(page.getByText('Employee profile not found.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Try again' })).toHaveCount(0);
});

test('Team Members can retry a failed search and distinguish it from empty results', async ({ page }) => {
  const requests: string[] = [];
  await page.route('**/api/v1/**', (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/auth/me')) {
      return route.fulfill({ json: { data: { id: 'lead', role: 'TEAM_LEAD', companyId: 'acme' } } });
    }
    if (url.pathname.endsWith('/auth/me/modules')) {
      return route.fulfill({ json: { data: { allowedModules: ['team-members'] } } });
    }
    if (!url.pathname.endsWith('/employees')) return route.fulfill({ json: { data: [] } });

    const search = url.searchParams.get('search');
    if (search === 'Evan') {
      requests.push(search);
      if (requests.length === 1) return route.fulfill({ status: 503, json: { message: 'Unavailable' } });
    }
    const items = search === 'Evan'
      ? [{ id: 'evan', employeeCode: 'EMP-005', firstName: 'Evan', lastName: 'Wright', status: 'ACTIVE' }]
      : [];
    return route.fulfill({ json: { data: { items, meta: { page: 1, total: items.length, totalPages: 1 } } } });
  });

  await page.goto('/dashboard/team-members');
  await expect(page.getByText('No employees found')).toBeVisible();
  const search = page.getByPlaceholder('Search by name, employee code, or email...');
  await search.fill('Evan');
  await expect(page.getByText('The employee list couldn’t load.')).toBeVisible();
  await expect(page.getByText('No employees found')).toHaveCount(0);
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByRole('link', { name: /Evan Wright/ })).toBeVisible();
  await expect(search).toHaveValue('Evan');
  expect(requests).toEqual(['Evan', 'Evan']);
});

test.describe('Workforce Onboarding & Organization Structure Management', () => {
  test.beforeAll(async () => {
    const prisma = openFixtureDatabase();
    // Clean up test employee, department, and designation if they exist
    await prisma.employee.deleteMany({ where: { user: { email: 'chloe.davis@acme.com' } } });
    await prisma.user.deleteMany({ where: { email: 'chloe.davis@acme.com' } });
    await prisma.designation.deleteMany({ where: { name: 'Senior CS Specialist', company: { slug: 'acme-corp' } } });
    await prisma.department.deleteMany({ where: { name: 'Customer Success', company: { slug: 'acme-corp' } } });
    await prisma.$disconnect();
  });

  test('CEO creates Department, Designation, and Onboards new Employee with temporary credentials', async ({ page, playwright, baseURL }) => {
    // 1. CEO Login
    await page.context().clearCookies();
    await page.goto('/login');
    await page.fill('input[type="email"]', 'ceo@acme.com');
    await page.fill('input[type="password"]', 'Password@123');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/dashboard', { timeout: 15000 });

    // 2. Navigate to Departments & Org Management
    await page.click('a[href="/dashboard/departments"]');
    await page.waitForURL('**/dashboard/departments');

    // Create Department
    await page.click('button:has-text("Add Department")');
    await expect(page.locator('h2:has-text("Add New Department")')).toBeVisible();

    await page.fill('input[placeholder="e.g. Marketing"]', 'Customer Success');
    await page.fill('textarea[placeholder="Brief description of department scope"]', 'Customer happiness, onboarding, and retention');
    await page.click('button:has-text("Create Department")');

    // Verify Department Card Created
    await expect(page.locator('h3:has-text("Customer Success")').first()).toBeVisible({ timeout: 10000 });

    // 3. Create Designation
    await page.click('button:has-text("Designations")');
    await page.click('button:has-text("Add Designation")');
    await expect(page.locator('h2:has-text("Add New Designation")')).toBeVisible();

    await page.fill('input[placeholder="e.g. Lead Product Designer"]', 'Senior CS Specialist');
    await page.fill('textarea[placeholder="Job scope and responsibilities"]', 'Handling Tier-2 VIP accounts');
    await page.click('button:has-text("Create Designation")');

    // Verify Designation Created
    await expect(page.locator('text=Senior CS Specialist').first()).toBeVisible({ timeout: 10000 });

    // 4. Navigate to Employees Directory & Onboard Employee
    await page.click('a[href="/dashboard/employees"]');
    await page.waitForURL('**/dashboard/employees');

    const invalidDate = await page.request.post('/api/v1/employees', { data: {
      firstName: 'Chloe', lastName: 'Davis', email: 'chloe.davis@acme.com', hireDate: '2026-02-30',
    } });
    expect(invalidDate.status()).toBe(400);
    expect((await invalidDate.json()).message).toContain('Hire date');

    await page.click('button:has-text("Onboard Employee")');
    await expect(page.locator('h2:has-text("Onboard New Employee")')).toBeVisible();

    await page.fill('input[placeholder="Jane"]', 'Chloe');
    await page.fill('input[placeholder="Doe"]', 'Davis');
    await page.fill('input[placeholder="jane.doe@acme.com"]', 'chloe.davis@acme.com');
    await page.getByLabel('Hire Date').fill('2025-01-15');

    // Submit Onboarding
    const onboardingResponse = page.waitForResponse((response) =>
      response.request().method() === 'POST' && new URL(response.url()).pathname === '/api/v1/employees',
    );
    await page.click('button:has-text("Complete Onboarding")');
    const response = await onboardingResponse;
    expect(response.status()).toBe(201);
    const { data: credentials } = await response.json();
    expect(typeof credentials.welcomeEmailSent).toBe('boolean');

    // 5. Verify Success Credentials Modal
    await expect(page.locator('text=Employee Successfully Onboarded!')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/^Email:\s*chloe\.davis@acme\.com$/)).toBeVisible();
    await expect(page.locator('text=Temporary Password:')).toBeVisible();
    await expect(page.getByText(credentials.welcomeEmailSent
      ? 'The mail server accepted the welcome email.'
      : 'The welcome email could not be sent. Share these initial credentials securely with the employee.')).toBeVisible();

    const employeeSession = await playwright.request.newContext({ baseURL });
    try {
      const login = await employeeSession.post('/api/v1/auth/login', {
        data: { email: credentials.email, password: credentials.tempPassword },
      });
      expect(login.status()).toBe(200);
      const profile = await employeeSession.get('/api/v1/auth/me');
      expect(profile.status()).toBe(200);
      expect((await profile.json()).data.email).toBe('chloe.davis@acme.com');

      const statusPath = `/api/v1/employees/${credentials.id}/status`;
      const terminated = await page.request.patch(statusPath, { data: { status: 'TERMINATED' } });
      expect(terminated.status()).toBe(200);
      expect((await employeeSession.get('/api/v1/auth/me')).status()).toBe(401);

      const restored = await page.request.patch(statusPath, { data: { status: 'ON_PROBATION' } });
      expect(restored.status()).toBe(200);
      expect((await employeeSession.get('/api/v1/auth/me')).status()).toBe(401);
      const freshLogin = await employeeSession.post('/api/v1/auth/login', {
        data: { email: credentials.email, password: credentials.tempPassword },
      });
      expect(freshLogin.status()).toBe(200);
      expect((await employeeSession.get('/api/v1/auth/me')).status()).toBe(200);
    } finally {
      await employeeSession.dispose();
    }

    const prisma = openFixtureDatabase();
    try {
      const employee = await prisma.employee.findFirstOrThrow({ where: { user: { email: 'chloe.davis@acme.com' } } });
      expect(employee.hireDate.toISOString()).toBe('2025-01-15T00:00:00.000Z');
      expect(employee.probationEndDate?.toISOString()).toBe('2025-04-15T00:00:00.000Z');
      await prisma.employee.update({ where: { id: employee.id }, data: { probationEndDate: new Date('2027-01-01') } });
      try {
        const profile = await page.request.get(`/api/v1/employees/${employee.id}`);
        expect(profile.ok()).toBe(true);
        expect((await profile.json()).data.probationEndDate).toBe('2025-04-15T00:00:00.000Z');
      } finally {
        await prisma.employee.update({ where: { id: employee.id }, data: { probationEndDate: employee.probationEndDate } });
      }
    } finally {
      await prisma.$disconnect();
    }

    // Close credentials modal
    await page.click('button:has-text("Done")');

    // 6. Search for newly onboarded employee in directory
    await page.fill('input[placeholder="Search by name, employee code, or email..."]', 'Chloe Davis');
    await expect(page.locator('text=Chloe Davis').first()).toBeVisible({ timeout: 10000 });
  });
});
