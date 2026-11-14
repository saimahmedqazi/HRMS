# Bound SMTP waits so employee onboarding returns credentials

High severity on the hosted demo. Register a test company, add an employee, and open the employee list in another tab. The employee is already in the list, but the create request waits on SMTP and can time out before the admin sees the temporary password. The database transaction commits before the welcome email is sent in `employees.service.ts`.

Give each delivery an eight-second deadline in `mail.service.ts`. Let Nodemailer cancel the connection and let onboarding return the temporary password with `welcomeEmailSent: false`. Verify cancellation against a local TCP server that accepts the SMTP connection and stalls, then retest the hosted employee workflow after deployment.
