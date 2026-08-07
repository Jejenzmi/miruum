-- Group booking link + cashier-shift link on payments.
ALTER TABLE "Booking" ADD COLUMN "groupId" TEXT;
ALTER TABLE "FolioPayment" ADD COLUMN "shiftId" TEXT;

CREATE TABLE "BookingGroup" (
  "id" TEXT NOT NULL, "hotelId" TEXT NOT NULL, "name" TEXT NOT NULL,
  "company" TEXT, "contactName" TEXT, "contactPhone" TEXT,
  "checkIn" TIMESTAMP(3) NOT NULL, "checkOut" TIMESTAMP(3) NOT NULL,
  "masterFolio" BOOLEAN NOT NULL DEFAULT true, "notes" TEXT NOT NULL DEFAULT '',
  "createdById" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BookingGroup_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "BookingGroup_hotelId_idx" ON "BookingGroup"("hotelId");

CREATE TABLE "CashierShift" (
  "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "hotelId" TEXT,
  "openingFloat" BIGINT NOT NULL DEFAULT 0, "closingCounted" BIGINT, "expectedCash" BIGINT, "variance" BIGINT,
  "status" TEXT NOT NULL DEFAULT 'OPEN', "note" TEXT NOT NULL DEFAULT '',
  "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "closedAt" TIMESTAMP(3),
  CONSTRAINT "CashierShift_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CashierShift_userId_idx" ON "CashierShift"("userId");

CREATE TABLE "LedgerAccount" (
  "id" TEXT NOT NULL, "hotelId" TEXT, "name" TEXT NOT NULL,
  "contactName" TEXT, "contactPhone" TEXT, "email" TEXT,
  "creditLimit" BIGINT NOT NULL DEFAULT 0, "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LedgerAccount_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "LedgerAccount_hotelId_idx" ON "LedgerAccount"("hotelId");

CREATE TABLE "LedgerEntry" (
  "id" TEXT NOT NULL, "accountId" TEXT NOT NULL, "bookingId" TEXT,
  "type" TEXT NOT NULL, "amount" BIGINT NOT NULL, "note" TEXT NOT NULL DEFAULT '',
  "entryDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LedgerEntry_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "LedgerEntry_accountId_idx" ON "LedgerEntry"("accountId");

ALTER TABLE "FolioPayment" ADD CONSTRAINT "FolioPayment_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "CashierShift"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "BookingGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "LedgerAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
