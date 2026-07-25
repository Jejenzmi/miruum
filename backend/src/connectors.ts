import type { PrismaClient } from "@prisma/client";
import { httpConnector, type GatewayConfig } from "./gateway.js";

// ─────────────────────────── OTA connectors ───────────────────────────
// Miruum aggregates rate & availability from multiple supply sources. Each
// source is a connector with a common interface. Only REAL sources produce
// offers: the hotel's own managed rate (DIRECT) and any OTA whose live B2B API
// is connected (connectorType HTTP + gateway config). There are no simulated
// competitor prices — an uncontracted OTA simply yields nothing.

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
  roomsLeft?: number; // real total room stock (for the DIRECT own-rate offer)
}

export interface OtaConnector {
  code: string;
  fetchOffer(hotel: HotelRef): Promise<OfferResult>;
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

// Own Channel Manager — the hotel's own managed rate. Price is the real
// priceFrom; availability is authoritative from RoomAvailability at booking, so
// the offer just carries the real total room stock as a hint.
const directConnector: OtaConnector = {
  code: "DIRECT",
  async fetchOffer(h) {
    const roomsLeft = h.roomsLeft ?? 0;
    return { basePrice: h.priceFrom, available: roomsLeft > 0 || h.roomsLeft === undefined, roomsLeft };
  },
};

export const CONNECTORS: Record<string, OtaConnector> = { DIRECT: directConnector };

// An OTA sub-agent produces offers ONLY once its real B2B API is connected
// (connectorType = HTTP with a gateway config). Until then it stays empty — no
// simulated competitor prices — because Miruum has no contract with that OTA yet.
// Connect the API in Back Office → Channel Manager and offers start flowing.
function isConnectedOta(c: { type: string; connectorType?: string | null; config?: unknown }): boolean {
  return c.type === "OTA" && c.connectorType === "HTTP" && !!c.config;
}

// Resolve the connector for a channel. HTTP → real B2B API via the gateway;
// DIRECT → the own managed rate. Anything else has no real connector (it is
// filtered out before this point) and throws rather than faking one.
export function getConnector(channel: { code: string; connectorType?: string | null; config?: unknown }): OtaConnector {
  if (channel.connectorType === "HTTP" && channel.config && typeof channel.config === "object") {
    return httpConnector(channel.code, channel.config as GatewayConfig);
  }
  if (channel.code === "DIRECT" || channel.connectorType === "DIRECT") return directConnector;
  throw new Error(`Channel ${channel.code} tidak punya koneksi API nyata (bukan HTTP/DIRECT)`);
}

/**
 * Pull offers from every relevant source for every hotel, apply Miruum's markup,
 * upsert HotelOffer rows, then cache the cheapest available offer back onto the
 * hotel (priceFrom + channelId) so lists/search show the best aggregated price.
 */
export async function syncOffers(prisma: PrismaClient): Promise<{ hotels: number; offers: number }> {
  const channels = await prisma.supplyChannel.findMany({ where: { active: true } });
  const hotels = await prisma.hotel.findMany({ include: { rooms: { select: { stock: true } } } });
  let offerCount = 0;

  for (const hotel of hotels) {
    // Real total room stock — feeds the DIRECT offer's roomsLeft (no fabrication).
    const totalStock = (hotel.rooms ?? []).reduce((s, r) => s + (r.stock ?? 0), 0);
    // sources = own Channel Manager (DIRECT) + any OTA whose real API is connected.
    // Mock/uncontracted OTA sub-agents are skipped → no fake competitor offers.
    const sources = channels.filter((c) => c.type === "DIRECT" || isConnectedOta(c));

    for (const ch of sources) {
      const conn = getConnector(ch);
      let r: OfferResult;
      try {
        r = await conn.fetchOffer({ ...hotel, roomsLeft: totalStock });
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
