import { randomUUID } from 'node:crypto';
import { expect, Page, test } from '@playwright/test';
import { openFixtureDatabase } from './fixture-database';

async function registerFixture(page: Page) {
  const id = randomUUID().slice(0, 12);
  const email = `admin-${id}@example.test`;
  const response = await page.request.post('/api/v1/auth/register', {
    data: {
      companyName: `QA Session ${id}`,
      adminFirstName: 'QA',
      adminLastName: 'Admin',
      adminEmail: email,
      adminPassword: 'OriginalFixturePassword@123',
    },
  });
  expect(response.status()).toBe(201);
  return email;
}

test('the dashboard renews an expired access session using the refresh cookie', async ({ page, context }) => {
  await registerFixture(page);
  await context.clearCookies({ name: 'access_token' });

  const refresh = page.waitForResponse((response) =>
    new URL(response.url()).pathname === '/api/v1/auth/refresh',
  );
  await page.goto('/dashboard');
  expect((await refresh).status()).toBe(200);

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole('heading', { name: /executive/i }).first()).toBeVisible();
  expect((await context.cookies()).some((cookie) => cookie.name === 'access_token' && cookie.httpOnly)).toBe(true);
});

test('a password reset link opens the reset form in a new session and changes the password', async ({ page, context }) => {
  const email = await registerFixture(page);
  await context.clearCookies();
  await page.goto('/forgot-password');
  await page.getByLabel('Registered Work Email').fill(email);
  await page.getByRole('button', { name: 'Send Reset Instructions' }).click();
  await expect(page.getByLabel('Reset Token')).toBeVisible();

  const prisma = openFixtureDatabase();
  let resetToken: string | null;
  try {
    const user = await prisma.user.findUniqueOrThrow({
      where: { email },
      select: { passwordResetToken: true },
    });
    resetToken = user.passwordResetToken;
  } finally {
    await prisma.$disconnect();
  }
  if (!resetToken) throw new Error('Expected a reset token for the test account');

  await page.goto(`/reset-password?token=${encodeURIComponent(resetToken)}`);
  await expect(page.getByLabel('Reset Token')).toHaveValue(resetToken);
  await page.getByLabel('New Password', { exact: false }).fill('ChangedFixturePassword@123');
  await page.getByRole('button', { name: 'Reset Password', exact: true }).click();
  await expect(page.getByText('Your password has been reset successfully!')).toBeVisible();

  await page.getByRole('link', { name: 'Return to Sign In' }).click();
  await page.locator('input[type=email]').fill(email);
  await page.locator('input[type=password]').fill('ChangedFixturePassword@123');
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
});
