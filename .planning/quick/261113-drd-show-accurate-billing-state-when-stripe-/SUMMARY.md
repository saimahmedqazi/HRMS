# Billing availability and return URLs

Hosted payment actions now return HTTP 503 when Stripe is unconfigured. A configured Stripe portal explains when the company still needs a billing account. Local billing displays a demo message and leaves the customer on the current page. Checkout and portal use the configured frontend billing URL, so retries do not accumulate query parameters. The handoff lists the Stripe settings used by the current implementation.

Backend typecheck, both builds, all 277 Jest tests, and three focused Chromium tests passed. A production-mode API on loopback with disposable PostgreSQL returned HTTP 503 for both unconfigured Stripe actions. Live Stripe and the hosted client deployment remain unverified for this change.
