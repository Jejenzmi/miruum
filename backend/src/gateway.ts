import type { OtaConnector, OfferResult, HotelRef } from "./connectors.js";

// ─────────────────────────── Connector gateway ───────────────────────────
// A generic, CONFIG-DRIVEN connector so ANY OTA B2B REST API can be plugged in
// without code changes. A channel stores a `config` (JSON) describing the base
// URL, auth, request template and how to map the response into our OfferResult.
// Secrets are referenced by ENV VAR NAME (kept in deploy .env, never in the DB).
//
// Example config (fill in when real credentials arrive):
// {
//   "baseUrl": "https://api.partner.com",
//   "auth":   { "type": "bearer", "tokenEnv": "AGODA_TOKEN" },
//   "request":{ "method": "GET", "path": "/v1/hotels/{externalId}/rates",
//               "query": { "checkin": "{checkIn}", "checkout": "{checkOut}" } },
//   "map":    { "basePrice": "data.lowestRate.amount", "available": "data.available",
//               "roomsLeft": "data.roomsLeft", "deeplink": "data.url",
//               "supplierRef": "data.rateId", "priceMultiplier": 1 }
// }

export interface GatewayConfig {
  baseUrl: string;
  auth?: {
    type: "none" | "bearer" | "header" | "basic" | "query";
    header?: string; // header name for type "header"
    param?: string; // query param for type "query"
    tokenEnv?: string; valueEnv?: string; userEnv?: string; passEnv?: string; // secrets via env
    token?: string; value?: string; user?: string; pass?: string; // inline (discouraged)
  };
  request: {
    method?: string;
    path: string; // supports {slug}{externalId}{name}{city}{checkIn}{checkOut}
    query?: Record<string, string>;
    headers?: Record<string, string>;
    body?: unknown; // templated JSON body (for POST)
  };
  map: {
    basePrice: string; // dot-path into the JSON response
    available?: string;
    roomsLeft?: string;
    deeplink?: string;
    supplierRef?: string;
    priceMultiplier?: number; // applied to basePrice (e.g. currency scale)
    availableTrueValue?: unknown; // when the availability field isn't a boolean
  };
  timeoutMs?: number;
}

// Dot-path getter with array-index support: "data.rooms.0.price".
function getPath(obj: any, path?: string): any {
  if (!path) return undefined;
  return path.split(".").reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);
}

// {placeholder} substitution.
function tmpl(input: any, vars: Record<string, string>): any {
  if (typeof input === "string") return input.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");
  if (Array.isArray(input)) return input.map((v) => tmpl(v, vars));
  if (input && typeof input === "object") {
    return Object.fromEntries(Object.entries(input).map(([k, v]) => [k, tmpl(v, vars)]));
  }
  return input;
}

function iso(d: Date) {
  return d.toISOString().slice(0, 10);
}

/** Build a connector that calls a real HTTP B2B API described by `cfg`. */
export function httpConnector(code: string, cfg: GatewayConfig): OtaConnector {
  return {
    code,
    async fetchOffer(hotel: HotelRef): Promise<OfferResult> {
      const now = Date.now();
      const vars: Record<string, string> = {
        slug: hotel.slug,
        externalId: hotel.externalId ?? hotel.slug,
        name: hotel.name,
        city: hotel.city ?? "",
        checkIn: iso(new Date(now + 86400000)),
        checkOut: iso(new Date(now + 2 * 86400000)),
      };

      const url = new URL(cfg.baseUrl.replace(/\/$/, "") + tmpl(cfg.request.path, vars));
      for (const [k, v] of Object.entries(tmpl(cfg.request.query ?? {}, vars) as Record<string, string>)) {
        url.searchParams.set(k, v);
      }

      const headers: Record<string, string> = { Accept: "application/json", ...(tmpl(cfg.request.headers ?? {}, vars) as any) };
      const a = cfg.auth;
      if (a && a.type !== "none") {
        const env = (name?: string) => (name ? process.env[name] ?? "" : "");
        if (a.type === "bearer") headers["Authorization"] = `Bearer ${env(a.tokenEnv) || a.token || ""}`;
        else if (a.type === "header") headers[a.header || "X-API-Key"] = env(a.valueEnv) || a.value || "";
        else if (a.type === "basic") headers["Authorization"] = "Basic " + Buffer.from(`${env(a.userEnv) || a.user}:${env(a.passEnv) || a.pass}`).toString("base64");
        else if (a.type === "query") url.searchParams.set(a.param || "apikey", env(a.valueEnv) || a.value || "");
      }

      const method = (cfg.request.method || "GET").toUpperCase();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), cfg.timeoutMs ?? 8000);
      let json: any;
      try {
        const resp = await fetch(url, {
          method,
          headers: method === "GET" ? headers : { ...headers, "Content-Type": "application/json" },
          body: method === "GET" ? undefined : JSON.stringify(tmpl(cfg.request.body ?? {}, vars)),
          signal: controller.signal,
        });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        json = await resp.json();
      } finally {
        clearTimeout(timer);
      }

      const m = cfg.map;
      const rawPrice = Number(getPath(json, m.basePrice) ?? 0);
      const basePrice = Math.round(rawPrice * (m.priceMultiplier ?? 1));
      let available = true;
      if (m.available) {
        const v = getPath(json, m.available);
        available = m.availableTrueValue !== undefined ? v === m.availableTrueValue : Boolean(v);
      }
      return {
        basePrice,
        available: available && basePrice > 0,
        roomsLeft: Number(getPath(json, m.roomsLeft) ?? (available ? 1 : 0)),
        deeplink: m.deeplink ? String(getPath(json, m.deeplink) ?? "") || undefined : undefined,
        supplierRef: m.supplierRef ? String(getPath(json, m.supplierRef) ?? "") || undefined : undefined,
      };
    },
  };
}
