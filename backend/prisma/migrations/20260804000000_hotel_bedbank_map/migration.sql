ALTER TABLE "Hotel" ADD COLUMN IF NOT EXISTS "bedbankCode" TEXT;
CREATE INDEX IF NOT EXISTS "Hotel_bedbankCode_idx" ON "Hotel"("bedbankCode");
