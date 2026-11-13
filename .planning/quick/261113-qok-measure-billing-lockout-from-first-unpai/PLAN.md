# Measure uninterrupted nonpayment

Each failed retry replaces the most recent failure time, which previously delayed the 60-day lockout. Track the start of the unpaid interval separately and clear it on payment. For existing unpaid subscriptions, initialize the new field from the last known failure time since earlier attempts may be unavailable.
