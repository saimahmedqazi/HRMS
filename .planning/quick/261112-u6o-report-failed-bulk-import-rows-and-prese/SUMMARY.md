# Bulk import results and downloadable error reports

| Severity | Affected files | Finding and fix |
| --- | --- | --- |
| Medium | Bulk import page | A completed request always displayed a success banner and discarded skipped or failed row details. The portal now shows imported and failed counts and offers a CSV report from preview and execution. The input stays fixed while a request is running. |
| Medium | `bulk-import.service.ts` | Row numbers were calculated from the compact list after empty rows were removed. Preview and execution now retain the actual worksheet row and reuse the same validated employee data. An execution where every row fails returns a report and commits nothing. |
| Medium | `bulk-import.service.ts` | Preview allowed invalid salary values, and execution silently omitted numeric zero. Validation now flags salary values outside the supported range and preserves zero. |

The Chromium regression downloaded the workbook, entered a valid row and an invalid row separated by an empty worksheet row, and verified that the valid employee was committed. The portal and CSV identified the invalid record as row 4. Retrying the same import returned zero imported and two failed rows. The test completed password setup for the imported employee. Backend tests also covered an all-failed import, invalid salary, and zero salary.

A separate Chromium smoke used a CSV and introduced an account conflict after validation. The page showed zero imported and one failed, offered a downloadable report, and created no employee. The full run passed 236 backend tests and 131 Chromium tests. Both production builds and both TypeScript checks passed.

The background worker requirement `BULK-02` remains open. This change is local.
