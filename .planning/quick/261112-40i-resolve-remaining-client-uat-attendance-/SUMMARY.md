---
status: complete
---

# Client UAT verification

Verified the current workspace on a fresh PostgreSQL 16 database at loopback. All **173 Jest tests**, **113 Chromium tests**, both production builds, and both typechecks passed. The new browser scenarios ran with the same disposable database configured in the API and the fixture client.

| Defect | Verification |
| --- | --- |
| D-01 | Tina added an emergency contact and uploaded a document on Evan's profile. Both records remained visible after a browser reload. The upload used the local storage simulation. |
| D-02 | The Team Lead dashboard and Attendance agreed on present totals with a company date different from the UTC date. Both now use the same daily summary. |
| D-03 | Daily Punch and History both showed zero recorded work minutes on a fixture with a 38-minute clock interval. Calendar review status remained visible. The timer no longer creates synthetic punch times or closes a punch when it stops. |
| D-04 and D-05 | Tina could act on Evan's pending request and could not act on her own request. HR rejected Evan's request after Step 1. The CEO shares the same backend permissions. |
| D-06 | The browser regression continued to verify that the Operation Manager cannot see tenant resource applicants. |
| D-07 | Employee documents and medical prescriptions now use authorization-checked download routes. Local HTTP checks verified expiring redirects for a legacy raw PDF and an authenticated prescription. An unauthenticated document request and the Team Lead's request for the reportee's medical attachment were denied. Live Cloudinary delivery remains unverified. |
| D-08 and D-09 | An employee submitted a remote work request and saved demographics. The saved date of birth persisted after reload. |
| D-10 | The browser loaded a stored notification and marked it read. A reload and the fixture database both confirmed persistence. |
| D-11 | Tina deleted the document she uploaded for Evan, and the document disappeared from his profile. Delete follows the same employee scope as upload. |
| D-12 | The exact work-from-home question returned instructions matching the current button label in the local fallback. The live Gemini response remains unverified. |

The wider stabilization goal remains active. Live Cloudinary and Gemini checks, billing recovery and duplicate event handling, and remaining high-severity dependency findings are open. Restarted timers can still count stopped time between sessions. Payroll, leave submission, and tenant isolation follow-ups are tracked in the [earlier audit](../261112-223-stabilize-zenhr-authentication-tenant-wo/SUMMARY.md).
