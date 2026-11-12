# Protect two-factor setup and recovery

- Prevent setup from replacing active authenticator credentials and prevent stale setup requests from enabling a different secret.
- Encrypt stored authenticator secrets with the deployment key and provide an explicit backfill for existing accounts.
- Show newly issued backup codes in Settings and verify the full setup, sign-in, and recovery flow against local PostgreSQL.
- Fix the anonymous session probe and payslip loading states exposed by the full browser regression.
