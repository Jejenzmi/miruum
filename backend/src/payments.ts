// ─────────────────────────── Payment gateway ───────────────────────────
// Provider-agnostic payment layer. MOCK works out of the box (fake VA/QR so the
// whole booking→pay→voucher flow is demoable without real money). Swap to FLIP
// (or Midtrans/Xendit) by setting PAYMENT_PROVIDER + credentials in .env — the
// rest of the app (routes, app UI) is unchanged.

export type PayType = "VA" | "EWALLET" | "QRIS";

export interface PaymentMethod {
  code: string;   // VA_BCA, EWALLET_GOPAY, QRIS
  label: string;
  group: string;
  type: PayType;
  logo?: string;
}

export const PAYMENT_METHODS: PaymentMethod[] = [
  { code: "VA_BCA", label: "BCA Virtual Account", group: "Virtual Account", type: "VA" },
  { code: "VA_BNI", label: "BNI Virtual Account", group: "Virtual Account", type: "VA" },
  { code: "VA_MANDIRI", label: "Mandiri Virtual Account", group: "Virtual Account", type: "VA" },
  { code: "VA_BRI", label: "BRI Virtual Account", group: "Virtual Account", type: "VA" },
  { code: "VA_PERMATA", label: "Permata Virtual Account", group: "Virtual Account", type: "VA" },
  { code: "EWALLET_GOPAY", label: "GoPay", group: "E-Wallet", type: "EWALLET" },
  { code: "EWALLET_OVO", label: "OVO", group: "E-Wallet", type: "EWALLET" },
  { code: "EWALLET_DANA", label: "DANA", group: "E-Wallet", type: "EWALLET" },
  { code: "EWALLET_SHOPEEPAY", label: "ShopeePay", group: "E-Wallet", type: "EWALLET" },
  { code: "QRIS", label: "QRIS (semua e-wallet & m-banking)", group: "QRIS", type: "QRIS" },
];

export function methodByCode(code: string): PaymentMethod | undefined {
  return PAYMENT_METHODS.find((m) => m.code === code);
}

export interface CreatePaymentInput {
  bookingCode: string;
  amount: number;
  method: PaymentMethod;
  bookerName: string;
  bookerEmail: string;
  bookerPhone: string;
}

export interface PaymentInstructions {
  provider: string;
  externalId: string;
  vaNumber?: string;
  qrString?: string;
  payUrl?: string;
  expiresAt: Date;
  raw?: unknown;
}

export interface PaymentProvider {
  code: string;
  create(input: CreatePaymentInput): Promise<PaymentInstructions>;
  /** Parse a provider webhook → the external id + resulting status. */
  parseWebhook(body: any, headers: Record<string, string | undefined>): { externalId: string; paid: boolean } | null;
}

// FNV hash for deterministic mock numbers (no Math.random for reproducibility).
function digits(seed: string, len: number): string {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
  let s = (h >>> 0).toString();
  while (s.length < len) s += ((h >>> (s.length % 24)) & 0xff).toString();
  return s.slice(0, len);
}

const VA_PREFIX: Record<string, string> = {
  VA_BCA: "39041", VA_BNI: "8808", VA_MANDIRI: "89608", VA_BRI: "26215", VA_PERMATA: "8528",
};

const mockProvider: PaymentProvider = {
  code: "MOCK",
  async create(input) {
    const external = "MOCK-" + digits(input.bookingCode + input.method.code, 10);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    const out: PaymentInstructions = { provider: "MOCK", externalId: external, expiresAt };
    if (input.method.type === "VA") {
      out.vaNumber = (VA_PREFIX[input.method.code] ?? "88888") + digits(input.bookingCode, 10);
    } else if (input.method.type === "QRIS") {
      out.qrString = `00020101021226${digits(input.bookingCode, 20)}5204899953033605802ID5910MIRUUM OTA6007Jakarta`;
    } else {
      out.payUrl = `https://pay.miruum.local/mock/${external}`;
    }
    return out;
  },
  parseWebhook(body) {
    if (!body?.externalId) return null;
    return { externalId: String(body.externalId), paid: body.status === "PAID" || body.paid === true };
  },
};

