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

const PROVIDERS: Record<string, PaymentProvider> = { MOCK: mockProvider, FLIP: flipProvider };

export function activeProvider(): PaymentProvider {
  const want = (process.env.PAYMENT_PROVIDER || "MOCK").toUpperCase();
  const p = PROVIDERS[want];
  // Fall back to MOCK if the selected provider lacks credentials.
  if (want === "FLIP" && !process.env.FLIP_SECRET_KEY) return mockProvider;
  return p ?? mockProvider;
}
