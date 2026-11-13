# Billing loading and recovery

Billing displayed a Basic Active plan and payment actions before the subscription loaded or after a failed initial request. The page now shows loading and retry states and scopes the cached subscription to the signed-in user and active company. The browser regression delayed the initial request, returned HTTP 503, and verified that retry displayed the returned Premium plan.

The frontend build and typecheck passed. All 142 Chromium tests passed against the local API and disposable PostgreSQL and Redis. The build preceded an indentation-only edit to the billing heading, and the typecheck included that edit. The prior 277-test backend result still applies because this change affected frontend and browser test files. Hosted deployment verification remains open.
