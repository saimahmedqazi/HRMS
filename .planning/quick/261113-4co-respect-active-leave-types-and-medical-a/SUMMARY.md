# Leave request form audit

| Severity | Affected path | Reproduction and fix |
| --- | --- | --- |
| High | Leave dashboard request form | Select a medical file on a sick-leave request, switch to annual leave, and submit. The old request still contained the medical file. The form now binds attachments to the selected policy and clears them when switching leave types. |
| Medium | Leave dashboard request form | Disable a leave type. The old form still offered it and sent a request the API would reject. The form now offers active settings only and explains when no type is available. |
| Medium | Leave dashboard request form | Submit a request missing a required certificate. Browser validation on the hidden file input blocked the submission with no visible error. The form now explains the missing certificate and labels optional uploads correctly. |

Chromium reproduced all three issues on the previous production build. All seven focused tests passed on the updated build, including inspection of the multipart payload, successful retry with a certificate, and live leave and approval workflows against disposable PostgreSQL and Redis. Frontend TypeScript and the production build passed.
