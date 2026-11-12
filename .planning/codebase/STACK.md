# Technology Stack

**Analysis Date:** 2026-11-12

## Languages

**Primary:**
- TypeScript 5.5.4 (`strict: true`) - All backend application code, NestJS modules, Next.js frontend pages, and Playwright E2E test suites

**Secondary:**
- JavaScript - Build and tooling scripts, PostCSS config (`postcss.config.mjs`)
- SQL / Prisma Schema - Relational data models, migrations, and schema definitions (`apps/backend/prisma/schema.prisma`)

## Runtime

**Environment:**
- Node.js >= 20.0.0 (LTS) - Full-stack monorepo runtime
- Browser runtime - Modern evergreen browsers (Chrome, Edge, Firefox, Safari)

**Package Manager:**
- npm >= 10.0.0
- Workspaces: `apps/frontend`, `apps/backend`
- Lockfile: `package-lock.json` present

## Frameworks

**Core:**
- NestJS 10.4.x - Enterprise modular backend framework enforcing SOLID architecture (Modules, Controllers, Services, Guards, Interceptors)
- Next.js 15.0.0 (App Router) - Full-stack frontend framework with server-side rendering, client components, and nested layouts
- React 18.3.1 - Frontend view library

**Testing:**
- Jest 29.7.0 (`ts-jest` 29.2.5) - Unit and integration testing on the backend
- Playwright 1.64.1 - Multi-role end-to-end browser testing (`playwright.config.ts`, `e2e/`)

**Build/Dev:**
- Nest CLI 10.4.x (`@nestjs/cli`, `webpack`) - Backend compilation and watch server
- Next.js Compiler (`SWC`) - Frontend bundler and hot-module reload
- Tailwind CSS 3.4.11 + PostCSS 8.4.45 - Utility-first styling framework with full dark-mode support

## Key Dependencies

**Critical:**
- `@prisma/client` 5.19.1 & `prisma` 5.19.1 - Declarative ORM, migrations, and tenant isolation extensions
- `@tanstack/react-query` 5.56.2 - Asynchronous client state management, server cache, polling, and invalidation
- `@google/genai` 2.31.0 - Gemini AI Assistant SDK for context-grounded HR policy assistance
- `stripe` 23.0.1 - Subscription billing, checkout sessions, customer portal, and webhook handling
- `passport-jwt` 4.0.1 & `@nestjs/jwt` 10.2.0 - JWT access and refresh token authentication via `httpOnly` secure cookies
- `socket.io` & `@nestjs/platform-socket.io` 10.4.1 / `socket.io-client` 4.7.5 - Real-time WebSockets for break alerts and attendance exceptions
- `bull` 4.16.3 & `@nestjs/bull` 10.2.1 - Redis-backed background queues for batch operations
- `cloudinary` 2.11.0 - Cloud object storage for employee avatars, contracts, and medical sick leave prescriptions
- `nodemailer` 6.9.14 - Transactional email notification service

**Infrastructure:**
- `helmet` 7.1.0 - HTTP security headers and Content Security Policy (CSP)
- `cookie-parser` 1.4.6 - Secure signed cookie parsing
- `geoip-lite` 1.4.10 - IP geolocation telemetry for punch audit trails
- `xlsx` 0.18.5 - Excel parsing for bulk workforce import
- `pdfkit` 0.20.2 - Server-side PDF generation for monthly payslips
- `otplib` 12.0.1 & `qrcode` 1.5.4 - TOTP two-factor authentication (2FA)
- `react-hook-form` 7.53.0 & `zod` 3.23.8 - Client form state management and schema validation
- `recharts` 2.12.7 - Interactive charts for attendance trends, department distribution, and revenue telemetry

## Configuration

**Environment:**
- Backend: Configured via `.env` loaded through `@nestjs/config` (`apps/backend/src/common/config/app.config.ts`) with Joi validation
- Frontend: Configured via `apps/frontend/.env` (`NEXT_PUBLIC_API_URL`)
- Key Variables: `DATABASE_URL`, `REDIS_HOST`, `JWT_SECRET`, `COOKIE_SECRET`, `STRIPE_SECRET_KEY`, `CLOUDINARY_CLOUD_NAME`, `GEMINI_API_KEY`

**Build:**
- Root: `package.json` with npm workspaces (`apps/frontend`, `apps/backend`)
- Backend: `apps/backend/tsconfig.json`, `apps/backend/nest-cli.json`
- Frontend: `apps/frontend/tsconfig.json`, `apps/frontend/next.config.ts`, `apps/frontend/tailwind.config.ts`

## Platform Requirements

**Development:**
- OS: Windows, macOS, or Linux
- Docker & Docker Compose (`docker-compose.yml`) for local PostgreSQL 16 Alpine and Redis 7 Alpine
- Node.js 20+

**Production:**
- Backend API + Redis + PostgreSQL: Persistent container deployment on Render (`render.yaml`)
- Frontend: Vercel deployment (Next.js App Router)
- Storage: Cloudinary (or AWS S3)
- Database: Managed PostgreSQL 16 with ACID isolation

---

*Stack analysis: 2026-11-12*
*Update after major dependency changes*
