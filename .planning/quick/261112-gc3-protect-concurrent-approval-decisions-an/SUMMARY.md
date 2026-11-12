---
status: complete
---

# Approval, dashboard access, and sign-out verification

| Severity | Affected files | Reproduction and fix |
| --- | --- | --- |
| High | `attendance.service.ts`, `attendance/exceptions/page.tsx` | Open an exception in two review sessions and submit competing decisions. A conditional write now accepts only a pending exception in the current company. The winning decision and employee notification commit together. The stale queue displays the conflict and refreshes. A normal punch is ineligible for exception resolution. |
| High | `resources.service.ts`, `resources/page.tsx` | Open an approved resource request and submit rejection and fulfillment together. The write now checks the request state that authorized the action. The transaction records one decision and one notification. A stale confirmation displays the conflict and refreshes the request list. |
| Medium | `attendance.service.ts`, `attendance/page.tsx` | Submit the same remote-work approval stage from two sessions. The competing decision now returns a conflict and refreshes the list. The recorded recommendation remains visible after final approval. |
| Medium | `dashboard/layout.tsx`, `auth.controller.ts` | Open Payroll or HR Exceptions directly as a Team Lead. The dashboard now shows Access Denied before mounting the page. Super Admin Support Mode can open HR Exceptions and follows the Payroll API's company-role restrictions. |
| Medium | `auth-context.tsx`, `11-payroll-and-exceptions-execution.spec.ts` | Sign out after running payroll and start the next login. The first full run reproduced competing login redirects. Sign-out now clears session queries and tenant data, and the dashboard performs one redirect. The payroll test verifies cleared cookies and signs the next user in from the resulting page. |

## Test results

- Backend Jest passed **209 of 209 tests** across 38 suites. Both production builds, both TypeScript checks, and `git diff --check` passed.
- The five focused Chromium tests passed, including the competing decisions and stale UI cases. The focused payroll and sign-out test passed twice after the redirect fix.
- The first full Chromium run passed 121 of 122 tests and exposed the logout navigation failure. The final full Chromium run passed **122 of 122 tests** on disposable PostgreSQL 16.

## Remaining work

- The resource workflow tested here follows the client UAT sequence from Step 1 to HR rejection or fulfillment. `RES-01` also specifies a separate department review stage, which remains unresolved.
- Live Work Timer notifications, production secret validation, and deployment and provider checks remain open.
