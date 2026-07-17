-- Multi rate-plan per room
CREATE TABLE "RatePlan" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "boardBasis" TEXT NOT NULL DEFAULT 'ROOM_ONLY',
    "refundable" BOOLEAN NOT NULL DEFAULT true,
    "freeCancellation" BOOLEAN NOT NULL DEFAULT false,
    "priceDelta" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "RatePlan_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "RatePlan_roomId_idx" ON "RatePlan"("roomId");
ALTER TABLE "RatePlan" ADD CONSTRAINT "RatePlan_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Booking: chosen rate plan + policy snapshot
ALTER TABLE "Booking" ADD COLUMN "ratePlanId" TEXT;
ALTER TABLE "Booking" ADD COLUMN "ratePlanName" TEXT;
ALTER TABLE "Booking" ADD COLUMN "planRefundable" BOOLEAN;
ALTER TABLE "Booking" ADD COLUMN "planFreeCancellation" BOOLEAN;
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_ratePlanId_fkey" FOREIGN KEY ("ratePlanId") REFERENCES "RatePlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Review sub-scores + photos + verified
ALTER TABLE "Review" ADD COLUMN "scoreCleanliness" DOUBLE PRECISION;
ALTER TABLE "Review" ADD COLUMN "scoreLocation" DOUBLE PRECISION;
ALTER TABLE "Review" ADD COLUMN "scoreStaff" DOUBLE PRECISION;
ALTER TABLE "Review" ADD COLUMN "scoreFacilities" DOUBLE PRECISION;
ALTER TABLE "Review" ADD COLUMN "scoreComfort" DOUBLE PRECISION;
ALTER TABLE "Review" ADD COLUMN "scoreValue" DOUBLE PRECISION;
ALTER TABLE "Review" ADD COLUMN "photos" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Review" ADD COLUMN "verified" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Review" ADD COLUMN "bookingId" TEXT;

-- Hotel property type
ALTER TABLE "Hotel" ADD COLUMN "propertyType" TEXT NOT NULL DEFAULT 'HOTEL';

-- What's nearby
CREATE TABLE "HotelNearby" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'ATTRACTION',
    "distanceKm" DOUBLE PRECISION NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "HotelNearby_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "HotelNearby_hotelId_idx" ON "HotelNearby"("hotelId");
ALTER TABLE "HotelNearby" ADD CONSTRAINT "HotelNearby_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
