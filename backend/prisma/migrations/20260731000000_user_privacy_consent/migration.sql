-- UU PDP: record when a user consented to the Privacy Policy.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "privacyConsentAt" TIMESTAMP(3);
