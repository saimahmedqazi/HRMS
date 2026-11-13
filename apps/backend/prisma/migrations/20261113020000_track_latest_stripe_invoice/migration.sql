ALTER TABLE "subscriptions"
ADD COLUMN "latestStripeInvoiceId" TEXT,
ADD COLUMN "latestStripeInvoiceAt" TIMESTAMP(3);
