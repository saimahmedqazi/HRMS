ALTER TABLE "subscriptions" ADD COLUMN "unpaidSince" TIMESTAMP(3);

UPDATE "subscriptions"
SET "unpaidSince" = "lastFailedPaymentAt"
WHERE "status" IN ('PAST_DUE', 'SUSPENDED');
