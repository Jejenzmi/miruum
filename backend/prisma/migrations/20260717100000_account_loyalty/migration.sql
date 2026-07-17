-- User: tier + referral
ALTER TABLE "User" ADD COLUMN "lifetimePoints" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "referralCode" TEXT;
ALTER TABLE "User" ADD COLUMN "referredById" TEXT;
CREATE UNIQUE INDEX "User_referralCode_key" ON "User"("referralCode");
-- Booking: post-stay review request
ALTER TABLE "Booking" ADD COLUMN "reviewRequestedAt" TIMESTAMP(3);
-- Promo: claimable
ALTER TABLE "Promo" ADD COLUMN "claimable" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "RecentlyViewed" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "viewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RecentlyViewed_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "RecentlyViewed_userId_hotelId_key" ON "RecentlyViewed"("userId", "hotelId");
CREATE INDEX "RecentlyViewed_userId_idx" ON "RecentlyViewed"("userId");
ALTER TABLE "RecentlyViewed" ADD CONSTRAINT "RecentlyViewed_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecentlyViewed" ADD CONSTRAINT "RecentlyViewed_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "UserVoucher" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "promoId" TEXT NOT NULL,
    "claimedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usedAt" TIMESTAMP(3),
    CONSTRAINT "UserVoucher_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "UserVoucher_userId_promoId_key" ON "UserVoucher"("userId", "promoId");
CREATE INDEX "UserVoucher_userId_idx" ON "UserVoucher"("userId");
ALTER TABLE "UserVoucher" ADD CONSTRAINT "UserVoucher_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserVoucher" ADD CONSTRAINT "UserVoucher_promoId_fkey" FOREIGN KEY ("promoId") REFERENCES "Promo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "HotelQuestion" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "userId" TEXT,
    "authorName" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "answer" TEXT,
    "answeredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HotelQuestion_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "HotelQuestion_hotelId_idx" ON "HotelQuestion"("hotelId");
ALTER TABLE "HotelQuestion" ADD CONSTRAINT "HotelQuestion_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HotelQuestion" ADD CONSTRAINT "HotelQuestion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
