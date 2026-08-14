CREATE TABLE "TranslationOverride" (
  "id" TEXT NOT NULL, "source" TEXT NOT NULL, "textId" TEXT NOT NULL, "textEn" TEXT NOT NULL,
  "surface" TEXT, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TranslationOverride_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TranslationOverride_source_key" ON "TranslationOverride"("source");
