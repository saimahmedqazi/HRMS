# Protect concurrent approval decisions and dashboard routes

- Make attendance exception and resource decisions conditional on the tenant and the state that authorized the decision. Save each decision with its notification in the same transaction.
- Return a conflict when a remote-work decision has already been recorded or another reviewer completes it first.
- Refresh stale approval queues and show useful errors. Match the Payroll and HR Exceptions pages to the roles their APIs allow.
- Verify the payroll workflow across sign-out and role switches. Resolve competing login redirects if the suite reproduces the race.
- Test competing decisions, final states, notifications, and role behavior on disposable PostgreSQL. Run the backend and browser regressions.
