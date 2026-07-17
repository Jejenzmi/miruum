// AI rate shopper — automatically finds each Miruum hotel's nightly price on
// external OTAs (Tiket.com, Agoda, Traveloka…) via an LLM with web search, then
// writes the result into RateObservation so it appears in Rate Intelligence with
// NO manual input. Dormant until an AI API key is set in Back Office → Integrasi.
//
// Honest by design: prices are AI estimates from live search — labeled source=AI
// and timestamped. Never fabricates: a hotel it can't price is simply skipped.

import { prisma } from "./prisma.js";
import { getSettings } from "./settings.js";

interface Ota { id: string; code: string; name: string }
interface HotelRef { id: string; name: string; city: string }

// Ask the AI to web-search the same hotel on each OTA and return strict JSON.
async function shopHotel(hotel: HotelRef, otas: Ota[], cfg: { apiKey: string; model: string }): Promise<Record<string, number>> {
  const codes = otas.map((o) => o.code);
  const otaList = otas.map((o) => `${o.name} (kunci JSON: "${o.code}")`).join(", ");
  const prompt =
    `Kamu asisten rate-shopping hotel. Gunakan web search untuk menemukan HARGA KAMAR TERMURAH per malam ` +
    `(mata uang Rupiah, angka bulat tanpa titik/koma) untuk hotel berikut di situs OTA yang diminta.\n\n` +
    `Hotel: "${hotel.name}"\nKota: ${hotel.city}, Indonesia\nOTA: ${otaList}\n\n` +
    `Balas HANYA satu objek JSON valid, tanpa teks lain, dengan kunci persis: ${codes.map((c) => `"${c}"`).join(", ")}. ` +
    `Nilai = harga (number) bila ditemukan, atau null bila tidak yakin/tidak ada. Contoh: {${codes.map((c) => `"${c}": 350000`).join(", ")}}.`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": cfg.apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: cfg.model,
      max_tokens: 1024,
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 2 }],
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`AI ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data: any = await res.json();
  const text = (data.content || []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n");
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("AI tidak mengembalikan JSON");
  const parsed = JSON.parse(m[0]);
  const out: Record<string, number> = {};
  for (const o of otas) {
    const v = parsed[o.code];
    if (typeof v === "number" && v > 0) out[o.code] = Math.round(v);
  }
  return out;
}

export function aiConfigured(s: Record<string, string>): boolean {
  return s.ai_enabled === "1" && !!s.ai_api_key;
}

// Is a hotel due for a scheduled check? freq = runs/day; allow a 1h tick tolerance.
function isDue(h: { rateShopFreq: number; rateShoppedAt: Date | null }): boolean {
  if (h.rateShopFreq <= 0) return false;
  if (!h.rateShoppedAt) return true;
  const thresholdMs = (24 / h.rateShopFreq - 1) * 3600_000;
  return Date.now() - h.rateShoppedAt.getTime() >= thresholdMs;
}

// Run the shopper. force=true → every hotel (admin manual). force=false → only
// hotels with a Miruum Intelligent schedule (rateShopFreq>0) that are due now.
export async function runRateShopping(force = false, limitHotels = 100): Promise<{ hotels: number; updated: number; skipped: number; ok: boolean }> {
  const s = await getSettings();
  if (!aiConfigured(s)) return { hotels: 0, updated: 0, skipped: 0, ok: false };
  const model = s.ai_model || "claude-sonnet-5";
  const otas = await prisma.supplyChannel.findMany({ where: { type: "OTA", active: true }, select: { id: true, code: true, name: true } });
  if (!otas.length) return { hotels: 0, updated: 0, skipped: 0, ok: true };
  const all = await prisma.hotel.findMany({
    where: force ? {} : { rateShopFreq: { gt: 0 } }, take: limitHotels,
    select: { id: true, name: true, city: true, rateShopFreq: true, rateShoppedAt: true },
  });
  const hotels = force ? all : all.filter(isDue);

  let updated = 0, skipped = 0;
  for (const h of hotels) {
    try {
      const found = await shopHotel(h, otas, { apiKey: s.ai_api_key, model });
      for (const ota of otas) {
        const price = found[ota.code];
        if (price && price > 0) {
          await prisma.rateObservation.upsert({
            where: { hotelId_channelId: { hotelId: h.id, channelId: ota.id } },
            create: { hotelId: h.id, channelId: ota.id, price, source: "AI", note: "AI web-search" },
            update: { price, source: "AI", note: "AI web-search" },
          });
          updated++;
        }
      }
    } catch (e: any) {
      skipped++;
      console.warn(`[rateshopper] ${h.name}: ${e.message}`);
    } finally {
      await prisma.hotel.update({ where: { id: h.id }, data: { rateShoppedAt: new Date() } }).catch(() => {});
    }
  }
  return { hotels: hotels.length, updated, skipped, ok: true };
}
