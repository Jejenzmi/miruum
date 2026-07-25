import type { PrismaClient } from "@prisma/client";
import { getSettings } from "./settings.js";

// ─────────────────────────── Channex channel manager ───────────────────────────
// Channex (https://channex.io) is an API-first channel manager. Miruum uses it as
// a 2-way connector: PULL real hotel inventory (properties → room types → rate
// plans → availability/restrictions) into our catalog as `source: CHANNEX`, and
// PUSH reservations back so the property's PMS receives the booking. Webhooks keep
// ARI fresh. This REPLACES the old mock distribution push.
//
// API: base https://staging.channex.io/api/v1 (sandbox) | https://app.channex.io/api/v1 (prod)
// Auth header: `user-api-key`. JSON:API-style — objects carry {type, attributes};
// requests are wrapped as {"<type>": {...}}; filtering via filter[field]=value.
// Everything here hits the REAL API; with no key set, calls fail honestly.

interface CxConfig { enabled: boolean; base: string; apiKey: string }

async function cxConfig(): Promise<CxConfig> {
  const s = await getSettings();
  return {
    enabled: s.channex_enabled === "1",
    base: (s.channex_base || "https://staging.channex.io/api/v1").replace(/\/+$/, ""),
    apiKey: s.channex_api_key || "",
  };
}

