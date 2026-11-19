# Technology Stack

**Analysis Date:** 2026-11-19

## Languages

**Primary:**
- TypeScript 5.5.4 (`strict: true`) - All frontend (`apps/frontend/src/`), backend (`apps/backend/src/`, `apps/backend/prisma/seed.ts`), and E2E test (`e2e/`) code

**Secondary:**
- SQL (PostgreSQL dialect) - Prisma migration scripts in `apps/backend/prisma/migrations/` and parameterized raw SQL predicates (e.g., atomic leave balance updates in `apps/backend/src/modules/leave/leave.service.ts`)
- JavaScript / ESM - Build, lint, and PostCSS configuration files (`apps/backend/eslint.config.mjs`, `apps/frontend/eslint.config.mjs`, `apps/frontend/postcss.config.mjs`)

## Runtime

**Environment:**
- Node.js 24.x - Enforced via `engines.node` in root `package.json`, `apps/frontend/package.json`, `.github/workflows/ci.yml`, and `node:24-alpine` base images in `apps/backend/Dockerfile` and `apps/frontend/Dockerfile`
- Browser runtime - Modern evergreen browsers targeting ES2022 (`apps/frontend/tsconfig.json`)

**Package Manager:**
- npm >=10.0.0 - npm workspaces monorepo (`apps/frontend`, `apps/backend`) defined in `package.json`
- Lockfile: `package-lock.json` present (`lockfileVersion: 3`); `apps/frontend/package-lock.json` also exists alongside the root workspace lockfile

## Frameworks

**Core:**
- NestJS 10.4.1 (`@nestjs/core`, `@nestjs/common`, `@nestjs/platform-express`) - Backend modular REST API, Express HTTP adapter, guards, interceptors, and dependency injection (`apps/backend/src/main.ts`, `apps/backend/src/app.module.ts`)
- Next.js 15.5.29 (App Router) with React 18.3.1 - Frontend web framework with server-side middleware, API/Socket rewrites, and security headers (`apps/frontend/next.config.ts`, `apps/frontend/src/middleware.ts`)
- Prisma ORM 5.19.1 (`@prisma/client`, `prisma`) - Type-safe PostgreSQL schema modeling (31 models, 17 enums), migrations, and client extensions (`apps/backend/prisma/schema.prisma`, `apps/backend/src/common/prisma/prisma.service.ts`)
- Socket.IO 4.x (`@nestjs/websockets` 10.4.1, `@nestjs/platform-socket.io` 10.4.1, `socket.io-client` 4.7.5) - Real-time attendance and break-alert notifications (`apps/backend/src/modules/attendance/attendance.gateway.ts`, `apps/frontend/src/components/layout/header.tsx`)
- Tailwind CSS 3.4.11 + PostCSS 8.4.45 (`postcss` 8.5.32 override for Next.js) + Autoprefixer 10.6.1 - Utility-first styling with `darkMode: 'class'` (`apps/frontend/tailwind.config.ts`)

**Testing:**
- Jest 29.7.0 + `ts-jest` 29.2.5 + `@nestjs/testing` 10.4.1 - Backend unit and service tests (`apps/backend/package.json` Jest config matching `*.spec.ts` under `apps/backend/src/`)
- Playwright 1.64.1 (`@playwright/test`) - End-to-end browser and PostgreSQL regression suite against Chromium (`playwright.config.ts`, `e2e/*.spec.ts`)

**Build/Dev:**
- NestJS CLI 10.4.5 (`nest build`, `@nestjs/swagger` compiler plugin in `apps/backend/nest-cli.json`) - Backend compilation to `apps/backend/dist/`
- TypeScript Compiler 5.5.4 (`tsc --noEmit`) - Strict static typechecking across both workspaces
- ESLint 9.9.1 (flat config) - Linting via `@typescript-eslint/eslint-plugin` 8.4.0 (`apps/backend/eslint.config.mjs`) and `@next/eslint-plugin-next` 15.5.29 Core Web Vitals rules (`apps/frontend/eslint.config.mjs`)
- Prettier 3.3.3 - Backend code formatting (`apps/backend/package.json`)
- Swagger / OpenAPI (`@nestjs/swagger` 7.4.0) - Interactive API documentation served at `/api/docs` (`apps/backend/src/main.ts`)
- Docker & Docker Compose - Local PostgreSQL 16 + Redis 7 services (`docker-compose.yml`) and multi-stage Alpine production images (`apps/backend/Dockerfile`, `apps/frontend/Dockerfile`)

