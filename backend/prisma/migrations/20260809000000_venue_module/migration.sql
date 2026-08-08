CREATE TABLE "Venue" (
  "id" TEXT NOT NULL, "hotelId" TEXT NOT NULL, "name" TEXT NOT NULL,
  "type" TEXT NOT NULL DEFAULT 'MEETING_ROOM', "bookingMode" TEXT NOT NULL DEFAULT 'INSTANT',
  "description" TEXT NOT NULL DEFAULT '', "imageUrl" TEXT NOT NULL DEFAULT '',
  "area" INTEGER NOT NULL DEFAULT 0, "capTheatre" INTEGER NOT NULL DEFAULT 0, "capClassroom" INTEGER NOT NULL DEFAULT 0,
  "capRound" INTEGER NOT NULL DEFAULT 0, "capStanding" INTEGER NOT NULL DEFAULT 0,
  "priceBasis" TEXT NOT NULL DEFAULT 'FULLDAY', "basePrice" BIGINT NOT NULL DEFAULT 0,
  "active" BOOLEAN NOT NULL DEFAULT true, "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Venue_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Venue_hotelId_idx" ON "Venue"("hotelId");
ALTER TABLE "Venue" ADD CONSTRAINT "Venue_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "VenuePackage" (
  "id" TEXT NOT NULL, "venueId" TEXT NOT NULL, "name" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '', "perPax" BOOLEAN NOT NULL DEFAULT false,
  "price" BIGINT NOT NULL DEFAULT 0, "inclusions" TEXT[], "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VenuePackage_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "VenuePackage_venueId_idx" ON "VenuePackage"("venueId");
ALTER TABLE "VenuePackage" ADD CONSTRAINT "VenuePackage_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "VenueBooking" (
  "id" TEXT NOT NULL, "hotelId" TEXT NOT NULL, "venueId" TEXT NOT NULL, "packageId" TEXT,
  "mode" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'INQUIRY',
  "eventDate" DATE NOT NULL, "slot" TEXT NOT NULL DEFAULT 'FULLDAY', "eventType" TEXT NOT NULL DEFAULT '',
  "pax" INTEGER NOT NULL DEFAULT 0, "customerName" TEXT NOT NULL, "customerPhone" TEXT NOT NULL DEFAULT '',
  "customerEmail" TEXT NOT NULL DEFAULT '', "notes" TEXT NOT NULL DEFAULT '',
  "quotedPrice" BIGINT, "totalPrice" BIGINT, "depositPaid" BIGINT NOT NULL DEFAULT 0, "userId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VenueBooking_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "VenueBooking_hotelId_idx" ON "VenueBooking"("hotelId");
CREATE INDEX "VenueBooking_venueId_idx" ON "VenueBooking"("venueId");
ALTER TABLE "VenueBooking" ADD CONSTRAINT "VenueBooking_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;
