# Commit attendance exception alerts with check-in

A remote check-in without approved permission writes an attendance record before alerting HR. The previous implementation wrote notifications individually after commit and waited for each recipient’s SMTP request in series. A notification write failure could leave a committed check-in behind a failed request. Two stalled email calls could consume twice the per-email deadline.

Write the attendance exception and HR in-app alerts in the same transaction, then deliver the live event and email. Send email to the recipients concurrently and handle individual failures after commit. Verify persistence, recipient scope, and behavior with failed delivery.
