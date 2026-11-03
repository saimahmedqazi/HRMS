import { test, expect } from '@playwright/test';
import { PrismaClient } from '@prisma/client';

test.describe('Resource Requisitions & Gemini AI Assistant Lifecycle', () => {
  const prisma = new PrismaClient();

  test.beforeAll(async () => {
    // Clean up test resource request if it exists
    await prisma.resourceRequest.deleteMany({
      where: { resourceType: 'Ergonomic Mechanical Keyboard' },
    });
    await prisma.$disconnect();
  });

  test('Employee creates Resource Request -> Ops Manager Approves & Fulfills -> Interactive Gemini AI Policy Chat', async ({ page }) => {
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

    // 2. Operation Manager Approves & Fulfills
    await page.context().clearCookies();
    await page.goto('/login');
    await page.fill('input[type="email"]', 'ops@zenhr.com');
    await page.fill('input[type="password"]', 'Password@123');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/dashboard', { timeout: 15000 });

    await page.click('a[href="/dashboard/resources"]');
    await page.waitForURL('**/dashboard/resources');

    const opsReqRow = page.locator('tr:has-text("Ergonomic Mechanical Keyboard")').first();
    await expect(opsReqRow).toBeVisible({ timeout: 10000 });

    // Click Approve
    await opsReqRow.locator('button:has-text("Approve")').click();
    await expect(page.locator('h3:has-text("Approve Resource Request")')).toBeVisible();
    await page.fill('textarea', 'Approved by Operations: Standard peripheral allocation.');
    await page.click('button:has-text("Confirm APPROVE")');

    // Wait for approval to update in table
    await expect(page.locator('h3:has-text("Approve Resource Request")')).not.toBeVisible();
    await expect(opsReqRow.locator('text=APPROVED')).toBeVisible({ timeout: 10000 });

    // Click Fulfill
    await opsReqRow.locator('button:has-text("Fulfill")').click();
    await expect(page.locator('h3:has-text("Fulfill Resource Request")')).toBeVisible();
    await page.fill('textarea', 'Asset #KB-102 dispatched via internal courier.');
    await page.click('button:has-text("Confirm Fulfillment")');

    // Wait for fulfillment to update in table
    await expect(page.locator('h3:has-text("Fulfill Resource Request")')).not.toBeVisible();
    await expect(opsReqRow.locator('text=FULFILLED')).toBeVisible({ timeout: 10000 });

    // Sign out Ops
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
