CREATE TABLE "stripe_invoice_payments" (
    "id" TEXT NOT NULL,
    "paid" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "stripe_invoice_payments_pkey" PRIMARY KEY ("id")
);
