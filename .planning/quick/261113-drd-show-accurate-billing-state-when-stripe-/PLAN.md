# Billing availability and return URLs

**Major.** In a production API without Stripe, open Billing and choose Checkout or Billing Portal. Both actions return simulated success. With Stripe configured, an account without a Stripe customer also receives a simulated portal URL. Report unavailability for hosted billing and preserve the demo flow when Stripe is deliberately absent locally.

**Medium.** Retry checkout from a billing page with an existing query string. Appending another `?` produces the wrong return URL. Build redirects from the configured frontend billing page and preserve clear feedback on failed requests.
