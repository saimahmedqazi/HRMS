# Attendance history and calendar audit

**Medium.** Attendance History passed invalid date filters to the database, and the shared monthly calendar omitted approved leave totals on days with multiple employee records. The API now validates date-only bounds before querying and keeps the range inclusive. History shows invalid ranges and request errors, and the calendar includes approved leave in its daily counts.

Backend typecheck and all 274 backend tests passed. A focused Chromium test with mocked API responses verified the leave count, the stored calendar day in a Los Angeles timezone, and the reversed-range alert. The full browser suite was not rerun for this change.
