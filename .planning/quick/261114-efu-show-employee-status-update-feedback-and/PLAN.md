# Show employee status update feedback and validation

Medium severity. Open Update Status on an employee profile and submit a change while the API is unavailable or reports a conflicting update. The modal stays open with no explanation. The reason input also accepted text longer than the API limit.

Show errors in the modal and refresh the employee profile so HR can retry with current information. Limit the reason to 500 characters, label the controls, and show confirmation after a successful save. Exercise the conflict and retry in Chromium.
