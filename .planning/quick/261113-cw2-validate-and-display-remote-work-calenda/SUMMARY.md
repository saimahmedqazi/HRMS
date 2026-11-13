# Remote-work date audit

**Medium.** The API accepted impossible dates such as February 30 and stored the rolled-over day. The Attendance table also displayed UTC date-only values one day early in timezones west of UTC. The API now validates calendar dates and rejects reversed ranges and blank reasons before writing. Attendance displays the stored calendar day, constrains the end date, and shows submission errors inside the form.

All 270 backend tests, backend typecheck, and both builds passed. Four focused Chromium tests passed against the local API, PostgreSQL, and Redis, including a Los Angeles browser context, the remote-work approval lifecycle, and related leave approval checks. Existing records retain their stored dates.
