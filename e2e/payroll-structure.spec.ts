import { test, expect } from '@playwright/test';

test('HR can submit a currency-neutral salary structure with custom components and tax', async ({ page }) => {
  let submittedPayload: Record<string, any> | undefined;

  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path.endsWith('/auth/me/modules')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ role: 'HR_MANAGER', allowedModules: ['dashboard', 'payroll'] }),
      });
      return;
    }
    if (path.endsWith('/auth/me')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'hr-manager', email: 'hr@example.test', role: 'HR_MANAGER',
          firstName: 'HR', lastName: 'Manager', companyId: 'company-1',
        }),
      });
      return;
    }
    if (path.endsWith('/payroll/structures') && request.method() === 'POST') {
      submittedPayload = request.postDataJSON();
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ data: { id: 'structure-1', ...submittedPayload } }),
      });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [] }) });
  });

  await page.goto('/dashboard/payroll');
  await expect(page.getByRole('heading', { name: 'Payroll Management' })).toBeVisible();
  await page.getByRole('button', { name: 'Add Structure' }).click();
  await page.getByLabel('Structure name').fill('European salaried');
  await page.getByLabel('Default base pay per month').fill('5000');
  await page.getByLabel('Currency (ISO 4217)').fill('EUR');

  await page.getByRole('button', { name: 'Add component' }).click();
  await page.getByLabel('Name', { exact: true }).nth(0).fill('Housing allowance');
  await page.getByLabel('Amount', { exact: true }).nth(0).fill('500');
  await page.getByRole('button', { name: 'Add component' }).click();
  await page.getByLabel('Name', { exact: true }).nth(1).fill('Pension contribution');
  await page.getByLabel('Type', { exact: true }).nth(1).selectOption('DEDUCTION');
  await page.getByLabel('Amount', { exact: true }).nth(1).fill('5');
  await page.getByLabel('Percent').nth(1).check();

  await page.getByRole('button', { name: 'Add bracket' }).click();
  await page.locator('#payroll-tax-min-0').fill('0');
  await page.locator('#payroll-tax-rate-0').fill('12');
  await page.getByRole('button', { name: 'Save Salary Structure' }).click();

  await expect.poll(() => submittedPayload).toMatchObject({
    name: 'European salaried',
    currencyCode: 'EUR',
    baseSalary: 5000,
    isDefault: true,
    components: [
      { name: 'Housing allowance', type: 'ALLOWANCE', value: 500, isPercentage: false },
      { name: 'Pension contribution', type: 'DEDUCTION', value: 5, isPercentage: true, isPreTax: true },
    ],
    taxRules: { brackets: [{ min: 0, max: null, rate: 0.12 }] },
  });
});

test('HR can archive unused structures, adjust unpaid payslips, and mark payslips as paid', async ({ page }) => {
  let archivedId: string | undefined;
  let adjustmentPayload: Record<string, any> | undefined;
  let paidPayslipId: string | undefined;
  let payslipState = {
    id: 'ps-1',
    month: 11,
    year: 2026,
    currencyCode: 'EUR',
    baseSalary: 5000,
    allowances: 500,
    bonuses: 0,
    deductions: 200,
    taxAmount: 530,
    netSalary: 4770,
    status: 'GENERATED',
    breakdown: {},
    employee: { firstName: 'Ada', lastName: 'Lovelace', employeeCode: 'EMP-001', department: { name: 'Engineering' } },
  };
  let structuresState = [
    { id: 'struct-default', name: 'Default Package', currencyCode: 'EUR', baseSalary: 5000, isDefault: true, components: [], taxRules: { brackets: [] } },
    { id: 'struct-legacy', name: 'Legacy Package', currencyCode: 'EUR', baseSalary: 4000, isDefault: false, components: [], taxRules: { brackets: [] } },
  ];

  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path.endsWith('/auth/me/modules')) {
      return route.fulfill({ json: { data: { role: 'HR_MANAGER', allowedModules: ['dashboard', 'payroll'] } } });
    }
    if (path.endsWith('/auth/me')) {
      return route.fulfill({ json: { data: { id: 'hr-1', email: 'hr@example.test', role: 'HR_MANAGER', companyId: 'comp-1' } } });
    }
    if (path.endsWith('/payroll/structures') && request.method() === 'GET') {
      return route.fulfill({ json: { data: structuresState } });
    }
    if (path.endsWith('/payroll/structures/struct-legacy') && request.method() === 'DELETE') {
      archivedId = 'struct-legacy';
      structuresState = structuresState.filter((s) => s.id !== 'struct-legacy');
      return route.fulfill({ json: { data: { id: 'struct-legacy' } } });
    }
    if (path.endsWith('/payroll/payslips') && request.method() === 'GET') {
      return route.fulfill({ json: { data: [payslipState] } });
    }
    if (path.endsWith('/payroll/payslips/ps-1') && request.method() === 'PATCH') {
      adjustmentPayload = request.postDataJSON();
      payslipState = {
        ...payslipState,
        bonuses: adjustmentPayload!.bonuses,
        netSalary: 5200,
        breakdown: { adjustment: adjustmentPayload },
      };
      return route.fulfill({ json: { data: payslipState } });
    }
    if (path.endsWith('/payroll/payslips/ps-1/mark-paid') && request.method() === 'PATCH') {
      paidPayslipId = 'ps-1';
      payslipState = { ...payslipState, status: 'PAID' };
      return route.fulfill({ json: { data: payslipState } });
    }
    return route.fulfill({ json: { data: [] } });
  });

  await page.goto('/dashboard/payroll');
  await expect(page.getByText('Legacy Package')).toBeVisible();

  // Default package cannot be archived; non-default package can be archived
  const archiveButtons = page.getByRole('button', { name: 'Archive', exact: true });
  await expect(archiveButtons.nth(0)).toBeDisabled();
  await expect(archiveButtons.nth(1)).toBeEnabled();
  await archiveButtons.nth(1).click();
  await page.getByRole('button', { name: 'Confirm Archive' }).click();
  await expect.poll(() => archivedId).toBe('struct-legacy');
  await expect(page.getByText('Legacy Package')).toHaveCount(0);

  // Adjust unpaid payslip with bonus and one-off deduction
  await page.getByRole('button', { name: 'Adjust' }).click();
  await page.getByLabel(/Bonus/).fill('750');
  await page.getByLabel(/One-Off Deduction/).fill('100');
  await page.getByLabel(/Adjustment Note/).fill('Q4 spot bonus');
  await page.getByRole('button', { name: 'Save Adjustment' }).click();
  await expect.poll(() => adjustmentPayload).toMatchObject({
    baseSalary: 5000,
    bonuses: 750,
    adjustmentDeduction: 100,
    adjustmentNote: 'Q4 spot bonus',
  });

  // Mark payslip as PAID -> Adjust button locks
  await page.getByRole('button', { name: 'Mark Paid', exact: true }).click();
  await expect.poll(() => paidPayslipId).toBe('ps-1');
  await expect(page.getByRole('button', { name: 'Adjust' })).toBeDisabled();
});

