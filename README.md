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
- Node.js >= 20
- Docker & Docker Compose
- npm >= 10

### Setup

```bash
# Start databases
npm run docker:up

# Install all dependencies
npm install

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

## Tech Stack

- **Frontend**: Next.js 15, React, TypeScript, Tailwind CSS, ShadCN UI, TanStack Query
- **Backend**: NestJS, PostgreSQL 16, Prisma ORM, Redis, BullMQ, Socket.IO
- **Auth**: JWT + httpOnly cookies, TOTP 2FA
- **Deployment**: Vercel (frontend) + Render (backend)

## API Documentation

Swagger UI available at `http://localhost:4000/api/docs` when backend is running.
