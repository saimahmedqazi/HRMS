# Refresh the authenticated profile after sign-in

CI reports HTTP 200 from sign-in but the dashboard returns to login. The profile refetch can reuse an initial anonymous request while it is in flight. Cancel the previous profile query before refetching and forward TanStack Query's abort signal to fetch. Verify with a delayed anonymous profile response in Chromium.
