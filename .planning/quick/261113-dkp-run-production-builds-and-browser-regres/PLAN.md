# Verify production builds and browser workflows in CI

**Medium.** The GitHub workflow runs Jest and database-only tenant checks. A browser regression or production build failure can pass the workflow. Build both apps, start them against the existing disposable PostgreSQL and Redis services, and run the full Chromium suite.

**Low.** The client test instructions depend on a shell variable set during initial setup. A fresh terminal does not inherit it. Document the full fixture database URL for both shells.
