# Enforce tenant integrity on required workforce relationships

Add same-company foreign keys where both sides already have a company ID and the relationship is required. Preserve the existing delete actions. Verify an upgrade from the previous schema, schema drift, valid writes, rejection of cross-company links, and normal application workflows on disposable PostgreSQL.