## Key Dependencies

**Critical:**
- `@tanstack/react-query` 5.56.2 - Frontend server-state fetching, caching (`staleTime: 60s`), and cache invalidation (`apps/frontend/src/lib/query-provider.tsx`)
- `passport` 0.7.0 / `passport-jwt` 4.0.1 / `@nestjs/jwt` 10.2.0 / `bcrypt` 6.0.0 - Cookie-based JWT authentication and password hashing (`apps/backend/src/modules/auth/`)
- `otplib` 12.0.1 + `qrcode` 1.5.4 - TOTP two-factor authentication generation, verification, and QR code provisioning (`apps/backend/src/modules/auth/auth.service.ts`)
- `bullmq` 5.81.5 - Redis-backed asynchronous job queue and worker for bulk employee spreadsheet imports (`apps/backend/src/modules/bulk-import/bulk-import-jobs.service.ts`). Note: `@nestjs/bull` 10.2.1 and `bull` 4.16.3 remain listed in `apps/backend/package.json` but are not imported by application code
- `stripe` 23.0.1 - SaaS subscription checkout, customer portal, and signed webhook processing (`apps/backend/src/modules/subscriptions/subscriptions.service.ts`)
- `@google/genai` 2.31.0 - Google Gemini AI client for HR policy chat (`apps/backend/src/modules/ai-assistant/ai-assistant.service.ts`)
- `cloudinary` 2.11.0 - Cloud object storage for employee avatars, documents, and medical certificates (`apps/backend/src/common/storage/storage.service.ts`)
- `nodemailer` 10.5.0 - SMTP email transport fallback alongside direct Resend HTTPS delivery (`apps/backend/src/common/mail/mail.service.ts`)
- `react-hook-form` 7.55.0 + `@hookform/resolvers` 5.2.2 + `zod` 4.6.7 - Client-side form handling and schema validation (`apps/frontend/src/app/login/page.tsx`, `apps/frontend/src/app/register/page.tsx`)
- `class-validator` 0.14.1 + `class-transformer` 0.5.1 - Backend DTO validation enforced globally via `ValidationPipe` (`whitelist: true`, `forbidNonWhitelisted: true`) (`apps/backend/src/main.ts`)

**Infrastructure:**
- `@nestjs/config` 4.0.4 - Typed global environment configuration (`apps/backend/src/common/config/app.config.ts`)
- `@nestjs/throttler` 6.2.1 - Global rate limiting (60 req/min short window, 300 req/15min long window) with user/session tracking (`apps/backend/src/common/guards/request-throttler.guard.ts`)
- `@nestjs/schedule` 4.1.0 - In-process cron scheduler for hourly absence marking, daily billing retries/lockouts, 15-second break-overstay checks, and bulk-import reconciliation
- `helmet` 7.1.0 + `cookie-parser` 1.4.6 - HTTP security headers and cookie parsing (`apps/backend/src/main.ts`)
- `multer` 2.5.0 (pinned via root `package.json` `overrides`) - Multipart file upload handling for avatars, documents, prescriptions, and Excel/CSV workbooks
- `pdfkit` 0.20.2 - Streaming single and bulk A4 PDF payslip generation (`apps/backend/src/modules/payroll/pdf.service.ts`)
- `xlsx` 0.20.3 (installed from SheetJS CDN tarball) - Excel/CSV parsing and template generation for bulk employee imports (`apps/backend/src/modules/bulk-import/bulk-import.service.ts`)
- `geoip-lite` 2.0.3 - Offline IP-to-location lookup for login network telemetry (`apps/backend/src/common/utils/login-network-location.ts`)
- `recharts` 2.12.7 + `lucide-react` 0.441.0 + `clsx` 2.1.1 + `tailwind-merge` 2.5.2 - Frontend charts, icons, and Tailwind class composition (`apps/frontend/src/app/dashboard/`)

