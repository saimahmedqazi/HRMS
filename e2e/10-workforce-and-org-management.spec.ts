import { test, expect } from '@playwright/test';
import { openFixtureDatabase } from './fixture-database';

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

  test('CEO creates Department, Designation, and Onboards new Employee with temporary credentials', async ({ page }) => {
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

    await page.click('button:has-text("Onboard Employee")');
    await expect(page.locator('h2:has-text("Onboard New Employee")')).toBeVisible();

    await page.fill('input[placeholder="Jane"]', 'Chloe');
    await page.fill('input[placeholder="Doe"]', 'Davis');
    await page.fill('input[placeholder="jane.doe@acme.com"]', 'chloe.davis@acme.com');

    // Submit Onboarding
    await page.click('button:has-text("Complete Onboarding")');

    // 5. Verify Success Credentials Modal
    await expect(page.locator('text=Employee Successfully Onboarded!')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/^Email:\s*chloe\.davis@acme\.com$/)).toBeVisible();
    await expect(page.locator('text=Temporary Password:')).toBeVisible();

    // Close credentials modal
    await page.click('button:has-text("Done")');

    // 6. Search for newly onboarded employee in directory
    await page.fill('input[placeholder="Search by name, employee code, or email..."]', 'Chloe Davis');
    await expect(page.locator('text=Chloe Davis').first()).toBeVisible({ timeout: 10000 });
  });
});
