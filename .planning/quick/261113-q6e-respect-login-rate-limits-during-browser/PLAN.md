# Respect the login rate limit during browser QA

CI role setup stopped at the login page in six suites after the preceding tests passed. The shared setup has no HTTP status diagnostics and all browser logins share one runner IP. Capture the login response and honor a short 429 Retry-After once. Report other login failures directly and keep the application's rate limits in place.
