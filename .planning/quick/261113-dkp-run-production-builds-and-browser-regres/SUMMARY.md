# Release checks and client setup

GitHub Actions now builds both applications, installs Chromium, and runs the full browser and PostgreSQL regression suite against disposable services. The CI API uses development mode for the demo providers. Next runs the optimized build. The client handoff now includes complete Playwright database setup commands, and the README identifies the Markdown handoff as the current guide.

Parsed the workflow YAML and checked its Bash blocks. A local rehearsal applied all nine migrations to a new PostgreSQL database, seeded both tenants, started the built applications, and passed all 141 Chromium tests. Jest passed all 274 tests with coverage. The GitHub runner itself and the client-hosted deployment were not exercised. The changes remain local.