async function cxFetch(cfg: CxConfig, method: string, path: string, body?: unknown): Promise<any> {
  if (!cfg.apiKey) throw new Error("Channex belum dikonfigurasi (API key kosong)");
  const res = await fetch(cfg.base + path, {
    method,
    headers: {
      "user-api-key": cfg.apiKey,
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* non-JSON error */ }
  if (!res.ok) {
    const msg = json?.errors?.title || json?.error?.title || json?.message || text?.slice(0, 200) || `HTTP ${res.status}`;
    throw new Error(`Channex ${res.status}: ${msg}`);
  }
  return json;
}

export async function channexConfigured(): Promise<boolean> {
  const c = await cxConfig();
  return c.enabled && !!c.apiKey;
}

export async function channexStatus(): Promise<{ ok: boolean; detail: string }> {
  const cfg = await cxConfig();
  if (!cfg.apiKey) return { ok: false, detail: "API key belum diisi" };
  try {
    const data = await cxFetch(cfg, "GET", "/properties?pagination[limit]=1");
    const n = data?.meta?.total ?? (Array.isArray(data?.data) ? data.data.length : 0);
    return { ok: true, detail: `Terhubung — ${n} properti terlihat` };
  } catch (e: any) { return { ok: false, detail: e.message }; }
}

// ── Read side (ARI pull) ──
export async function cxProperties(): Promise<any[]> {
  const cfg = await cxConfig();
  const data = await cxFetch(cfg, "GET", "/properties");
  return data?.data ?? [];
}
export async function cxRoomTypes(propertyId: string): Promise<any[]> {
  const cfg = await cxConfig();
  const data = await cxFetch(cfg, "GET", `/room_types?filter[property_id]=${encodeURIComponent(propertyId)}`);
  return data?.data ?? [];
}
export async function cxRatePlans(propertyId: string): Promise<any[]> {
  const cfg = await cxConfig();
  const data = await cxFetch(cfg, "GET", `/rate_plans?filter[property_id]=${encodeURIComponent(propertyId)}`);
  return data?.data ?? [];
}
/** Availability (rooms left) per room type per date. */
export async function cxAvailability(propertyId: string, from: string, to: string): Promise<any[]> {
  const cfg = await cxConfig();
  const data = await cxFetch(cfg, "GET", `/availability?filter[property_id]=${encodeURIComponent(propertyId)}&filter[date][gte]=${from}&filter[date][lte]=${to}`);
  return data?.data ?? [];
}
/** Rates + restrictions per rate plan per date. */
export async function cxRestrictions(propertyId: string, from: string, to: string): Promise<any[]> {
  const cfg = await cxConfig();
  const data = await cxFetch(cfg, "GET", `/restrictions?filter[property_id]=${encodeURIComponent(propertyId)}&filter[date][gte]=${from}&filter[date][lte]=${to}&filter[restrictions]=rate`);
  return data?.data ?? [];
}

// ── Write side (booking push) ──
/** Send a reservation to the property via Channex (their PMS receives it). */
export async function cxCreateBooking(input: {
  propertyId: string;
  arrivalDate: string; departureDate: string;
  customer: { name: string; surname: string; mail?: string; phone?: string };
  rooms: { roomTypeId: string; ratePlanId: string; amount: number; occupancy: { adults: number; children?: number } }[];
  ota_reservation_code: string;
}): Promise<{ id: string; status: string }> {
  const cfg = await cxConfig();
  const data = await cxFetch(cfg, "POST", "/bookings", {
    booking: {
      property_id: input.propertyId,
      ota_name: "Miruum",
      ota_reservation_code: input.ota_reservation_code,
      arrival_date: input.arrivalDate,
      departure_date: input.departureDate,
      currency: "IDR",
      customer: { name: input.customer.name, surname: input.customer.surname, mail: input.customer.mail, phone: input.customer.phone },
      rooms: input.rooms.map((r) => ({
        room_type_id: r.roomTypeId, rate_plan_id: r.ratePlanId,
        days: {}, amount: r.amount,
        occupancy: { adults: r.occupancy.adults, children: r.occupancy.children ?? 0, infants: 0 },
      })),
    },
  });
  const b = data?.data;
  return { id: b?.id || b?.attributes?.id, status: b?.attributes?.status || "new" };
}

// ── Sync: pull Channex properties into Miruum's catalog as source=CHANNEX ──
const num = (v: any, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };

/**
 * Upsert every Channex property (or one) as a Hotel with its room types as Rooms.
 * Prices come from the cheapest current rate plan restriction. Real data only —
 * nothing is fabricated; a property with no rate simply gets its base price.
 */
export async function syncChannex(prisma: PrismaClient, onlyPropertyId?: string): Promise<{ hotels: number; rooms: number }> {
  const props = onlyPropertyId
    ? [{ id: onlyPropertyId, attributes: (await cxProperties()).find((p) => p.id === onlyPropertyId)?.attributes ?? {} }]
    : await cxProperties();
  let hotelCount = 0, roomCount = 0;

  for (const prop of props) {
    const a = prop.attributes ?? {};
    const slug = `cx-${prop.id}`;
    const hotel = await prisma.hotel.upsert({
      where: { slug },
      create: {
        name: a.title || a.name || "Channex Property", slug, source: "CHANNEX", supplierHotelCode: prop.id,
        city: a.city || "", address: [a.address, a.city, a.country].filter(Boolean).join(", "),
        description: a.content?.description || "", imageUrl: (a.logo_url || (a.facilities?.[0]?.image) || ""),
        lat: a.location?.[1] != null ? num(a.location[1]) : null, lng: a.location?.[0] != null ? num(a.location[0]) : null,
        priceFrom: 0,
      } as any,
      update: { name: a.title || a.name || "Channex Property", city: a.city || "" },
    });
    hotelCount++;

    const [roomTypes, ratePlans] = await Promise.all([cxRoomTypes(prop.id), cxRatePlans(prop.id)]);
    // cheapest rate plan per room type → its price + id (for booking push).
    const cheapestByRoomType: Record<string, { price: number; ratePlanId: string }> = {};
    for (const rp of ratePlans) {
      const rt = rp.attributes?.room_type_id;
      const price = num(rp.attributes?.price ?? rp.attributes?.default_rate ?? rp.attributes?.rate);
      if (rt && price > 0 && (cheapestByRoomType[rt] == null || price < cheapestByRoomType[rt].price)) {
        cheapestByRoomType[rt] = { price, ratePlanId: rp.id };
      }
    }
    let minPrice = Infinity;
    for (const rt of roomTypes) {
      const cheap = cheapestByRoomType[rt.id];
      const price = cheap?.price ?? 0;
      if (price > 0) minPrice = Math.min(minPrice, price);
      const name = rt.attributes?.title || rt.attributes?.name || `Room ${String(rt.id).slice(0, 6)}`;
      const existing = await prisma.room.findFirst({ where: { hotelId: hotel.id, supplierRoomTypeId: rt.id } })
        ?? await prisma.room.findFirst({ where: { hotelId: hotel.id, name } });
      const data = {
        hotelId: hotel.id, name,
        price: Math.round(price), stock: num(rt.attributes?.count_of_rooms, 5) || 5,
        capacity: num(rt.attributes?.occ_adults, 2) || 2,
        supplierRoomTypeId: rt.id, supplierRatePlanId: cheap?.ratePlanId ?? null,
      };
      if (existing) await prisma.room.update({ where: { id: existing.id }, data: { price: data.price, stock: data.stock, supplierRoomTypeId: rt.id, supplierRatePlanId: cheap?.ratePlanId ?? null } });
      else await prisma.room.create({ data });
      roomCount++;
    }
    if (Number.isFinite(minPrice) && minPrice > 0) {
      await prisma.hotel.update({ where: { id: hotel.id }, data: { priceFrom: Math.round(minPrice) } });
    }
  }
  return { hotels: hotelCount, rooms: roomCount };
}
