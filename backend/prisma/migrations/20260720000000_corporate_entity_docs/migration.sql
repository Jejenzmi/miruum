-- Detailed entity classification + uploaded legality documents for corporate/government accounts.
ALTER TABLE "Corporate" ADD COLUMN IF NOT EXISTS "entityType" TEXT;
ALTER TABLE "CorporateApplication" ADD COLUMN IF NOT EXISTS "entityType" TEXT;
ALTER TABLE "CorporateApplication" ADD COLUMN IF NOT EXISTS "documents" JSONB;
