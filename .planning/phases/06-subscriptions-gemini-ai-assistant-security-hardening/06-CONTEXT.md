# Phase 6 Context: Subscriptions, Gemini AI Assistant & Security Hardening

**Phase:** 06 — Subscriptions, Gemini AI Assistant & Security Hardening  
**Created:** 2026-10-26  
**Status:** In Progress  

## Key Architectural Decisions

1. **Subscription Tiers & Gating Engine**:
   - `SubscriptionTier`: `BASIC` vs `PREMIUM`
   - Feature Matrix:
     - `BASIC`: Up to 25 employees; Core attendance (onsite/remote); Leave management; Payroll; Sick leave prescription upload. Work Timer: OFF; General document uploads: OFF; Gemini AI Assistant: OFF.
     - `PREMIUM`: Unlimited employees; Work Timer: ON (with break overstay real-time alerts); Cloudinary general document uploads: ON; Gemini AI Assistant: ON; Bulk Excel import: ON.
   - Enforced by `@RequireSubscriptionTier(SubscriptionTier.PREMIUM)` decorator + `SubscriptionTierGuard`.
2. **Stripe Integration & Customer Portal**:
   - `SubscriptionsService`:
     - Creates Stripe Checkout session for plan upgrade (`stripe.checkout.sessions.create`).
     - Webhook handler (`/api/v1/subscriptions/webhook`):
       - `checkout.session.completed` -> activates subscription.
       - `invoice.payment_succeeded` -> resets failure count, updates period dates.
       - `invoice.payment_failed` -> records `lastFailedReason`, increments `failedPaymentCount`, sets status `PAST_DUE`, dispatches email alert to Company Admin.
3. **Scheduled Renewal Retry Cron & 2-Month Non-Payment Lockout**:
   - `SubscriptionCronService`:
     - Daily cron `@Cron('0 2 * * *')`.
     - Retries payment on Day +1, Day +2, Day +3.
     - If non-payment exceeds 60 days (`now - lastFailedPaymentAt > 60 days`):
       - Updates `Company.status = CompanyStatus.SUSPENDED`, `Subscription.status = SubscriptionStatus.SUSPENDED`, `Subscription.suspendedAt = new Date()`.
       - Locks out all company users at auth level with descriptive message.
4. **Google Gemini AI Assistant (`AiAssistantService`)**:
   - Integration with Google Gemini SDK (`@google/genai`).
   - HR policy system prompt injection with role-aware safety guardrails:
     - Grounds responses in standard company leave policies, work hours, attendance procedures, and probation terms.
     - Redacts and refuses to disclose other employees' salaries, sensitive personal details, or tenant-isolated data.
   - Streaming or REST chat completion endpoint: `POST /api/v1/ai/chat`.
5. **Security Audit Log Hardening**:
   - Dedicated `AuditLogService` recording sensitive operational actions:
     - `STATUS_CHANGE`, `SUPPORT_MODE_ENTERED`, `PAYROLL_EXECUTED`, `PLAN_UPGRADED`.
