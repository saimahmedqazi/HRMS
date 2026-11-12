# Notification account and company scope

| Severity | Affected files | Finding and fix |
| --- | --- | --- |
| High | `notifications.controller.ts` | Notification list and mark-all queries used the recipient ID alone. Both queries now use the authenticated recipient and account company. A missing account ID fails before reaching Prisma. A platform administrator keeps their personal platform inbox in Support Mode. |
| Medium | `header.tsx` | The browser cached notification results under a shared key. The cache key now includes the signed-in account and its company. Fetching starts when the signed-in account is available. |
| Low | `notifications.module.ts` | The module instantiated a second Prisma client. It now uses the application's global Prisma service. |

Controller tests verified the SQL scope for tenant users, platform users, and Support Mode. Chromium confirmed that mark-all persisted without changing a coworker's notification and that a platform administrator could update their own notification in Support Mode without changing a tenant employee's receipt.

The combined release regression passed 231 Jest tests and 131 Chromium tests. Both production builds and both TypeScript checks passed. The production-mode API returned the notification list with secure session cookies and connected once through the global Prisma service.
