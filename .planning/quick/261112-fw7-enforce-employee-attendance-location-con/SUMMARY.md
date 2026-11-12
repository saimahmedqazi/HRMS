---
status: complete
---

# Attendance consent and login location

| Severity | Confirmed issue | Fix |
| --- | --- | --- |
| High | Opening Attendance requested device coordinates before the employee opted in. `attendance.service.ts` stored submitted coordinates or an IP-derived fallback even when the preference was off. Employees had no Settings control. | Tenant employees can save their preference in Settings. Punch In verifies consent before asking the browser and continues without coordinates if the lookup fails or takes more than three seconds. The API checks current consent again within the punch transaction. |
| High | Opening Login requested device coordinates before authentication. `auth.service.ts` stored submitted coordinates in the country field and fabricated a default location for unknown IPs. | Record the actual client IP and available approximate GeoIP metadata on password and two-factor sign-in. Accept legacy coordinate fields for compatibility and ignore their values. |
| Medium | Viewing a reportee who had no login data could show the signed-in manager's IP and time or a fabricated location in `employees/[id]/page.tsx`. The platform account profile also showed fabricated defaults. | Both profile views use the selected account's recorded IP and time, label derived coordinates as approximate, and show unavailable values when lookup fails. |

## Verification

- Backend Jest passed **204 tests** across 38 suites. Both production builds, both TypeScript checks, and `git diff --check` passed.
- The full Playwright Chromium run passed **119 tests** on disposable PostgreSQL 16. The focused tests confirmed opt-in persistence, default and withdrawn consent, withdrawal in a separate tab while Attendance was open, and a successful punch when the browser never answered the location request. They also verified the persisted punch rows and the reportee's missing and approximate login data.
- After tightening the Team Lead permission assertion, the targeted test passed. The executive payroll structures API returned 403 and personal Settings contained no organization or leave policy controls. Mobile Chromium opened Settings through the menu at 390 pixels with the checkbox visible and no horizontal overflow.
- This change reused the existing preference column. Historical rows were left in place. Profile APIs no longer read historical device coordinates from the country field. New login events overwrite that field with an IP-derived country code or null.

## Follow-up findings

- Direct navigation to the Payroll dashboard still renders executive controls for a Team Lead. The executive API rejects the Team Lead, and the frontend route should enforce the same role policy.
- Attendance exception resolution checks company scope without checking that the record is pending review. Resource rejection and fulfillment also update without matching the status used to authorize the decision. Add conditional, transactional transitions and concurrent-decision coverage.
- Work Timer break alerts use organization record identifiers when selecting user socket rooms. The browser has no subscriber for the attendance events. Verify recipient resolution and live notification delivery.
- Production ingress, live Cloudinary PDF delivery, and live Gemini remain unverified.
