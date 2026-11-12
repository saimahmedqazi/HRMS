# Production dependency audit and verification

| Severity | Finding | Change |
| --- | --- | --- |
| High | Production lockfiles resolved affected request parsing, configuration, YAML, Lodash, mail, form-validation, and CSS packages. | Updated Nest Config, Nodemailer, Zod, and its form resolver. Removed unused Joi. Applied root overrides for patched body-parser, JS-YAML, Lodash, and Next.js's PostCSS. The standalone frontend lockfile also uses the PostCSS override. |
| High | The old GeoIP package still includes an affected `ip-address` version. | The remaining dependency finding is open. The supported GeoIP upgrade requires Node 24. The installed version imports `ip-address` in its data-update utility, while the portal uses its lookup API. [GeoIP release metadata](https://registry.npmjs.org/geoip-lite/2.0.3) |

The production lockfile audit dropped from 10 high and 14 moderate findings to 1 high and 14 moderate, with zero critical findings. npm regenerated the workspace lockfile to apply overrides and refreshed additional versions permitted by the manifests. NestJS and Next.js stayed on their current release lines.

Clean installs passed for the workspace and standalone frontend. Node's actual resolution confirmed body-parser 1.20.9 and Multer 2.5.0 from Nest Express, JS-YAML 4.3.2 and Lodash 4.18.1 from Swagger, and PostCSS 8.5.32 from Next.js. npm's dependency listing labels the deliberate overrides against upstream exact pins as invalid. The clean install, runtime-resolution checks, and builds used the patched packages.

Backend Jest passed 220 tests, both workspace typechecks passed, and the backend and standalone frontend built. The local SMTP fixture verified authentication and delivery through MailService. The local Stripe endpoint accepted a signed fixture containing insignificant JSON whitespace and rejected the unsigned fixture. Chromium verified that empty login and registration forms still show field-specific messages.

The frontend also built with the workspace dependency tree, and the standalone frontend production audit reported zero findings. All 127 Chromium tests passed against disposable loopback PostgreSQL, including the employee profile update and field protection regression. The first combined production startup fixture timed out waiting for readiness. A separate production-mode launch against the local fixture passed login, secure HTTP-only cookie checks, profile retrieval, and session refresh.
