---
status: complete
---

# Client UAT recheck

| Defect | Current status |
| --- | --- |
| D-01 | Tina added an emergency contact and uploaded a document on a direct report's profile. Both persisted after reload. |
| D-02 | The Team Lead dashboard and Attendance showed the same present count on the tenant's calendar day. |
| D-03 | Daily Punch and History showed the same recorded work time. The absence job preserves existing punches. A punch that fails the configured attendance rules still enters HR review by design. |
| D-04 | Tina could approve or reject a pending direct report's request. Her own request had no approval actions. |
| D-05 | HR could reject after Step 1, and the separate lifecycle test verified fulfillment. The company admin role uses the same permission checks. |
| D-06 | The Operation Manager browser test confirmed that tenant resource applicants were hidden. |
| D-07 | Authorization checks and signed redirects for employee and sick-leave PDFs passed locally. Real PDF delivery in the client Cloudinary environment remains open. Check both upload paths and a previously uploaded PDF. |
| D-08 | An employee submitted a remote-work request from Attendance and saw it listed as pending. |
| D-09 | Employee demographics saved and were still present after reload. |
| D-10 | Stored notifications appeared in the bell menu. Marking them read persisted after reload and in PostgreSQL. |
| D-11 | The Team Lead deleted a direct report's uploaded document in the local storage simulation. |
| D-12 | The exact UAT question returned the current workflow in Chromium. A mocked Gemini provider verified that absent or whitespace-only text now falls back to that guidance and that nonempty text is returned. Live Gemini remains unverified. |

Backend Jest passed 202 tests across 38 suites. The 16 targeted Chromium tests passed using a fresh loopback PostgreSQL 16 database. The backend production build, backend TypeScript check, and `git diff --check` passed. The UAT recheck used the existing local frontend build and made no deployment changes.

The subsequent provider verification passed both D-07 and D-12 using the production-mode local API with live Cloudinary and Gemini. [Live provider results](../261112-n7a-fix-live-gemini-answers-and-verify-the-r/SUMMARY.md)
