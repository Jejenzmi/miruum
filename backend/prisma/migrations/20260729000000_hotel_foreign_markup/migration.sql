-- Nationality (market) pricing: per-hotel foreign markup override (null = global default).
ALTER TABLE "Hotel" ADD COLUMN IF NOT EXISTS "foreignMarkupPct" INTEGER;