// Flip (bigflip.id) adapter — Accept Payment / Create Bill. Fill in when creds
// are available: FLIP_SECRET_KEY, FLIP_VALIDATION_TOKEN, FLIP_BASE.
const flipProvider: PaymentProvider = {
  code: "FLIP",
  async create(input) {
    const base = process.env.FLIP_BASE || "https://bigflip.id/api";
    const key = process.env.FLIP_SECRET_KEY || "";
    const auth = "Basic " + Buffer.from(`${key}:`).toString("base64");
    const form = new URLSearchParams({
      title: `Miruum ${input.bookingCode}`,
      amount: String(input.amount),
      type: "SINGLE",
      sender_name: input.bookerName,
      sender_email: input.bookerEmail,
      sender_phone_number: input.bookerPhone,
    });
    const resp = await fetch(`${base}/v2/pwf/bill`, {
      method: "POST",
      headers: { Authorization: auth, "Content-Type": "application/x-www-form-urlencoded" },
      body: form,
    });
    if (!resp.ok) throw new Error(`Flip HTTP ${resp.status}`);
    const j: any = await resp.json();
    return {
      provider: "FLIP",
      externalId: String(j.link_id ?? j.id),
      payUrl: j.link_url ? `https://flip.id/pwf/${j.link_url}` : undefined,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      raw: j,
    };
  },
  parseWebhook(body) {
    // Flip posts `data` (JSON string) + `token`. Validate token then read status.
    if (process.env.FLIP_VALIDATION_TOKEN && body?.token !== process.env.FLIP_VALIDATION_TOKEN) return null;
    let data = body?.data;
    try { if (typeof data === "string") data = JSON.parse(data); } catch { /* ignore */ }
    if (!data) return null;
    return { externalId: String(data.bill_link_id ?? data.id), paid: data.status === "SUCCESSFUL" };
  },
};

// ── LinkQu (linkqu.id) adapter — QRIS + Virtual Account. Credentials are
// admin-managed (Back Office → Integrasi), never hardcoded. Docs:
// prod https://api.linkqu.id  · dev https://gateway-dev.linkqu.id
// Headers: client-id, client-secret. Signature: HMAC-SHA256(signString, serverKey)
// where signString = normalize(path + METHOD + params + client-id), normalize =
// lowercase + strip non-alphanumeric. NOTE: LinkQu also gatekeeps by IP — your
// server's public IP must be whitelisted in the LinkQu dashboard, else HTTP 403
// "error 1010" on every call.
import { getSettings } from "./settings.js";
import { createHmac } from "crypto";

