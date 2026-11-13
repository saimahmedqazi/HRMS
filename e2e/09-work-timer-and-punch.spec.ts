import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';
import { hash } from 'bcrypt';
import { getAttendanceDay, previousAttendanceDate } from '../apps/backend/src/common/utils/attendance-date';
import { openFixtureDatabase } from './fixture-database';

test('the shared attendance calendar shows approved leave and history validates its date range', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, locale: 'en-US', timezoneId: 'America/Los_Angeles' });
  try {
    const page = await context.newPage();
    const day = '2026-11-03';
    const records = ['PRESENT', 'ON_LEAVE'].map((status) => ({
      id: status, date: `${day}T00:00:00.000Z`, status, employee: { firstName: 'Fixture', lastName: status },
    }));
    await page.route('**/api/v1/**', (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith('/auth/me')) return route.fulfill({ json: { data: { id: 'fixture-hr', role: 'HR_MANAGER', firstName: 'Fixture', lastName: 'HR', companyId: 'fixture-company' } } });
      if (path.endsWith('/analytics/overview')) return route.fulfill({ json: { data: { attendanceDate: day } } });
      return route.fulfill({ json: { data: path.endsWith('/attendance/records') ? records : [] } });
    });
    await page.goto('/dashboard/attendance');
    await expect(page.getByTitle('On Leave', { exact: true })).toHaveText('1 L');
    await page.goto('/dashboard/attendance/history');
    await expect(page.getByRole('row').filter({ hasText: 'Fixture ON_LEAVE' })).toContainText('11/3/2026');
    await page.getByLabel('Start Date').fill(day);
    await page.getByLabel('End Date').fill('2026-11-02');
    await expect(page.getByRole('alert').filter({ hasText: 'End date cannot be earlier than start date.' })).toBeVisible();
  } finally {
    await context.close();
  }
});

