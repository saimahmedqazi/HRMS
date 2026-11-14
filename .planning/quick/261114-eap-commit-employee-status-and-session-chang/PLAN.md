# Commit employee status and session changes together

High severity. In a disposable tenant, onboard an employee and sign in. As HR, change the employee to Terminated, then restore On Probation. The old status handler only cleared the employment lock when moving directly from Suspended to Active. Its status update, audit, notifications, and session changes could also commit independently, with the session update waiting on email.

Apply the tenant-scoped status transition, audit, notifications, and session revocation in one transaction. Reject a conflicting transition, clear the employment lock on reactivation, and deliver email after commit. Extend unit coverage and the workforce lifecycle test to check that reactivation requires a fresh login.
