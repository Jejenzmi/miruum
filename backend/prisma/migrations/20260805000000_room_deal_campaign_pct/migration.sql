-- Independent discount tracking for room deals vs hotel campaigns.
ALTER TABLE "Room" ADD COLUMN "dealPct" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Room" ADD COLUMN "campaignPct" INTEGER NOT NULL DEFAULT 0;

-- Backfill: any room currently showing a discount (originalPrice set above price)
-- is treated as an active partner deal so existing deals survive the migration.
UPDATE "Room"
SET "dealPct" = GREATEST(0, LEAST(90, ROUND((1 - "price"::numeric / "originalPrice") * 100)::int))
WHERE "originalPrice" IS NOT NULL AND "originalPrice" > "price";
