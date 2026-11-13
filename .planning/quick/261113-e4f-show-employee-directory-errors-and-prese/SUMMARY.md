# Employee directory recovery

Employees and Team Members now distinguish a failed list request from an empty result. Retrying keeps the current search, filters, and page. Directory and filter queries include the signed-in user and active tenant in their cache keys. The empty state only suggests onboarding for roles that have the onboarding action.

The frontend production build and its TypeScript check passed. A focused Chromium test simulated a failed search and verified the error, retry, recovered result, and preserved search text. The test used mocked API responses. The full browser suite was not rerun for this change.
