# ZenHR HRMS

A production-ready, multi-tenant SaaS Human Resource Management System.

## Project Structure

```
zenhr/
├── apps/
│   ├── frontend/        # Next.js 15 App Router
│   └── backend/         # NestJS 10
├── docker-compose.yml   # Local PostgreSQL + Redis
├── package.json         # npm workspaces root
└── .planning/           # GSD planning artifacts
```

## Quick Start

### Prerequisites
- Node.js 24 LTS
- Docker & Docker Compose
- npm >= 10

### Setup

```bash
# Start databases
npm run docker:up

# Install all dependencies
npm ci

# Generate Prisma client
npm run prisma:generate

# Run database migrations
npm run prisma:migrate

# Start backend (port 4000)
npm run dev:backend

# Start frontend (port 3000)
npm run dev:frontend
```

### Environment Variables

Copy and configure:
```bash
cp apps/backend/.env.example apps/backend/.env
cp apps/frontend/.env.example apps/frontend/.env.local
```

Set `NEXT_PUBLIC_API_URL` to the full backend origin, including its scheme, before building the frontend. Browser API and PDF requests use the frontend's `/api` rewrite so the session cookies stay on the frontend origin. Set `FRONTEND_URL` on the backend to the public frontend origin for email links and the CORS allowlist. Configure `STRIPE_WEBHOOK_SECRET` with the signing secret for the endpoint registered in Stripe.

For an API behind a reverse proxy, set `TRUSTED_PROXY_CIDRS` to the comma-separated IP addresses or CIDR ranges of the verified ingress hops. Leave it empty for direct connections. Before using attendance IP rules in a hosted environment, verify the detected IP through the frontend rewrite and the API ingress. Request limits are per backend instance.

Production requires distinct `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` values of at least 32 bytes each. Render generates them for a new Blueprint environment. For other deployments, generate two independent secrets and store them with the deployment configuration. Rotating either key invalidates tokens signed with that key. Development can leave both unset and use random keys that last until the API process restarts.

Set `TOTP_ENCRYPTION_KEY` to a stable base64-encoded 32-byte key before starting a production API or configuring a local authenticator. The Render Blueprint generates one. For a self-managed environment, generate a key with `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"` and store it with the deployment secrets. On existing installations, run `npm run auth:encrypt-totp --workspace=apps/backend` after deploying the updated backend to encrypt legacy authenticator secrets. Use the same `TOTP_ENCRYPTION_KEY` as the API and set the intended `DATABASE_URL` explicitly.

Configure Cloudinary credentials for document uploads and downloads. ZenHR checks employee or leave scope before issuing a short-lived download link. If Cloudinary blocks PDF delivery for the product environment, enable **Allow delivery of PDF and ZIP files** in its Security settings. New employee documents and prescriptions use Cloudinary's authenticated delivery type. Previously uploaded public assets keep their original Cloudinary access settings until migrated. [Cloudinary PDF delivery settings](https://cloudinary.com/documentation/image_delivery_options)

### Database deployment

The Render Blueprint applies migrations before starting the API. When running outside Render, apply the checked-in migrations before starting the API.

```bash
npm run prisma:migrate:deploy --workspace=apps/backend
```

For an existing database created with `prisma db push`, complete the baseline before deploying the updated Blueprint. Back up the database and compare its schema with the initial migration. If the existing schema matches, run `npx prisma migrate resolve --schema apps/backend/prisma/schema.prisma --applied 20261112000000_initial_schema` against that database. Investigate any differences before recording the baseline. Then run the deployment command for subsequent migrations.

Provision PostgreSQL with the checked-in migrations. The optional workforce foreign keys use PostgreSQL's column-specific `ON DELETE SET NULL` to preserve `companyId` when an assignment is removed. Prisma's schema-only `db push` cannot create that delete behavior.

On a new installation, set `DATABASE_URL`, `SUPER_ADMIN_EMAIL`, and `SUPER_ADMIN_PASSWORD` in the environment used for initial setup. After building the backend and applying migrations, run `npm run auth:bootstrap-admin --workspace=apps/backend`. Use a unique generated password. The command creates one verified platform administrator and leaves existing accounts intact. Remove the provisioning password from the environment after setup.

The demo seed contains public fixture credentials and requires an explicit loopback `DATABASE_URL` in development or test mode. For an existing installation, review any accounts created by an earlier demo seed and rotate or disable them before public access.

### Browser tests

Start the API and frontend against disposable, seeded PostgreSQL. Set `ZENHR_E2E_DATABASE_URL` to the same disposable loopback PostgreSQL URL before running `npm run test:e2e`. Database-backed specs use this explicit connection for fixture cleanup. Set `PLAYWRIGHT_BASE_URL` if the test frontend runs on a port other than 3000.

## Tech Stack

- **Frontend**: Next.js 15, React, TypeScript, Tailwind CSS, ShadCN UI, TanStack Query
- **Backend**: NestJS, PostgreSQL 16, Prisma ORM, Redis, BullMQ, Socket.IO
- **Auth**: JWT + httpOnly cookies, TOTP 2FA
- **Deployment**: Vercel (frontend) + Render (backend)

## API Documentation

Swagger UI available at `http://localhost:4000/api/docs` when backend is running.
