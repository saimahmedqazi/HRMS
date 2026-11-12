---
status: complete
---

# Stripe payment recovery and spreadsheet upload verification

| Severity | Confirmed defect and reproduction | Fix |
| --- | --- | --- |
| High | After the billing job suspends a delinquent tenant, a successful renewal updates the subscription but sign-in still fails because it reads the company status. | Track the suspension reason. Update billing state, restore company access, and record the audit event in one transaction. Restore only documented non-payment lockouts. |
| High | When Stripe retries a failed-payment delivery with the same event ID, the old handler increments the counter and creates a second notification. Checkout also writes the subscription tier and company tier separately. | Store the Stripe event ID in the same transaction as the billing updates and in-app notification. Update both tiers together. Send the failure email after commit. |
| High | The production lockfile resolved outdated multipart and spreadsheet parsers. The preview and execute upload handlers had no file size limit. | Use Multer 2.5.0 and SheetJS 0.20.3, lock install versions, and reject spreadsheet uploads over 10 MiB before parsing. |

The billing changes are in `subscriptions.service.ts`, `subscription-cron.service.ts`, `super-admin.service.ts`, and the new Prisma migration. Upload changes are in `bulk-import.controller.ts`, the package manifests, and the root lockfile. Render and Docker installs now use the lockfile.

## Verification

- **176 of 176 Jest tests** passed across 33 suites and **113 of 113 Chromium tests** passed against a separate disposable PostgreSQL database. Backend and frontend TypeScript checks and the backend production build passed.
- Fresh PostgreSQL 16 migration deployment passed with no schema drift. An upgrade fixture confirmed that the backfill distinguishes documented billing and manual suspensions and leaves unverified reasons unset.
- Signed local HTTP fixtures verified that four concurrent deliveries produce one failed-payment count and one stored notification. Two concurrent billing jobs suspended an overdue tenant once. Payment restored sign-in for that tenant, preserved a manual suspension after payment, and left the other tenant unchanged.
- With the final runtime dependencies, a valid XLSX file previewed and imported one record into the fixture tenant. Both upload endpoints returned 413 for files over the configured limit.
- A clean `npm ci` resolved Nest's runtime Multer to 2.5.0. The production audit reported **0 critical, 10 high, and 14 moderate** findings. Multer and SheetJS disappeared from the audit.

## Remaining verification

- Live Stripe delivery, distinct events arriving out of order, and Docker and Render deployments remain unverified. Deduplication covers repeated event IDs. Legacy suspensions without an audit record remain eligible for administrator review.
- Production Cloudinary and Gemini verification from the client UAT remains open. The [client UAT report](../261112-40i-resolve-remaining-client-uat-attendance-/SUMMARY.md) lists the local result for each defect.

[Stripe webhook delivery guidance](https://docs.stripe.com/webhooks#event-ordering) · [Multer release notes](https://github.com/expressjs/multer/blob/main/CHANGELOG.md) · [SheetJS distribution](https://docs.sheetjs.com/docs/getting-started/installation/nodejs/)
