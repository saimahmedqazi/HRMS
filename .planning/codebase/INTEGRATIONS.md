# External Integrations

**Analysis Date:** 2026-11-19

## APIs & External Services

**Payment Processing:**
- Stripe - Multi-tenant SaaS subscription upgrades (Basic $49/mo vs. Premium $149/mo), billing portal management, and renewal lifecycle webhooks (`apps/backend/src/modules/subscriptions/subscriptions.service.ts`)
  - SDK/Client: `stripe` npm package `^23.0.1` initialized with pinned `apiVersion: '2024-06-20'`
  - Auth: Secret API key in `STRIPE_SECRET_KEY`; webhook signing secret in `STRIPE_WEBHOOK_SECRET`
  - Endpoints used: `stripe.checkout.sessions.create` (subscription mode, inline $149/mo `price_data` with `metadata.companyId`), `stripe.billingPortal.sessions.create`, and incoming webhooks (`POST /api/v1/subscriptions/webhook`)
  - Fallback behavior: Non-production environments run in local sandbox simulation mode when `STRIPE_SECRET_KEY` is missing or contains `mock`; production throws `503 ServiceUnavailableException`
  - Note: `STRIPE_BASIC_PRICE_ID` and `STRIPE_PREMIUM_PRICE_ID` are declared in `apps/backend/.env.example` / `apps/backend/src/common/config/app.config.ts`, though `createCheckoutSession` currently constructs inline `price_data`

**Email/SMS:**
- Resend (Primary HTTPS transport) & Generic SMTP via Nodemailer (Fallback) - Account verification emails, password reset emails, work-timer break-overstay alerts, and Stripe payment failure/retry notices (`apps/backend/src/common/mail/mail.service.ts`)
  - SDK/Client: Native `fetch` against `https://api.resend.com/emails` (with 8s `AbortController` timeout and `redirect: 'error'`), or `nodemailer` `10.5.0` SMTP transporter (`8s` connection/greeting timeouts)
  - Auth: Bearer API key in `RESEND_API_KEY` (takes precedence when set, designed for hosts that block outbound SMTP); otherwise SMTP credentials in `MAIL_HOST`, `MAIL_PORT`, `MAIL_SECURE`, `MAIL_USER`, `MAIL_PASSWORD`
  - Sender identity: Configured via `MAIL_FROM_NAME` (default `ZenHR`) and `MAIL_FROM_ADDRESS` (default `noreply@zenhr.com`)
  - Templates: Inline HTML strings constructed in `apps/backend/src/common/mail/mail.service.ts`, `apps/backend/src/modules/subscriptions/subscriptions.service.ts`, and `apps/backend/src/modules/subscriptions/subscription-cron.service.ts`
  - SMS: None

**External APIs:**
- Google Gemini API - Conversational HR policy assistant gated to Premium-tier tenants (`apps/backend/src/modules/ai-assistant/ai-assistant.service.ts`)
  - Integration method: Official `@google/genai` SDK `^2.31.0` (`GoogleGenAI.models.generateContent`)
  - Auth: API key in `GEMINI_API_KEY`; model override in `GEMINI_MODEL` (default `gemini-3.5-flash`)
  - Resilience & guardrails: 15-second total request deadline (`GEMINI_TIMEOUT_MS`), 5-second timeout for custom preferred models with automatic fallback to `gemini-3.5-flash` (`ThinkingLevel.LOW`), and deterministic local policy engine (`zenhr-policy-engine`) that answers common probation, leave-balance, sick-leave, break-alert, WFH, and compensation-privacy queries without external API round trips
  - Fallback behavior: When `GEMINI_API_KEY` is absent or placeholder, operates in deterministic local HR policy engine mode
- Geolocation (Offline/Local): Login IP city/country/coordinates resolution uses local embedded MaxMind data via `geoip-lite` `2.0.3` (`apps/backend/src/common/utils/login-network-location.ts`) with no outbound HTTP calls

## Data Storage

**Databases:**
- PostgreSQL 16 - Primary ACID multi-tenant relational datastore (31 models, 17 enums)
  - Connection: `DATABASE_URL` env var (`apps/backend/prisma/schema.prisma`)
  - Client: Prisma ORM `5.19.1` (`@prisma/client`) via `apps/backend/src/common/prisma/prisma.service.ts`, with tenant scoping extension utilities in `apps/backend/src/common/prisma/tenant-extension.ts`
  - Migrations: 14 SQL migrations tracked under `apps/backend/prisma/migrations/`, applied in production via `prisma migrate deploy` (`render.yaml`) and locally via `npm run prisma:migrate`
  - Local seed: `apps/backend/prisma/seed.ts` (enforces non-production loopback-only `DATABASE_URL` guard)

