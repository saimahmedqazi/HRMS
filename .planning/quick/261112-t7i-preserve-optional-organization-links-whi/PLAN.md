# Protect optional organization links and shift assignments

Add same-company foreign keys to optional organization and payroll links. Keep the existing delete behavior by clearing only the optional field. Backfill shift assignment ownership from the linked employee, then enforce ownership against both parents. Verify populated upgrades, clean migrations, and the application workflows that read and write these records.
