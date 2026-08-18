-- General Ledger (double-entry accounting)
CREATE TABLE IF NOT EXISTS "GlAccount" (
  "id" TEXT NOT NULL,
  "hotelId" TEXT,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "normalBalance" TEXT NOT NULL,
  "parentCode" TEXT,
  "isPostable" BOOLEAN NOT NULL DEFAULT true,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GlAccount_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "GlAccount_hotelId_code_key" ON "GlAccount"("hotelId", "code");
CREATE INDEX IF NOT EXISTS "GlAccount_hotelId_idx" ON "GlAccount"("hotelId");

CREATE TABLE IF NOT EXISTS "GlJournal" (
  "id" TEXT NOT NULL,
  "hotelId" TEXT NOT NULL,
  "date" TIMESTAMP(3) NOT NULL,
  "ref" TEXT,
  "source" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "createdBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GlJournal_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "GlJournal_hotelId_date_idx" ON "GlJournal"("hotelId", "date");
CREATE INDEX IF NOT EXISTS "GlJournal_hotelId_ref_idx" ON "GlJournal"("hotelId", "ref");
CREATE INDEX IF NOT EXISTS "GlJournal_source_idx" ON "GlJournal"("source");

CREATE TABLE IF NOT EXISTS "GlLine" (
  "id" TEXT NOT NULL,
  "journalId" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "debit" BIGINT NOT NULL DEFAULT 0,
  "credit" BIGINT NOT NULL DEFAULT 0,
  "memo" TEXT,
  CONSTRAINT "GlLine_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "GlLine_journalId_idx" ON "GlLine"("journalId");
CREATE INDEX IF NOT EXISTS "GlLine_accountId_idx" ON "GlLine"("accountId");

DO $$ BEGIN
  ALTER TABLE "GlLine" ADD CONSTRAINT "GlLine_journalId_fkey" FOREIGN KEY ("journalId") REFERENCES "GlJournal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "GlLine" ADD CONSTRAINT "GlLine_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "GlAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
