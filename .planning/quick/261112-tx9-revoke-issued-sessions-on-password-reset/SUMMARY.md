# Session revocation and historical bulk-import credentials

| Severity | Affected files | Finding and fix |
| --- | --- | --- |
| High | `auth.service.ts`, `jwt.strategy.ts`, Support Mode service, Prisma schema and migration | Password reset invalidated the stored refresh token while previously issued access and two-factor challenge tokens could still be used until expiry. Tokens now carry an account session version. Reset advances the version atomically and clears the refresh token. Signing and refresh updates use the current version. Previously issued unversioned tokens are treated as version zero so unchanged accounts can continue through deployment. |
| High | Attendance gateway and broadcasters | Already-connected sockets authenticated only when they joined their rooms. The gateway now validates the stored session before each attendance or break alert and disconnects revoked or expired sockets. |
| High | Historical import remediation command, README | Existing users with the retired import credential needed a selective remediation path. The command defaults to dry run and reports counts. Apply mode matches stored hashes, atomically switches matching accounts to password setup, invalidates their sessions, and preserves unrelated users. |

The additive migration applied to populated and fresh PostgreSQL 16 fixtures. Prisma reported no schema drift. The dry-run and apply smoke used synthetic accounts and verified that a repeat apply made zero changes. Chromium confirmed that the old access and refresh cookies returned HTTP 401 after reset while the new password worked. A real Socket.IO client received one alert before reset and was disconnected before the next alert.

All 234 backend Jest tests and 131 Chromium tests passed. The backend production build and both TypeScript checks passed. A separate production-mode API smoke verified password reset, secure cookies, rejection of the old cookie, and entry into and exit from Support Mode after the session version increased.

GitHub Actions completed successfully for the previously pushed release commit `def2f1c`. It passed both workspace typechecks, the PostgreSQL constraints checks, and the backend test suite. The new session changes are local. The remediation command has only been run on disposable data. [Published CI run](https://github.com/saimahmedqazi/HRMS/actions/runs/43259697519)
