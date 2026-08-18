CREATE TABLE IF NOT EXISTS "GlPeriodClose" (
  "id" TEXT NOT NULL,
  "hotelId" TEXT NOT NULL,
  "asOf" TIMESTAMP(3) NOT NULL,
  "netIncome" BIGINT NOT NULL,
  "journalId" TEXT,
  "createdBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GlPeriodClose_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "GlPeriodClose_hotelId_idx" ON "GlPeriodClose"("hotelId");
