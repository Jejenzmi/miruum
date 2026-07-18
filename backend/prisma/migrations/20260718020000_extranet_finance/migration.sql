-- Extranet finance suite: Promo/Campaign registration, Advance Deposit, Monthly Invoice

-- Advance Deposit balance on the hotel
ALTER TABLE "Hotel" ADD COLUMN "depositBalance" BIGINT NOT NULL DEFAULT 0;

-- Promo & Campaign self-registration
CREATE TABLE "HotelCampaign" (
  "id" TEXT NOT NULL,
  "hotelId" TEXT NOT NULL,
  "type" TEXT NOT NULL DEFAULT 'FLASH_SALE',
  "name" TEXT NOT NULL,
  "discountPct" INTEGER NOT NULL DEFAULT 0,
  "startDate" TIMESTAMP(3) NOT NULL,
  "endDate" TIMESTAMP(3) NOT NULL,
  "minNights" INTEGER NOT NULL DEFAULT 1,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "applied" BOOLEAN NOT NULL DEFAULT false,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "HotelCampaign_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "HotelCampaign_hotelId_idx" ON "HotelCampaign"("hotelId");
CREATE INDEX "HotelCampaign_status_idx" ON "HotelCampaign"("status");
ALTER TABLE "HotelCampaign" ADD CONSTRAINT "HotelCampaign_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Advance Deposit ledger
CREATE TABLE "DepositTxn" (
  "id" TEXT NOT NULL,
  "hotelId" TEXT NOT NULL,
  "kind" TEXT NOT NULL DEFAULT 'TOPUP',
  "amount" BIGINT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "note" TEXT,
  "period" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "confirmedAt" TIMESTAMP(3),
  CONSTRAINT "DepositTxn_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "DepositTxn_hotelId_idx" ON "DepositTxn"("hotelId");
CREATE INDEX "DepositTxn_status_idx" ON "DepositTxn"("status");
ALTER TABLE "DepositTxn" ADD CONSTRAINT "DepositTxn_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Monthly invoice per hotel
CREATE TABLE "HotelInvoice" (
  "id" TEXT NOT NULL,
  "hotelId" TEXT NOT NULL,
  "period" TEXT NOT NULL,
  "commissionOwed" BIGINT NOT NULL DEFAULT 0,
  "payoutOwed" BIGINT NOT NULL DEFAULT 0,
  "bookingsCount" INTEGER NOT NULL DEFAULT 0,
  "offsetFromDeposit" BIGINT NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "dueDate" TIMESTAMP(3) NOT NULL,
  "paidAt" TIMESTAMP(3),
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "HotelInvoice_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "HotelInvoice_hotelId_period_key" ON "HotelInvoice"("hotelId", "period");
CREATE INDEX "HotelInvoice_hotelId_idx" ON "HotelInvoice"("hotelId");
ALTER TABLE "HotelInvoice" ADD CONSTRAINT "HotelInvoice_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
