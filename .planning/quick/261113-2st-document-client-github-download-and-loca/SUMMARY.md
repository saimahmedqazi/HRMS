# Client handoff verification

The [client handoff](../../../CLIENT_HANDOFF.md) documents GitHub ZIP download, Node.js 24 and Compose v2 setup, the nine existing demo accounts, expected role behavior, automated tests, and optional provider configuration. The environment examples enable local provider fallbacks and scope the database, cache, and API listeners to loopback for the demo. The handoff starts the web app on localhost.

Applied all eight migrations to disposable PostgreSQL, seeded the two demo tenants, and checked all nine passwords against the stored hashes. Prisma reported no schema drift. Docker was unavailable in this Windows environment, so the migration and worker checks used local PostgreSQL and Redis processes.
