# Restore hosted bulk imports

The hosted HR account can preview a spreadsheet, then receives HTTP 503 when submitting it. Railway supplies the Redis host, port, and password. The import worker currently initializes only when `REDIS_URL` is set.

Preserve URL precedence and accept the existing split settings when a host is explicitly configured. Use TLS for Upstash. Verify that the queue and worker receive the same connection options, then repeat the hosted import through completion.
