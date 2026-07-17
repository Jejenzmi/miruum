import type { PrismaClient } from "@prisma/client";
import { httpConnector, type GatewayConfig } from "./gateway.js";

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
  city?: string;
  externalId?: string | null;
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

/** Apply a supply source's pricing rule to a nett base price.
 *  - feeIncluded → basePrice is final (no markup)
 *  - NOMINAL     → basePrice + flat Rupiah markup
 *  - PCT (default)→ basePrice × (1 + commissionPct/100)
 *  Returns the guest-facing price and the effective markup % (for reporting). */
export function applyMarkup(
  base: number,
  ch: { feeIncluded?: boolean; markupType?: string; markupNominal?: number; commissionPct?: number },
): { price: number; markupPct: number } {
  if (ch.feeIncluded) return { price: round1k(base), markupPct: 0 };
  if (ch.markupType === "NOMINAL") {
    const price = round1k(base + (ch.markupNominal ?? 0));
    return { price, markupPct: base > 0 ? Math.round(((price - base) / base) * 1000) / 10 : 0 };
  }
  const pct = ch.commissionPct ?? 0;
  return { price: round1k(base * (1 + pct / 100)), markupPct: pct };
}

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

// An OTA sub-agent produces offers ONLY once its real B2B API is connected
// (connectorType = HTTP with a gateway config). Until then it stays empty — no
// simulated competitor prices — because Miruum has no contract with that OTA yet.
// Connect the API in Back Office → Channel Manager and offers start flowing.
function isConnectedOta(c: { type: string; connectorType?: string | null; config?: unknown }): boolean {
  return c.type === "OTA" && c.connectorType === "HTTP" && !!c.config;
}

// Resolve the connector for a channel from its stored config. HTTP → real B2B
// API via the gateway; otherwise a built-in mock (so demos always work).
export function getConnector(channel: { code: string; connectorType?: string | null; config?: unknown }): OtaConnector {
  if (channel.connectorType === "HTTP" && channel.config && typeof channel.config === "object") {
    return httpConnector(channel.code, channel.config as GatewayConfig);
  }
  return CONNECTORS[channel.code] ?? otaConnector(channel.code, 1.0, 0.05, `${channel.code.toLowerCase()}.example`);
}

/**
 * Pull offers from every relevant source for every hotel, apply Miruum's markup,
 * upsert HotelOffer rows, then cache the cheapest available offer back onto the
 * hotel (priceFrom + channelId) so lists/search show the best aggregated price.
 */
export async function syncOffers(prisma: PrismaClient): Promise<{ hotels: number; offers: number }> {
  const channels = await prisma.supplyChannel.findMany({ where: { active: true } });
  const hotels = await prisma.hotel.findMany();
  let offerCount = 0;

  for (const hotel of hotels) {
    // sources = own Channel Manager (DIRECT) + any OTA whose real API is connected.
    // Mock/uncontracted OTA sub-agents are skipped → no fake competitor offers.
    const sources = channels.filter((c) => c.type === "DIRECT" || isConnectedOta(c));

    for (const ch of sources) {
      const conn = getConnector(ch);
      let r: OfferResult;
      try {
        r = await conn.fetchOffer(hotel);
      } catch (e: any) {
        // A real B2B API failed → keep any last-known offer, just mark it stale/unavailable.
        console.warn(`[connector] ${ch.code} fetch failed for ${hotel.slug}: ${e.message}`);
        await prisma.hotelOffer.updateMany({
          where: { hotelId: hotel.id, channelId: ch.id },
          data: { available: false, fetchedAt: new Date() },
        });
        continue;
      }
      // Apply Miruum's pricing rule for this source: fee-included = no markup;
      // otherwise markup is a percentage or a flat nominal (Rp).
      const { price, markupPct } = applyMarkup(r.basePrice, ch as any);
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
      // Only record the cheapest SOURCE — never write the marked-up price back
      // into priceFrom, or it would feed the mock base and compound each sync.
      await prisma.hotel.update({
        where: { id: hotel.id },
        data: { channelId: best.channelId },
      });
    }
  }
  return { hotels: hotels.length, offers: offerCount };
}
