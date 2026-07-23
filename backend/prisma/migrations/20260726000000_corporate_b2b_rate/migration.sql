-- Negotiated B2B discount per corporate account (percent off the public rate).
ALTER TABLE "Corporate" ADD COLUMN IF NOT EXISTS "discountPct" INTEGER NOT NULL DEFAULT 0;
