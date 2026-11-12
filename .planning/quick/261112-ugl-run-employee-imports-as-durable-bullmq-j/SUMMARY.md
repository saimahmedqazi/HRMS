# Background employee imports

The import request previously processed employee rows before responding. Slow workbooks could keep an HTTP request open until the proxy timed out. The API now accepts the upload with HTTP 202 and returns a job ID. The frontend polls account-scoped status and retains the job link across reloads.

The BullMQ worker commits each employee and its checkpoint in one transaction. PostgreSQL keeps progress and error reports for 24 hours after the job ends. The worker clears the original workbook from its Redis job data after preparing rows and clears prepared rows from PostgreSQL at completion or terminal failure. If Redis loses a job after preparation, reconciliation can recover it from the saved checkpoint. An active Support Mode session retains its existing import access.

The updated migration applied to a fresh PostgreSQL database with no Prisma schema drift. A live Redis and PostgreSQL test verified partial success, worksheet row numbers, report isolation, duplicate retry, and checkpoint recovery. The Chromium regression covers HTTP 202, reports across reloads, and authorization. The local execution environment rejected launching the API and web servers for that browser run.