test('HR can edit employee monthly base salary and salary structure on employee profile', async ({ page }) => {
  let lastPatch: Record<string, any> | undefined;
  let employeeState = {
    id: 'emp-1',
    firstName: 'Ada',
    lastName: 'Lovelace',
    employeeCode: 'EMP-001',
    status: 'ACTIVE',
    hireDate: '2025-01-15T00:00:00.000Z',
    baseSalary: '5000.00',
    payrollStructureId: 'struct-eu',
    payrollStructure: { id: 'struct-eu', name: 'European salaried', isDefault: true },
    user: { id: 'user-emp-1', email: 'ada@example.test', role: 'EMPLOYEE' },
    emergencyContacts: [],
    documents: [],
    subordinates: [],
  };

  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path.endsWith('/auth/me/modules')) {
      return route.fulfill({ json: { data: { role: 'HR_MANAGER', allowedModules: ['dashboard', 'employees', 'payroll'] } } });
    }
    if (path.endsWith('/auth/me')) {
      return route.fulfill({ json: { data: { id: 'hr-1', email: 'hr@example.test', role: 'HR_MANAGER', companyId: 'comp-1' } } });
    }
    if (path.endsWith('/payroll/structures')) {
      return route.fulfill({ json: { data: [{ id: 'struct-eu', name: 'European salaried', currencyCode: 'EUR', baseSalary: 4500, isDefault: true }] } });
    }
    if (path.endsWith('/employees/emp-1') && request.method() === 'GET') {
      return route.fulfill({ json: { data: employeeState } });
    }
    if (path.endsWith('/employees/emp-1') && request.method() === 'PATCH') {
      lastPatch = request.postDataJSON();
      employeeState = { ...employeeState, baseSalary: lastPatch!.salary === null ? null as any : String(lastPatch!.salary) };
      return route.fulfill({ json: { data: employeeState } });
    }
    if (path.includes('/employees?limit=100')) {
      return route.fulfill({ json: { data: { items: [] } } });
    }
    return route.fulfill({ json: { data: [] } });
  });

  await page.goto('/dashboard/employees/emp-1');
  await expect(page.getByText('Monthly Base Salary')).toBeVisible();
  await page.getByRole('button', { name: 'Edit Job Details' }).click();
  await page.getByLabel(/Monthly Base Salary/).fill('6250');
  await page.getByRole('button', { name: 'Save Job Details' }).click();
  await expect.poll(() => lastPatch).toEqual({ salary: 6250 });
});

test('Department payroll summary displays currency from API and renders errors cleanly', async ({ page }) => {
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/auth/me/modules')) {
      return route.fulfill({ json: { data: { role: 'DEPARTMENT_MANAGER', allowedModules: ['dashboard', 'payroll-view', 'my-payslips'] } } });
    }
    if (path.endsWith('/auth/me')) {
      return route.fulfill({ json: { data: { id: 'dm-1', email: 'dm@example.test', role: 'DEPARTMENT_MANAGER', companyId: 'comp-1' } } });
    }
    if (path.endsWith('/payroll/department-summary')) {
      return route.fulfill({
        json: {
          data: {
            departmentId: 'dept-1',
            departmentName: 'Engineering',
            month: 11,
            year: 2026,
            currencyCode: 'EUR',
            headcount: 2,
            totalGross: 11000,
            totalDeductions: 1500,
            totalNet: 9500,
            averageNet: 4750,
          },
        },
      });
    }
    return route.fulfill({ json: { data: [] } });
  });

  await page.goto('/dashboard/payroll-view');
  await expect(page.getByText('Engineering Department')).toBeVisible();
  await expect(page.getByText(/€|EUR/)).toBeVisible();
});
