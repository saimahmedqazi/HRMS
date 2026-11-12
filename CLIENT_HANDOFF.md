# ZenHR client test handoff

## 1. Download and prepare

1. Open the ZenHR repository on GitHub. On the `main` branch, choose **Code → Download ZIP** and extract it. If GitHub prompts for access, sign in with the account invited to the repository. [ZenHR repository](https://github.com/saimahmedqazi/HRMS)
2. Install **Node.js 24.x** with npm 10 or newer, and install **Docker Desktop** or Docker Engine with Compose v2. Start Docker before setup. [Node.js downloads](https://nodejs.org/en/download) · [Docker installation](https://docs.docker.com/get-started/get-docker/)
3. Open a terminal in the extracted folder containing `package.json` and `docker-compose.yml`. Confirm `node --version`, `npm --version`, and `docker compose version` work. The default setup uses ports `3000`, `4000`, `5432`, and `6379`.

## 2. Set up the local demo

On Windows, use PowerShell.

```powershell
Copy-Item apps/backend/.env.example apps/backend/.env
Copy-Item apps/frontend/.env.example apps/frontend/.env.local
$env:NODE_ENV = 'development'
$env:DATABASE_URL = 'postgresql://zenhr:zenhr_secret@localhost:5432/zenhr_db?schema=public'
```

On macOS or Linux, use a shell.

```bash
cp apps/backend/.env.example apps/backend/.env
cp apps/frontend/.env.example apps/frontend/.env.local
export NODE_ENV=development
export DATABASE_URL='postgresql://zenhr:zenhr_secret@localhost:5432/zenhr_db?schema=public'
```

Run these commands in that same terminal.

```text
npm run docker:up
npm ci
npm run prisma:generate
npm run prisma:migrate:deploy --workspace=apps/backend
npm run prisma:seed --workspace=apps/backend
```

Keep the copied settings for the demo. PostgreSQL uses database `zenhr_db`, user `zenhr`, and password `zenhr_secret`. Redis uses password `zenhr_redis_secret`. The Compose file publishes both services on loopback. Use these credentials only for a disposable local demo.

## 3. Start ZenHR

Open two terminals in the extracted folder. Leave both running.

| Terminal | Command |
|---|---|
| API | `npm run dev:backend` |
| Web app | `npm run dev --workspace=apps/frontend -- --hostname localhost` |

Open [ZenHR sign-in](http://localhost:3000/login). Use `localhost` for the web app so it matches the configured browser origin. API documentation is available at [Swagger](http://127.0.0.1:4000/api/docs).

## 4. Demo sign-ins

| Role | Email | Password |
|---|---|---|
| Platform Super Admin | `superadmin@zenhr.com` | `SuperAdmin@123` |
| Platform Operation Manager | `ops@zenhr.com` | `Password@123` |
| Acme Company Admin | `ceo@acme.com` | `Password@123` |
| Acme HR Manager | `hr@acme.com` | `Password@123` |
| Acme Department Manager | `eng.manager@acme.com` | `Password@123` |
| Acme Team Lead (Tina Lopez) | `team.lead@acme.com` | `Password@123` |
| Acme Employee | `employee@acme.com` | `Password@123` |
| Acme Employee on probation | `newbie@acme.com` | `Password@123` |
| Globex Company Admin | `ceo@globex.com` | `Password@123` |

Sign out before switching roles, or open a separate private browser window for the next role. Use synthetic personal information and sample files.

## 5. Suggested acceptance checks

| Sign in as | Workflow and expected result |
|---|---|
| Acme Employee | Under **My Profile**, edit phone number, address, city, country, date of birth, gender, or nationality. Reload to check that the changes persist. Authorized staff control official name, work email, role, reporting assignment, employment status, and compensation. |
| Acme Employee | Check in under **Attendance** and submit a remote-work request. Verify that the new request appears with a pending status. |
| Acme Employee and Team Lead | Create a resource request as the employee. Check that Tina can act on the eligible reportee request and that approval controls are absent on her own request. |
| Acme Team Lead | Compare dashboard and Attendance totals for the same day. Open a direct report’s profile and add an emergency contact. Reload to confirm it saved. |
| Acme HR Manager | In **Bulk Import**, download the spreadsheet template, add a row with a unique email and employee code, preview it, and confirm the import. Reload to check that the result remains available. |
| Platform Operation Manager and Globex Company Admin | Check that the platform account has read-only company access and that Globex employee screens contain only Globex records. |
| Acme HR Manager or Company Admin | Open the notification bell after an applicable workflow, mark items as read, and reload to check that the read status persists. |

For a sample import, fill the first data row with `Demo`, `Employee`, `import-demo@example.test`, `DEMO-100`, and `2026-01-15` in the first five columns. Use a fresh email and employee code for each successful import. To test the error report, include a second row with a missing first name.

## 6. Optional integrations

The seeded accounts and core workflows work with the copied local environment. Configure these settings in `apps/backend/.env` and restart the API to test a live provider. Use credentials issued for your test environment.

| Test | Settings |
|---|---|
| Actual PDF upload and download | `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`. In Cloudinary, enable **Allow delivery of PDF and ZIP files** if required. The local storage simulation verifies application records and workflow. [Cloudinary delivery options](https://cloudinary.com/documentation/image_delivery_options) |
| Live AI answers | `GEMINI_API_KEY`. `GEMINI_MODEL` is optional. The local demo uses built-in HR policy responses when the key is blank. |
| Stripe checkout and webhooks | A Stripe test-mode `STRIPE_SECRET_KEY`, `STRIPE_BASIC_PRICE_ID`, `STRIPE_PREMIUM_PRICE_ID`, and `STRIPE_WEBHOOK_SECRET` for events forwarded to `/api/v1/subscriptions/webhook`. |
| Email delivery and password setup links | `MAIL_HOST`, `MAIL_PORT`, `MAIL_SECURE`, `MAIL_USER`, `MAIL_PASSWORD`, and `MAIL_FROM_ADDRESS`. Use a test SMTP inbox for demo recipients. |
| Authenticator setup | Generate a local key with `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"` and save it as `TOTP_ENCRYPTION_KEY`. Keep the same key across restarts. |

## 7. Run tests or stop the demo

For backend tests, run `npm run test --workspace=apps/backend -- --runInBand`. For browser tests, leave both servers running, run `npx playwright install chromium`, and set `ZENHR_E2E_DATABASE_URL` to the local demo database URL shown above. In PowerShell use `$env:ZENHR_E2E_DATABASE_URL = $env:DATABASE_URL`. On macOS or Linux use `export ZENHR_E2E_DATABASE_URL="$DATABASE_URL"`. Run `npm run test:e2e -- --project chromium`. The browser suite creates and changes fixture records, so use a disposable demo database.

If setup fails, run `docker compose ps` to check both containers. For port conflicts, stop the local service occupying the listed port or update the Compose port and its matching environment variable together. If PowerShell blocks `npm.ps1`, use `npm.cmd` and `npx.cmd`.

To stop, press **Ctrl+C** in both app terminals and run `npm run docker:down`. This preserves local data. To start over, use `docker compose down --volumes` only if you intend to delete the local demo database and Redis data, then repeat setup and seeding.
