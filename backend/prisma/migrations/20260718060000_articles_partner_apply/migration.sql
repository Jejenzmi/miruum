-- Articles/blog + Partner (property) self-registration

CREATE TABLE "Article" (
  "id" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "excerpt" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "coverImage" TEXT NOT NULL,
  "category" TEXT NOT NULL DEFAULT 'Tips',
  "published" BOOLEAN NOT NULL DEFAULT true,
  "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Article_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Article_slug_key" ON "Article"("slug");
CREATE INDEX "Article_published_idx" ON "Article"("published");

CREATE TABLE "PartnerApplication" (
  "id" TEXT NOT NULL,
  "propertyName" TEXT NOT NULL,
  "propertyType" TEXT NOT NULL DEFAULT 'HOTEL',
  "city" TEXT NOT NULL,
  "address" TEXT NOT NULL,
  "picName" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "website" TEXT,
  "roomCount" INTEGER,
  "note" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PartnerApplication_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PartnerApplication_status_idx" ON "PartnerApplication"("status");
