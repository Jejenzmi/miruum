import crypto from "crypto";
import { getSettings } from "./settings.js";

// ───────────────────────────── Supply sources ─────────────────────────────
// Miruum is a sub-agent/aggregator: besides its own DIRECT inventory it can pull
// live hotels from external bedbanks. Each external source implements this common
// interface, so search/booking route to the right provider by `source`.
//
// This is REAL connectivity — every call signs and hits the provider's actual
// REST API. When credentials aren't set yet, calls fail honestly (a clear
// "not configured" error), never a fake success.

export type SupplySourceCode = "HOTELBEDS";

export interface SupplyStay {
  checkIn: string;  // YYYY-MM-DD
  checkOut: string; // YYYY-MM-DD
}
export interface SupplyOccupancy {
  rooms: number;
  adults: number;
  children: number;
}
export interface SupplyHotelResult {
  source: SupplySourceCode;
  supplierHotelCode: string;   // provider hotel id (e.g. Hotelbeds `code`)
  name: string;
  categoryName?: string;       // star category text
  destinationName?: string;
  zoneName?: string;
  latitude?: number;
  longitude?: number;
  currency: string;
  minRate: number;             // cheapest sellable rate for the stay (nett)
  maxRate?: number;
  rooms: SupplyRoomResult[];
}
export interface SupplyRoomResult {
  code: string;
  name: string;
  rateKey: string;             // opaque token → checkRate / book
  boardName?: string;          // meal plan
  net: number;
  cancellationPolicies?: { amount: number; from: string }[];
  refundable?: boolean;
}
export interface SupplyBookingHolder { name: string; surname: string; email?: string; phone?: string }
export interface SupplyBookingPax { roomCode: string; type: "AD" | "CH"; name: string; surname: string; age?: number }

export interface SupplyProvider {
  code: SupplySourceCode;
  configured(): Promise<boolean>;
  /** Live availability for a destination / geolocation + stay + occupancies. */
  search(params: { destinationCode?: string; hotelCodes?: string[]; geo?: { latitude: number; longitude: number; radiusKm?: number }; stay: SupplyStay; occupancies: SupplyOccupancy[] }): Promise<SupplyHotelResult[]>;
  /** Re-price + confirm a rateKey is still bookable (prices can change). */
  checkRate(rateKey: string): Promise<{ rateKey: string; net: number; currency: string; cancellationPolicies?: any }>;
  /** Create the booking at the supplier. */
  book(params: { holder: SupplyBookingHolder; rateKey: string; paxes: SupplyBookingPax[]; clientReference: string }): Promise<{ reference: string; status: string; net: number; currency: string }>;
  /** Cancel a supplier booking by its reference. */
  cancel(reference: string): Promise<{ reference: string; status: string }>;
  /** Lightweight connectivity check (used by Back Office "Test"). */
  status(): Promise<{ ok: boolean; detail: string }>;
}

// ───────────────────────────── Hotelbeds APItude ─────────────────────────────
// Docs: https://developer.hotelbeds.com/ — Booking API (hotel-api) + Content API.
// Auth: header `Api-key` + `X-Signature` = SHA256(apiKey + secret + unixSeconds).
// Sandbox base: https://api.test.hotelbeds.com

interface HbConfig { enabled: boolean; base: string; apiKey: string; secret: string }

async function hbConfig(): Promise<HbConfig> {
  const s = await getSettings();
  return {
    enabled: s.hotelbeds_enabled === "1",
    base: (s.hotelbeds_base || "https://api.test.hotelbeds.com").replace(/\/+$/, ""),
    apiKey: s.hotelbeds_api_key || "",
    secret: s.hotelbeds_secret || "",
  };
}

function hbSignature(apiKey: string, secret: string): { sig: string; ts: number } {
  const ts = Math.floor(Date.now() / 1000);
  const sig = crypto.createHash("sha256").update(apiKey + secret + ts).digest("hex");
  return { sig, ts };
}

