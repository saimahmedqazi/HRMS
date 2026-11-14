import { test, expect } from '@playwright/test';
import { openFixtureDatabase } from './fixture-database';

test('The assistant waits for subscription access and locks prompts for Basic employees', async ({ page }) => {
  let releaseSubscription!: () => void;
  const canRespond = new Promise<void>((resolve) => { releaseSubscription = resolve; });
  let promptRequests = 0;
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/auth/me')) return route.fulfill({ json: { data: { id: 'employee', role: 'EMPLOYEE', companyId: 'fixture' } } });
    if (path.endsWith('/auth/me/modules')) return route.fulfill({ json: { data: { allowedModules: ['ai-assistant'] } } });
    if (path.endsWith('/subscriptions/current')) {
      await canRespond;
      return route.fulfill({ json: { data: { tier: 'BASIC', status: 'TRIALING', features: { aiAssistant: false } } } });
    }
    if (path.endsWith('/ai/chat')) promptRequests++;
    return route.fulfill({ json: { data: [] } });
  });

  try {
    await page.goto('/dashboard/ai-assistant');
    await expect(page.getByText('Checking assistant access…')).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Ask the HR assistant' })).toBeDisabled();
  } finally {
    releaseSubscription();
  }
  await expect(page.getByText('Premium Feature Locked')).toBeVisible();
  await expect(page.getByText('Contact your company administrator about access to the assistant.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Probation Leave Policy' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Send message' })).toBeDisabled();
  await expect(page.getByRole('link', { name: 'Upgrade Plan' })).toHaveCount(0);
  expect(promptRequests).toBe(0);
});
test.describe('Resource Requisitions & Gemini AI Assistant Lifecycle', () => {
  test.beforeAll(async () => {
    const prisma = openFixtureDatabase();
    // Clean up test resource request if it exists
    await prisma.resourceRequest.deleteMany({
      where: {
        resourceType: 'Ergonomic Mechanical Keyboard',
        company: { slug: 'acme-corp' },
        requestedBy: { user: { email: 'employee@acme.com' } },
      },
    });
    await prisma.$disconnect();
  });

  test('Employee creates Resource Request -> HR Manager Approves & Fulfills -> Interactive Gemini AI Policy Chat', async ({ page }) => {
    // 1. Employee submits Resource Request
    await page.context().clearCookies();
    await page.goto('/login');
    await page.fill('input[type="email"]', 'employee@acme.com');
    await page.fill('input[type="password"]', 'Password@123');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/dashboard', { timeout: 15000 });

    await page.click('a[href="/dashboard/resources"]');
    await page.waitForURL('**/dashboard/resources');

    await expect(page.getByRole('heading', { name: 'Resource Requests', level: 1 })).toBeVisible();

    // Click Request Resource
    await page.click('button:has-text("Request Resource")');
    await expect(page.locator('h3:has-text("Request Resource")')).toBeVisible();

    await page.fill('input[placeholder="e.g. Ergonomic Office Chair, 4K Display, RAM Upgrade"]', 'Ergonomic Mechanical Keyboard');
    await page.fill('textarea[placeholder="Provide precise equipment or software license requirements..."]', 'Mechanical keyboard with quiet brown switches');
    await page.fill('textarea[placeholder="Explain why this equipment is needed for project delivery..."]', 'Daily typing ergonomics for software engineering');

    await page.click('button:has-text("Submit Request")');

    // Verify modal closes and request row appears with PENDING status
    await expect(page.locator('h3:has-text("Request Resource")')).not.toBeVisible();
    const reqRow = page.locator('tr:has-text("Ergonomic Mechanical Keyboard")').first();
    await expect(reqRow).toBeVisible({ timeout: 10000 });
    await expect(reqRow.locator('text=PENDING')).toBeVisible();

    // Sign out employee
    await page.locator('button[title="Sign out"]').click();
    await page.waitForURL('**/login', { timeout: 15000 });

    // 2. Tenant HR Manager approves and fulfills the request
    await page.context().clearCookies();
    await page.goto('/login');
    await page.fill('input[type="email"]', 'hr@acme.com');
    await page.fill('input[type="password"]', 'Password@123');
    const hrLogin = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/v1/auth/login');
    await page.click('button[type="submit"]');
    expect((await hrLogin).status()).toBe(200);
    await page.waitForURL('**/dashboard', { timeout: 15000 });

    await page.click('a[href="/dashboard/resources"]');
    await page.waitForURL('**/dashboard/resources');

    const hrReqRow = page.getByRole('row').filter({ hasText: 'Ergonomic Mechanical Keyboard' });
    await expect(hrReqRow).toBeVisible({ timeout: 10000 });

    // Click Approve
    await hrReqRow.getByRole('button', { name: 'Approve', exact: true }).click();
    await expect(page.locator('h3:has-text("Approve Resource Request")')).toBeVisible();
    await page.fill('textarea', 'Approved by HR for standard peripheral allocation.');
    await page.click('button:has-text("Confirm APPROVE")');

    // Wait for approval to update in table
    await expect(page.locator('h3:has-text("Approve Resource Request")')).not.toBeVisible();
    await expect(hrReqRow.locator('text=APPROVED')).toBeVisible({ timeout: 10000 });

    // Click Fulfill
    await hrReqRow.getByRole('button', { name: 'Fulfill', exact: true }).click();
    await expect(page.locator('h3:has-text("Fulfill Resource Request")')).toBeVisible();
    await page.fill('textarea', 'Asset #KB-102 dispatched via internal courier.');
    await page.click('button:has-text("Confirm Fulfillment")');

    // Wait for fulfillment to update in table
    await expect(page.locator('h3:has-text("Fulfill Resource Request")')).not.toBeVisible();
    await expect(hrReqRow.locator('text=FULFILLED')).toBeVisible({ timeout: 10000 });

    // Sign out HR
    await page.locator('button[title="Sign out"]').click();
    await page.waitForURL('**/login', { timeout: 15000 });

    // 3. User interacts with Gemini AI Assistant
    await page.context().clearCookies();
    await page.goto('/login');
    await page.fill('input[type="email"]', 'employee@acme.com');
    await page.fill('input[type="password"]', 'Password@123');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/dashboard', { timeout: 15000 });

    await page.click('a[href="/dashboard/ai-assistant"]');
    await page.waitForURL('**/dashboard/ai-assistant');

    await expect(page.getByRole('heading', { name: 'ZenHR Gemini Assistant', level: 1 })).toBeVisible();

    // Click preset prompt chip
    await page.click('button:has-text("Probation Leave Policy")');

    // Verify AI response arrives in the feed
    await expect(page.locator('text=3-month probation period').first()).toBeVisible({ timeout: 15000 });
  });
});
