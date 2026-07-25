-- Channex room-type / rate-plan mapping on rooms (for pushing bookings back).
ALTER TABLE "Room" ADD COLUMN IF NOT EXISTS "supplierRoomTypeId" TEXT;
ALTER TABLE "Room" ADD COLUMN IF NOT EXISTS "supplierRatePlanId" TEXT;
