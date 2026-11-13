import { randomUUID } from 'node:crypto';
import { expect, Page, test } from '@playwright/test';
import { signInThroughUi } from './role-session';
import { openFixtureDatabase } from './fixture-database';

const teamLead = 'team.lead@acme.com';
const employee = 'employee@acme.com';

async function signIn(page: Page, email: string) {
  await page.context().clearCookies();
  await signInThroughUi(page, email, 'Password@123');
}

async function getProfileId(page: Page) {
  const response = await page.request.get('/api/v1/auth/me');
  expect(response.ok()).toBe(true);
  const { data } = await response.json();
  return data.employee.id as string;
}

test('Team Lead dashboard and attendance agree on the company day and show the actual recorded duration', async ({ page }) => {
  const prisma = openFixtureDatabase();
  const company = await prisma.company.findUniqueOrThrow({ where: { slug: 'acme-corp' } });
  const now = new Date();
  const dateIn = (timeZone: string) => new Intl.DateTimeFormat('sv-SE', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
  const timeZone = dateIn('Pacific/Kiritimati') === dateIn('UTC') ? 'Etc/GMT+12' : 'Pacific/Kiritimati';
  const date = new Date(`${dateIn(timeZone)}T00:00:00.000Z`);
  const lead = await prisma.employee.findFirstOrThrow({ where: { companyId: company.id, user: { email: teamLead } } });
  const report = await prisma.employee.findFirstOrThrow({ where: { companyId: company.id, user: { email: employee } } });
  const fixtures = [
    {
      employeeId: lead.id, status: 'ABSENT_PENDING_REVIEW' as const,
      checkInTime: new Date(now.getTime() - 38 * 60_000), checkOutTime: now, workMinutes: 0,
    },
    { employeeId: report.id, status: 'PRESENT' as const, checkInTime: now, checkOutTime: null, workMinutes: 0 },
  ];
  const before = await prisma.attendanceRecord.findMany({
    where: { companyId: company.id, date, employeeId: { in: fixtures.map(({ employeeId }) => employeeId) } },
    select: { id: true, status: true, checkInTime: true, checkOutTime: true, workMinutes: true, updatedAt: true },
  });
  const records = await prisma.$transaction(fixtures.map((fixture) => {
    const key = { companyId: company.id, employeeId: fixture.employeeId, date };
    return prisma.attendanceRecord.upsert({
      where: { companyId_employeeId_date: key },
      create: { ...key, ...fixture },
      update: fixture,
      select: { id: true },
    });
  }));
  try {
    await prisma.company.update({ where: { id: company.id }, data: { timezone: timeZone } });
    await signIn(page, teamLead);
    await expect(page.getByText('1 checked in today', { exact: true })).toBeVisible();

    await page.goto('/dashboard/attendance');
    const onsite = page.getByText('Present (Onsite)', { exact: true }).first().locator('..');
    await expect(onsite.getByText('1', { exact: true })).toBeVisible();
    await expect(page.locator('[aria-current="date"]').getByText('1 R', { exact: true })).toBeVisible();
    await expect(page.getByText(/Total work: 0m/)).toBeVisible();

    await page.getByRole('link', { name: 'History Log' }).click();
    const row = page.getByRole('row').filter({ hasText: 'Tina Lopez' }).filter({ hasText: 'ABSENT_PENDING_REVIEW' });
    const columns = await page.getByRole('columnheader').allTextContents();
    const workMinutes = columns.findIndex((column) => column.trim() === 'Work Minutes');
    expect(workMinutes).toBeGreaterThanOrEqual(0);
    await expect(row.getByRole('cell').nth(workMinutes)).toHaveText('0m');
  } finally {
    const existing = new Map(before.map(({ id, ...data }) => [id, data]));
    await prisma.$transaction([
      ...records.map(({ id }) => {
        const data = existing.get(id);
        return data ? prisma.attendanceRecord.update({ where: { id }, data }) : prisma.attendanceRecord.delete({ where: { id } });
      }),
      prisma.company.update({ where: { id: company.id }, data: { timezone: company.timezone } }),
    ]);
    await prisma.$disconnect();
  }
});

test('Team Lead can add a reportee’s contact, upload a document, and delete it', async ({ page }) => {
  await signIn(page, employee);
  const reportId = await getProfileId(page);
  await signIn(page, teamLead);
  await page.goto(`/dashboard/employees/${reportId}`);
  await expect(page.getByRole('heading', { name: 'Personal Demographics' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Edit Demographics|Edit Personal Information/ })).toHaveCount(0);
  await page.getByRole('button', { name: /^Emergency Contacts/ }).click();
  await page.getByRole('button', { name: 'Add Contact', exact: true }).click();
  const contact = `QA Contact ${randomUUID().slice(0, 8)}`;
  await page.getByPlaceholder('e.g. Maria Gonzalez').fill(contact);
  await page.getByPlaceholder('e.g. Spouse, Parent, Sibling').fill('Sibling');
  await page.getByPlaceholder('+1-555-0123').fill('+1-555-0100');
  await page.getByRole('button', { name: 'Add Contact', exact: true }).last().click();
  await expect(page.getByRole('alert').filter({ hasText: 'Emergency contact added successfully.' })).toBeVisible();
  await expect(page.getByText(contact, { exact: true })).toBeVisible();

  await page.getByRole('button', { name: /^Documents \(/ }).click();
  await page.getByRole('button', { name: 'Upload Document', exact: true }).click();
  const doc = `QA Contract ${randomUUID().slice(0, 8)}`;
  await page.getByPlaceholder('e.g. Employment Contract 2025').fill(doc);
  await page.locator('input[type="file"][accept*="application/pdf"]').setInputFiles({
    name: 'contract.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n%%EOF\n'),
  });
  await page.getByRole('button', { name: 'Upload to Cloud Storage', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Document uploaded successfully.' })).toBeVisible();
  await expect(page.getByText(doc, { exact: true })).toBeVisible();

  await page.reload();
  await page.getByRole('button', { name: /^Emergency Contacts/ }).click();
  await expect(page.getByText(contact, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /^Documents \(/ }).click();
  const card = page.getByRole('heading', { name: doc }).locator('xpath=../../..');
  await expect(card.getByRole('link', { name: 'View' })).toHaveAttribute('href', /\/documents\/[^/]+\/download$/);
  const deleteButton = card.getByRole('button', { name: `Delete ${doc}`, exact: true });
  const confirmation = card.getByRole('group', { name: `Confirm deletion of ${doc}` });
  await deleteButton.click();
  await confirmation.getByRole('button', { name: 'Cancel' }).click();
  await expect(deleteButton).toBeFocused();
  await expect(card.getByRole('heading', { name: doc })).toBeVisible();
  await deleteButton.click();
  await confirmation.getByRole('button', { name: 'Confirm deletion' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Document deleted successfully.' })).toBeVisible();
  await expect(page.getByRole('heading', { name: doc })).toHaveCount(0);
  await page.reload();
  await page.getByRole('button', { name: /^Documents \(/ }).click();
  await expect(page.getByRole('heading', { name: doc })).toHaveCount(0);
});

test('Team Lead actions respect self-approval and HR can reject after Step 1', async ({ page }) => {
  const id = randomUUID().slice(0, 8);
  const reportRequest = `QA Reportee Keyboard ${id}`;
  const ownRequest = `QA Lead Chair ${id}`;
  const requestResource = async (resourceType: string) => {
    const response = await page.request.post('/api/v1/resources/requests', {
      data: { resourceType, description: 'UAT equipment request for an isolated fixture' },
    });
    expect(response.status()).toBe(201);
  };
  await signIn(page, employee);
  await requestResource(reportRequest);
  await signIn(page, teamLead);
  await requestResource(ownRequest);
  await page.goto('/dashboard/resources');
  const ownRow = page.getByRole('row').filter({ hasText: ownRequest });
  const reportRow = page.getByRole('row').filter({ hasText: reportRequest });
  await expect(ownRow).toBeVisible();
  await expect(ownRow.getByRole('button', { name: /Approve|Reject/ })).toHaveCount(0);
  await expect(reportRow.getByRole('button', { name: 'Reject', exact: true })).toBeVisible();
  await reportRow.getByRole('button', { name: 'Approve', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm APPROVE', exact: true }).click();
  await expect(reportRow).toContainText('APPROVED');

  await signIn(page, 'hr@acme.com');
  await page.goto('/dashboard/resources');
  await expect(reportRow.getByRole('button', { name: 'Fulfill', exact: true })).toBeVisible();
  await reportRow.getByRole('button', { name: 'Reject', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm REJECT', exact: true }).click();
  await expect(reportRow).toContainText('REJECTED');
});

test('Competing resource rejection and fulfillment commit one decision and update the stale portal', async ({ page }) => {
  const prisma = openFixtureDatabase();
  const applicant = await prisma.employee.findFirstOrThrow({
    where: { user: { email: employee }, company: { slug: 'acme-corp' } },
  });
  const request = await prisma.resourceRequest.create({
    data: {
      companyId: applicant.companyId, requestedById: applicant.id,
      resourceType: `QA concurrent request ${randomUUID().slice(0, 8)}`,
      description: 'One resource and one final decision',
      status: 'STEP_1_APPROVED', step1Status: 'APPROVED', step1ApprovedAt: new Date(),
    },
  });
  const notificationScope = {
    companyId: applicant.companyId, userId: applicant.userId,
    data: { path: ['resourceRequestId'], equals: request.id },
  };
  try {
    await signIn(page, 'hr@acme.com');
    await page.goto('/dashboard/resources');
    const row = page.getByRole('row').filter({ hasText: request.resourceType });
    await row.getByRole('button', { name: 'Fulfill', exact: true }).click();

    const endpoint = `/api/v1/resources/requests/${request.id}`;
    const responses = await Promise.all([
      page.request.post(`${endpoint}/approve`, { data: { decision: 'REJECT', notes: 'Cancelled' } }),
      page.request.post(`${endpoint}/fulfill`, { data: { notes: 'Delivered' } }),
    ]);
    expect(responses.map((response) => response.status()).sort()).toEqual([201, 409]);
    const rejected = responses[0].status() === 201;
    const finalStatus = rejected ? 'REJECTED' : 'FULFILLED';
    const final = await prisma.resourceRequest.findUniqueOrThrow({ where: { id: request.id } });
    expect(final.status).toBe(finalStatus);
    const notifications = await prisma.notification.findMany({ where: notificationScope });
    expect(notifications.map(({ title }) => title)).toEqual([`Resource Request ${rejected ? 'Rejected' : 'Fulfilled'}`]);

    const confirm = page.getByRole('button', { name: 'Confirm Fulfillment' });
    await confirm.click();
    await expect(page.getByRole('alert').filter({ hasText: 'Resource request cannot be fulfilled' })).toBeVisible();
    await expect(confirm).toBeDisabled();
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(row).toContainText(finalStatus);
    await expect(row.getByRole('button', { name: /Reject|Fulfill/ })).toHaveCount(0);
    expect(await prisma.notification.count({ where: notificationScope })).toBe(1);
  } finally {
    await prisma.$transaction([
      prisma.notification.deleteMany({ where: notificationScope }),
      prisma.resourceRequest.delete({ where: { id: request.id, companyId: applicant.companyId } }),
    ]);
    await prisma.$disconnect();
  }
});

test('HR resolves a pending attendance exception once and sees a stale queue refresh', async ({ page }) => {
  const prisma = openFixtureDatabase();
  const applicant = await prisma.employee.findFirstOrThrow({
    where: { user: { email: employee }, company: { slug: 'acme-corp' } },
  });
  const pending = await prisma.attendanceRecord.create({
    data: {
      companyId: applicant.companyId, employeeId: applicant.id, date: new Date('2099-07-01'),
      checkInTime: new Date('2099-07-01T08:00:00Z'), checkInIp: '192.0.2.25',
      status: 'ABSENT_PENDING_REVIEW', isRemote: true, notes: 'Remote check-in',
    },
  });
  const notificationScope = {
    companyId: applicant.companyId, userId: applicant.userId,
    data: { path: ['attendanceId'], equals: pending.id },
  };
  try {
    await signIn(page, 'hr@acme.com');
    await page.goto('/dashboard/attendance/exceptions');
    const row = page.getByRole('row').filter({ hasText: '192.0.2.25' });
    await expect(row).toBeVisible();

    const endpoint = `/api/v1/attendance/exceptions/${pending.id}/resolve`;
    const responses = await Promise.all(['APPROVE', 'REJECT'].map((action) =>
      page.request.post(endpoint, { data: { action, notes: `QA ${action}` } }),
    ));
    expect(responses.map((response) => response.status()).sort()).toEqual([201, 409]);
    const approved = responses[0].status() === 201;
    const status = approved ? 'PRESENT_REMOTE' : 'ABSENT';
    const action = approved ? 'APPROVE' : 'REJECT';
    const final = await prisma.attendanceRecord.findUniqueOrThrow({ where: { id: pending.id } });
    expect(final).toMatchObject({ status, notes: `Remote check-in | HR Resolution: ${action} (QA ${action})` });
    expect((await prisma.notification.findMany({ where: notificationScope })).map(({ data }) => data)).toEqual([
      { attendanceId: pending.id, status },
    ]);

    await row.getByRole('button', { name: 'Approve', exact: true }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'This attendance exception is no longer pending review.' })).toBeVisible();
    await expect(row).toHaveCount(0);
    expect(await prisma.notification.count({ where: notificationScope })).toBe(1);
  } finally {
    await prisma.$transaction([
      prisma.notification.deleteMany({ where: notificationScope }),
      prisma.attendanceRecord.delete({ where: { id: pending.id, companyId: applicant.companyId } }),
    ]);
    await prisma.$disconnect();
  }
});

test('Remote work records each approval stage once', async ({ page }) => {
  const prisma = openFixtureDatabase();
  const applicant = await prisma.employee.findFirstOrThrow({
    where: { user: { email: employee }, company: { slug: 'acme-corp' } },
    select: { id: true, companyId: true },
  });
  const permission = await prisma.remoteWorkPermission.create({
    data: {
      companyId: applicant.companyId, employeeId: applicant.id,
      startDate: new Date('2099-07-01'), endDate: new Date('2099-07-01'),
      reason: 'QA competing remote work decisions',
    },
  });
  const where = { id: permission.id, companyId: applicant.companyId };
  const endpoint = `/api/v1/attendance/remote-permissions/${permission.id}`;
  try {
    await signIn(page, teamLead);
    const recommendations = await Promise.all([
      page.request.patch(`${endpoint}/step1`), page.request.patch(`${endpoint}/step1`),
    ]);
    expect(recommendations.map((response) => response.status()).sort()).toEqual([200, 409]);
    const recommended = await prisma.remoteWorkPermission.findUniqueOrThrow({ where });
    expect(recommended.status).toBe('PENDING');
    expect(recommended.step1ApprovedAt).toBeInstanceOf(Date);
    expect(recommended.step2ApprovedAt).toBeNull();

    await signIn(page, 'hr@acme.com');
    const approvals = await Promise.all([
      page.request.patch(`${endpoint}/step2`), page.request.patch(`${endpoint}/step2`),
    ]);
    expect(approvals.map((response) => response.status()).sort()).toEqual([200, 409]);
    const approved = await prisma.remoteWorkPermission.findUniqueOrThrow({ where });
    expect(approved.status).toBe('APPROVED');
    expect(approved.step1ApprovedAt).toEqual(recommended.step1ApprovedAt);
    expect(approved.step2ApprovedAt).toBeInstanceOf(Date);
  } finally {
    await prisma.remoteWorkPermission.delete({ where });
    await prisma.$disconnect();
  }
});

test('Employee can submit remote work and read work-from-home guidance', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, timezoneId: 'America/Los_Angeles', locale: 'en-US' });
  const page = await context.newPage();
  try {
    await signIn(page, employee);
    const invalid = await page.request.post('/api/v1/attendance/remote-permissions', { data: {
      startDate: '2026-02-30', endDate: '2026-03-02', reason: 'Invalid date fixture',
    } });
    expect(invalid.status()).toBe(400);
    expect((await invalid.json()).message).toContain('valid start and end dates');
    await page.goto('/dashboard/my-attendance');
    await page.getByRole('button', { name: 'New Remote Work Request', exact: true }).click();
    const date = new Date(Date.now() + 10 * 86400_000).toISOString().slice(0, 10);
    await page.locator('input[type="date"]').nth(0).fill(date);
    await page.locator('input[type="date"]').nth(1).fill(date);
    const reason = `QA home-office request ${randomUUID().slice(0, 8)}`;
    await page.locator('textarea').fill(reason);
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: /Submit Request/ }).click();
    const row = page.getByRole('row').filter({ hasText: reason });
    await expect(row).toContainText('PENDING');
    const formatted = new Date(date).toLocaleDateString('en-US', { timeZone: 'UTC' });
    await expect(row).toContainText(`${formatted} — ${formatted}`);

    await page.goto('/dashboard/ai-assistant');
    const prompt = page.getByPlaceholder('Ask a question about HR policies, leave balances, or workflows...');
    await prompt.fill('How do I apply to work from home?');
    await prompt.press('Enter');
    await expect(page.getByText(/New Remote Work Request/)).toBeVisible();
  } finally {
    await context.close();
  }
});

test('Employee can save and clear personal information while HR-managed fields stay protected', async ({ page }) => {
  const prisma = openFixtureDatabase();
  const { id, companyId, firstName, baseSalary, ...original } = await prisma.employee.findFirstOrThrow({
    where: { user: { email: employee }, company: { slug: 'acme-corp' } },
    select: { id: true, companyId: true, firstName: true, baseSalary: true, phone: true, address: true, dateOfBirth: true },
  });
  const where = { id, companyId };
  const endpoint = `/api/v1/employees/${id}`;
  const dateOfBirth = original.dateOfBirth?.toISOString().startsWith('1995-05-15') ? '1995-05-16' : '1995-05-15';
  const phone = original.phone === '+1 555 0104' ? '+1 555 0105' : '+1 555 0104';
  const address = `QA address ${randomUUID().slice(0, 8)}`;
  try {
    await signIn(page, employee);
    await page.getByRole('link', { name: 'My Profile', exact: true }).click();
    const edit = page.getByRole('button', { name: 'Edit Personal Information', exact: true });
    await edit.click();
    const editor = page.getByRole('dialog', { name: 'Edit Personal Information' });
    const save = editor.getByRole('button', { name: 'Save Changes' });
    await expect(save).toBeDisabled();
    await expect(editor.getByText(/Contact HR to update your official name/)).toBeVisible();
    await expect(editor.getByLabel(/First Name|Work Email|Salary|Department/)).toHaveCount(0);
    await editor.getByLabel('Date of Birth').fill(dateOfBirth);
    await editor.getByLabel('Phone Number').fill(phone);
    await editor.getByLabel('Street Address').fill(address);

    const [saved] = await Promise.all([
      page.waitForResponse((response) => response.url().endsWith(endpoint) && response.request().method() === 'PATCH'),
      save.click(),
    ]);
    expect(saved.status()).toBe(200);
    expect(saved.request().postDataJSON()).toEqual({ dateOfBirth, phone, address });
    await expect(page.getByText('Personal information saved.', { exact: true })).toBeVisible();

    await page.reload();
    await edit.click();
    await expect(editor.getByLabel('Date of Birth')).toHaveValue(dateOfBirth);
    await expect(editor.getByLabel('Phone Number')).toHaveValue(phone);
    await expect(editor.getByLabel('Street Address')).toHaveValue(address);
    await editor.getByLabel('Date of Birth').clear();
    await editor.getByLabel('Phone Number').clear();
    await editor.getByLabel('Street Address').clear();
    await save.click();
    await expect(page.getByText('Personal information saved.', { exact: true })).toBeVisible();

    const protectedChange = await page.request.patch(endpoint, { data: { firstName: 'QA protected field', salary: 1, phone } });
    expect(protectedChange.status()).toBe(403);
    const invalidDate = await page.request.patch(endpoint, { data: { dateOfBirth: '1995-02-30' } });
    expect(invalidDate.status()).toBe(400);
    const futureDate = await page.request.patch(endpoint, { data: { dateOfBirth: '2099-07-01' } });
    expect(futureDate.status()).toBe(400);
    const stored = await prisma.employee.findUniqueOrThrow({ where });
    expect(stored).toMatchObject({ firstName, baseSalary, dateOfBirth: null, phone: null, address: null });

    const teammate = await prisma.employee.findFirstOrThrow({
      where: { companyId, user: { email: teamLead } }, select: { id: true },
    });
    const otherProfile = await page.request.patch(`/api/v1/employees/${teammate.id}`, { data: { phone } });
    expect(otherProfile.status()).toBe(403);
  } finally {
    await prisma.employee.update({ where, data: original });
    await prisma.$disconnect();
  }
});

test('Mark all notifications as read persists after a reload', async ({ page }) => {
  const prisma = openFixtureDatabase();
  const user = await prisma.user.findUniqueOrThrow({ where: { email: teamLead } });
  const coworker = await prisma.user.findUniqueOrThrow({ where: { email: employee } });
  const notifications = await prisma.notification.createManyAndReturn({
    data: [user, coworker].map(recipient => ({
      userId: recipient.id, companyId: recipient.companyId, type: 'GENERAL',
      title: `QA notification ${randomUUID().slice(0, 8)}`, body: 'Fixture notification for UAT',
    })),
  });
  const notification = notifications.find(item => item.userId === user.id)!;
  const coworkerNotification = notifications.find(item => item.userId === coworker.id)!;
  try {
    await signIn(page, teamLead);
    await page.getByTitle('Notifications', { exact: true }).click();
    await expect(page.getByText(notification.title, { exact: true })).toBeVisible();
    await expect(page.getByText(coworkerNotification.title, { exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Mark all read', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Mark all read', exact: true })).toHaveCount(0);
    await page.reload();
    await page.getByTitle('Notifications', { exact: true }).click();
    await expect(page.getByText(notification.title, { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Mark all read', exact: true })).toHaveCount(0);
    expect((await prisma.notification.findUniqueOrThrow({ where: { id: notification.id } })).isRead).toBe(true);
    expect((await prisma.notification.findUniqueOrThrow({ where: { id: coworkerNotification.id } })).isRead).toBe(false);
  } finally {
    await prisma.notification.deleteMany({ where: { id: { in: notifications.map(item => item.id) } } });
    await prisma.$disconnect();
  }
});

test('Support Mode retains the platform inbox and leaves tenant read receipts alone', async ({ page }) => {
  const prisma = openFixtureDatabase();
  const platformUser = await prisma.user.findUniqueOrThrow({ where: { email: 'superadmin@zenhr.com' } });
  const tenantUser = await prisma.user.findUniqueOrThrow({ where: { email: teamLead } });
  const notifications = await prisma.notification.createManyAndReturn({
    data: [platformUser, tenantUser].map(recipient => ({
      userId: recipient.id, companyId: recipient.companyId, type: 'GENERAL',
      title: `Support mode QA ${randomUUID()}`, body: 'Fixture notification for Support Mode',
    })),
  });
  const platformNotification = notifications.find(item => item.userId === platformUser.id)!;
  const tenantNotification = notifications.find(item => item.userId === tenantUser.id)!;
  const supportMode = `/api/v1/super-admin/companies/${tenantUser.companyId}/support-mode`;
  let entered = false;

  try {
    const login = await page.request.post('/api/v1/auth/login', {
      data: { email: platformUser.email, password: 'SuperAdmin@123' },
    });
    expect(login.ok()).toBe(true);
    const entry = await page.request.post(`${supportMode}/enter`, {
      data: { reason: 'Verify platform inbox isolation in Support Mode' },
    });
    entered = entry.ok();
    expect(entered).toBe(true);

    const inbox = await page.request.get('/api/v1/notifications');
    expect(inbox.ok()).toBe(true);
    const { data } = await inbox.json();
    expect(data).toContainEqual(expect.objectContaining({ id: platformNotification.id }));
    expect(data).not.toContainEqual(expect.objectContaining({ id: tenantNotification.id }));
    expect((await page.request.patch('/api/v1/notifications/mark-all-read')).ok()).toBe(true);
    expect((await prisma.notification.findUniqueOrThrow({ where: { id: platformNotification.id } })).isRead).toBe(true);
    expect((await prisma.notification.findUniqueOrThrow({ where: { id: tenantNotification.id } })).isRead).toBe(false);
  } finally {
    try {
      if (entered) await page.request.post(`${supportMode}/exit`);
      await prisma.notification.deleteMany({ where: { id: { in: notifications.map(item => item.id) } } });
    } finally {
      await prisma.$disconnect();
    }
  }
});
