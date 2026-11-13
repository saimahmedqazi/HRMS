# Send each billing retry notice once

The daily job repeatedly sends the same notice while Stripe's failed attempt count stays unchanged. Claim the attempt in the notification transaction, skip stale candidates and zero attempts, and reset the claim after payment.
