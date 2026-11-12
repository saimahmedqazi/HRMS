# Work Timer overstay alerts

| Severity | Confirmed issue | Fix |
| --- | --- | --- |
| High | Work Timer sent organization employee identifiers to Socket.IO rooms keyed by user identifiers. Its persisted notifications also skipped HR. | Resolve one set of active, tenant-scoped user accounts for the assigned Team Lead and Department Manager, Company Admin, and HR. Use that set for persistence, browser events, and email. |
| Medium | Stopping a paused timer closed the break without running the overstay check. | Apply the same threshold check on Resume and Stop. Save notifications with the timer transition and send the browser signal after commit. A later break above the same threshold creates no duplicate alert. |
| Medium | The browser had no attendance event subscriber. During the first browser run, one alert also landed before room membership was ready. | Subscribe through the frontend's same-origin Socket.IO polling path. Signal readiness after joining the recipient room, and refresh the bell from the authenticated API on readiness or alert. [Socket.IO client options](https://socket.io/docs/v4/client-options/) |

Both targeted Chromium tests passed against disposable PostgreSQL 16. They observed the event in the Team Lead browser and verified exactly four persisted recipients. The full Chromium run passed 125 tests. Backend Jest passed 220 tests, and both builds and typechecks passed. Local email used the development sink.

Alerts are evaluated when a break closes. The dashboard wording and `TIMER-02` imply notification during an active break and remain open. Hosted proxy delivery and SMTP still require live verification.
