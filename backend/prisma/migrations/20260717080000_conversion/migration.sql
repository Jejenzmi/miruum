-- Harga turun badge
ALTER TABLE "Hotel" ADD COLUMN "priceBefore" INTEGER;
-- Bayar di hotel
ALTER TABLE "Booking" ADD COLUMN "payAtHotel" BOOLEAN NOT NULL DEFAULT false;
-- Price alerts
CREATE TABLE "PriceAlert" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "lastNotifiedPrice" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PriceAlert_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PriceAlert_userId_hotelId_key" ON "PriceAlert"("userId", "hotelId");
CREATE INDEX "PriceAlert_hotelId_idx" ON "PriceAlert"("hotelId");
ALTER TABLE "PriceAlert" ADD CONSTRAINT "PriceAlert_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PriceAlert" ADD CONSTRAINT "PriceAlert_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
