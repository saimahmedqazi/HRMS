# Preserve billing state across delayed invoice deliveries

An older invoice success can clear a later invoice failure, and an older failure can mark a newer paid subscription past due. Track the newest invoice applied to each subscription and enforce the ordering in the database update. Use the invoice creation time, not webhook arrival time. Within the same invoice, the existing paid marker takes precedence.
