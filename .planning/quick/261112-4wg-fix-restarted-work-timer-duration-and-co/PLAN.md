# Work timer restarts and leave balance reservations

- Preserve work already recorded when a timer restarts and exclude stopped time from the live counter and final attendance total.
- Make the available-day check and reservation atomic with leave creation. Keep first-use balance initialization safe under simultaneous requests and clean up attachments when submission fails.
- Verify browser timer display, attendance totals, and competing leave submissions on disposable PostgreSQL.
