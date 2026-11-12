# Alerts during ongoing breaks

| Severity | Confirmed issue | Fix |
| --- | --- | --- |
| High | Overstay alerts previously depended on Resume or Stop. A manager could miss a long break while it was still happening. | The Work Timer job checks open breaks every 15 seconds against the configured shift allowance. It uses the existing notification recipients and browser event. |
| High | A scheduled alert and a manual timer action could otherwise send separate notifications for the same shift. | The alert claims a durable marker on the timer in the same transaction as notification persistence. It checks the timer revision and active break before claiming and keeps that revision stable for concurrent timer actions. |
| Medium | The Team Lead dashboard claimed a fixed 60-minute limit and instant WebSocket delivery. | The dashboard points to the notification bell and the configured shift limit. |

The migration applied on disposable PostgreSQL 16 and Prisma reported zero schema drift. A temporary pre-migration table fixture verified that the additive SQL preserved an existing paused timer with its new marker unset.

The 10 focused Chromium tests and all 126 tests in the full Chromium run passed. The new test received the alert through the Team Lead’s bell while the timer was still paused, verified the open break and timer revision, and confirmed that Resume created no additional notifications. It verified the exact four persisted recipients. Backend Jest passed 220 tests across 39 suites. Both builds and the backend typecheck passed. The final frontend build included the dashboard text update, which was verified in Chromium after the full run had started.

Hosted Socket.IO and SMTP delivery remain unverified. The UAT's overstay policy is covered locally. The literal `TIMER-02` wording also describes notifications on every pause and remains a separate requirement interpretation.