async function hbFetch(cfg: HbConfig, method: string, path: string, body?: unknown): Promise<any> {
  if (!cfg.apiKey || !cfg.secret) throw new Error("Hotelbeds belum dikonfigurasi (Api-key/Secret kosong)");
  const { sig } = hbSignature(cfg.apiKey, cfg.secret);
  const res = await fetch(cfg.base + path, {
    method,
    headers: {
      "Api-key": cfg.apiKey,
      "X-Signature": sig,
      "Accept": "application/json",
      "Accept-Encoding": "gzip",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* non-JSON error page */ }
  if (!res.ok) {
    const msg = json?.error?.message || json?.message || text?.slice(0, 200) || `HTTP ${res.status}`;
    throw new Error(`Hotelbeds ${res.status}: ${msg}`);
  }
  return json;
}

const hotelbeds: SupplyProvider = {
  code: "HOTELBEDS",

  async configured() {
    const c = await hbConfig();
    return c.enabled && !!c.apiKey && !!c.secret;
  },

  async search({ destinationCode, hotelCodes, geo, stay, occupancies }) {
    const cfg = await hbConfig();
    const body: any = {
      stay: { checkIn: stay.checkIn, checkOut: stay.checkOut },
      occupancies: occupancies.map((o) => ({ rooms: o.rooms, adults: o.adults, children: o.children })),
    };
    if (hotelCodes?.length) body.hotels = { hotel: hotelCodes.map((h) => Number(h) || h) };
    else if (geo) body.geolocation = { latitude: geo.latitude, longitude: geo.longitude, radius: geo.radiusKm ?? 20, unit: "km" };
    else if (destinationCode) body.destination = { code: destinationCode };
    else throw new Error("Butuh destinationCode, geolocation, atau hotelCodes untuk pencarian Hotelbeds");

    const data = await hbFetch(cfg, "POST", "/hotel-api/1.0/hotels", body);
    const hotels = data?.hotels?.hotels ?? [];
    return hotels.map((h: any): SupplyHotelResult => {
      const rooms: SupplyRoomResult[] = [];
      for (const room of h.rooms ?? []) {
        for (const rate of room.rates ?? []) {
          rooms.push({
            code: room.code,
            name: room.name,
            rateKey: rate.rateKey,
            boardName: rate.boardName,
            net: Number(rate.net),
            refundable: rate.rateClass !== "NRF",
            cancellationPolicies: (rate.cancellationPolicies ?? []).map((p: any) => ({ amount: Number(p.amount), from: p.from })),
          });
        }
      }
      return {
        source: "HOTELBEDS",
        supplierHotelCode: String(h.code),
        name: h.name,
        categoryName: h.categoryName,
        destinationName: h.destinationName,
        zoneName: h.zoneName,
        latitude: h.latitude != null ? Number(h.latitude) : undefined,
        longitude: h.longitude != null ? Number(h.longitude) : undefined,
        currency: h.currency || data?.hotels?.currency || "EUR",
        minRate: Number(h.minRate),
        maxRate: h.maxRate != null ? Number(h.maxRate) : undefined,
        rooms,
      };
    });
  },

  async checkRate(rateKey) {
    const cfg = await hbConfig();
    const data = await hbFetch(cfg, "POST", "/hotel-api/1.0/checkrates", { rooms: [{ rateKey }] });
    const rate = data?.hotel?.rooms?.[0]?.rates?.[0];
    if (!rate) throw new Error("Rate tidak lagi tersedia");
    return { rateKey: rate.rateKey, net: Number(rate.net), currency: data?.hotel?.currency || "EUR", cancellationPolicies: rate.cancellationPolicies };
  },

  async book({ holder, rateKey, paxes, clientReference }) {
    const cfg = await hbConfig();
    const data = await hbFetch(cfg, "POST", "/hotel-api/1.0/bookings", {
      holder: { name: holder.name, surname: holder.surname },
      clientReference,
      rooms: [{ rateKey, paxes: paxes.map((p) => ({ roomId: 1, type: p.type, name: p.name, surname: p.surname, ...(p.age != null ? { age: p.age } : {}) })) }],
      ...(holder.email ? { remark: `Contact: ${holder.email} ${holder.phone ?? ""}`.trim() } : {}),
    });
    const b = data?.booking;
    if (!b?.reference) throw new Error("Booking Hotelbeds gagal (tanpa reference)");
    return { reference: b.reference, status: b.status, net: Number(b.totalNet), currency: b.currency || "EUR" };
  },

  async cancel(reference) {
    const cfg = await hbConfig();
    const data = await hbFetch(cfg, "DELETE", `/hotel-api/1.0/bookings/${encodeURIComponent(reference)}?cancellationFlag=CANCELLATION`);
    return { reference, status: data?.booking?.status || "CANCELLED" };
  },

  async status() {
    const cfg = await hbConfig();
    if (!cfg.apiKey || !cfg.secret) return { ok: false, detail: "Api-key/Secret belum diisi" };
    try {
      // `status` endpoint is the lightweight liveness probe on the booking API.
      const data = await hbFetch(cfg, "GET", "/hotel-api/1.0/status");
      return { ok: true, detail: data?.status || "API aktif" };
    } catch (e: any) {
      return { ok: false, detail: e.message };
    }
  },
};

const PROVIDERS: Record<SupplySourceCode, SupplyProvider> = { HOTELBEDS: hotelbeds };

export function supplyProvider(code: SupplySourceCode): SupplyProvider {
  const p = PROVIDERS[code];
  if (!p) throw new Error(`Supply source tidak dikenal: ${code}`);
  return p;
}

/** External supply providers that are enabled AND have credentials. */
export async function activeSupplyProviders(): Promise<SupplyProvider[]> {
  const out: SupplyProvider[] = [];
  for (const p of Object.values(PROVIDERS)) if (await p.configured()) out.push(p);
  return out;
}
