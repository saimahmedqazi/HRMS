# Mobile dashboard navigation

**Medium.** At phone width, sign in and press Tab. Focus lands on the off-screen close button. Open the menu and press Escape. The drawer remains open. Use a modal dialog for the mobile drawer so its keyboard behavior matches its visible state, then verify at phone width with Chromium.

**QA.** The full browser run on the reused local demo database exposed a duplicate employee/date attendance fixture in `e2e/15-client-uat.spec.ts`. Preserve and restore the two affected records when the scenario runs against existing data.

**QA.** The second full run returned HTTP 429 during role-suite sign-in. Reuse one login session per role suite while preserving a fresh browser context for each test and keeping the normal API request limits enabled.
