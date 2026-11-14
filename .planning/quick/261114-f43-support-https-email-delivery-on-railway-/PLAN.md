# Support HTTPS email delivery on Railway

The hosted onboarding API took 124 seconds and reported failed email delivery. The local SMTP deadline returns credentials, but password setup and resets still need a working mail transport. Railway documents that Free, Trial, and Hobby block outbound SMTP.

Add Resend HTTPS support inside the existing MailService behind a deployment variable. Use the same deadline and acceptance result as SMTP. Verify the request payload, provider failure behavior, and the existing SMTP timeout using local tests. Live delivery requires a Resend key and verified sender in the group’s backend service.
