# Ignore late failures for paid Stripe invoices

Record successful payments by invoice ID in the webhook transaction. Serialize success and failure processing for the same invoice so a late failure cannot mark a paid invoice past due or notify the customer. Retain event-ID deduplication and preserve failures for different invoices.
