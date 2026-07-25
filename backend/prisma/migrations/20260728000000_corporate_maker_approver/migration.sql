-- Corporate maker–approver workflow.
ALTER TABLE "User"    ADD COLUMN IF NOT EXISTS "corporateRole"  TEXT;
ALTER TABLE "Booking" ADD COLUMN IF NOT EXISTS "approvalStatus" TEXT;
ALTER TABLE "Booking" ADD COLUMN IF NOT EXISTS "requestedById"  TEXT;
ALTER TABLE "Booking" ADD COLUMN IF NOT EXISTS "approvedById"   TEXT;
ALTER TABLE "Booking" ADD COLUMN IF NOT EXISTS "approvedAt"     TIMESTAMP(3);
ALTER TABLE "Booking" ADD COLUMN IF NOT EXISTS "rejectReason"   TEXT;
-- Existing corporate users act as ADMIN (can manage users + approve).
UPDATE "User" SET "corporateRole" = 'ADMIN' WHERE role = 'CORPORATE' AND "corporateRole" IS NULL;
