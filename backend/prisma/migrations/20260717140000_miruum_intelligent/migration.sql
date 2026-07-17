-- Miruum Intelligent: per-hotel auto rate-check schedule
ALTER TABLE "Hotel" ADD COLUMN "rateShopFreq" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Hotel" ADD COLUMN "rateShoppedAt" TIMESTAMP(3);
