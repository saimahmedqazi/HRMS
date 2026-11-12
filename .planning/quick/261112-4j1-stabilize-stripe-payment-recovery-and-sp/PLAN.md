# Stripe payment recovery and spreadsheet uploads

- Confirm the duplicate event and suspension recovery defects in the billing state transitions. Apply billing events and their database side effects together and distinguish non-payment lockouts from administrator actions.
- Update the installed multipart and workbook parsers and enforce a size limit before spreadsheet parsing.
- Retest billing transitions, migrations, and imports against isolated local fixtures.
