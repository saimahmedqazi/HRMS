# Stack Research

**Domain:** Multi-Tenant SaaS HRMS
**Researched:** 2026-10-26
**Confidence:** HIGH

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Next.js (App Router) | 15.x / 14.x | Frontend Web Framework | Server-side rendering, API integration, fast routing, and clean React component hierarchy |
| NestJS | 10.x | Backend API Framework | Robust modular enterprise architecture (Modules, Controllers, Services, Guards, Interceptors) enforcing strict SOLID principles |
| PostgreSQL | 16.x | Primary Relational Database | Battle-tested ACID compliance, native relational constraints, and robust composite tenant indexing |
| Prisma ORM | 5.x / 6.x | Database Access Layer | Type-safe query generation, migrations, client middleware for tenant isolation and data scopes |
| Redis | 7.x | Caching, WebSockets & Job Queues | High-throughput in-memory datastore backing BullMQ asynchronous workers and Socket.IO adapter |
| BullMQ | 5.x | Background Jobs & Scheduled Crons | Resilient background processing for Excel imports, nightly absence jobs, and 3-day Stripe retries |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Socket.IO | 4.x | Real-Time Bi-Directional WebSockets | Instant break alerts, attendance exception notifications, and approval updates |
| Stripe Node SDK | 17.x | Payments & Subscriptions | Subscription checkout widget, customer portal, webhooks, and invoice management |
| Google GenAI SDK (@google/genai) | latest | AI Assistant | HR policy assistance and onboarding guidance using Gemini models |
| Cloudinary SDK / AWS S3 Client | latest | Cloud Object Storage | File uploads (employee documents, sick leave medical prescriptions) storing only URLs |
| Nodemailer | 6.x | Email Dispatch | In-app notification mirrors (leave updates, break alerts, Stripe payment failures) |
| TanStack Query (React Query) | 5.x | Client State & Server Cache | Efficient data fetching, caching, and optimistic UI updates on the frontend |
| ShadCN UI + Tailwind CSS | latest | UI Component Library & Styling | Accessible, modern, responsive UI design with full Dark Mode support |
| React Hook Form + Zod | latest | Form Management & Validation | Schema validation on client and matching DTO validation on NestJS backend |
| Recharts | 2.x | Data Visualization | Role-scoped interactive charts for attendance trends, payroll, and subscriptions |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| TypeScript | 5.x (`strict: true`) | Catch type mismatches across full stack |
| Docker & Docker Compose | Multi-container local environment | Local PostgreSQL, Redis, and API containers |
| ESLint & Prettier | Code linting and formatting | Consistent styling across frontend and backend workspaces |
| Swagger / OpenAPI | API Documentation | Automatic interactive documentation at `/api/docs` |

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Render (Backend) | Vercel Serverless Functions | Serverless functions timeout after 10-15s, breaking long-running BullMQ workers and persistent Socket.IO connections. Render supports long-running Node processes |
| Prisma ORM | TypeORM / Drizzle | Prisma provides superior type-safety and declarative schema modeling for multi-tenant relations |
| Cloudinary / AWS S3 | Local disk filesystem | Local filesystem is ephemeral on cloud platforms like Render; object storage is required |
| Gemini API directly | Custom ML Model Training | Custom model training is slow, expensive, and unnecessary; Gemini with system prompts and context injection satisfies all HR requirements |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Vercel Serverless for Backend API | Hard timeouts on cron jobs, background queues, and WebSocket disconnects | Persistent container service (Render) |
| Local File Storage (`/uploads`) | Ephemeral filesystem loss on container restart in production | Cloudinary (free tier) or AWS S3 |
| Mandatory GPS Check-in | Privacy violations, OS permission rejection, app store scrutiny | Optional opt-in informational metadata only |
| 10-Minute Screenshot Trackers | Employee privacy invasion, storage cost, OS background task instability | Work Timer with break notifications |
| Client-Side Data Scope Filtering | High security vulnerability where unauthorized tenant rows are leaked over network | Prisma/Service layer WHERE clauses (`companyId`, `departmentId`) |

## Sources

- ZenHR Functional & Role-Based Requirements Specification (v2.1)
- Supervisor Project Requirements Brief (`req.docx`)
- Official NestJS, Next.js, and Prisma Documentation
