# Request throttling and trusted client IP resolution

- Enforce the configured API request limits and tighten sensitive anonymous authentication routes.
- Use Express client IP resolution with an explicit trusted proxy allowlist for authentication, request audit context, and attendance.
- Make failed authentication counts atomic and verify authentication and attendance through local HTTP and browser fixtures.