const LINKQU_BANK: Record<string, string> = {
  VA_BCA: "014", VA_BNI: "009", VA_MANDIRI: "008", VA_BRI: "002", VA_PERMATA: "013",
};
async function linkquCfg() {
  const s = await getSettings();
  return {
    base: (s.linkqu_base || "https://gateway-dev.linkqu.id").replace(/\/+$/, ""),
    clientId: s.linkqu_client_id || "",
    clientSecret: s.linkqu_client_secret || "",
    username: s.linkqu_username || "",
    pin: s.linkqu_pin || "",
    serverKey: s.linkqu_server_key || "",
  };
}
const lqNorm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const lqSign = (raw: string, key: string) => createHmac("sha256", key).update(raw).digest("hex");
function lqExpired(hours: number): string {
  // LinkQu validates `expired` against its own clock in WIB (UTC+7) — a UTC
  // string reads as "not greater than now" and the transaction is rejected.
  // Shift by +7h and read the UTC wall-clock so this is correct regardless of
  // the container timezone.
  const d = new Date(Date.now() + (hours + 7) * 3600_000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`;
}
const linkquProvider: PaymentProvider = {
  code: "LINKQU",
  async create(input) {
    const c = await linkquCfg();
    if (!c.clientId || !c.username || !c.pin || !c.serverKey) throw new Error("Kredensial LinkQu belum diatur");
    const isVA = input.method.type === "VA";
    const path = isVA ? "/linkqu-partner/transaction/create/va" : "/linkqu-partner/transaction/create/qris";
    const partnerReff = (input.bookingCode.replace(/[^0-9]/g, "") + digits(input.bookingCode + Date.now(), 8)).slice(0, 20);
    const bankCode = LINKQU_BANK[input.method.code] || "008";
    const amount = String(input.amount);
    // signString per LinkQu docs; isolated so it's easy to confirm via the LinkQu
    // signature simulator once the merchant account/IP is active.
    const signRaw = lqNorm(path + "POST" + amount + partnerReff + input.bookerPhone + (isVA ? bankCode : "") + c.clientId);
    const signature = lqSign(signRaw, c.serverKey);
    const callback = (process.env.PUBLIC_ORIGIN || "https://api.miruum.id") + "/api/payments/webhook/linkqu";
    const body: any = {
      amount: input.amount, partner_reff: partnerReff, customer_id: input.bookerPhone,
      customer_name: input.bookerName, customer_email: input.bookerEmail, customer_phone: input.bookerPhone,
      expired: lqExpired(1), username: c.username, pin: c.pin, signature, url_callback: callback,
    };
    if (isVA) body.bank_code = bankCode;
    const resp = await fetch(c.base + path, {
      method: "POST",
      headers: { "Content-Type": "application/json", "client-id": c.clientId, "client-secret": c.clientSecret },
      body: JSON.stringify(body),
    });
    const text = await resp.text();
    let j: any = {}; try { j = JSON.parse(text); } catch { /* keep text */ }
    if (!resp.ok) throw new Error(`LinkQu HTTP ${resp.status}: ${text.slice(0, 160)}`);
    const d = j.data || j;
    return {
      provider: "LINKQU",
      externalId: partnerReff,
      vaNumber: isVA ? (d.va_number || d.virtual_account || d.vanumber) : undefined,
      qrString: !isVA ? (d.qris_content || d.qris || d.qr_string || d.qrstring) : undefined,
      expiresAt: new Date(Date.now() + 3600_000),
      raw: j,
    };
  },
  parseWebhook(body) {
    // LinkQu posts partner_reff, va_number, status ("SUCCESS"), signature.
    if (!body?.partner_reff) return null;
    return { externalId: String(body.partner_reff), paid: String(body.status || "").toUpperCase() === "SUCCESS" };
  },
};

// Verify a LinkQu callback is genuine. Per LinkQu docs the callback signature is
// HMAC-SHA256(partner_reff + amount + va_number + username, serverKey). Only the
// merchant + LinkQu know serverKey, so a forged callback can never produce a
// valid signature — this is what stops anyone from POSTing a fake "SUCCESS" to
// mark a booking paid. We also accept a couple of defensive field variants
// (normalised; QRIS has no va_number) since we can't replay a real callback.
export async function verifyLinkquCallback(body: any): Promise<boolean> {
  const c = await linkquCfg();
  if (!c.serverKey) return false;
  const provided = String(body?.signature ?? "").toLowerCase();
  const reff = String(body?.partner_reff ?? "");
  if (!provided || !reff) return false;
  const amount = String(body?.amount ?? "");
  const va = String(body?.va_number ?? "");
  const user = String(body?.username || c.username || "");
  const raws = [
    reff + amount + va + user,   // VA, exact per docs
    reff + amount + user,        // QRIS (no va_number)
  ];
  const cands = raws.flatMap((r) => [lqSign(r, c.serverKey), lqSign(lqNorm(r), c.serverKey)]);
  return cands.some((h) => h.toLowerCase() === provided);
}
/** LinkQu's callback source IP (from the docs) — a second, softer check. */
export const LINKQU_CALLBACK_IP = "34.101.73.158";

const PROVIDERS: Record<string, PaymentProvider> = { MOCK: mockProvider, FLIP: flipProvider, LINKQU: linkquProvider };

// Provider selection is admin-managed (Setting `payment_provider`), falling back
// to env then MOCK. Falls back to MOCK when the selected provider isn't configured.
export async function activeProvider(): Promise<PaymentProvider> {
  const s = await getSettings();
  const want = (s.payment_provider || process.env.PAYMENT_PROVIDER || "MOCK").toUpperCase();
  if (want === "FLIP" && !process.env.FLIP_SECRET_KEY) return mockProvider;
  if (want === "LINKQU") {
    const c = await linkquCfg();
    if (!c.clientId || !c.username || !c.pin || !c.serverKey) return mockProvider;
  }
  return PROVIDERS[want] ?? mockProvider;
}
