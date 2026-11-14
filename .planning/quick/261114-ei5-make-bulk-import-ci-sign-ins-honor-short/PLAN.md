# Stabilize browser waits in bulk import and attendance

The imported employee login check failed once in the full Linux CI suite with an opaque non-success status. It performed several sign-ins without honoring the endpoint's retry window. Use the existing UI sign-in helper so the test reports HTTP status and retries only when the server returns a short rate limit. A local Chromium run also read the attendance History Log headers before the lazy-loaded table rendered. Wait for the Work Minutes header before reading the column order.
