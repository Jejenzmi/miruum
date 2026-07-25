-- Industry-standard extranet onboarding: structured location, star, legal/tax, payout bank, policy.
ALTER TABLE "PartnerApplication" ADD COLUMN IF NOT EXISTS "regionId" TEXT;
ALTER TABLE "PartnerApplication" ADD COLUMN IF NOT EXISTS "lat" DOUBLE PRECISION;
ALTER TABLE "PartnerApplication" ADD COLUMN IF NOT EXISTS "lng" DOUBLE PRECISION;
ALTER TABLE "PartnerApplication" ADD COLUMN IF NOT EXISTS "starRating" INTEGER;
ALTER TABLE "PartnerApplication" ADD COLUMN IF NOT EXISTS "legalName" TEXT;
ALTER TABLE "PartnerApplication" ADD COLUMN IF NOT EXISTS "businessRegNo" TEXT;
ALTER TABLE "PartnerApplication" ADD COLUMN IF NOT EXISTS "taxId" TEXT;
ALTER TABLE "PartnerApplication" ADD COLUMN IF NOT EXISTS "bankName" TEXT;
ALTER TABLE "PartnerApplication" ADD COLUMN IF NOT EXISTS "bankAccount" TEXT;
ALTER TABLE "PartnerApplication" ADD COLUMN IF NOT EXISTS "bankHolder" TEXT;
ALTER TABLE "PartnerApplication" ADD COLUMN IF NOT EXISTS "cancellationPolicy" TEXT;
ALTER TABLE "Hotel" ADD COLUMN IF NOT EXISTS "legalName" TEXT;
ALTER TABLE "Hotel" ADD COLUMN IF NOT EXISTS "businessRegNo" TEXT;
ALTER TABLE "Hotel" ADD COLUMN IF NOT EXISTS "taxId" TEXT;
ALTER TABLE "Hotel" ADD COLUMN IF NOT EXISTS "payoutBankName" TEXT;
ALTER TABLE "Hotel" ADD COLUMN IF NOT EXISTS "payoutBankAccount" TEXT;
ALTER TABLE "Hotel" ADD COLUMN IF NOT EXISTS "payoutBankHolder" TEXT;
ALTER TABLE "Hotel" ADD COLUMN IF NOT EXISTS "cancellationPolicy" TEXT;
