# Mobile navigation and release regression

**Medium.** The closed mobile sidebar remained in the keyboard tab order, and Escape left the open drawer in place. The dashboard now uses a native modal dialog at mobile widths. Chromium verified keyboard entry, background focus exclusion, Escape, focus restoration, and navigation. An iPhone-sized Chromium check also verified touch navigation and backdrop dismissal.

Two full runs exposed QA fixture issues. The Team Lead attendance test attempted to insert a duplicate employee/date row, and the role suites accumulated repeated logins until the API returned HTTP 429. The attendance test now preserves and restores existing rows. The role suites use one session per role and a fresh browser context per test.

The final run passed **141 Chromium tests** against the current frontend and backend builds and a disposable loopback PostgreSQL and Redis setup. All **274 backend tests**, both typechecks, and both production builds passed. All nine migrations were present and Prisma reported no schema drift. The full run used local provider fallbacks. The client deployment remains unverified, and GitHub main remains at `654c828`.
