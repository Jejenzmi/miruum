CREATE TABLE "PosProduct" (
  "id" TEXT NOT NULL, "hotelId" TEXT NOT NULL, "outlet" TEXT NOT NULL,
  "category" TEXT, "name" TEXT NOT NULL, "price" BIGINT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true, "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PosProduct_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PosProduct_hotelId_idx" ON "PosProduct"("hotelId");

CREATE TABLE "PosSale" (
  "id" TEXT NOT NULL, "hotelId" TEXT NOT NULL, "outlet" TEXT NOT NULL,
  "settle" TEXT NOT NULL, "bookingId" TEXT, "method" TEXT, "customerName" TEXT,
  "total" BIGINT NOT NULL, "shiftId" TEXT, "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PosSale_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PosSale_hotelId_idx" ON "PosSale"("hotelId");
CREATE INDEX "PosSale_shiftId_idx" ON "PosSale"("shiftId");

CREATE TABLE "PosSaleItem" (
  "id" TEXT NOT NULL, "saleId" TEXT NOT NULL, "name" TEXT NOT NULL,
  "price" BIGINT NOT NULL, "qty" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "PosSaleItem_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PosSaleItem_saleId_idx" ON "PosSaleItem"("saleId");
ALTER TABLE "PosSaleItem" ADD CONSTRAINT "PosSaleItem_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "PosSale"("id") ON DELETE CASCADE ON UPDATE CASCADE;