## Configuration

**Environment:**
- Configured via environment variables loaded by `@nestjs/config` (`apps/backend/src/common/config/app.config.ts`) and Next.js runtime/build env (`apps/frontend/next.config.ts`, `apps/frontend/src/middleware.ts`)
- Reference templates: `apps/backend/.env.example` and `apps/frontend/.env.example`
- Key backend variables: `DATABASE_URL`, `REDIS_URL` (or `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`), `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `TOTP_ENCRYPTION_KEY`, `COOKIE_SECRET`, `FRONTEND_URL`, `API_BIND_HOST`, `TRUSTED_PROXY_CIDRS`, `IP_FORWARDING_SECRET`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `GEMINI_API_KEY`, `GEMINI_MODEL`, `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, `RESEND_API_KEY` (or `MAIL_HOST`, `MAIL_PORT`, `MAIL_SECURE`, `MAIL_USER`, `MAIL_PASSWORD`, `MAIL_FROM_NAME`, `MAIL_FROM_ADDRESS`)
- Key frontend variables: `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SOCKET_URL`, `IP_FORWARDING_SECRET` (server-only, never `NEXT_PUBLIC_`)
- Operational script variables: `SUPER_ADMIN_EMAIL`, `SUPER_ADMIN_PASSWORD` (`apps/backend/src/scripts/bootstrap-admin.ts`), `ZENHR_RETIRED_IMPORT_PASSWORD` (`apps/backend/src/scripts/revoke-legacy-import-sessions.ts`), `ZENHR_E2E_DATABASE_URL` (`e2e/fixture-database.ts`)

**Build:**
- `package.json` - Monorepo workspace definitions, dependency security `overrides` (`multer`, `body-parser`, `qs`, `file-type`, `uuid`, `js-yaml`, `lodash`, `postcss`), and root orchestration scripts
- `apps/backend/tsconfig.json`, `apps/backend/tsconfig.build.json`, `apps/backend/nest-cli.json` - Backend CommonJS/ES2021 build with `@common/*` and `@modules/*` path aliases
- `apps/frontend/tsconfig.json`, `apps/frontend/next.config.ts`, `apps/frontend/tailwind.config.ts`, `apps/frontend/postcss.config.mjs` - Frontend ES2022 bundler config, CSP/security headers, and `/api/*` + `/api/attendance-events` reverse proxy rewrites
- `playwright.config.ts` - E2E test runner settings (single worker, 60s timeout, Desktop Chrome 1280x800)

## Platform Requirements

**Development:**
- Any OS with Node.js 24.x and npm >=10.0.0
- Docker and Docker Compose for local `postgres:16-alpine` (bound to `127.0.0.1:5432`) and `redis:7-alpine` (bound to `127.0.0.1:6379`) via `npm run docker:up` (`docker-compose.yml`)
- Native build toolchain (`python3`, `make`, `g++`) and OpenSSL required when building native modules (`bcrypt`) and Prisma engines on Alpine Linux (`apps/backend/Dockerfile`)

**Production:**
- Render Blueprint (`render.yaml`, `frankfurt` region) defines:
  - `zenhr-backend-api` (Node web service, persistent container required for Socket.IO, BullMQ worker, and `@nestjs/schedule` crons; runs `prisma migrate deploy` in `preDeployCommand`)
  - `zenhr-frontend-web` (Node web service running `next start`)
  - `zenhr-postgres` (Managed PostgreSQL 16)
  - `zenhr-redis` (Managed Redis Key-Value store with `maxmemoryPolicy: noeviction` for BullMQ reliability)
- Vercel deployment is also actively supported for the Next.js frontend (`apps/frontend/.vercel/` metadata and explicit `process.env.VERCEL === '1'` HTTPS `NEXT_PUBLIC_API_URL` enforcement in `apps/frontend/next.config.ts` plus HMAC IP attestation in `apps/frontend/src/middleware.ts`)
- Both apps also provide standalone multi-stage `node:24-alpine` Dockerfiles (`apps/backend/Dockerfile`, `apps/frontend/Dockerfile`)

---

*Stack analysis: 2026-11-19*
*Update after major dependency changes*
