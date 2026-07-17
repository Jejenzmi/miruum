-- Manual OTA price observations for Rate Intelligence comparison (no integration)
CREATE TABLE "RateObservation" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "note" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RateObservation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "RateObservation_hotelId_channelId_key" ON "RateObservation"("hotelId", "channelId");
CREATE INDEX "RateObservation_hotelId_idx" ON "RateObservation"("hotelId");
ALTER TABLE "RateObservation" ADD CONSTRAINT "RateObservation_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RateObservation" ADD CONSTRAINT "RateObservation_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "SupplyChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
