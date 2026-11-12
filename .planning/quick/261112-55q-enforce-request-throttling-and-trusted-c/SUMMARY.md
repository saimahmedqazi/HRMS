---
status: complete
---

# Authentication and attendance safeguards

| Severity | Confirmed issue | Fix and verification |
| --- | --- | --- |
| High | The API configured request limits without applying a throttling guard. | Apply the guard to HTTP routes and tighter limits to registration, password recovery, reset, and second-factor verification. Public routes use IP limits. Signed-in users have separate quotas, including when they share one network. Local HTTP verified both limits and confirmed signed Stripe delivery remained functional. |
| High | Authentication, request context, and attendance interpreted client IPs differently. Attendance also treated loopback as whitelisted without an HR rule. | Read the Express-resolved IP with an explicit trusted ingress allowlist. Use the same whitelist result for punches and attendance telemetry. Local HTTP verified consistent IP resolution through a configured fixture ingress. The attendance page now displays unavailable telemetry explicitly. |
| High | Parallel authentication failures could overwrite the counter, second-factor failures did not count, and a backup code could be consumed twice. | Increment failures atomically, enforce the same lockout for both factors, validate second-factor requests, and remove backup codes with a conditional database update. Five concurrent local failures locked the fixture account. Two concurrent submissions of a valid backup code produced one successful session. |
| Medium | Two simultaneous check-ins could overwrite the first punch time and notes. | Update the unique attendance record only while its check-in is empty. The duplicate request returns a conflict. |

Authentication changes are in `auth.controller.ts`, `auth.service.ts`, and `app.module.ts`. Proxy and attendance changes are in `main.ts`, `request-ip.ts`, `request-context.middleware.ts`, `attendance.service.ts`, and the attendance page.

Both production builds and typechecks passed. All **188 backend tests** and **116 Chromium tests** passed. The first browser run exposed an HTTP 429 on the session endpoint because users shared an IP quota. The final run passed after moving authenticated traffic to per-user quotas. The HTTP and browser checks used loopback PostgreSQL fixtures.

The deployed proxy chain still needs verification through the public frontend and API. Rate-limit counters are per backend instance. Configure `TRUSTED_PROXY_CIDRS` for the actual ingress hops before relying on attendance IP rules in a proxied deployment.

[NestJS rate limiting](https://docs.nestjs.com/security/rate-limiting) · [Express behind proxies](https://expressjs.com/en/guide/behind-proxies/)
