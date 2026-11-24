ALTER TABLE "users"
  ADD COLUMN "lastLoginLatitude" DOUBLE PRECISION,
  ADD COLUMN "lastLoginLongitude" DOUBLE PRECISION,
  ADD COLUMN "lastLoginLocationAccuracy" DOUBLE PRECISION,
  ADD COLUMN "lastLoginLocationSource" TEXT,
  ADD COLUMN "lastLoginLocationCapturedAt" TIMESTAMP(3),
  ADD COLUMN "lastLoginLocationSessionId" TEXT;
