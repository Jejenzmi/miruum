import type { PrismaClient } from "@prisma/client";

// ─────────────────────────── OTA connectors ───────────────────────────
// Miruum aggregates rate & availability from multiple supply sources. Each
// source is a connector with a common interface. The mock implementations below
// derive deterministic prices from the canonical hotel so the aggregation logic
// (compare + pick-best + markup) can be built and demoed end-to-end. Swap a
// connector's `fetchOffer` for a real Tiket.com/Agoda/Traveloka API call once
// B2B credentials are available — nothing else changes.

export interface OfferResult {
  basePrice: number; // supplier nett price / night (rupiah)
  available: boolean;
  roomsLeft: number;
  deeplink?: string;
  supplierRef?: string;
}

export interface HotelRef {
  slug: string;
  name: string;
  priceFrom: number;
}

export interface OtaConnector {
  code: string;
  fetchOffer(hotel: HotelRef): Promise<OfferResult>;
}

// Stable FNV-1a hash → deterministic pseudo-randomness (no Math.random, so
// re-syncs are idempotent).
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
// Factor in [1-spread, 1+spread] derived from a seed.
function jitter(seed: string, spread: number): number {
  return 1 - spread + ((hash(seed) % 1000) / 1000) * 2 * spread;
}
const round1k = (n: number) => Math.max(1000, Math.round(n / 1000) * 1000);

// Own Channel Manager — the hotel's own managed rate.
const directConnector: OtaConnector = {
  code: "DIRECT",
  async fetchOffer(h) {
    return { basePrice: h.priceFrom, available: true, roomsLeft: 3 + (hash(h.slug) % 6) };
  },
};

// Mock OTA — nett price relative to the canonical rate, with per-hotel jitter.
function otaConnector(code: string, factor: number, spread: number, domain: string): OtaConnector {
  return {
    code,
    async fetchOffer(h) {
      const base = round1k(h.priceFrom * factor * jitter(`${h.slug}:${code}`, spread));
      const available = hash(`${h.slug}:${code}:av`) % 7 !== 0; // ~1 in 7 sold out
      return {
        basePrice: base,
        available,
        roomsLeft: available ? 1 + (hash(`${h.slug}:${code}:r`) % 8) : 0,
        deeplink: `https://www.${domain}/hotel/${h.slug}`,
        supplierRef: `${code}-${hash(h.slug) % 100000}`,
      };
    },
  };
}

export const CONNECTORS: Record<string, OtaConnector> = {
  DIRECT: directConnector,
  TIKETCOM: otaConnector("TIKETCOM", 0.99, 0.05, "tiket.com"),
  AGODA: otaConnector("AGODA", 0.95, 0.06, "agoda.com"),
  TRAVELOKA: otaConnector("TRAVELOKA", 1.02, 0.05, "traveloka.com"),
};

// Which extra OTA channels also list a given hotel (mapping of the same
// canonical hotel across sources). The hotel's origin channel is always kept.
function listsHotel(slug: string, channelCode: string): boolean {
  return hash(`${slug}:${channelCode}:list`) % 3 !== 0; // ~2 of 3
}

/**
 * Pull offers from every relevant source for every hotel, apply Miruum's markup,
 * upsert HotelOffer rows, then cache the cheapest available offer back onto the
 * hotel (priceFrom + channelId) so lists/search show the best aggregated price.
 */
export async function syncOffers(prisma: PrismaClient): Promise<{ hotels: number; offers: number }> {
  const channels = await prisma.supplyChannel.findMany({ where: { active: true } });
  const byId: Record<string, (typeof channels)[number]> = Object.fromEntries(channels.map((c) => [c.id, c]));
  const hotels = await prisma.hotel.findMany();
  let offerCount = 0;

  for (const hotel of hotels) {
    const originCode = hotel.channelId ? byId[hotel.channelId]?.code : "DIRECT";
    // sources = origin channel + OTA channels that also list this hotel
    const sources = channels.filter(
      (c) => c.code === originCode || (c.type === "OTA" && listsHotel(hotel.slug, c.code))
    );

    for (const ch of sources) {
      const conn = CONNECTORS[ch.code];
      if (!conn) continue;
      const r = await conn.fetchOffer(hotel);
      const markupPct = ch.commissionPct; // Miruum margin on top of nett
      const price = round1k(r.basePrice * (1 + markupPct / 100));
      await prisma.hotelOffer.upsert({
        where: { hotelId_channelId: { hotelId: hotel.id, channelId: ch.id } },
        create: {
          hotelId: hotel.id, channelId: ch.id, basePrice: r.basePrice, markupPct, price,
          available: r.available, roomsLeft: r.roomsLeft, deeplink: r.deeplink, supplierRef: r.supplierRef,
        },
        update: {
          basePrice: r.basePrice, markupPct, price, available: r.available,
          roomsLeft: r.roomsLeft, deeplink: r.deeplink, supplierRef: r.supplierRef, fetchedAt: new Date(),
        },
      });
      offerCount++;
    }

    // Drop stale offers for sources that no longer list this hotel.
    await prisma.hotelOffer.deleteMany({
      where: { hotelId: hotel.id, channelId: { notIn: sources.map((s) => s.id) } },
    });

    // Cache the cheapest available offer as the hotel's headline price + source.
    const best = await prisma.hotelOffer.findFirst({
      where: { hotelId: hotel.id, available: true },
      orderBy: { price: "asc" },
    });
    if (best) {
      await prisma.hotel.update({
        where: { id: hotel.id },
        data: { priceFrom: best.price, channelId: best.channelId },
      });
    }
  }
  return { hotels: hotels.length, offers: offerCount };
}
