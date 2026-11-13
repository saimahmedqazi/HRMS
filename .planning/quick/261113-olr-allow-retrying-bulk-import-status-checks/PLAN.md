# Bulk import progress and recovery

**Medium.** Opening a saved import report shows “queued” before the server confirms its state. HTTP 403 keeps polling forever and disables uploads. Show an initial loading state, stop polling on terminal access errors, and offer a manual progress check during transient failures while retaining the existing job link.
