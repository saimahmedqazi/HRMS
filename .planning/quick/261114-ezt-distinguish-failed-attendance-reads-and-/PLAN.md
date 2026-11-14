# Distinguish failed attendance reads and lock Basic timer actions

Confirmed in Chromium against the hosted frontend with an intercepted attendance response. On a failed current-attendance request, Daily Punch offered to punch in as if no record existed. The Work Timer also offered a Start action to Basic tenants, even though the server requires Premium and the UI hid mutation errors.

Wait for the current record before showing the punch controls and provide a retry on read failure. Match Work Timer access to the company tier enforced by the service. Display action failures and prevent overlapping timer actions. Verify the read recovery and Basic restriction in the browser, and run the existing Premium lifecycle regression.
