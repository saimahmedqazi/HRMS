# Employee profile load errors

**Medium.** Open an employee profile while the API returns HTTP 503. The page says the profile is missing. Preserve the missing-profile state for 404s and show a retry for temporary failures. Keep cached profiles tied to the current viewer and tenant.