**File Storage:**
- Cloudinary - Cloud object storage for employee avatars, employee documents, and sick-leave medical prescriptions; only secure URLs are persisted in PostgreSQL (`apps/backend/src/common/storage/storage.service.ts`)
  - SDK/Client: `cloudinary` `^2.11.0` (`v2` streaming `upload_stream`, `destroy`, and `utils.private_download_url`)
  - Auth: `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`
  - Folders & access tiers:
    - `zenhr/companies/{companyId}/avatars` - Public `upload` delivery (`image/jpeg`, `image/png`, `image/webp`, max 5 MB)
    - `zenhr/companies/{companyId}/documents` - `authenticated` delivery (images, PDF, DOC, DOCX, max 10 MB); retrieved via 60-second signed private download URLs
    - `zenhr/companies/{companyId}/prescriptions` - `authenticated` delivery (images, PDF, DOC, DOCX, max 10 MB); retrieved via 60-second signed private download URLs
  - Fallback behavior: Deterministic mock Cloudinary URLs in non-production when credentials are unset; production returns `503 ServiceUnavailableException`
  - Note: AWS S3 is not integrated (no `@aws-sdk/*` packages are installed)

**Caching & Queues:**
- Redis 7 - Backing store for BullMQ asynchronous employee bulk-import jobs (`zenhr-employee-imports` queue) (`apps/backend/src/modules/bulk-import/bulk-import-jobs.service.ts`)
  - Connection: `REDIS_URL` (`redis://` or `rediss://` with automatic TLS) or discrete `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD` (auto-enables TLS for `*.upstash.io` hosts)
  - Client: `bullmq` `5.81.5` (`Queue` and `Worker` instances created in `BulkImportJobsService` with exponential backoff, 4 retry attempts, and 15-second reconciliation cron)
  - Note: Socket.IO (`apps/backend/src/modules/attendance/attendance.gateway.ts`) and rate limiting (`@nestjs/throttler` in `apps/backend/src/app.module.ts`) currently operate in-memory without a Redis adapter; Render provisions Redis with `maxmemoryPolicy: noeviction` (`render.yaml`)

## Authentication & Identity

**Auth Provider:**
- Custom first-party JWT + Refresh Token authentication with TOTP 2FA (`apps/backend/src/modules/auth/`)
  - Implementation: NestJS `@nestjs/jwt`, `passport-jwt`, `bcrypt` (12 salt rounds), and `otplib` + `qrcode` for authenticator app 2FA
  - Token storage: `httpOnly`, `sameSite: 'lax'`, `secure` (in production) cookies (`access_token` 15m TTL, `refresh_token` 7d TTL) parsed by `cookie-parser` (`apps/backend/src/modules/auth/auth.controller.ts`, `apps/backend/src/modules/auth/strategies/jwt.strategy.ts`)
  - Session management: Rotating refresh tokens hashed in PostgreSQL, monotonically incremented `sessionVersion` invalidation, Super Admin time-boxed `SupportModeSession` (1-hour duration), account lockout after 5 failed attempts for 15 minutes, and automatic frontend 401 refresh deduplication (`apps/frontend/src/lib/api.ts`)
  - Secrets: Independent `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` (validated >= 32 bytes and non-placeholder in production), `COOKIE_SECRET`, and AES-256-GCM `TOTP_ENCRYPTION_KEY` (32-byte base64 key with user ID as AAD in `apps/backend/src/modules/auth/totp-secret.ts`)
  - Proxy IP attestation: Optional HMAC-SHA256 signed client IP forwarding (`x-zenhr-client-ip`, `x-zenhr-client-ip-timestamp`, `x-zenhr-client-ip-signature`, 60s window) between the Next.js edge middleware and NestJS backend using shared `IP_FORWARDING_SECRET` (>= 32 bytes) (`apps/frontend/src/middleware.ts`, `apps/backend/src/common/utils/request-ip.ts`)
  - Real-time auth: Socket.IO gateway (`/ws/attendance`) validates the `access_token` cookie or handshake auth token via `JwtStrategy.validate` on connect and re-validates active sessions before emitting events (`apps/backend/src/modules/attendance/attendance.gateway.ts`)

**OAuth Integrations:**
- None (email/password + optional TOTP 2FA only)

## Monitoring & Observability

**Error Tracking:**
- None configured (no Sentry, Datadog, or external APM SDK installed); backend exceptions are normalized through `apps/backend/src/common/filters/global-exception.filter.ts`

**Analytics:**
- None (no third-party product analytics SDK); internal HR and SaaS metrics are queried directly from PostgreSQL via `apps/backend/src/modules/analytics/`

**Logs:**
- Stdout/stderr only via NestJS `Logger` (`apps/backend/src/main.ts` and service classes) and Prisma `error`/`warn` stdout logging (`apps/backend/src/common/prisma/prisma.service.ts`)
- Persistent security and domain audit trail stored in PostgreSQL `AuditLog` table via `apps/backend/src/common/services/audit-log.service.ts`

## CI/CD & Deployment

**Hosting:**
- Render (Blueprint in `render.yaml`, `frankfurt` region) - Hosts `zenhr-backend-api` (Node web service), `zenhr-frontend-web` (Node web service), `zenhr-postgres` (PostgreSQL 16), and `zenhr-redis` (Key-Value store)
  - Deployment: Blueprint-defined `buildCommand`, `preDeployCommand` (`prisma migrate deploy`), and `startCommand`; secrets synced via Render dashboard or `generateValue: true`
