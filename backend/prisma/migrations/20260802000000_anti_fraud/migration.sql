-- Anti-fraud: booking risk flags + blocklist.
ALTER TABLE "Booking" ADD COLUMN IF NOT EXISTS "flagged" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Booking" ADD COLUMN IF NOT EXISTS "riskScore" INTEGER;
ALTER TABLE "Booking" ADD COLUMN IF NOT EXISTS "riskNote" TEXT;
CREATE TABLE IF NOT EXISTS "FraudBlock" (
  "id" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "reason" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FraudBlock_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "FraudBlock_type_value_key" ON "FraudBlock"("type","value");
CREATE INDEX IF NOT EXISTS "FraudBlock_type_value_active_idx" ON "FraudBlock"("type","value","active");
