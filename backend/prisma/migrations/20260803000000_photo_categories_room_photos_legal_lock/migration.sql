-- HotelPhoto: category + per-room association (for channel-manager API mapping)
ALTER TABLE "HotelPhoto" ADD COLUMN IF NOT EXISTS "category" TEXT NOT NULL DEFAULT 'OTHER';
ALTER TABLE "HotelPhoto" ADD COLUMN IF NOT EXISTS "roomId" TEXT;

CREATE INDEX IF NOT EXISTS "HotelPhoto_hotelId_category_idx" ON "HotelPhoto"("hotelId", "category");
CREATE INDEX IF NOT EXISTS "HotelPhoto_roomId_idx" ON "HotelPhoto"("roomId");

DO $$ BEGIN
  ALTER TABLE "HotelPhoto" ADD CONSTRAINT "HotelPhoto_roomId_fkey"
    FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Hotel: lock legal & payout once the partner submits it (only admin can change afterwards)
ALTER TABLE "Hotel" ADD COLUMN IF NOT EXISTS "legalLockedAt" TIMESTAMP(3);
