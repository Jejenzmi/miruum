-- External supply (bedbank) bookings: source + provider references.
ALTER TABLE "Booking" ADD COLUMN IF NOT EXISTS "source" TEXT NOT NULL DEFAULT 'DIRECT';
ALTER TABLE "Booking" ADD COLUMN IF NOT EXISTS "supplierBookingCode" TEXT;
ALTER TABLE "Hotel" ADD COLUMN IF NOT EXISTS "source" TEXT NOT NULL DEFAULT 'DIRECT';
ALTER TABLE "Hotel" ADD COLUMN IF NOT EXISTS "supplierHotelCode" TEXT;
CREATE INDEX IF NOT EXISTS "Hotel_source_idx" ON "Hotel"("source");
