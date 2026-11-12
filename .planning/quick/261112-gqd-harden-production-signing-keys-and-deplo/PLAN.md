# Harden production signing keys and deployment bootstrap

- Remove shared default signing keys. Validate production access and refresh keys before the API listens and keep unconfigured development isolated to the current process.
- Separate demo seed data from initial production administrator setup. Verify bootstrap creates one platform admin without overwriting an existing account.
- Correct the Render service declarations and run checked-in migrations in pre-deploy. Verify the Blueprint against its published schema and exercise the deployment commands on disposable PostgreSQL.
- Run backend tests and production startup checks. Verify login and refresh against the resulting build.
