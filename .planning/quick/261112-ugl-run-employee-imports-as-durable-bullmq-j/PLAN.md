# Process employee imports in a background worker

Accept uploads asynchronously, keep company-scoped job status in PostgreSQL, and run imports through BullMQ. Record each row and its progress together so a retry cannot double-count a committed row. Preserve previews, error reports, and partial results. Verify the real Redis worker and Chromium flow on loopback fixtures.
