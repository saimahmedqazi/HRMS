---
status: complete
---

# Production signing keys and deployment bootstrap

| Severity | Confirmed issue | Fix and verification |
| --- | --- | --- |
| High | `app.config.ts` and several token consumers accepted shared signing defaults. The `start:prod` command could also inherit development mode. | The production entry point sets production mode. Startup requires separate explicit access and refresh secrets, rejects short values and known examples, and stops before listening. JWT consumers read the same validated configuration. Development without configured keys gets independent process-local keys. |
| High | `prisma/seed.ts` could create privileged demo accounts with public fixture credentials on a hosted database. | Demo seed requires an explicit loopback database and refuses production mode. `auth:bootstrap-admin` creates the first verified platform admin using supplied credentials. On an empty database, competing setup runs created exactly one admin. Rerunning with a different password preserved the existing password hash. |
| High | `render.yaml` declared Redis as a Postgres database, used an invalid plan for new Postgres instances, and skipped migrations before startup. | The Blueprint declares Redis as a private Key Value service and runs Prisma migrations before deployment. PostgreSQL remains version 16. The PostgreSQL plan is left to Render's existing setting or its new-instance default. The updated file passed the published Blueprint JSON Schema. [Render Blueprint reference](https://render.com/docs/blueprint-spec) |

The deployment migration command applied all three migrations on fresh loopback PostgreSQL 16 and reported no pending migrations on repeat. A production-mode demo seed attempt created zero users. The compiled production entry point rejected missing, placeholder, and reused keys before listening. With generated fixture keys, the initial platform administrator signed in, accessed the profile, and refreshed the session with Secure, HttpOnly, SameSite=Lax cookies.

Backend Jest initially passed **218 tests** after these changes, and the production backend build and TypeScript check passed. Hosted startup and ingress remain to be verified. Existing databases created with `prisma db push` require the documented baseline before the Blueprint pre-deploy command can apply subsequent migrations.
