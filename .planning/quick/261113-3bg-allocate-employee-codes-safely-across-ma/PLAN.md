# Allocate employee codes across manual and bulk onboarding

Reproduce the collision with a custom code imported into a disposable PostgreSQL tenant. Coordinate employee creation within each tenant, preserve the existing `EMP-` format, and skip occupied codes during manual onboarding. Verify simultaneous creates, a mixed import and manual transaction, and tenant isolation.
