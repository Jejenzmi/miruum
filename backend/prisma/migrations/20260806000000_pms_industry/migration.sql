-- Guest identity + walk-in flag on bookings (registration card / compliance).
ALTER TABLE "Booking" ADD COLUMN "guestIdType" TEXT;
ALTER TABLE "Booking" ADD COLUMN "guestIdNumber" TEXT;
ALTER TABLE "Booking" ADD COLUMN "guestAddress" TEXT;
ALTER TABLE "Booking" ADD COLUMN "guestNationality" TEXT;
ALTER TABLE "Booking" ADD COLUMN "walkIn" BOOLEAN NOT NULL DEFAULT false;

-- Folio settlement lines.
CREATE TABLE "FolioPayment" (
  "id" TEXT NOT NULL,
  "bookingId" TEXT NOT NULL,
  "method" TEXT NOT NULL,
  "amount" BIGINT NOT NULL,
  "note" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FolioPayment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "FolioPayment_bookingId_idx" ON "FolioPayment"("bookingId");
ALTER TABLE "FolioPayment" ADD CONSTRAINT "FolioPayment_bookingId_fkey"
  FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Room / unit blocks (OOO, maintenance, hold).
CREATE TABLE "RoomBlock" (
  "id" TEXT NOT NULL,
  "hotelId" TEXT NOT NULL,
  "roomId" TEXT NOT NULL,
  "roomUnitId" TEXT,
  "dateFrom" DATE NOT NULL,
  "dateTo" DATE NOT NULL,
  "rooms" INTEGER NOT NULL DEFAULT 1,
  "kind" TEXT NOT NULL DEFAULT 'OOO',
  "reason" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RoomBlock_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "RoomBlock_hotelId_idx" ON "RoomBlock"("hotelId");
CREATE INDEX "RoomBlock_roomId_idx" ON "RoomBlock"("roomId");
