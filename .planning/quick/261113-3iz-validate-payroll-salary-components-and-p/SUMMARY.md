# Payroll configuration audit

| Severity | Affected paths | Reproduction and fix |
| --- | --- | --- |
| High | `create-payroll-structure.dto.ts`, `payroll.service.ts`, `payroll-configuration.ts` | The configured Nest validation pipe accepted negative deductions and overlapping tax brackets. Negative deductions inflated net pay and overlapping brackets taxed the same range twice. A non-array bracket value raised a calculation error. The service now validates components, rates, boundaries, and monetary limits before saving or issuing payslips. |
| High | `create-payroll-structure.dto.ts` | Implicit conversion turned component objects into arrays whose fields disappear during JSON serialization. It also converted a string `false` to Boolean `true`. Salary-package validation now uses the original JSON types and persists validated component objects. |
| Medium | Payroll dashboard page | A failed run left the modal open without an error. A successful run for a different period left the table on the previous period. The modal now displays the API error and a successful run selects the processed period. |

Disposable PostgreSQL confirmed correct results for valid components and adjacent brackets, unchanged behavior for empty brackets and default tax rules, and rejection of malformed stored configurations and amount overflow without issuing a payslip. A focused Chromium test used mocked API responses to verify failure feedback and the selected pay period after retry. Hosted payroll remains unverified. Packages whose stored component fields were previously lost require correction with the intended values.
