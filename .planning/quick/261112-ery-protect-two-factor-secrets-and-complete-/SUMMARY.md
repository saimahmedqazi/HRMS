---
status: complete
---

# Two-factor setup and recovery

| Severity | Confirmed issue | Fix |
| --- | --- | --- |
| High | The setup handler could replace the secret for an account with an active authenticator. An enable request could also race with a different setup or replace issued backup codes. | Generation rejects active accounts. Enable and disable use conditional writes tied to the setup state they verified. Repeated setup or enable requests return a conflict. |
| High | Authenticator secrets were written as plaintext, even though the deployment already defined an encryption key. | Store new secrets with authenticated encryption tied to the account. The production API requires the deployment key. An explicit backfill protects existing secrets while the login reader supports the legacy format during rollout. |
| Medium | Settings discarded the recovery codes returned after enabling an authenticator. | Show all eight one-time backup codes after successful setup and clear the display when the user dismisses it. The sign-in form now explains that either an authenticator or a backup code can be used. |
| High | Repeated session checks from a shared IP could exhaust the anonymous quota and return HTTP 429 before a browser with an expired access token could refresh. | Let credentialless probes reach the existing HTTP 401 response. Signed-in requests retain their per-user quota, and refresh requests with a cookie retain their IP quota. |
| Medium | My Payslips showed its empty state before the API returned and also when a request failed. | Render separate loading, error, and empty states. The browser regression delays the response to verify the loading state. |

The backend changes are in `auth.service.ts`, `auth.controller.ts`, `totp-secret.ts`, and `scripts/encrypt-totp.ts`. The UI changes are in the login and Settings pages.

Both production builds and TypeScript checks passed. **195 backend tests** passed. The focused Chromium test verified QR generation, enabling, encrypted persistence, backup-code display, rejection of repeat setup, both sign-in methods, backup-code consumption, and disabling. A PostgreSQL fixture signed in with its existing authenticator before and after the backfill. Repeating the command made zero changes. A local production-mode startup check rejected a missing key.

The first full browser run passed 114 of 116 tests and exposed the session and payslip defects listed above. A subsequent local HTTP check recovered a legitimate session after 65 credentialless checks of each session endpoint. The second browser run passed 115 of 116 tests. The remaining failure was a test-generated authenticator code submitted on the rollover boundary. The test now waits for the verification field and generates a code with at least six seconds remaining. The final run passed **116 of 116 Chromium tests** on fresh local PostgreSQL.

Production rollout still requires the configured key and a backfill against the intended database for any legacy secrets. See the [deployment steps](../../../README.md).

[Node.js authenticated encryption](https://nodejs.org/api/crypto.html) · [Render-generated secrets](https://render.com/docs/blueprint-spec#generating-random-secrets)
