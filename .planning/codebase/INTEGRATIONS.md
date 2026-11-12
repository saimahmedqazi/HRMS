# External Integrations

**Analysis Date:** 2026-11-12

## APIs & External Services

**Payment Processing:**
- Stripe - SaaS subscription checkout, customer portal, and recurring billing
  - SDK/Client: `stripe` npm package v23.0.1
  - Auth: API secret in `STRIPE_SECRET_KEY`, publishable key in `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
  - Webhook secret: `STRIPE_WEBHOOK_SECRET`
  - Integration locations: `apps/backend/src/modules/subscriptions/subscriptions.service.ts`, `subscriptions.controller.ts`
  - Handled events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`

**AI & Natural Language Processing:**
- Google Gemini API - Intelligent HR policy guidance and context-grounded employee support
  - SDK/Client: `@google/genai` v2.31.0
  - Auth: API key in `GEMINI_API_KEY`
  - Models: Gemini 2.0 Flash / Gemini 1.5 Flash (`GEMINI_MODEL` configurable)
  - Integration location: `apps/backend/src/modules/ai-assistant/ai-assistant.service.ts`
  - Fallback: Deterministic HR policy sandbox simulation mode when API key is unconfigured or in offline environments

**Email Dispatch:**
- Nodemailer - Transactional email notifications (leave requests, break overstay alerts, payment failure warnings)
  - SDK/Client: `nodemailer` v6.9.14
  - Auth: SMTP credentials (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`)
  - Integration location: `apps/backend/src/common/mail/mail.service.ts`
  - Fallback: Console email logging in development/test when SMTP credentials are unconfigured

**Geolocation & Telemetry:**
- geoip-lite - IP-based location and country resolution for login and attendance punch auditing
  - Client: `geoip-lite` v1.4.10
  - Integration locations: `apps/backend/src/modules/attendance/attendance.service.ts`, `apps/backend/src/modules/auth/auth.service.ts`

## Data Storage

**Databases:**
- PostgreSQL 16 (Relational Database)
  - Connection: `DATABASE_URL` connection string (e.g., `postgresql://zenhr:zenhr_secret@localhost:5432/zenhr_db`)
  - Client: Prisma ORM v5.19.1 (`@prisma/client`)
  - Schema location: `apps/backend/prisma/schema.prisma`
  - Migrations: `apps/backend/prisma/migrations/`
  - Tenant Isolation: Composite tenant index (`[companyId]`) and Prisma client middleware/extension (`apps/backend/src/common/prisma/tenant-extension.ts`)

**Cloud Object Storage:**
- Cloudinary - Remote file and asset storage
  - SDK/Client: `cloudinary` v2.11.0
  - Auth: `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`
  - Resource Types: Auto-detected image and raw types for PDFs to prevent 401 ACL delivery issues
  - Integration location: `apps/backend/src/common/storage/storage.service.ts`
  - Stored Artifacts: Avatars (`zenhr/companies/{companyId}/avatars`), employee documents (`zenhr/companies/{companyId}/documents`), and medical sick leave prescriptions
  - Fallback: Deterministic mock URL generator for local/offline testing

**Caching, Real-Time WebSockets & Job Queues:**
- Redis 7 (In-Memory Datastore)
  - Connection: `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`
  - Clients: Bull Queue (`bull` v4.16.3 / `@nestjs/bull` v10.2.1), Socket.IO Redis adapter
  - Usage: Background worker queues for bulk employee import (`apps/backend/src/modules/bulk-import/bulk-import.service.ts`), subscription grace period retries, and real-time attendance alert broadcast

## Authentication & Identity

**Auth Engine:**
- Custom Multi-Tenant JWT Authentication with Dual-Token Rotation
  - Access Token: Short-lived signed JWT (15m expiry) stored in `httpOnly`, `secure`, `sameSite=lax` cookie (`access_token`)
  - Refresh Token: Long-lived signed JWT (7d expiry) stored in `httpOnly` cookie (`refresh_token`)
  - Secrets: `JWT_SECRET`, `JWT_REFRESH_SECRET`, `COOKIE_SECRET`
  - Integration locations: `apps/backend/src/modules/auth/auth.service.ts`, `auth.controller.ts`, `apps/backend/src/common/guards/jwt-auth.guard.ts`

**Multi-Factor Authentication (2FA):**
- TOTP Two-Factor Authentication
  - Libraries: `otplib` v12.0.1 (TOTP generation and verification), `qrcode` v1.5.4 (QR code generation)
  - Backup codes: Hashed one-time recovery codes stored in PostgreSQL

## Monitoring & Observability

**Error & Response Interceptors:**
- Global Exception Filter: `apps/backend/src/common/filters/global-exception.filter.ts` formats all errors into uniform JSON `{ success: false, error: { code, message, details }, timestamp }`
- Global Response Interceptor: `apps/backend/src/common/interceptors/response.interceptor.ts` wraps successful payloads into `{ success: true, data: ..., timestamp }`
- Audit Logging: `apps/backend/src/common/services/audit-log.service.ts` records administrative actions into `audit_logs` table

**API Documentation:**
- Swagger / OpenAPI 3.0 at `/api/docs` (`apps/backend/src/main.ts`)

## CI/CD & Deployment

**Production Hosting:**
- Backend API + Redis + PostgreSQL: Render (`render.yaml`)
- Frontend: Vercel (Next.js App Router serverless deployment)

**Local Environment:**
- Multi-container local orchestration via `docker-compose.yml` (`zenhr_postgres`, `zenhr_redis`)

## Webhooks & Callbacks

**Incoming:**
- Stripe Webhook:
  - Endpoint: `POST /api/v1/subscriptions/webhook`
  - Verification: Cryptographic signature validation via `stripe.webhooks.constructEvent(rawBody, signature, secret)`
  - Location: `apps/backend/src/modules/subscriptions/subscriptions.controller.ts`

**Outgoing:**
- Real-Time WebSockets:
  - Gateway: `AttendanceGateway` (`apps/backend/src/modules/attendance/attendance.gateway.ts`)
  - Events: `attendanceException` (unauthorized check-ins), `breakOverstay` (exceeding 60-minute break threshold)

---

*Integration audit: 2026-11-12*
*Update when adding/removing external services*
