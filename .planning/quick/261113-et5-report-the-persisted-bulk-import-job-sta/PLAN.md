# Bulk import queue response

**Medium.** When Redis fails to acknowledge an import submission, the API can report `QUEUED` even after storing `FAILED`. Return the persisted state, preserving progress if a worker already claimed the job.