test.describe('Daily Punch & Work Timer Lifecycle', () => {
  test.beforeEach(async () => {
    const prisma = openFixtureDatabase();
    try {
      const employee = await prisma.employee.findFirstOrThrow({
        where: { user: { email: 'employee@acme.com' }, company: { slug: 'acme-corp' } },
        select: { id: true, companyId: true, company: { select: { timezone: true } } },
      });
      const where = {
        companyId: employee.companyId,
        employeeId: employee.id,
        date: getAttendanceDay(new Date(), employee.company.timezone).date,
      };
      await prisma.$transaction([
        prisma.attendanceRecord.deleteMany({ where }),
        prisma.workTimerEntry.deleteMany({ where }),
      ]);
    } finally {
      await prisma.$disconnect();
    }
  });

  for (const action of ['resume', 'stop', 'paused'] as const) {
    test(`An overlong break alerts the assigned recipients (${action})`, async ({ page, browser, baseURL }) => {
      const prisma = openFixtureDatabase();
      const employee = await prisma.employee.findFirstOrThrow({
        where: { user: { email: 'employee@acme.com' }, company: { slug: 'acme-corp' } },
        include: { company: true, team: true, department: true },
      });
      const where = {
        companyId: employee.companyId, employeeId: employee.id,
        date: getAttendanceDay(new Date(), employee.company.timezone).date,
      };
      const notificationScope = {
        type: 'BREAK_ALERT' as const, companyId: employee.companyId,
        data: { path: ['employeeId'], equals: employee.id },
        createdAt: { gte: new Date() },
      };
      const staff = await browser.newPage({ baseURL });
      const signIn = async (target: typeof page, email: string) => {
        await target.goto('/login');
        await target.locator('input[type="email"]').fill(email);
        await target.locator('input[type="password"]').fill('Password@123');
        await target.getByRole('button', { name: 'Sign In', exact: true }).click();
        await expect(target).toHaveURL(/\/dashboard$/);
      };
      const socketPacket = (value: string) => staff.waitForResponse(async (response) =>
        response.url().includes('/api/attendance-events?') && response.request().method() === 'GET' &&
        (await response.text().catch(() => '')).includes(value), { timeout: 26000 });

      try {
        await signIn(page, 'employee@acme.com');
        await Promise.all([socketPacket('42/ws/attendance,["attendance_ready"]'), signIn(staff, 'team.lead@acme.com')]);
        await staff.getByTitle('Notifications', { exact: true }).click();
        const packet = socketPacket('42/ws/attendance,["break_alert"]');
        const timer = await prisma.workTimerEntry.create({ data: {
          ...where, status: 'PAUSED', startedAt: new Date(Date.now() - 90 * 60_000),
          breaks: { create: { startedAt: new Date(Date.now() - 75 * 60_000) } },
        } });
        if (action !== 'paused') expect((await page.request.post(`/api/v1/timer/${action}`)).ok()).toBe(true);
        expect((await packet).ok()).toBe(true);
        await expect(staff.getByText(`Excessive Break Alert: ${employee.firstName} ${employee.lastName}`, { exact: true })).toBeVisible({ timeout: 5000 });
        const alerted = await prisma.workTimerEntry.findUniqueOrThrow({ where: { id: timer.id }, include: { breaks: true } });
        expect(alerted.breakAlertedAt).toBeInstanceOf(Date);
        if (action === 'paused') {
          expect(alerted.status).toBe('PAUSED');
          expect(alerted.breaks[0].endedAt).toBeNull();
          expect(alerted.updatedAt).toEqual(timer.updatedAt);
          expect((await page.request.post('/api/v1/timer/resume')).ok()).toBe(true);
        }
        const records = await prisma.notification.findMany({
          where: notificationScope, select: { user: { select: { email: true } } },
        });
        const expected = await prisma.user.findMany({ where: {
          companyId: employee.companyId,
          OR: [
            { role: { in: ['COMPANY_ADMIN', 'HR_MANAGER'] } },
            { employee: { id: employee.team!.leadId! } },
            { employee: { id: employee.department!.managerId! } },
          ],
        }, select: { email: true } });
        expect(expected).toHaveLength(4);
        expect(records.map(({ user }) => user.email).sort()).toEqual(expected.map(({ email }) => email).sort());
        if (action === 'resume') {
          expect((await page.request.post('/api/v1/timer/pause')).ok()).toBe(true);
          expect((await page.request.post('/api/v1/timer/stop')).ok()).toBe(true);
          expect(await prisma.notification.count({ where: notificationScope })).toBe(4);
        }
      } finally {
        await staff.close();
        await prisma.$transaction([
          prisma.notification.deleteMany({ where: notificationScope }),
          prisma.workTimerEntry.deleteMany({ where }),
          prisma.attendanceRecord.deleteMany({ where }),
        ]);
        await prisma.$disconnect();
      }
    });
  }

  test('Daily Punch Lifecycle: Punch In -> Verified Checked In -> Punch Out & Conclude', async ({ page }) => {
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

    // Verify the IP and approximate location panel is available.
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

  test('Attendance asks for device location only for an opted-in punch and can continue without it', async ({ page, context }) => {
    test.setTimeout(90_000);
    const prisma = openFixtureDatabase();
    const employee = await prisma.employee.findFirstOrThrow({
      where: { user: { email: 'employee@acme.com' }, company: { slug: 'acme-corp' } },
      select: { id: true, companyId: true, locationConsent: true },
    });
    const employeeScope = { id: employee.id, companyId: employee.companyId };
    const coordinates = { latitude: 0, longitude: 46.25 };
    const settingName = 'Allow device location at check-in';
    const punchIds: string[] = [];

    const checkIn = async (options: { location?: typeof coordinates; skipLocationResponse?: boolean; keepPage?: boolean } = {}) => {
      const { location, skipLocationResponse, keepPage } = options;
      if (!keepPage) await page.goto('/dashboard/my-attendance');
      await expect(page.getByRole('heading', { name: 'Attendance & Work Timer' })).toBeVisible();
      await expect(page.locator('html')).not.toHaveAttribute('data-location-requests');
      if (skipLocationResponse) await page.evaluate(() => sessionStorage.setItem('qa-location-pending', 'yes'));

      const [response] = await Promise.all([
        page.waitForResponse((response) => response.url().endsWith('/attendance/check-in') && response.request().method() === 'POST'),
        page.getByRole('button', { name: 'Punch In Now' }).click(),
      ]);
      expect(response.status()).toBe(201);
      const { data } = await response.json();
      punchIds.push(data.id);
      const request = response.request().postDataJSON();
      expect(request.latitude).toBe(location?.latitude);
      expect(request.longitude).toBe(location?.longitude);
      if (location || skipLocationResponse) {
        await expect(page.locator('html')).toHaveAttribute('data-location-requests', '1');
      } else {
        await expect(page.locator('html')).not.toHaveAttribute('data-location-requests');
      }
      const record = await prisma.attendanceRecord.findUniqueOrThrow({ where: { id: data.id } });
      if (location) {
        expect(JSON.parse(record.checkInLocation!)).toMatchObject({ lat: location.latitude, lng: location.longitude });
      } else {
        expect(record.checkInLocation).toBeNull();
      }
      expect(record.checkInIp).toBe('127.0.0.1');
      await expect(page.getByText('You are currently checked in today.')).toBeVisible();
      await prisma.attendanceRecord.delete({ where: { id: data.id } });
      await page.evaluate(() => sessionStorage.removeItem('qa-location-pending'));
    };

    try {
      await prisma.employee.update({ where: employeeScope, data: { locationConsent: false } });
      await context.grantPermissions(['geolocation']);
      await context.setGeolocation(coordinates);
      await page.addInitScript(() => {
        const geo = navigator.geolocation;
        const getCurrentPosition = geo.getCurrentPosition.bind(geo);
        geo.getCurrentPosition = (...args) => {
          const root = document.documentElement;
          root.dataset.locationRequests = String(Number(root.dataset.locationRequests ?? 0) + 1);
          if (sessionStorage.getItem('qa-location-pending') !== 'yes') getCurrentPosition(...args);
        };
      });

      await page.goto('/login');
      await page.locator('input[type="email"]').fill('employee@acme.com');
      await page.locator('input[type="password"]').fill('Password@123');
      const [loginRequest] = await Promise.all([
        page.waitForRequest((request) => request.url().endsWith('/auth/login') && request.method() === 'POST'),
        page.getByRole('button', { name: 'Sign In', exact: true }).click(),
      ]);
      expect(loginRequest.postDataJSON()).not.toHaveProperty('latitude');
      expect(loginRequest.postDataJSON()).not.toHaveProperty('longitude');
      await expect(page).toHaveURL(/\/dashboard$/);
      await expect(page.locator('html')).not.toHaveAttribute('data-location-requests');

      const me = await page.request.get('/api/v1/auth/me');
      expect(me.ok()).toBe(true);
      expect((await me.json()).data).toMatchObject({
        lastLoginIp: '127.0.0.1', lastLoginLocation: null, lastLoginLatitude: null, lastLoginLongitude: null,
      });
      await checkIn();

      await page.getByRole('link', { name: 'Settings', exact: true }).click();
      const preference = page.getByRole('checkbox', { name: settingName });
      await expect(preference).not.toBeChecked();
      await expect(page.getByRole('button', { name: 'Organization Profile' })).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Leave Policies' })).toHaveCount(0);
      const invalid = await page.request.patch('/api/v1/auth/me/location-consent', { data: { locationConsent: 'false' } });
      expect(invalid.status()).toBe(400);
      await preference.click();
      await expect(page.getByText('Attendance location preference saved.')).toBeVisible();
      await page.reload();
      await expect(preference).toBeChecked();
      await checkIn({ location: coordinates });
      await checkIn({ skipLocationResponse: true });

      await page.goto('/dashboard/my-attendance');
      await expect(page.getByRole('button', { name: 'Punch In Now' })).toBeVisible();
      const settingsPage = await context.newPage();
      await settingsPage.goto('/dashboard/settings');
      const settingsPreference = settingsPage.getByRole('checkbox', { name: settingName });
      await expect(settingsPreference).toBeChecked();
      await settingsPreference.click();
      await expect(settingsPage.getByText('Attendance location preference saved.')).toBeVisible();
      await settingsPage.reload();
      await expect(settingsPreference).not.toBeChecked();
      await settingsPage.close();
      await checkIn({ keepPage: true });
    } finally {
      await prisma.$transaction([
        prisma.attendanceRecord.deleteMany({ where: { employeeId: employee.id, companyId: employee.companyId, id: { in: punchIds } } }),
        prisma.employee.update({ where: employeeScope, data: { locationConsent: employee.locationConsent } }),
      ]);
      await prisma.$disconnect();
    }
  });

  test('A manager sees login telemetry from the reportee’s own network record', async ({ page }) => {
    const prisma = openFixtureDatabase();
    const report = await prisma.employee.findFirstOrThrow({
      where: { user: { email: 'employee@acme.com' }, company: { slug: 'acme-corp' } },
      select: {
        id: true,
        user: {
          select: { id: true, lastLoginIp: true, lastLoginAt: true, lastLoginCity: true, lastLoginCountry: true },
        },
      },
    });
    const { id: reportUserId, ...original } = report.user!;
    try {
      await prisma.user.update({
        where: { id: reportUserId },
        data: { lastLoginIp: null, lastLoginAt: null, lastLoginCity: 'Legacy City', lastLoginCountry: 'ZZ | 12.3456, 45.6789' },
      });
      await page.goto('/login');
      await page.locator('input[type="email"]').fill('team.lead@acme.com');
      await page.locator('input[type="password"]').fill('Password@123');
      await page.getByRole('button', { name: 'Sign In', exact: true }).click();
      await expect(page).toHaveURL(/\/dashboard$/);
      const viewer = await page.request.get('/api/v1/auth/me');
      expect((await viewer.json()).data.lastLoginIp).toBe('127.0.0.1');

      const profile = await page.request.get(`/api/v1/employees/${report.id}`);
      expect(profile.ok()).toBe(true);
      expect((await profile.json()).data.user).toMatchObject({
        lastLoginIp: null, lastLoginAt: null, lastLoginLocation: null, lastLoginCountry: null,
        lastLoginLatitude: null, lastLoginLongitude: null,
      });
      await page.goto(`/dashboard/employees/${report.id}`);
      await expect(page.getByText('Logged in from IP Unavailable')).toBeVisible();
      await expect(page.getByRole('link', { name: 'Open Map' })).toHaveCount(0);

      // A public IP is a local GeoIP database fixture. No request goes to that address.
      const recordedIp = '8.8.8.8';
      await prisma.user.update({ where: { id: reportUserId }, data: { lastLoginIp: recordedIp, lastLoginAt: new Date() } });
      await page.reload();
      await expect(page.getByText(recordedIp, { exact: true }).first()).toBeVisible();
      await expect(page.getByText('Approximate Latitude & Longitude', { exact: true })).toBeVisible();
      const mapLink = page.getByRole('link', { name: 'Open Map' });
      await expect(mapLink).toBeVisible();
      await expect(mapLink).not.toHaveAttribute('href', /12\.3456/);
    } finally {
      await prisma.user.update({ where: { id: reportUserId }, data: original });
      await prisma.$disconnect();
    }
  });

  test('Concurrent punches keep the first check-in record and return a conflict for the duplicate', async ({ page }) => {
    await page.goto('/login');
    await page.locator('input[type="email"]').fill('employee@acme.com');
    await page.locator('input[type="password"]').fill('Password@123');
    await page.locator('button[type="submit"]').click();
    await page.waitForURL('**/dashboard');

    const results = await Promise.all(['First workstation', 'Second workstation'].map((notes) =>
      page.request.post('/api/v1/attendance/check-in', { data: { isRemote: false, notes } }),
    ));
    expect(results.map((response) => response.status()).sort()).toEqual([201, 409]);
    const accepted = results.find((response) => response.status() === 201)!;
    const { data: punch } = await accepted.json();
    const prisma = openFixtureDatabase();
    try {
      const stored = await prisma.attendanceRecord.findUniqueOrThrow({ where: { id: punch.id } });
      expect(stored.notes).toBe(punch.notes);
      expect(stored.checkInTime?.toISOString()).toBe(punch.checkInTime);
    } finally {
      await prisma.$disconnect();
    }
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

  test('Restarted work timer preserves recorded seconds and excludes stopped time from attendance', async ({ page }) => {
    const prisma = openFixtureDatabase();
    try {
      const employee = await prisma.employee.findFirstOrThrow({
        where: { user: { email: 'employee@acme.com' }, company: { slug: 'acme-corp' } },
        select: { id: true, companyId: true, company: { select: { timezone: true } } },
      });
      const now = new Date();
      const date = getAttendanceDay(now, employee.company.timezone).date;
      const timer = await prisma.workTimerEntry.create({
        data: {
          companyId: employee.companyId,
          employeeId: employee.id,
          date,
          status: 'STOPPED',
          startedAt: new Date(now.getTime() - 120 * 60000),
          stoppedAt: new Date(now.getTime() - 90 * 60000),
          workedSeconds: 1205,
          totalMinutes: 20,
          breaks: { create: {
            startedAt: new Date(now.getTime() - 115 * 60000),
            endedAt: new Date(now.getTime() - 105 * 60000),
            durationMin: 10,
          } },
        },
      });

      await page.goto('/login');
      await page.locator('input[type="email"]').fill('employee@acme.com');
      await page.locator('input[type="password"]').fill('Password@123');
      await page.locator('button[type="submit"]').click();
      await page.waitForURL('**/dashboard');
      await page.getByRole('link', { name: 'Work Timer', exact: true }).click();
      await expect(page.getByText('00:20:05', { exact: true })).toBeVisible();

      await page.getByRole('button', { name: 'Start Timer' }).click();
      await expect(page.getByText('Status: RUNNING')).toBeVisible();
      await expect(page.getByText(/^00:20:\d{2}$/)).toBeVisible();
      await page.getByRole('button', { name: 'Stop & Finalize' }).click();
      await expect(page.getByText('Status: STOPPED')).toBeVisible();

      const stored = await prisma.workTimerEntry.findUniqueOrThrow({ where: { id: timer.id } });
      expect(stored.workedSeconds).toBeGreaterThanOrEqual(1205);
      expect(stored.workedSeconds).toBeLessThan(1230);
      expect(stored.activeSessionStartedAt).toBeNull();
      const attendance = await prisma.attendanceRecord.findUniqueOrThrow({
        where: { companyId_employeeId_date: { companyId: employee.companyId, employeeId: employee.id, date } },
      });
      expect(attendance.workMinutes).toBe(20);
    } finally {
      await prisma.$disconnect();
    }
  });

  test('Overnight punches and timer actions stay on the shift start date after midnight', async ({ page }) => {
    const prisma = openFixtureDatabase();
    const fixture = randomUUID();
    const email = `overnight-${fixture}@example.test`;
    const password = 'OvernightFixture@123';
    const now = new Date();
    const timezone = Array.from({ length: 27 }, (_, index) => index - 14)
      .map((offset) => offset === 0 ? 'UTC' : `Etc/GMT${offset > 0 ? '+' : ''}${offset}`)
      .find((zone) => getAttendanceDay(now, zone).hour === 1)!;
    const local = getAttendanceDay(now, timezone);
    const shiftDate = previousAttendanceDate(local.date);
    const dayKey = shiftDate.toISOString().slice(0, 10);
    let companyId: string | undefined;
    let userId: string | undefined;

    try {
      const company = await prisma.company.create({
        data: { name: 'Overnight QA', slug: `overnight-${fixture}`, email, timezone, subscriptionTier: 'PREMIUM' },
      });
      companyId = company.id;
      const shift = await prisma.shift.create({
        data: {
          companyId, name: 'Overnight', startTime: '22:00', endTime: '06:00',
          breakDuration: 30, workDays: [1, 2, 3, 4, 5, 6, 7], isDefault: true,
        },
      });
      const user = await prisma.user.create({
        data: {
          companyId, email, passwordHash: await hash(password, 4), isEmailVerified: true,
          role: 'EMPLOYEE', dataScope: 'SELF',
        },
      });
      userId = user.id;
      const employee = await prisma.employee.create({
        data: {
          companyId, userId, employeeCode: 'QA-NIGHT', firstName: 'Night', lastName: 'Fixture',
          hireDate: new Date('2024-01-01'), status: 'ACTIVE',
        },
      });
      const key = { companyId, employeeId: employee.id, date: shiftDate };

      await page.goto('/login');
      await page.locator('input[type="email"]').fill(email);
      await page.locator('input[type="password"]').fill(password);
      await page.getByRole('button', { name: 'Sign In', exact: true }).click();
      await page.waitForURL('**/dashboard');
      await page.goto('/dashboard/my-attendance');
      await expect(page.getByText(`Shift date ${dayKey}`, { exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Punch In Now' }).click();
      await expect(page.getByText('You are still checked in for this shift.')).toBeVisible();
      await page.getByRole('button', { name: 'Start Timer' }).click();
      await expect(page.getByText('Status: RUNNING')).toBeVisible();

      const punch = await prisma.attendanceRecord.findUniqueOrThrow({ where: { companyId_employeeId_date: key } });
      const timer = await prisma.workTimerEntry.findFirstOrThrow({ where: key });
      const beforeMidnight = new Date(now.getTime() - (local.hour * 60 + local.minute + 30) * 60000);
      await prisma.$transaction([
        prisma.attendanceRecord.update({ where: { id: punch.id }, data: { checkInTime: beforeMidnight } }),
        prisma.workTimerEntry.update({ where: { id: timer.id }, data: { startedAt: beforeMidnight } }),
        prisma.shift.update({ where: { id: shift.id }, data: { endTime: '00:30' } }),
      ]);

      await page.reload();
      await expect(page.getByText('You are still checked in for this shift.')).toBeVisible();
      const overviewResponse = await page.request.get('/api/v1/analytics/overview');
      expect(overviewResponse.ok()).toBe(true);
      const { data: overview } = await overviewResponse.json();
      expect(overview.todayAttendance.date.slice(0, 10)).toBe(dayKey);
      expect(overview.todayTimer.status).toBe('RUNNING');
      const duplicate = await page.request.post('/api/v1/attendance/check-in', { data: { isRemote: false } });
      expect(duplicate.status()).toBe(409);

      await page.getByRole('button', { name: 'Pause Break' }).click();
      await expect(page.getByText('Status: PAUSED')).toBeVisible();
      await page.getByRole('button', { name: 'Resume Work' }).click();
      await expect(page.getByText('Status: RUNNING')).toBeVisible();
      await page.getByRole('button', { name: 'Stop & Finalize' }).click();
      await expect(page.getByText('Status: STOPPED')).toBeVisible();
      const stopped = await prisma.workTimerEntry.findUniqueOrThrow({ where: { id: timer.id } });
      expect(stopped.date.toISOString().slice(0, 10)).toBe(dayKey);
      expect(stopped.totalMinutes).toBeGreaterThanOrEqual(90);

      await page.getByRole('button', { name: 'Punch Out & Conclude Shift' }).click();
      await expect(page.getByRole('button', { name: 'Punch In Now' })).toBeVisible();
      const records = await prisma.attendanceRecord.findMany({ where: { companyId, employeeId: employee.id } });
      expect(records).toHaveLength(1);
      expect(records[0].date.toISOString().slice(0, 10)).toBe(dayKey);
      expect(records[0].checkOutTime).not.toBeNull();
      expect(records[0].workMinutes).toBe(stopped.totalMinutes);
    } finally {
      try {
        if (companyId) await prisma.employee.deleteMany({ where: { companyId } });
        if (userId) await prisma.user.delete({ where: { id: userId } });
        if (companyId) await prisma.company.delete({ where: { id: companyId } });
      } finally {
        await prisma.$disconnect();
      }
    }
  });
});
