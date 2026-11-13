# Make payroll writes atomic

Reproduce partial payroll writes, duplicate notices, and default structure loss using disposable PostgreSQL. Serialize payroll operations within the company and commit related writes together. Preserve recalculation of existing payslips and verify both failure rollback and concurrent reruns.