- Vercel - Supported frontend host for Next.js App Router (`apps/frontend/.vercel/` link and `VERCEL === '1'` production origin validation in `apps/frontend/next.config.ts`)
  - Reverse proxy: Frontend proxies `/api/:path*` to `${NEXT_PUBLIC_API_URL}/api/:path*` and `/api/attendance-events` to `${NEXT_PUBLIC_API_URL}/socket.io/` (polling transport) so `httpOnly` auth cookies stay same-origin

**CI Pipeline:**
- GitHub Actions (`.github/workflows/ci.yml`) - Triggered on pushes and pull requests to `main` and `master`
  - Jobs:
    1. `frontend-container`: Builds `apps/frontend/Dockerfile`, runs container, and smoke-tests `/login`
    2. `test-and-verify`: Spins up `postgres:16-alpine` and `redis:7-alpine` service containers, runs `prisma generate`, ESLint, TypeScript typecheck for both workspaces, `prisma migrate deploy` + `prisma:seed`, Jest backend unit tests with coverage, full monorepo production build, and Playwright Chromium E2E regression tests
  - Secrets: No external repository secrets required in CI (uses ephemeral test DB/Redis credentials and dynamically generated `TOTP_ENCRYPTION_KEY`)

## Environment Configuration

**Development:**
- Required env vars: `DATABASE_URL` (PostgreSQL), `REDIS_URL` or `REDIS_HOST`/`REDIS_PORT`/`REDIS_PASSWORD` (for bulk imports), `NEXT_PUBLIC_API_URL` (frontend rewrite target)
- Optional/dev-defaulted vars: `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` (auto-generated process-local random keys if blank), `TOTP_ENCRYPTION_KEY` (required when testing 2FA setup), `STRIPE_*`, `GEMINI_API_KEY`, `CLOUDINARY_*`, `RESEND_API_KEY` / `MAIL_*`
- Secrets location: Local `.env` / `apps/backend/.env` / `apps/frontend/.env.local` (gitignored); variable templates in `apps/backend/.env.example` and `apps/frontend/.env.example`
- Mock/stub services: Local Docker PostgreSQL 16 + Redis 7 (`docker-compose.yml`); automatic sandbox/mock modes for Stripe checkout/portal, Cloudinary uploads, and Gemini AI when API keys are omitted

**Staging:**
- No dedicated staging manifest in the repository; staging can be provisioned as a separate Render/Vercel environment using isolated PostgreSQL, Redis, Stripe test-mode keys, and separate Cloudinary/Resend credentials

**Production:**
- Secrets management: Render environment variables (including `generateValue: true` for `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `TOTP_ENCRYPTION_KEY` in `render.yaml`) and Vercel environment variables (`NEXT_PUBLIC_API_URL`, `IP_FORWARDING_SECRET`)
- Strict production guards enforced at boot/runtime:
  - `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` must be distinct, non-placeholder, >= 32 bytes (`apps/backend/src/common/config/app.config.ts`)
  - `TOTP_ENCRYPTION_KEY` must be a valid base64-encoded 32-byte key (`apps/backend/src/modules/auth/auth.service.ts`)
  - `IP_FORWARDING_SECRET` must be >= 32 bytes when configured (`apps/backend/src/main.ts`, `apps/frontend/src/middleware.ts`)
  - `NEXT_PUBLIC_API_URL` on Vercel must be a public `https://` origin (non-loopback) (`apps/frontend/next.config.ts`)
  - Mock fallbacks for Stripe and Cloudinary are disabled in `NODE_ENV=production`
  - Initial platform admin is provisioned out-of-band via `npm run auth:bootstrap-admin` (`apps/backend/src/scripts/bootstrap-admin.ts`) using `SUPER_ADMIN_EMAIL` and `SUPER_ADMIN_PASSWORD`

## Webhooks & Callbacks

**Incoming:**
- Stripe - `POST /api/v1/subscriptions/webhook` (`apps/backend/src/modules/subscriptions/subscriptions.controller.ts`, marked `@Public()` and `@SkipThrottle`)
  - Verification: Raw request body (`NestFactory.create(..., { rawBody: true })`) verified against the `stripe-signature` header via `Stripe.webhooks.constructEvent(rawBody, signature, STRIPE_WEBHOOK_SECRET)`
  - Idempotency & ordering: Deduplicates event IDs in `StripeWebhookReceipt`, tracks paid invoice IDs in `StripeInvoicePayment`, and guards against out-of-order stale invoices via `latestStripeInvoiceAt`
  - Events handled: `checkout.session.completed` (upgrades tenant to `PREMIUM`, links `stripeCustomerId`/`stripeSubscriptionId`, restores billing lockouts), `invoice.payment_succeeded` (resets delinquency counters and restores lockouts), `invoice.payment_failed` (marks `PAST_DUE`, increments `failedPaymentCount`, sets `unpaidSince`, creates in-app notification and sends email to `COMPANY_ADMIN`)

**Outgoing:**
- None (application does not emit outbound customer webhooks; external notifications are delivered via Resend/SMTP email and in-app Socket.IO events)

---

*Integration audit: 2026-11-19*
*Update when adding/removing external services*
