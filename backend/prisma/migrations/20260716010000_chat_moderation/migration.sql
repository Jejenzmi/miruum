-- Chat moderation: hide policy-violating messages (contact sharing / off-system deals)
ALTER TABLE "HotelMessage" ADD COLUMN "flagged" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "HotelMessage" ADD COLUMN "violation" TEXT;
