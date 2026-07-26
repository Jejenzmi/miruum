import express, { type Response, type NextFunction, type Request, type ErrorRequestHandler } from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import * as Sentry from "@sentry/node";
import pino from "pino";
import pinoHttp from "pino-http";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "./prisma.js";
import { signToken, requireAuth, optionalAuth, issueSession, rotateRefresh, revokeRefresh, revokeAllRefresh, hashToken, type AuthRequest } from "./auth.js";
import { config } from "./config.js";
import { redis, cached, invalidate } from "./redis.js";
import { ensureBucket, putObject, storageReady } from "./storage.js";
import { syncOffers, getConnector, applyMarkup } from "./connectors.js";
import QRCode from "qrcode";
import PDFDocument from "pdfkit";
import geoip from "fast-geoip";
import { PAYMENT_METHODS, methodByCode, activeProvider, verifyLinkquCallback, LINKQU_CALLBACK_IP } from "./payments.js";
import { computeFinance } from "./finance.js";
import { getSettings, getNum, setSettings, SETTING_DEFAULTS } from "./settings.js";
import { pushDistribution } from "./distribution.js";
import { supplyProvider, activeSupplyProviders } from "./supply.js";
import { channexStatus, channexConfigured, syncChannex, cxCreateBooking } from "./channex.js";
import { fxConverter } from "./fx.js";
import { clientIp, deviceFingerprint, isBlocked, assessBookingRisk, refundVelocity } from "./fraud.js";
import { botReply } from "./chatbot.js";
import { screenChat, violationNotice } from "./moderation.js";
import { runRateShopping, aiConfigured } from "./rateshopper.js";
import { dispatch, sendMail } from "./notify.js";
import { testFcm } from "./fcm.js";
import { quote, consume, release } from "./availability.js";

// ── Observability: structured logging + error tracking ──
// Sentry activates only when SENTRY_DSN is set (configure in the environment,
// like the other integrations) — no code change needed to turn it on.
if (process.env.SENTRY_DSN) {
  Sentry.init({ dsn: process.env.SENTRY_DSN, environment: process.env.NODE_ENV || "production", tracesSampleRate: 0.1 });
}
export const logger = pino({ level: process.env.LOG_LEVEL || "info" });

const app = express();
app.set("trust proxy", 1); // behind nginx → real client IP via X-Forwarded-For (for rate limiting)

// ── Async safety net (Express 4) ──
// In Express 4 a rejected promise from an `async` handler is NOT forwarded to the
// error middleware — the request would hang until the socket aborts (this exact
// bug bit refund/reschedule). Patch the routing methods so every handler's
// rejection (and sync throw) is caught and passed to next(), reaching
// `errorHandler` → HTTP 500 instead of hanging. 4-arg error middlewares are left
// untouched; path strings and non-functions pass through.
for (const m of ["use", "get", "post", "put", "patch", "delete", "all"] as const) {
  const orig = (app as any)[m].bind(app);
  (app as any)[m] = (...args: any[]) =>
    orig(...args.map((a: any) =>
      typeof a === "function" && a.length < 4
        ? function (this: any, req: any, res: any, next: any) {
            try { return Promise.resolve(a.call(this, req, res, next)).catch(next); }
            catch (e) { return next(e); }
          }
        : a,
    ));
}

app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === "/api/health" } })); // structured request logs
app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: "cross-origin" } })); // security headers (JSON API)
app.use(cors());
app.use(express.json({ limit: "8mb" })); // allow base64 image uploads

// ── Response shape compatibility: hotel facilities ──────────────────────────
// The hotel-card select pulls facilities through the HotelFacility join table,
// so Prisma nests them as [{ facility: { id, name, icon } }]. The hotel DETAIL
// endpoint has always returned a FLAT [{ id, name, icon }], and shipped mobile
// builds parse that flat shape with NON-NULLABLE name/icon — the nested shape
// makes them crash. Flatten on the way out so every client keeps working
// without needing an app update.
function flattenFacilities(node: any): any {
  if (Array.isArray(node)) return node.map(flattenFacilities);
  if (node && typeof node === "object") {
    for (const k of Object.keys(node)) {
      const v = (node as any)[k];
      if (k === "facilities" && Array.isArray(v)) {
        (node as any)[k] = v.map((f: any) =>
          f && typeof f === "object" && f.facility
            ? { id: f.facility.id ?? "", name: f.facility.name ?? "", icon: f.facility.icon ?? "" }
            : flattenFacilities(f));
      } else {
        (node as any)[k] = flattenFacilities(v);
      }
    }
  }
  return node;
}
// ── B2B price confidentiality ───────────────────────────────────────────────
// Net rates, our markup, channel commissions and the supply-source identity are
// commercial secrets. They must never reach customer-facing clients: every
// endpoint below is readable by anyone with curl, so "we just don't render it"
// is NOT protection. Only the role-guarded /api/admin and /api/partner trees
// keep these fields.
//
// `channelId` deliberately STAYS: bookings route to the cheapest supply source
// by that id, and it is an opaque identifier that reveals no pricing.
// Keys that must never reach a public (B2C) client: B2B cost/markup internals,
// plus `foreignMarkupPct` (a pricing-policy field consumed server-side only).
const B2B_ONLY_KEYS = new Set(["basePrice", "markupPct", "commissionPct", "deeplink", "channel", "foreignMarkupPct",
  // Internal supply-routing fields — never exposed to a public (B2C) client.
  "source", "supplierHotelCode", "supplierRoomTypeId", "supplierRatePlanId"]);
function stripB2B(node: any): any {
  if (Array.isArray(node)) return node.map(stripB2B);
  if (node && typeof node === "object") {
    for (const k of Object.keys(node)) {
      if (B2B_ONLY_KEYS.has(k)) delete (node as any)[k];
      else (node as any)[k] = stripB2B((node as any)[k]);
    }
  }
  return node;
}
const PRIVILEGED_PATH = /^\/api\/(admin|partner)(\/|$)/;

// ── Nationality (market) pricing — PUBLIC catalog only, OTA-style ──
// Foreign (WNA) guests see the public rate + a markup %. Domestic (WNI) see the
// base rate. This NEVER touches the B2B/corporate tree — that stays auth+role
// guarded. Only the public catalog paths below are eligible.
const MARKET_PATH = /^\/api\/(hotels|packages|destinations)(\/|$)/;
const MARKET_PRICE_FIELDS = new Set(["price", "priceFrom", "priceBefore", "publicPrice"]);

function ipOf(req: Request): string {
  const xf = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return xf || req.socket.remoteAddress || "";
}
/** Resolve the guest market: explicit choice wins, else default from IP country. */
async function resolveMarket(req: Request): Promise<"DOMESTIC" | "FOREIGN"> {
  const explicit = String(req.query.market || req.headers["x-market"] || "").toUpperCase();
  if (explicit === "FOREIGN" || explicit === "WNA") return "FOREIGN";
  if (explicit === "DOMESTIC" || explicit === "WNI") return "DOMESTIC";
  try {
    const ip = ipOf(req);
    // Skip private/loopback ranges — treat as domestic.
    if (ip && !/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|127\.|::1|fc|fd)/.test(ip)) {
      const geo = await geoip.lookup(ip);
      if (geo && geo.country && geo.country !== "ID") return "FOREIGN";
    }
  } catch { /* geoip failure → default domestic */ }
  return "DOMESTIC";
}
/**
 * Bump public display prices for foreign guests. Walks the tree; when it enters
 * a hotel node (has `foreignMarkupPct`), that hotel's override becomes the active
 * markup for it and its nested rooms/rate-plans/offers. Mutates a per-request
 * copy (cache stores the raw domestic value), and drops the policy field.
 */
function applyMarket(node: any, pct: number): any {
  if (Array.isArray(node)) { for (const n of node) applyMarket(n, pct); return node; }
  if (node && typeof node === "object") {
    let ctxPct = pct;
    if (Object.prototype.hasOwnProperty.call(node, "foreignMarkupPct")) {
      const own = (node as any).foreignMarkupPct;
      ctxPct = own === null || own === undefined ? pct : Number(own);
    }
    for (const k of Object.keys(node)) {
      if (MARKET_PRICE_FIELDS.has(k) && typeof node[k] === "number" && ctxPct > 0) {
        node[k] = Math.round((node[k] * (100 + ctxPct)) / 100);
      } else if (k !== "foreignMarkupPct") {
        applyMarket(node[k], ctxPct);
      }
    }
  }
  return node;
}

app.use((req, res, next) => {
  const orig = res.json.bind(res);
  const privileged = PRIVILEGED_PATH.test(req.path);
  res.json = (body: any) => {
    let out = flattenFacilities(body);
    if (!privileged) {
      // Foreign market markup (public catalog only), applied BEFORE stripB2B
      // removes the policy field. Domestic / disabled → no change.
      if (res.locals.market === "FOREIGN" && Number(res.locals.foreignPct) > 0 && MARKET_PATH.test(req.path)) {
        out = applyMarket(out, Number(res.locals.foreignPct));
      }
      out = stripB2B(out);
    }
    return orig(out);
  };
  next();
});

// Resolve guest market + global foreign markup for public catalog requests only.
app.use(async (req, res, next) => {
  try {
    if (!PRIVILEGED_PATH.test(req.path) && MARKET_PATH.test(req.path)) {
      const s = await getSettings();
      if (s.foreign_market_enabled === "1") {
        res.locals.market = await resolveMarket(req);
        res.locals.foreignPct = Math.min(Math.max(Number(s.foreign_markup_pct) || 0, 0), 100);
      }
    }
  } catch { /* fail soft → domestic */ }
  next();
});
app.use(express.urlencoded({ extended: true })); // provider webhooks (form-encoded)

// Shared Redis store so rate limits hold ACROSS instances & survive restarts.
const rlStore = () => new RedisStore({ sendCommand: (...args: string[]) => (redis() as any).call(...args), prefix: "rl:" });

// ── Brute-force protection on auth-sensitive endpoints ──
// Direct clients (mobile via nginx, external) are limited per real IP. Requests
// from the internal web tier (Docker private IP) are skipped — the web portal
// rate-limits per real client IP itself, so its shared IP must not be throttled.
const isInternal = (req: any) => {
  const ip = String(req.ip || "").replace("::ffff:", "");
  return ip === "127.0.0.1" || ip === "::1" || ip.startsWith("10.") || ip.startsWith("192.168.") ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(ip);
};
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, limit: 12, standardHeaders: true, legacyHeaders: false, skip: isInternal, store: rlStore(),
  message: { error: "Terlalu banyak percobaan. Coba lagi dalam beberapa menit." },
});
const otpLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, limit: 6, standardHeaders: true, legacyHeaders: false, skip: isInternal, store: rlStore(),
  message: { error: "Terlalu banyak permintaan kode. Coba lagi nanti." },
});

const PORT = config.port;
const PUBLIC_ORIGIN = process.env.PUBLIC_ORIGIN || "https://api.miruum.id";
const rupiah = (n: number) => "Rp " + Math.round(n).toLocaleString("id-ID");

const publicUser = (u: any) => ({
  id: u.id,
  name: u.name,
  email: u.email,
  role: u.role,
  phone: u.phone,
  gender: u.gender,
  birthDate: u.birthDate,
  avatarUrl: u.avatarUrl,
  title: u.title,
  nationality: u.nationality,
  idType: u.idType,
  idNumber: u.idNumber,
  address: u.address,
  city: u.city,
});

// Role guard — verifies JWT then checks the user's role from DB.
function requireRole(...roles: string[]) {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    requireAuth(req, res, async () => {
      const user = await prisma.user.findUnique({ where: { id: req.userId } });
      if (!user || !roles.includes(user.role)) return res.status(403).json({ error: "Akses ditolak" });
      (req as any).role = user.role;
      (req as any).userEmail = user.email;
      next();
    });
  };
}

// Fire-and-forget audit trail for sensitive admin/partner actions.
function audit(req: AuthRequest, action: string, entity?: string, entityId?: string, meta?: any) {
  prisma.auditLog.create({
    data: {
      actorId: req.userId ?? null, actorRole: (req as any).role ?? null, actorEmail: (req as any).userEmail ?? null,
      action, entity: entity ?? null, entityId: entityId ?? null, meta: meta ?? undefined,
      ip: (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.ip || null,
    },
  }).catch((e) => console.error("audit failed:", e.message));
}

// One-time verification codes (OTP / password reset). Only the hash is stored.
const hashCode = (raw: string) => crypto.createHash("sha256").update(raw).digest("hex");
async function issueCode(userId: string, purpose: "OTP" | "RESET", digits = 6, ttlMin = 10): Promise<string> {
  const code = String(Math.floor(Math.random() * Math.pow(10, digits))).padStart(digits, "0");
  await prisma.verificationCode.updateMany({ where: { userId, purpose, usedAt: null }, data: { usedAt: new Date() } }); // invalidate old
  await prisma.verificationCode.create({ data: { userId, purpose, codeHash: hashCode(code), expiresAt: new Date(Date.now() + ttlMin * 60000) } });
  return code;
}
async function checkCode(userId: string, purpose: "OTP" | "RESET", raw: string): Promise<boolean> {
  const rec = await prisma.verificationCode.findFirst({
    where: { userId, purpose, usedAt: null, expiresAt: { gt: new Date() }, codeHash: hashCode(raw) },
    orderBy: { createdAt: "desc" },
  });
  if (!rec) return false;
  await prisma.verificationCode.update({ where: { id: rec.id }, data: { usedAt: new Date() } });
  return true;
}

// ─────────────────────────── Health ───────────────────────────
app.get("/api/health", async (_req, res) => {
  let redisOk = false;
  try { redisOk = (await redis().ping()) === "PONG"; } catch { redisOk = false; }
  res.json({ ok: true, service: "miruum", ts: Date.now(), redis: redisOk, minio: storageReady() });
});

// ─────────────────────────── Auth ───────────────────────────
app.post("/api/auth/register", authLimiter, async (req, res) => {
  const schema = z.object({
    name: z.string().min(2),
    email: z.string().email(),
    password: z.string().min(6),
    phone: z.string().optional(),
    consent: z.coerce.boolean().optional(), // explicit Privacy Policy consent (UU PDP)
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Data tidak valid", details: parsed.error.issues });
  const { name, email, password, phone } = parsed.data;
  const exists = await prisma.user.findUnique({ where: { email } });
  if (exists) return res.status(409).json({ error: "Email sudah terdaftar" });
  const user = await prisma.user.create({
    // Registering after being shown the consent notice records consent (UU PDP);
    // the timestamp is our evidence of when it was given.
    data: { name, email, phone: phone || null, passwordHash: await bcrypt.hash(password, 10), privacyConsentAt: new Date() },
  });
  res.json({ ...(await issueSession(user.id)), user: publicUser(user) });
});

function deviceLabel(req: any): string | null {
  return String(req.headers["x-device"] || req.headers["user-agent"] || "").slice(0, 120) || null;
}
app.post("/api/auth/login", authLimiter, async (req, res) => {
  const schema = z.object({ email: z.string().email(), password: z.string(), code: z.string().optional() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Data tidak valid" });
  const { email, password } = parsed.data;
  const device = deviceLabel(req);
  const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.ip || null;
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return res.status(401).json({ error: "Pengguna tidak terdaftar" });
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    await prisma.loginEvent.create({ data: { userId: user.id, device, ip, ok: false } }).catch(() => {});
    return res.status(401).json({ error: "Email atau kata sandi salah" });
  }
  // Two-factor (email OTP): first call issues a code; second call verifies it.
  if (user.twoFactorEnabled) {
    if (!parsed.data.code) {
      const code = await issueCode(user.id, "OTP");
      try { await sendMail(user.email, "Kode Masuk Miruum", `Kode verifikasi login kamu: ${code}\nBerlaku 10 menit. Abaikan jika ini bukan kamu.`); } catch { /* dev: code still valid */ }
      return res.json({ twoFactorRequired: true });
    }
    if (!(await checkCode(user.id, "OTP", parsed.data.code))) return res.status(401).json({ error: "Kode verifikasi salah / kedaluwarsa" });
  }
  await prisma.loginEvent.create({ data: { userId: user.id, device, ip, ok: true } }).catch(() => {});
  res.json({ ...(await issueSession(user.id, device ?? undefined)), user: publicUser(user) });
});

// Sign in / register with a Google ID token (from google_sign_in on the app).
app.post("/api/auth/google", authLimiter, async (req, res) => {
  const idToken = String(req.body?.idToken || "");
  if (!idToken) return res.status(400).json({ error: "idToken wajib" });
  try {
    const info: any = await (await fetch("https://oauth2.googleapis.com/tokeninfo?id_token=" + encodeURIComponent(idToken))).json();
    if (info.error_description || !info.email) return res.status(401).json({ error: "Token Google tidak valid" });
    const s = await getSettings();
    if (s.google_client_id && info.aud !== s.google_client_id) return res.status(401).json({ error: "Audience token tidak cocok" });
    if (info.email_verified === "false") return res.status(401).json({ error: "Email Google belum terverifikasi" });
    const email = String(info.email).toLowerCase();
    let user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      user = await prisma.user.create({ data: { name: info.name || email.split("@")[0], email, passwordHash: await bcrypt.hash(makeCode() + makeCode(), 10), role: "USER" } });
    }
    res.json({ ...(await issueSession(user.id)), user: publicUser(user) });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Exchange a valid refresh token for a fresh access+refresh pair (rotation).
app.post("/api/auth/refresh", async (req, res) => {
  const raw = String(req.body?.refreshToken || "");
  const rotated = await rotateRefresh(raw);
  if (!rotated) return res.status(401).json({ error: "Sesi berakhir, silakan masuk lagi" });
  const user = await prisma.user.findUnique({ where: { id: rotated.userId } });
  if (!user) return res.status(401).json({ error: "Sesi tidak valid" });
  res.json({ token: rotated.token, refreshToken: rotated.refreshToken, user: publicUser(user) });
});

// Logout — revoke the presented refresh token (this device). ?all=1 → all devices.
app.post("/api/auth/logout", optionalAuth, async (req: AuthRequest, res) => {
  const raw = String(req.body?.refreshToken || "");
  if (req.query.all === "1" && req.userId) await revokeAllRefresh(req.userId);
  else await revokeRefresh(raw);
  res.json({ ok: true });
});

// Real OTP — a random code is hashed + stored with a 10-min expiry and delivered
// via email/WhatsApp. Verified against the stored hash (no bypass code).
app.post("/api/auth/otp/request", otpLimiter, requireAuth, async (req: AuthRequest, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  const settings = await getSettings();
  const noChannel = settings.mail_enabled !== "1" && settings.wa_enabled !== "1";
  // Honest: without a delivery channel the user can never receive the code, so
  // OTP is genuinely unavailable — don't pretend, don't leak the code in prod.
  if (noChannel && process.env.NODE_ENV === "production") {
    return res.status(503).json({ error: "Verifikasi OTP belum aktif — email/WhatsApp belum dikonfigurasi di Back Office" });
  }
  const code = await issueCode(user.id, "OTP", 4, 10);
  await dispatch(prisma, {
    userId: user.id, title: "Kode Verifikasi Miruum",
    body: `Kode OTP Anda: ${code}. Berlaku 10 menit. Jangan bagikan ke siapa pun.`,
    type: "otp", email: user.email, phone: user.phone || undefined,
  });
  // Dev-only convenience so local testing works without SMTP — NEVER in production.
  res.json({ ok: true, ...(noChannel && process.env.NODE_ENV !== "production" ? { devCode: code } : {}) });
});
app.post("/api/auth/otp/verify", otpLimiter, requireAuth, async (req: AuthRequest, res) => {
  const code = String(req.body?.code ?? "");
  if (!/^\d{4,6}$/.test(code)) return res.status(400).json({ error: "Format kode tidak valid" });
  if (await checkCode(req.userId!, "OTP", code)) return res.json({ ok: true });
  return res.status(400).json({ error: "Kode OTP salah atau kedaluwarsa" });
});

// Forgot password — issues a real 6-digit reset code, hashed + stored (15-min
// expiry) and delivered via email/WhatsApp. Never reveals whether the email exists.
app.post("/api/auth/forgot", authLimiter, async (req, res) => {
  const email = String(req.body?.email ?? "").toLowerCase();
  const user = await prisma.user.findUnique({ where: { email } });
  if (user) {
    const code = await issueCode(user.id, "RESET", 6, 15);
    await dispatch(prisma, {
      userId: user.id, title: "Reset Kata Sandi Miruum",
      body: `Kode reset kata sandi Anda: ${code}. Berlaku 15 menit. Abaikan bila Anda tidak memintanya.`,
      type: "reset", email: user.email, phone: user.phone || undefined,
    });
  }
  // Never reveal whether the email exists.
  res.json({ ok: true });
});

// Reset password with the code.
app.post("/api/auth/reset", authLimiter, async (req, res) => {
  const schema = z.object({ email: z.string().email(), code: z.string(), password: z.string().min(6) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Kata sandi baru minimal 6 karakter" });
  const user = await prisma.user.findUnique({ where: { email: parsed.data.email.toLowerCase() } });
  if (!user) return res.status(400).json({ error: "Kode reset salah atau kedaluwarsa" });
  if (!(await checkCode(user.id, "RESET", parsed.data.code))) return res.status(400).json({ error: "Kode reset salah atau kedaluwarsa" });
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(parsed.data.password, 10) } });
  await revokeAllRefresh(user.id); // invalidate all sessions after a password reset
  res.json({ ok: true });
});

app.get("/api/auth/me", requireAuth, async (req: AuthRequest, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  if (!user) return res.status(404).json({ error: "Not found" });
  res.json({ user: publicUser(user) });
});

// Change password (while logged in).
app.post("/api/auth/change-password", requireAuth, async (req: AuthRequest, res) => {
  const schema = z.object({ currentPassword: z.string(), newPassword: z.string().min(6) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Kata sandi baru minimal 6 karakter" });
  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  if (!user) return res.status(404).json({ error: "Pengguna tidak ditemukan" });
  if (!(await bcrypt.compare(parsed.data.currentPassword, user.passwordHash)))
    return res.status(400).json({ error: "Kata sandi saat ini salah" });
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(parsed.data.newPassword, 10) } });
  res.json({ ok: true });
});

// ── UU PDP: data subject rights ──
// Right to data portability — export everything we hold about the user.
app.get("/api/auth/export", requireAuth, async (req: AuthRequest, res) => {
  const [user, bookings, reviews, loyalty, threads, savedGuests] = await Promise.all([
    prisma.user.findUnique({ where: { id: req.userId }, select: { id: true, name: true, email: true, phone: true, gender: true, birthDate: true, title: true, nationality: true, idType: true, idNumber: true, address: true, city: true, loyaltyPoints: true, createdAt: true } }),
    prisma.booking.findMany({ where: { userId: req.userId }, include: { hotel: { select: { name: true } }, room: { select: { name: true } } } }),
    prisma.review.findMany({ where: { userId: req.userId } }),
    prisma.loyaltyTxn.findMany({ where: { userId: req.userId } }),
    prisma.hotelThread.findMany({ where: { userId: req.userId }, include: { messages: true } }),
    prisma.savedGuest.findMany({ where: { userId: req.userId } }),
  ]);
  res.setHeader("Content-Disposition", `attachment; filename="miruum-data-${req.userId}.json"`);
  res.json({ exportedAt: new Date().toISOString(), profile: user, bookings, reviews, loyalty, messages: threads, savedGuests });
});

// Right to erasure — anonymize PII but keep booking records (legal/financial
// retention), revoke all sessions, and lock the account.
app.post("/api/auth/delete-account", requireAuth, async (req: AuthRequest, res) => {
  const password = String(req.body?.password ?? "");
  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  if (!user) return res.status(404).json({ error: "Pengguna tidak ditemukan" });
  // Google-created accounts have a random password; allow deletion via a typed confirmation instead.
  const confirmed = req.body?.confirm === "HAPUS";
  if (!confirmed && !(await bcrypt.compare(password, user.passwordHash)))
    return res.status(400).json({ error: "Kata sandi salah. Atau kirim confirm:\"HAPUS\"." });
  const anon = `deleted_${user.id}@deleted.local`;
  await prisma.$transaction([
    prisma.booking.updateMany({ where: { userId: user.id }, data: { bookerName: "Pengguna Dihapus", bookerEmail: anon, bookerPhone: "-" } }),
    prisma.savedGuest.deleteMany({ where: { userId: user.id } }),
    prisma.hotelThread.deleteMany({ where: { userId: user.id } }),
    prisma.review.updateMany({ where: { userId: user.id }, data: { authorName: "Pengguna Dihapus" } }),
    prisma.user.update({ where: { id: user.id }, data: {
      name: "Pengguna Dihapus", email: anon, phone: null, avatarUrl: null, gender: null, birthDate: null,
      title: null, nationality: null, idType: null, idNumber: null, address: null, city: null,
      passwordHash: await bcrypt.hash(crypto.randomBytes(24).toString("hex"), 10),
    } }),
  ]);
  await revokeAllRefresh(user.id);
  audit(req, "account.delete", "User", user.id);
  res.json({ ok: true, message: "Akun dihapus. Data pribadi dianonimkan; catatan transaksi disimpan sesuai kewajiban hukum." });
});

// ── UU PDP: data retention — periodically purge stale sensitive data ──
async function runRetention() {
  try {
    const now = Date.now();
    const [codes, tokens, logs] = await Promise.all([
      prisma.verificationCode.deleteMany({ where: { OR: [{ usedAt: { not: null } }, { expiresAt: { lt: new Date(now - 24 * 3600_000) } }] } }),
      prisma.refreshToken.deleteMany({ where: { OR: [{ revokedAt: { not: null } }, { expiresAt: { lt: new Date() } }] } }),
      prisma.auditLog.deleteMany({ where: { createdAt: { lt: new Date(now - 365 * 86400_000) } } }), // keep 12 months
    ]);
    logger.info({ codes: codes.count, tokens: tokens.count, logs: logs.count }, "retention purge done");
  } catch (e: any) { logger.error({ err: e }, "retention purge failed"); }
}

// Recompute a hotel's headline price from its rooms; track "harga turun".
async function refreshPriceFrom(hotelId: string) {
  const rooms = await prisma.room.findMany({ where: { hotelId }, select: { price: true } });
  if (!rooms.length) return;
  const min = Math.min(...rooms.map((r) => r.price));
  const h = await prisma.hotel.findUnique({ where: { id: hotelId }, select: { priceFrom: true, priceBefore: true } });
  if (!h) return;
  const data: any = { priceFrom: min };
  if (min < h.priceFrom) data.priceBefore = h.priceFrom;                 // dropped → remember old
  else if (h.priceBefore && min >= h.priceBefore) data.priceBefore = null; // recovered → clear badge
  await prisma.hotel.update({ where: { id: hotelId }, data });
}

// Notify price-alert watchers when a hotel's price drops below their baseline.
async function runPriceAlerts() {
  try {
    const alerts = await prisma.priceAlert.findMany({ include: { hotel: { select: { id: true, name: true, priceFrom: true } } } });
    let sent = 0;
    for (const a of alerts) {
      const cur = a.hotel.priceFrom;
      const base = a.lastNotifiedPrice ?? cur;
      if (cur < base) {
        await dispatch(prisma, { userId: a.userId, title: `Harga turun — ${a.hotel.name}`,
          body: `Sekarang ${rupiah(cur)}/malam (sebelumnya ${rupiah(base)}). Pesan sebelum naik lagi!`, type: "success" });
        await prisma.priceAlert.update({ where: { id: a.id }, data: { lastNotifiedPrice: cur } });
        sent++;
      } else if (cur > base) {
        await prisma.priceAlert.update({ where: { id: a.id }, data: { lastNotifiedPrice: cur } });
      }
    }
    if (sent) logger.info({ sent }, "price-drop alerts sent");
  } catch (e: any) { logger.error({ err: e }, "price alerts failed"); }
}

// Ask guests to review after they've checked out (once per stay).
async function runReviewRequests() {
  try {
    const bookings = await prisma.booking.findMany({
      where: { status: { in: ["PAID", "COMPLETED"] }, reviewRequestedAt: null, checkOut: { lt: new Date() } },
      select: { id: true, userId: true, hotelId: true, code: true, hotel: { select: { name: true } } }, take: 200,
    });
    let sent = 0;
    for (const b of bookings) {
      const already = await prisma.review.findFirst({ where: { hotelId: b.hotelId, userId: b.userId }, select: { id: true } });
      if (!already) {
        await dispatch(prisma, { userId: b.userId, title: `Bagaimana menginap di ${b.hotel.name}?`,
          body: "Bagikan ulasanmu & bantu tamu lain. Ketuk untuk memberi rating & foto.", type: "info", hotelName: b.hotel.name, orderCode: b.code });
        sent++;
      }
      await prisma.booking.update({ where: { id: b.id }, data: { reviewRequestedAt: new Date() } });
    }
    if (sent) logger.info({ sent }, "post-stay review requests sent");
  } catch (e: any) { logger.error({ err: e }, "review requests failed"); }
}

app.put("/api/auth/me", requireAuth, async (req: AuthRequest, res) => {
  const schema = z.object({
    name: z.string().min(2).optional(),
    phone: z.string().optional(),
    gender: z.string().optional(),
    birthDate: z.string().optional(),
    avatarUrl: z.string().optional(),
    title: z.string().optional(),
    nationality: z.string().optional(),
    idType: z.string().optional(),
    idNumber: z.string().optional(),
    address: z.string().optional(),
    city: z.string().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Data tidak valid" });
  const user = await prisma.user.update({ where: { id: req.userId }, data: parsed.data });
  res.json({ user: publicUser(user) });
});

// ─────────────────────────── Uploads (MinIO) ───────────────────────────
// Accepts a base64 data URL, stores the image in MinIO, returns its public URL.
app.post("/api/uploads", requireAuth, async (req: AuthRequest, res) => {
  const schema = z.object({
    dataUrl: z.string().regex(/^data:image\/(png|jpe?g|webp);base64,/, "Format gambar tidak didukung"),
    folder: z.enum(["avatars", "hotels"]).default("avatars"),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Data tidak valid" });
  if (!storageReady()) return res.status(503).json({ error: "Penyimpanan belum siap" });
  const m = parsed.data.dataUrl.match(/^data:(image\/[a-z]+);base64,(.*)$/s);
  if (!m) return res.status(400).json({ error: "Data gambar tidak valid" });
  const [, contentType, b64] = m;
  const buf = Buffer.from(b64, "base64");
  if (buf.length > 6 * 1024 * 1024) return res.status(413).json({ error: "Ukuran gambar maksimal 6MB" });
  const ext = contentType.split("/")[1].replace("jpeg", "jpg");
  const key = `${parsed.data.folder}/${req.userId}-${Date.now()}.${ext}`;
  try {
    const url = await putObject(key, buf, contentType);
    res.json({ url });
  } catch (e: any) {
    res.status(500).json({ error: "Gagal mengunggah gambar" });
  }
});

// ─────────────────────────── Hotels ───────────────────────────
/**
 * Every region id in the subtree rooted at `id` (the id itself included).
 * Recursive CTE so one query walks Provinsi → Kab/Kota → Kecamatan → Desa;
 * the region table holds ~88k rows, so this must not be done in JS.
 */
async function regionWithDescendants(id: string): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    WITH RECURSIVE subtree AS (
      SELECT id FROM "Region" WHERE id = ${id}
      UNION ALL
      SELECT r.id FROM "Region" r JOIN subtree s ON r."parentId" = s.id
    )
    SELECT id FROM subtree`;
  return rows.map((r) => r.id);
}

const hotelCard = {
  id: true, name: true, slug: true, city: true, address: true, rating: true,
  reviewCount: true, priceFrom: true, priceBefore: true, starRating: true, imageUrl: true,
  isPromo: true, promoLabel: true, propertyType: true, lat: true, lng: true,
  foreignMarkupPct: true, // for nationality (market) pricing on public catalog
  // A few facility chips so list cards can show what the property offers
  // (richer cards convert better — same as the big OTAs).
  facilities: { take: 3, select: { facility: { select: { id: true, name: true, icon: true } } } },
  channel: { select: { code: true, name: true, type: true, color: true, commissionPct: true } },
} as const;

// A hotel is publicly discoverable ONLY when it's actually bookable: it must have
// at least one room with a real price. This hides half-set-up properties (a hotel
// that just registered but hasn't added inventory yet) from search/discovery, so
// customers never see an un-bookable listing. Admin/partner endpoints don't use
// this — owners still manage their in-progress hotels in the Extranet.
const PUBLIC_HOTEL_GATE = { rooms: { some: { price: { gt: 0 } } } };

app.get("/api/hotels", async (req, res) => {
  const { query, city, minPrice, maxPrice, star, sort } = req.query as Record<string, string>;
  const where: any = { ...PUBLIC_HOTEL_GATE };
  if (query) where.OR = [
    { name: { contains: query, mode: "insensitive" } },
    { city: { contains: query, mode: "insensitive" } },
    { address: { contains: query, mode: "insensitive" } },
  ];
  if (city) where.city = { contains: city, mode: "insensitive" };
  // Structured area search: a regionId at ANY level matches properties in that
  // region AND all its descendants, so picking a province/kabupaten also finds
  // hotels linked at kecamatan/desa level.
  if (req.query.regionId) {
    where.regionId = { in: await regionWithDescendants(String(req.query.regionId)) };
  }
  if (minPrice || maxPrice) where.priceFrom = {
    ...(minPrice ? { gte: Number(minPrice) } : {}),
    ...(maxPrice ? { lte: Number(maxPrice) } : {}),
  };
  if (star) where.starRating = { gte: Number(star) };
  if (req.query.promo) where.isPromo = true;
  if (req.query.minRating) where.rating = { gte: Number(req.query.minRating) };
  // Property type filter (HOTEL | VILLA | APARTMENT | HOMESTAY | GUESTHOUSE | HOSTEL | RESORT).
  const ptypes = String(req.query.propertyType || "").split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
  if (ptypes.length) where.propertyType = { in: ptypes };
  // Room-level amenities on the property.
  const roomSome: any = {};
  if (req.query.freeCancellation === "1") roomSome.freeCancellation = true;
  if (req.query.refundable === "1") roomSome.refundable = true;
  if (req.query.breakfast === "1") roomSome.breakfast = true;
  if (Object.keys(roomSome).length) where.rooms = { some: roomSome };
  // Facilities filter — hotels that have ALL of the selected facility ids.
  const facIds = String(req.query.facilities || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (facIds.length) where.AND = facIds.map((id) => ({ facilities: { some: { facilityId: id } } }));
  const orderBy =
    sort === "price_asc" ? { priceFrom: "asc" as const } :
    sort === "price_desc" ? { priceFrom: "desc" as const } :
    sort === "rating" ? { rating: "desc" as const } :
    sort === "popular" ? { reviewCount: "desc" as const } :
    { createdAt: "desc" as const };

  // GPS "near me" search: given lat/lng, sort by real distance (haversine) and
  // optionally keep only hotels within `radius` km (default 100).
  const lat = Number(req.query.lat), lng = Number(req.query.lng);
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    const radius = Number(req.query.radius) || 100;
    where.lat = { not: null };
    where.lng = { not: null };
    const all = await prisma.hotel.findMany({ where, select: hotelCard });
    const hav = (aLat: number, aLng: number, bLat: number, bLng: number) => {
      const R = 6371, toRad = (d: number) => (d * Math.PI) / 180;
      const dLat = toRad(bLat - aLat), dLng = toRad(bLng - aLng);
      const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
      return 2 * R * Math.asin(Math.sqrt(s));
    };
    const hotels = all
      .map((h: any) => ({ ...h, distanceKm: Math.round(hav(lat, lng, h.lat, h.lng) * 10) / 10 }))
      .filter((h: any) => h.distanceKm <= radius)
      .sort((a: any, b: any) => a.distanceKm - b.distanceKm);
    return res.json({ hotels, near: true });
  }

  const hotels = await prisma.hotel.findMany({ where, orderBy, select: hotelCard });
  res.json({ hotels });
});

// Public: nationality (market) pricing status + the market resolved for THIS
// request (explicit ?market= wins, else IP default). Lets the web/app render a
// Domestik/Asing selector and show the right default. Disabled → enabled:false.
app.get("/api/market", async (req, res) => {
  const s = await getSettings();
  const enabled = s.foreign_market_enabled === "1";
  // NB: use `markup` (not `foreignMarkupPct`/`markupPct`) — those keys are in the
  // public-strip set and would be deleted from this response.
  const markup = Math.min(Math.max(Number(s.foreign_markup_pct) || 0, 0), 100);
  const market = enabled ? await resolveMarket(req) : "DOMESTIC";
  res.json({ enabled, market, markup });
});

// ───────────────────── External supply (Hotelbeds bedbank) ─────────────────────
// REAL connectivity — every call hits the provider's live REST API. When no
// external source is configured, search returns an honest empty set with
// `externalConfigured:false` (never fabricated hotels).

// Live availability from all configured external bedbanks for a stay.
app.post("/api/supply/search", async (req, res) => {
  const schema = z.object({
    destination: z.string().optional(),          // provider destination code (e.g. Hotelbeds "BCN")
    hotelCodes: z.array(z.string()).optional(),
    lat: z.coerce.number().optional(), lng: z.coerce.number().optional(), radiusKm: z.coerce.number().optional(),
    checkIn: z.string().min(8), checkOut: z.string().min(8),
    adults: z.coerce.number().int().min(1).default(2),
    children: z.coerce.number().int().min(0).default(0),
    rooms: z.coerce.number().int().min(1).default(1),
  });
  const p = schema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Parameter pencarian tidak valid" });
  const providers = await activeSupplyProviders();
  if (!providers.length) return res.json({ external: [], externalConfigured: false, sources: [] });
  const occupancies = [{ rooms: p.data.rooms, adults: p.data.adults, children: p.data.children }];
  const geo = (p.data.lat != null && p.data.lng != null) ? { latitude: p.data.lat, longitude: p.data.lng, radiusKm: p.data.radiusKm } : undefined;
  const results = await Promise.allSettled(providers.map((pr) =>
    pr.search({ destinationCode: p.data.destination, hotelCodes: p.data.hotelCodes, geo, stay: { checkIn: p.data.checkIn, checkOut: p.data.checkOut }, occupancies })));
  const external: any[] = [];
  const errors: { source: string; error: string }[] = [];
  results.forEach((r, i) => {
    if (r.status === "fulfilled") external.push(...r.value);
    else errors.push({ source: providers[i].code, error: r.reason?.message || "gagal" });
  });
  // Convert supplier currency → IDR so the app shows rupiah; keep the original
  // net + currency for reference/transparency.
  const fx = await fxConverter();
  for (const h of external) {
    h.minRateIdr = fx(h.minRate, h.currency);
    if (h.maxRate != null) h.maxRateIdr = fx(h.maxRate, h.currency);
    for (const rm of h.rooms || []) rm.netIdr = fx(rm.net, h.currency);
  }
  res.json({ external, externalConfigured: true, sources: providers.map((pr) => pr.code), errors });
});

// Re-price a rateKey right before booking (bedbank prices can move).
app.post("/api/supply/checkrate", async (req, res) => {
  const source = String(req.body?.source || "HOTELBEDS").toUpperCase();
  const rateKey = String(req.body?.rateKey || "");
  if (!rateKey) return res.status(400).json({ error: "rateKey wajib" });
  try {
    const rate = await supplyProvider(source as any).checkRate(rateKey);
    res.json({ ok: true, rate });
  } catch (e: any) { res.status(502).json({ error: e.message }); }
});

// Book an external (bedbank) stay. Caches the hotel/room locally so the Booking
// has a real home, then confirms at the supplier. Auth required.
app.post("/api/supply/book", requireAuth, async (req: AuthRequest, res) => {
  const schema = z.object({
    source: z.string().default("HOTELBEDS"),
    rateKey: z.string().min(4),
    hotelName: z.string().min(2),
    supplierHotelCode: z.string().min(1),
    city: z.string().optional(),
    checkIn: z.string().min(8), checkOut: z.string().min(8),
    holder: z.object({ name: z.string().min(1), surname: z.string().min(1), email: z.string().optional(), phone: z.string().optional() }),
    paxes: z.array(z.object({ type: z.enum(["AD", "CH"]), name: z.string(), surname: z.string(), age: z.coerce.number().optional() })).min(1),
    guests: z.coerce.number().int().default(2), rooms: z.coerce.number().int().default(1),
  });
  const p = schema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Data pemesanan tidak valid", details: p.error.issues });
  const prov = supplyProvider(p.data.source.toUpperCase() as any);
  try {
    // Pay-first: verify the rate is still valid, cache the hotel/room, and create
    // a PENDING Miruum booking. The supplier booking happens on payment settle
    // (markPaymentPaid) so the guest pays Miruum BEFORE we commit at the bedbank.
    const rate = await prov.checkRate(p.data.rateKey);
    // Convert the supplier's nett (e.g. EUR) → IDR for everything the guest sees/pays.
    const fx = await fxConverter();
    const netIdr = fx(rate.net, rate.currency);
    const hotel = await prisma.hotel.upsert({
      where: { slug: `hb-${p.data.supplierHotelCode}` },
      create: { name: p.data.hotelName, slug: `hb-${p.data.supplierHotelCode}`, city: p.data.city || "", address: p.data.city || "", source: p.data.source.toUpperCase(), supplierHotelCode: p.data.supplierHotelCode, priceFrom: netIdr, description: "", imageUrl: "" },
      update: { name: p.data.hotelName, priceFrom: netIdr },
    }).catch(async () => prisma.hotel.findFirst({ where: { supplierHotelCode: p.data.supplierHotelCode } }) as any);
    let room = await prisma.room.findFirst({ where: { hotelId: hotel.id } });
    if (!room) room = await prisma.room.create({ data: { hotelId: hotel.id, name: "Supplier Rate", price: netIdr, stock: 99, capacity: p.data.guests || 2 } });
    const nights = Math.max(1, Math.round((+new Date(p.data.checkOut) - +new Date(p.data.checkIn)) / 86400000));
    const total = BigInt(netIdr);
    const booking = await prisma.booking.create({
      data: {
        code: makeCode(), userId: req.userId!, hotelId: hotel.id, roomId: room.id,
        source: p.data.source.toUpperCase(),
        supplierRef: rate.rateKey, // the checked rateKey → used to book at settle
        roomGuests: p.data.paxes as any, // pax list for the supplier booking
        checkIn: new Date(p.data.checkIn), checkOut: new Date(p.data.checkOut), nights,
        guests: p.data.guests, rooms: p.data.rooms,
        bookerName: `${p.data.holder.name} ${p.data.holder.surname}`.trim(),
        bookerEmail: p.data.holder.email || "", bookerPhone: p.data.holder.phone || "",
        roomPrice: total, taxFee: BigInt(0), totalPrice: total,
        status: "PENDING",
      },
    });
    // Client now pays via POST /api/bookings/:id/pay (same as any booking).
    res.json({ ok: true, booking: { id: booking.id, code: booking.code, status: "PENDING" }, rate, needsPayment: true });
  } catch (e: any) { res.status(502).json({ error: e.message }); }
});

// Cancel an external booking at the supplier (+ mark it cancelled locally).
app.post("/api/supply/bookings/:id/cancel", requireAuth, async (req: AuthRequest, res) => {
  const b = await prisma.booking.findFirst({ where: { id: req.params.id, userId: req.userId } });
  if (!b) return res.status(404).json({ error: "Pesanan tidak ditemukan" });
  if (b.source === "DIRECT" || !b.supplierBookingCode) return res.status(400).json({ error: "Bukan pesanan supplier eksternal" });
  try {
    const r = await supplyProvider(b.source as any).cancel(b.supplierBookingCode);
    await prisma.booking.update({ where: { id: b.id }, data: { status: "CANCELLED" } });
    res.json({ ok: true, status: r.status });
  } catch (e: any) { res.status(502).json({ error: e.message }); }
});

// Back Office: connectivity check for external supply + channel-manager providers.
app.get("/api/admin/supply/status", requireRole("ADMIN"), async (_req, res) => {
  const out: Record<string, { ok: boolean; detail: string }> = {};
  try { out.HOTELBEDS = await supplyProvider("HOTELBEDS").status(); } catch (e: any) { out.HOTELBEDS = { ok: false, detail: e.message }; }
  try { out.CHANNEX = await channexStatus(); } catch (e: any) { out.CHANNEX = { ok: false, detail: e.message }; }
  res.json({ providers: out });
});

// Back Office: pull Channex properties (ARI) into the catalog as source=CHANNEX.
app.post("/api/admin/supply/channex/sync", requireRole("ADMIN"), async (req, res) => {
  if (!(await channexConfigured())) return res.status(400).json({ error: "Channex belum diaktifkan / API key kosong" });
  try {
    const r = await syncChannex(prisma, req.body?.propertyId || undefined);
    await invalidate("miruum:");
    audit(req, "supply.channex.sync", "Supply", "CHANNEX", r);
    res.json({ ok: true, ...r });
  } catch (e: any) { res.status(502).json({ error: e.message }); }
});

// Channex webhook — ARI updates + booking events keep our cache fresh. Channex
// posts a signed payload; we re-sync the affected property (idempotent).
app.post("/api/webhooks/channex", async (req, res) => {
  const evt = req.body?.event || req.body?.type || "";
  const propertyId = req.body?.property_id || req.body?.data?.property_id;
  res.json({ ok: true }); // ack fast; Channex retries on non-2xx
  try {
    if (!(await channexConfigured())) return;
    if (propertyId && (evt === "ari" || evt === "availability" || String(evt).includes("ari"))) {
      await syncChannex(prisma, propertyId).catch((e) => console.warn("[channex webhook] sync failed", e.message));
      await invalidate("miruum:");
    }
  } catch (e: any) { console.warn("[channex webhook]", e.message); }
});

app.get("/api/hotels/promo", async (_req, res) => {
  const hotels = await prisma.hotel.findMany({ where: { isPromo: true, ...PUBLIC_HOTEL_GATE }, select: hotelCard });
  res.json({ hotels });
});

app.get("/api/hotels/recommended", async (_req, res) => {
  const hotels = await cached("miruum:hotels:recommended", 120, () =>
    prisma.hotel.findMany({ where: { ...PUBLIC_HOTEL_GATE }, orderBy: { rating: "desc" }, take: 10, select: hotelCard }));
  res.json({ hotels });
});

app.get("/api/hotels/:id", async (req, res) => {
  const hotel = await prisma.hotel.findUnique({
    where: { id: req.params.id },
    include: {
      photos: { orderBy: { sort: "asc" } },
      facilities: { include: { facility: true } },
      rooms: { include: {
        ratePlans: { where: { active: true }, orderBy: { sortOrder: "asc" } },
        photos: { orderBy: { sort: "asc" } }, // per-room photos (shown on the room card + booking)
      } },
      reviews: { orderBy: { createdAt: "desc" }, take: 8 },
      nearby: { orderBy: { distanceKm: "asc" } },
      channel: { select: { code: true, name: true, type: true, color: true, commissionPct: true } },
      offers: {
        orderBy: { price: "asc" },
        include: { channel: { select: { code: true, name: true, type: true, color: true } } },
      },
    },
  });
  if (!hotel) return res.status(404).json({ error: "Hotel tidak ditemukan" });
  // Category sub-score averages (0–10) across all reviews that rated them.
  const agg = await prisma.review.aggregate({
    where: { hotelId: hotel.id },
    _avg: { scoreCleanliness: true, scoreLocation: true, scoreStaff: true, scoreFacilities: true, scoreComfort: true, scoreValue: true },
    _count: true,
  });
  const rnd = (n: number | null) => (n == null ? null : Math.round(n * 10) / 10);
  res.json({
    hotel: {
      ...hotel,
      facilities: hotel.facilities.map((f) => f.facility),
      reviewScores: {
        cleanliness: rnd(agg._avg.scoreCleanliness), location: rnd(agg._avg.scoreLocation),
        staff: rnd(agg._avg.scoreStaff), facilities: rnd(agg._avg.scoreFacilities),
        comfort: rnd(agg._avg.scoreComfort), value: rnd(agg._avg.scoreValue),
      },
    },
  });
});

app.get("/api/hotels/:id/reviews", async (req, res) => {
  const reviews = await prisma.review.findMany({
    where: { hotelId: req.params.id },
    orderBy: { createdAt: "desc" },
  });
  res.json({ reviews });
});

// Submit a review (1–5 stars → stored 0–10) with optional category sub-scores
// (0–10) + photos. Marked "verified" when the guest has a completed stay here.
app.post("/api/hotels/:id/reviews", requireAuth, async (req: AuthRequest, res) => {
  const sub = z.number().min(0).max(10).optional();
  const schema = z.object({
    rating: z.number().min(1).max(5), body: z.string().min(3),
    scoreCleanliness: sub, scoreLocation: sub, scoreStaff: sub, scoreFacilities: sub, scoreComfort: sub, scoreValue: sub,
    photos: z.array(z.string()).max(6).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Beri rating & ulasan minimal 3 karakter" });
  const hotel = await prisma.hotel.findUnique({ where: { id: req.params.id } });
  if (!hotel) return res.status(404).json({ error: "Hotel tidak ditemukan" });
  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  // Verified reviews only: the guest must have a paid stay whose check-out has
  // passed (they actually stayed) — like Booking.com/Agoda. One review per stay.
  const stay = await prisma.booking.findFirst({
    where: { userId: req.userId, hotelId: hotel.id, status: { in: ["PAID", "COMPLETED"] }, checkOut: { lte: new Date() } },
    orderBy: { checkOut: "desc" }, select: { id: true },
  });
  if (!stay) return res.status(403).json({ error: "Hanya tamu yang telah menyelesaikan menginap di properti ini yang dapat memberi ulasan." });
  const dup = await prisma.review.findFirst({ where: { bookingId: stay.id }, select: { id: true } });
  if (dup) return res.status(400).json({ error: "Anda sudah memberi ulasan untuk pesanan ini." });
  const p = parsed.data;
  await prisma.review.create({
    data: {
      hotelId: hotel.id, userId: req.userId, authorName: user?.name ?? "Tamu", rating: p.rating * 2, body: p.body,
      scoreCleanliness: p.scoreCleanliness, scoreLocation: p.scoreLocation, scoreStaff: p.scoreStaff,
      scoreFacilities: p.scoreFacilities, scoreComfort: p.scoreComfort, scoreValue: p.scoreValue,
      photos: p.photos ?? [], verified: true, bookingId: stay.id,
    },
  });
  const agg = await prisma.review.aggregate({ where: { hotelId: hotel.id }, _avg: { rating: true }, _count: true });
  await prisma.hotel.update({
    where: { id: hotel.id },
    data: { rating: Math.round((agg._avg.rating ?? 0) * 10) / 10, reviewCount: agg._count },
  });
  await invalidate("miruum:");
  res.json({ ok: true, rating: agg._avg.rating, reviewCount: agg._count });
});

// Hotel-level price calendar: per date, the cheapest available room price.
app.get("/api/hotels/:id/availability", async (req, res) => {
  const { from, to } = req.query as Record<string, string>;
  const rooms = await prisma.room.findMany({ where: { hotelId: req.params.id }, select: { id: true, price: true } });
  if (rooms.length === 0) return res.json({ days: [] });
  const roomIds = rooms.map((r) => r.id);
  const where: any = { roomId: { in: roomIds } };
  if (from || to) where.date = { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) };
  const rows = await prisma.roomAvailability.findMany({ where, orderBy: { date: "asc" }, take: 1000 });
  const byDate: Record<string, { price: number; available: boolean }> = {};
  for (const r of rows) {
    const key = r.date.toISOString().slice(0, 10);
    const open = !r.closed && r.allotment > 0;
    if (!byDate[key]) byDate[key] = { price: open ? r.price : r.price, available: open };
    if (open && (!byDate[key].available || r.price < byDate[key].price)) byDate[key] = { price: r.price, available: true };
  }
  const days = Object.entries(byDate).map(([date, v]) => ({ date, price: v.price, available: v.available }));
  res.json({ days });
});

app.get("/api/hotels/:id/rooms", async (req, res) => {
  const rooms = await prisma.room.findMany({ where: { hotelId: req.params.id } });
  res.json({ rooms });
});

// Price comparison across every supply source for a hotel (cheapest first).
app.get("/api/hotels/:id/offers", async (req, res) => {
  const offers = await prisma.hotelOffer.findMany({
    where: { hotelId: req.params.id },
    orderBy: [{ available: "desc" }, { price: "asc" }],
    include: { channel: { select: { code: true, name: true, type: true, color: true } } },
  });
  const cheapest = offers.find((o) => o.available);
  res.json({ offers, bestOfferId: cheapest?.id ?? null });
});

// ─────────────────────────── Hotel Packages ───────────────────────────
const packageCard = {
  id: true, slug: true, title: true, city: true, imageUrl: true, nights: true,
  days: true, guests: true, originalPrice: true, price: true, discountPct: true,
  rating: true, reviewCount: true, starRating: true, badge: true, isPopular: true, inclusions: true, boardBasis: true,
} as const;

app.get("/api/packages", async (req, res) => {
  const { query, city, sort } = req.query as Record<string, string>;
  const where: any = {};
  if (query) where.OR = [
    { title: { contains: query, mode: "insensitive" } },
    { city: { contains: query, mode: "insensitive" } },
  ];
  if (city) where.city = { contains: city, mode: "insensitive" };
  const orderBy =
    sort === "price_asc" ? { price: "asc" as const } :
    sort === "price_desc" ? { price: "desc" as const } :
    sort === "rating" ? { rating: "desc" as const } :
    { isPopular: "desc" as const };
  const noFilter = !query && !city && !sort;
  const fetch = () => prisma.hotelPackage.findMany({ where, orderBy, select: packageCard });
  const packages = noFilter ? await cached("miruum:packages:all", 120, fetch) : await fetch();
  res.json({ packages });
});

app.get("/api/packages/:id", async (req, res) => {
  const pkg = await prisma.hotelPackage.findUnique({
    where: { id: req.params.id },
    include: {
      hotel: {
        include: {
          photos: { orderBy: { sort: "asc" } },
          facilities: { include: { facility: true } },
          reviews: { orderBy: { createdAt: "desc" }, take: 5 },
        },
      },
      room: true,
    },
  });
  if (!pkg) return res.status(404).json({ error: "Paket tidak ditemukan" });
  res.json({
    package: {
      ...pkg,
      hotel: { ...pkg.hotel, facilities: pkg.hotel.facilities.map((f) => f.facility) },
    },
  });
});

// ─────────────────────────── Supply channels ───────────────────────────
app.get("/api/channels", async (_req, res) => {
  const channels = await cached("miruum:channels:all", 300, () =>
    prisma.supplyChannel.findMany({
      where: { active: true }, orderBy: { sortOrder: "asc" },
      select: { id: true, code: true, name: true, type: true, color: true, commissionPct: true },
    }));
  res.json({ channels });
});

// ─────────────────────────── Promos & static ───────────────────────────
app.get("/api/promos", async (_req, res) => {
  const promos = await cached("miruum:promos:all", 300, () => prisma.promo.findMany());
  res.json({ promos });
});

// Home marketing banners (admin-managed).
app.get("/api/banners", async (_req, res) => {
  const banners = await cached("miruum:banners:all", 120, () =>
    prisma.banner.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }));
  res.json({ banners });
});

// Static content pages (T&C / Privacy / About) — public, app-facing.
app.get("/api/content", async (_req, res) => {
  const content = await prisma.content.findMany({ orderBy: { slug: "asc" } });
  res.json({ content });
});
app.get("/api/content/:slug", async (req, res) => {
  const content = await prisma.content.findUnique({ where: { slug: req.params.slug } });
  if (!content) return res.status(404).json({ error: "not found" });
  res.json({ content });
});

// Public app config (safe subset).
function moduleFlags(s: Record<string, string>) {
  return {
    hotel: true, // core, always on
    hotelPackage: s.moduleHotelPackage !== "0",
    tour: s.moduleTour !== "0",
    shuttle: s.moduleShuttle !== "0",
  };
}

app.get("/api/config", async (_req, res) => {
  const s = await getSettings();
  res.json({ taxPct: Number(s.taxPct), currency: s.currency, appName: s.appName, modules: moduleFlags(s) });
});

// Area autocomplete for the search box: match a region by name and return it
// with its full administrative path, plus how many properties it covers.
app.get("/api/regions/search", async (req, res) => {
  const q = String(req.query.q || "").trim();
  if (q.length < 2) return res.json({ regions: [] });
  try {
  const rows = await prisma.$queryRaw<
    { id: string; name: string; level: string; path: string; hotels: bigint }[]
  >`
    WITH RECURSIVE match AS (
      SELECT id, name, level, "parentId"
      FROM "Region"
      WHERE name ILIKE ${"%" + q + "%"}
        AND level IN ('PROVINCE', 'CITY', 'DISTRICT')
      ORDER BY CASE level WHEN 'CITY' THEN 0 WHEN 'DISTRICT' THEN 1 ELSE 2 END,
               (name ILIKE ${q + "%"}) DESC, name
      LIMIT 15
    ),
    subtree AS (
      SELECT m.id AS root, r.id FROM match m JOIN "Region" r ON r.id = m.id
      UNION ALL
      SELECT s.root, r.id FROM "Region" r JOIN subtree s ON r."parentId" = s.id
    )
    SELECT m.id, m.name, m.level,
           COALESCE(p.name, '') || CASE WHEN pp.name IS NOT NULL THEN ', ' || pp.name ELSE '' END AS path,
           (SELECT COUNT(*) FROM "Hotel" h WHERE h."regionId" IN (SELECT id FROM subtree s WHERE s.root = m.id)) AS hotels
    FROM match m
    LEFT JOIN "Region" p  ON p.id  = m."parentId"
    LEFT JOIN "Region" pp ON pp.id = p."parentId"`;
  res.json({
    regions: rows.map((r) => ({
      id: r.id, name: r.name, level: r.level, path: r.path, hotels: Number(r.hotels),
    })),
  });
  } catch (e: any) {
    logger.error({ err: e?.message }, "[regions/search] failed");
    res.json({ regions: [] }); // autocomplete must never break the search box
  }
});

// Popular destinations with a real "from" price + property count per city.
app.get("/api/destinations", async (_req, res) => {
  const destinations = await cached("miruum:destinations", 300, async () => {
    const grouped = await prisma.hotel.groupBy({
      by: ["city"],
      where: { ...PUBLIC_HOTEL_GATE }, // only count bookable properties
      _count: { _all: true },
      _min: { priceFrom: true },
      orderBy: { _count: { city: "desc" } },
      take: 8,
    });
    // One representative image per city (cheapest property).
    const out = [];
    for (const g of grouped) {
      if (!g.city) continue;
      const h = await prisma.hotel.findFirst({
        where: { city: g.city },
        orderBy: { priceFrom: "asc" },
        select: { imageUrl: true },
      });
      out.push({
        name: g.city,
        count: g._count._all,
        priceFrom: g._min.priceFrom ?? 0,
        imageUrl: h?.imageUrl ?? null,
      });
    }
    return out;
  });
  res.json({ destinations });
});

// Real, non-fabricated social proof: aggregate counts + genuine guest reviews.
app.get("/api/site-stats", async (_req, res) => {
  const stats = await cached("miruum:site-stats", 300, async () => {
    const [hotels, cityGroups, reviewCount, ratingAgg, completed] = await Promise.all([
      prisma.hotel.count(),
      prisma.hotel.groupBy({ by: ["city"] }),
      prisma.review.count(),
      prisma.review.aggregate({ _avg: { rating: true } }),
      prisma.booking.count({ where: { status: { in: ["PAID", "COMPLETED"] } } }),
    ]);
    const top = await prisma.review.findMany({
      where: { rating: { gte: 8.5 }, body: { not: "" } },
      orderBy: [{ rating: "desc" }, { createdAt: "desc" }],
      take: 6,
      select: {
        id: true, authorName: true, rating: true, body: true, createdAt: true,
        hotel: { select: { name: true, city: true } },
      },
    });
    return {
      hotels,
      cities: cityGroups.length,
      reviews: reviewCount,
      avgRating: Number((ratingAgg._avg.rating ?? 0).toFixed(1)),
      bookings: completed,
      topReviews: top,
    };
  });
  res.json(stats);
});

// Validate a promo code against an amount → returns the discount.
app.post("/api/promos/validate", async (req, res) => {
  const schema = z.object({ code: z.string(), amount: z.coerce.number().int().min(0) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Data tidak valid" });
  const promo = await prisma.promo.findUnique({ where: { code: parsed.data.code.toUpperCase() } });
  if (!promo) return res.status(404).json({ valid: false, error: "Kode promo tidak ditemukan" });
  const discount = Math.round((parsed.data.amount * promo.discountPct) / 100);
  res.json({ valid: true, code: promo.code, title: promo.title, discountPct: promo.discountPct, discount });
});

app.get("/api/payment-methods", async (_req, res) => {
  // Group the gateway's method catalog for the app's picker. Which methods are
  // offered is admin-controlled (Back Office → Pengaturan): a comma-separated
  // list of method codes; empty means "offer everything".
  const s = await getSettings();
  const enabled = String(s.payment_methods_enabled || "")
    .split(",").map((c) => c.trim()).filter(Boolean);
  const list = enabled.length ? PAYMENT_METHODS.filter((m) => enabled.includes(m.code)) : PAYMENT_METHODS;
  const groups: Record<string, any[]> = {};
  for (const m of list) (groups[m.group] ??= []).push({ code: m.code, name: m.label, type: m.type });
  res.json({ methods: Object.entries(groups).map(([group, items]) => ({ group, items })) });
});

// Admin: the full catalog + which codes are currently enabled.
app.get("/api/admin/payment-methods", requireRole("ADMIN"), async (_req, res) => {
  const s = await getSettings();
  const enabled = String(s.payment_methods_enabled || "").split(",").map((c) => c.trim()).filter(Boolean);
  res.json({
    all: PAYMENT_METHODS.map((m) => ({ code: m.code, name: m.label, group: m.group, type: m.type })),
    enabled,
  });
});

// ─────────────────────────── Favorites ───────────────────────────
app.get("/api/favorites", requireAuth, async (req: AuthRequest, res) => {
  const favs = await prisma.favorite.findMany({
    where: { userId: req.userId },
    include: { hotel: { select: hotelCard } },
  });
  res.json({ hotels: favs.map((f) => f.hotel) });
});

app.post("/api/favorites/:hotelId", requireAuth, async (req: AuthRequest, res) => {
  await prisma.favorite.upsert({
    where: { userId_hotelId: { userId: req.userId!, hotelId: req.params.hotelId } },
    create: { userId: req.userId!, hotelId: req.params.hotelId },
    update: {},
  });
  res.json({ ok: true });
});

app.delete("/api/favorites/:hotelId", requireAuth, async (req: AuthRequest, res) => {
  await prisma.favorite.deleteMany({ where: { userId: req.userId, hotelId: req.params.hotelId } });
  res.json({ ok: true });
});

// ─────────────────────────── Bookings ───────────────────────────
function makeCode() {
  return "MRM-" + Math.floor(1000000 + Math.random() * 8999999);
}

app.post("/api/bookings", requireAuth, async (req: AuthRequest, res) => {
  const schema = z.object({
    hotelId: z.string().optional(),
    roomId: z.string().optional(),
    ratePlanId: z.string().optional(), // chosen rate plan (multi rate-plan per room)
    packageId: z.string().optional(), // when set, booking is a Hotel Package bundle
    channelId: z.string().optional(), // supply source the guest chose (compare-prices)
    promoCode: z.string().optional(),
    checkIn: z.string(),
    checkOut: z.string().optional(),
    guests: z.number().int().min(1).default(2),
    rooms: z.number().int().min(1).default(1),
    bookerName: z.string().min(2),
    bookerEmail: z.string().email(),
    bookerPhone: z.string().min(5),
    forSelf: z.boolean().default(true),
    usePoints: z.coerce.boolean().default(false), // redeem loyalty points as discount
    specialRequest: z.string().optional(),
    payAtHotel: z.coerce.boolean().default(false), // confirmed reservation, pay at property
    roomGuests: z.array(z.object({ name: z.string().optional(), request: z.string().optional() })).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Data pemesanan tidak valid", details: parsed.error.issues });
  const d = parsed.data;

  let hotelId = d.hotelId;
  let roomId = d.roomId;
  let packageId: string | undefined;
  let packageTitle: string | undefined;
  let ratePlanId: string | undefined;
  let ratePlanName: string | undefined;
  let planRefundable: boolean | undefined;
  let planFreeCancellation: boolean | undefined;
  let nights: number;
  let baseAmount: number; // pre-tax room/package amount
  const checkIn = new Date(d.checkIn);
  let checkOut: Date;

  if (d.packageId) {
    // Hotel Package: flat bundled price, nights taken from the package.
    const pkg = await prisma.hotelPackage.findUnique({ where: { id: d.packageId } });
    if (!pkg) return res.status(404).json({ error: "Paket tidak ditemukan" });
    hotelId = pkg.hotelId;
    roomId = pkg.roomId;
    packageId = pkg.id;
    packageTitle = pkg.title;
    nights = pkg.nights;
    checkOut = new Date(checkIn.getTime() + pkg.nights * 86400000);
    baseAmount = pkg.price * d.rooms;
  } else {
    if (!roomId || !d.checkOut) return res.status(400).json({ error: "Data pemesanan tidak valid" });
    const room = await prisma.room.findUnique({ where: { id: roomId } });
    if (!room) return res.status(404).json({ error: "Kamar tidak ditemukan" });
    hotelId = room.hotelId;
    checkOut = new Date(d.checkOut);
    // Date-accurate availability & pricing from the room calendar.
    const q = await quote(prisma, roomId, checkIn, checkOut, d.rooms);
    if (!q.available) return res.status(409).json({ error: q.reason ?? "Kamar tidak tersedia untuk tanggal tersebut" });
    nights = q.nights;
    baseAmount = q.total;
    // Multi rate-plan: apply the chosen plan's per-night delta + policy snapshot.
    if (d.ratePlanId) {
      const plan = await prisma.ratePlan.findFirst({ where: { id: d.ratePlanId, roomId, active: true } });
      if (!plan) return res.status(404).json({ error: "Rate plan tidak ditemukan" });
      baseAmount += plan.priceDelta * nights * d.rooms;
      ratePlanId = plan.id;
      ratePlanName = plan.name;
      planRefundable = plan.refundable;
      planFreeCancellation = plan.freeCancellation;
    }
  }

  const taxFee = Math.round(baseAmount * (await getNum("taxPct")) / 100); // configurable tax & service
  // Apply promo code (discount off the accommodation subtotal).
  let discount = 0;
  let promoCode: string | null = null;
  if (d.promoCode) {
    const promo = await prisma.promo.findUnique({ where: { code: d.promoCode.toUpperCase() } });
    if (promo) { discount = Math.round((baseAmount * promo.discountPct) / 100); promoCode = promo.code; }
  }

  // Membership tier discount (Perak/Emas/Platinum) off the accommodation subtotal.
  const meTier = await prisma.user.findUnique({ where: { id: req.userId }, select: { lifetimePoints: true } });
  const tier = tierOf(meTier?.lifetimePoints ?? 0);
  if (tier.discountPct > 0) discount += Math.round((baseAmount * tier.discountPct) / 100);

  // Redeem loyalty points as an extra discount (capped at loyaltyMaxRedeemPct%).
  let pointsUsed = 0;
  if (d.usePoints) {
    const ls = await getSettings();
    if (ls.loyaltyEnabled === "1") {
      const me = await prisma.user.findUnique({ where: { id: req.userId }, select: { loyaltyPoints: true } });
      const bal = me?.loyaltyPoints ?? 0;
      const redeemValue = Number(ls.loyaltyRedeemValue) || 100;
      const maxRupiah = Math.floor((baseAmount + taxFee - discount) * (Number(ls.loyaltyMaxRedeemPct) || 30) / 100);
      pointsUsed = Math.max(0, Math.min(bal, Math.floor(maxRupiah / redeemValue)));
      discount += pointsUsed * redeemValue;
    }
  }
  const totalPrice = baseAmount + taxFee - discount;

  // ── Anti-fraud screening ── blocklist + velocity + risk score.
  const ip = clientIp(req), device = deviceFingerprint(req);
  const blk = await isBlocked(prisma, { email: d.bookerEmail, ip, phone: d.bookerPhone, device });
  if (blk.blocked) return res.status(403).json({ error: "Pesanan tidak dapat diproses. Silakan hubungi dukungan Miruum." });
  const acct = await prisma.user.findUnique({ where: { id: req.userId }, select: { createdAt: true } });
  const accountAgeDays = acct ? (Date.now() - acct.createdAt.getTime()) / 86400000 : 999;
  const risk = await assessBookingRisk(redis(), { userId: req.userId!, ip, device, amount: totalPrice, accountAgeDays });
  if (risk.block) return res.status(429).json({ error: "Terlalu banyak percobaan pemesanan dalam waktu singkat. Coba lagi nanti." });

  // Booking routing: DIRECT → commit to our own Channel Manager inventory.
  // OTA → route to the source (mock: allocate a supplier reference). Real
  // connectors would call the OTA booking API here.
  let channelId = d.channelId ?? null;
  let supplierRef: string | null = null;
  if (channelId) {
    const channel = await prisma.supplyChannel.findUnique({ where: { id: channelId } });
    if (!channel) channelId = null;
    else if (channel.type === "OTA") {
      supplierRef = `${channel.code}-${makeCode().slice(4)}`;
    }
  }

  // Overbooking protection: reserve inventory ATOMICALLY before creating the
  // booking. If the room is sold out for any night, reject — never create a
  // booking without inventory.
  if (!packageId) {
    const reserved = await consume(prisma, roomId!, checkIn, checkOut, d.rooms);
    if (!reserved) return res.status(409).json({ error: "Maaf, kamar tidak lagi tersedia untuk tanggal yang dipilih." });
  }
  let booking;
  try {
    booking = await prisma.booking.create({
      data: {
        code: makeCode(),
        userId: req.userId!,
        hotelId: hotelId!,
        roomId: roomId!,
        packageId, packageTitle,
        ratePlanId, ratePlanName, planRefundable, planFreeCancellation,
        channelId, supplierRef,
        checkIn, checkOut, nights,
        guests: d.guests, rooms: d.rooms,
        bookerName: d.bookerName, bookerEmail: d.bookerEmail, bookerPhone: d.bookerPhone,
        forSelf: d.forSelf, specialRequest: d.specialRequest,
        payAtHotel: d.payAtHotel, paymentMethod: d.payAtHotel ? "Bayar di Hotel" : undefined,
        roomGuests: d.roomGuests && d.roomGuests.length ? d.roomGuests : undefined,
        roomPrice: baseAmount, taxFee, discount, promoCode, totalPrice,
        status: "PENDING",
        flagged: risk.flagged, riskScore: risk.score, riskNote: risk.note || null,
      },
      include: { hotel: { select: hotelCard }, room: true, channel: { select: { code: true, name: true, type: true } } },
    });
  } catch (e) {
    // Create failed after reserving inventory → give it back to avoid a phantom hold.
    if (!packageId) await release(prisma, roomId!, checkIn, checkOut, d.rooms).catch(() => {});
    throw e;
  }
  if (risk.flagged) {
    const admins = await prisma.user.findMany({ where: { role: "ADMIN" }, select: { id: true } });
    for (const a of admins) await dispatch(prisma, { userId: a.id, title: `Pesanan ditandai risiko (${risk.score}) — ${booking.code}`, body: `Skor risiko ${risk.score}. ${risk.note}. Tinjau di Back Office → Anti-Fraud.`, type: "cancel" });
  }
  // (inventory already reserved above, before the booking was created)
  if (pointsUsed > 0) {
    await prisma.$transaction([
      prisma.loyaltyTxn.create({ data: { userId: req.userId!, points: -pointsUsed, type: "REDEEM", bookingId: booking.id, note: `Tukar ${pointsUsed} poin di ${booking.code}` } }),
      prisma.user.update({ where: { id: req.userId! }, data: { loyaltyPoints: { decrement: pointsUsed } } }),
    ]);
  }
  res.json({ booking, pointsUsed });
});

// Award loyalty points for a paid booking (idempotent per booking).
async function awardLoyalty(userId: string, roomSpend: number, bookingId: string, code: string) {
  const s = await getSettings();
  if (s.loyaltyEnabled !== "1") return;
  const pts = Math.floor(roomSpend / (Number(s.loyaltyEarnPer) || 10000));
  if (pts <= 0) return;
  if (await prisma.loyaltyTxn.findFirst({ where: { bookingId, type: "EARN" } })) return; // already awarded
  await prisma.$transaction([
    prisma.loyaltyTxn.create({ data: { userId, points: pts, type: "EARN", bookingId, note: `Poin dari pesanan ${code}` } }),
    prisma.user.update({ where: { id: userId }, data: { loyaltyPoints: { increment: pts }, lifetimePoints: { increment: pts } } }),
  ]);
  await dispatch(prisma, { userId, title: "Poin Miruum Bertambah 🎉", body: `Kamu mendapat ${pts} poin dari pesanan ${code}. Tukarkan jadi diskon di pemesanan berikutnya!`, type: "success" });
}

// ─────────────── Membership tiers (from lifetime points earned) ───────────────
const TIERS = [
  { key: "BRONZE",   label: "Perunggu", min: 0,     discountPct: 0, color: "#B87333" },
  { key: "SILVER",   label: "Perak",    min: 1000,  discountPct: 2, color: "#9AA0A6" },
  { key: "GOLD",     label: "Emas",     min: 5000,  discountPct: 5, color: "#E0A21B" },
  { key: "PLATINUM", label: "Platinum", min: 15000, discountPct: 8, color: "#5B6B7B" },
];
function tierOf(lifetimePoints: number) {
  let cur = TIERS[0];
  for (const t of TIERS) if (lifetimePoints >= t.min) cur = t;
  const idx = TIERS.indexOf(cur);
  const next = TIERS[idx + 1] ?? null;
  return {
    ...cur, lifetimePoints,
    next: next ? { label: next.label, min: next.min, remaining: Math.max(0, next.min - lifetimePoints) } : null,
    progressPct: next ? Math.min(100, Math.round(((lifetimePoints - cur.min) / (next.min - cur.min)) * 100)) : 100,
  };
}

// Loyalty balance + history.
app.get("/api/loyalty", requireAuth, async (req: AuthRequest, res) => {
  const s = await getSettings();
  const user = await prisma.user.findUnique({ where: { id: req.userId }, select: { loyaltyPoints: true, lifetimePoints: true } });
  const txns = await prisma.loyaltyTxn.findMany({ where: { userId: req.userId }, orderBy: { createdAt: "desc" }, take: 50 });
  res.json({
    enabled: s.loyaltyEnabled === "1",
    points: user?.loyaltyPoints ?? 0,
    tier: tierOf(user?.lifetimePoints ?? 0),
    redeemValue: Number(s.loyaltyRedeemValue) || 100,
    earnPer: Number(s.loyaltyEarnPer) || 10000,
    maxRedeemPct: Number(s.loyaltyMaxRedeemPct) || 30,
    txns,
  });
});

// Per-date rate & availability for a room (calendar view).
app.get("/api/rooms/:id/availability", async (req, res) => {
  const { from, to } = req.query as Record<string, string>;
  const where: any = { roomId: req.params.id };
  if (from || to) where.date = { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) };
  const availability = await prisma.roomAvailability.findMany({ where, orderBy: { date: "asc" }, take: 180 });
  res.json({ availability });
});

// Bulk-set rate / allotment / closed for a room over a date range (Channel Manager).
app.put("/api/partner/rooms/:id/availability", requireRole("PARTNER", "ADMIN"), async (req, res) => {
  const schema = z.object({
    from: z.string(), to: z.string(),
    price: z.coerce.number().int().optional(),
    allotment: z.coerce.number().int().optional(),
    closed: z.coerce.boolean().optional(),
    minStay: z.coerce.number().int().optional(),
    cta: z.coerce.boolean().optional(),
    ctd: z.coerce.boolean().optional(),
  });
  const p = schema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Data tidak valid" });
  if (!(await ownsRoom(req as AuthRequest, req.params.id))) return res.status(404).json({ error: "Kamar tidak ditemukan / bukan milik Anda" });
  const room = await prisma.room.findUnique({ where: { id: req.params.id } });
  if (!room) return res.status(404).json({ error: "Kamar tidak ditemukan" });
  const start = new Date(p.data.from), end = new Date(p.data.to);
  let updated = 0;
  for (let t = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()); t <= end.getTime(); t += 86400000) {
    const date = new Date(t);
    const data: any = {};
    if (p.data.price != null) data.price = p.data.price;
    if (p.data.allotment != null) data.allotment = p.data.allotment;
    if (p.data.closed != null) data.closed = p.data.closed;
    if (p.data.minStay != null) data.minStay = p.data.minStay;
    if (p.data.cta != null) data.cta = p.data.cta;
    if (p.data.ctd != null) data.ctd = p.data.ctd;
    await prisma.roomAvailability.upsert({
      where: { roomId_date: { roomId: room.id, date } },
      create: { roomId: room.id, date, price: p.data.price ?? room.price, allotment: p.data.allotment ?? room.stock, closed: p.data.closed ?? false,
        minStay: p.data.minStay ?? 1, cta: p.data.cta ?? false, ctd: p.data.ctd ?? false },
      update: data,
    });
    updated++;
  }
  await invalidate("miruum:");
  res.json({ ok: true, days: updated });
});

// Month grid for the extranet allotment calendar (Traveloka Tera style).
// Returns every room of the hotel with a date→availability map for the month,
// falling back to the room's default price/stock/open when no override exists.
app.get("/api/partner/hotels/:id/calendar", requireRole("PARTNER", "ADMIN"), async (req: AuthRequest, res) => {
  const hotel = await prisma.hotel.findFirst({
    where: { id: req.params.id, ...((req as any).role === "ADMIN" ? {} : { ownerId: req.userId }) },
    include: { rooms: { orderBy: { price: "asc" } } },
  });
  if (!hotel) return res.status(404).json({ error: "Hotel tidak ditemukan / bukan milik Anda" });

  // month = "YYYY-MM"; default to current month (UTC).
  const now = new Date();
  const m = /^(\d{4})-(\d{2})$/.exec(String(req.query.month || ""));
  const year = m ? Number(m[1]) : now.getUTCFullYear();
  const mon = m ? Number(m[2]) - 1 : now.getUTCMonth();
  const first = new Date(Date.UTC(year, mon, 1));
  const last = new Date(Date.UTC(year, mon + 1, 0));
  const daysInMonth = last.getUTCDate();
  const iso = (d: Date) => d.toISOString().slice(0, 10);

  const days: string[] = [];
  for (let d = 1; d <= daysInMonth; d++) days.push(iso(new Date(Date.UTC(year, mon, d))));

  const roomIds = hotel.rooms.map((r) => r.id);
  const rows = roomIds.length
    ? await prisma.roomAvailability.findMany({
        where: { roomId: { in: roomIds }, date: { gte: first, lte: last } },
      })
    : [];
  const byRoom: Record<string, Record<string, any>> = {};
  for (const r of rows) {
    (byRoom[r.roomId] ??= {})[iso(new Date(r.date))] = {
      price: r.price, allotment: r.allotment, closed: r.closed, minStay: r.minStay, cta: r.cta, ctd: r.ctd, set: true,
    };
  }

  const rooms = hotel.rooms.map((r) => {
    const cells: Record<string, any> = {};
    for (const d of days) {
      cells[d] = byRoom[r.id]?.[d] ?? {
        price: r.price, allotment: r.stock, closed: false, minStay: 1, cta: false, ctd: false, set: false,
      };
    }
    return { id: r.id, name: r.name, price: r.price, stock: r.stock, cells };
  });

  res.json({
    month: `${year}-${String(mon + 1).padStart(2, "0")}`,
    prev: iso(new Date(Date.UTC(year, mon - 1, 1))).slice(0, 7),
    next: iso(new Date(Date.UTC(year, mon + 1, 1))).slice(0, 7),
    firstWeekday: first.getUTCDay(), // 0=Sun
    days, rooms,
  });
});

// ═══════════════ Rate plans (multi rate-plan per room) ═══════════════
app.get("/api/partner/rooms/:roomId/rate-plans", requireRole("PARTNER", "ADMIN"), async (req: AuthRequest, res) => {
  if (!(await ownsRoom(req, req.params.roomId))) return res.status(404).json({ error: "Kamar bukan milik Anda" });
  const ratePlans = await prisma.ratePlan.findMany({ where: { roomId: req.params.roomId }, orderBy: { sortOrder: "asc" } });
  res.json({ ratePlans });
});
app.post("/api/partner/rooms/:roomId/rate-plans", requireRole("PARTNER", "ADMIN"), async (req: AuthRequest, res) => {
  if (!(await ownsRoom(req, req.params.roomId))) return res.status(404).json({ error: "Kamar bukan milik Anda" });
  const b = req.body;
  const plan = await prisma.ratePlan.create({ data: {
    roomId: req.params.roomId, name: String(b.name || "Kamar Saja"),
    boardBasis: String(b.boardBasis || "ROOM_ONLY"),
    refundable: b.refundable === undefined ? true : (b.refundable === "1" || b.refundable === true || b.refundable === "on"),
    freeCancellation: b.freeCancellation === "1" || b.freeCancellation === true || b.freeCancellation === "on",
    priceDelta: Number(b.priceDelta) || 0, sortOrder: Number(b.sortOrder) || 0,
  }});
  await invalidate("miruum:");
  res.json({ ratePlan: plan });
});
app.put("/api/partner/rate-plans/:id", requireRole("PARTNER", "ADMIN"), async (req: AuthRequest, res) => {
  const existing = await prisma.ratePlan.findUnique({ where: { id: req.params.id }, select: { roomId: true } });
  if (!existing || !(await ownsRoom(req, existing.roomId))) return res.status(404).json({ error: "Rate plan tidak ditemukan" });
  const b = req.body; const data: any = {};
  if (b.name != null) data.name = String(b.name);
  if (b.boardBasis != null) data.boardBasis = String(b.boardBasis);
  if (b.priceDelta != null && b.priceDelta !== "") data.priceDelta = Number(b.priceDelta);
  if (b.sortOrder != null && b.sortOrder !== "") data.sortOrder = Number(b.sortOrder);
  if (b.refundable != null) data.refundable = b.refundable === "1" || b.refundable === true || b.refundable === "on";
  if (b.freeCancellation != null) data.freeCancellation = b.freeCancellation === "1" || b.freeCancellation === true || b.freeCancellation === "on";
  if (b.active != null) data.active = b.active === "1" || b.active === true || b.active === "on";
  const plan = await prisma.ratePlan.update({ where: { id: req.params.id }, data });
  await invalidate("miruum:");
  res.json({ ratePlan: plan });
});
app.delete("/api/partner/rate-plans/:id", requireRole("PARTNER", "ADMIN"), async (req: AuthRequest, res) => {
  const existing = await prisma.ratePlan.findUnique({ where: { id: req.params.id }, select: { roomId: true } });
  if (!existing || !(await ownsRoom(req, existing.roomId))) return res.status(404).json({ error: "Rate plan tidak ditemukan" });
  await prisma.ratePlan.delete({ where: { id: req.params.id } });
  await invalidate("miruum:");
  res.json({ ok: true });
});

// ═══════════════ "What's nearby" per hotel ═══════════════
app.post("/api/partner/hotels/:id/nearby", requireRole("PARTNER", "ADMIN"), async (req: AuthRequest, res) => {
  if (!(await ownsHotel(req, req.params.id))) return res.status(404).json({ error: "Hotel bukan milik Anda" });
  const b = req.body;
  const item = await prisma.hotelNearby.create({ data: {
    hotelId: req.params.id, name: String(b.name || ""), category: String(b.category || "ATTRACTION"),
    distanceKm: Number(b.distanceKm) || 0, sortOrder: Number(b.sortOrder) || 0,
  }});
  await invalidate("miruum:");
  res.json({ item });
});
app.delete("/api/partner/nearby/:id", requireRole("PARTNER", "ADMIN"), async (req: AuthRequest, res) => {
  const existing = await prisma.hotelNearby.findUnique({ where: { id: req.params.id }, select: { hotelId: true } });
  if (!existing || !(await ownsHotel(req, existing.hotelId))) return res.status(404).json({ error: "Tidak ditemukan" });
  await prisma.hotelNearby.delete({ where: { id: req.params.id } });
  await invalidate("miruum:");
  res.json({ ok: true });
});

// ═══════════════ Price alerts (watch a hotel for price drops) ═══════════════
app.get("/api/price-alerts", requireAuth, async (req: AuthRequest, res) => {
  const alerts = await prisma.priceAlert.findMany({
    where: { userId: req.userId }, orderBy: { createdAt: "desc" },
    include: { hotel: { select: hotelCard } },
  });
  res.json({ alerts, hotelIds: alerts.map((a) => a.hotelId) });
});
// Toggle a price-drop watch on a hotel.
app.post("/api/hotels/:id/price-alert", requireAuth, async (req: AuthRequest, res) => {
  const hotel = await prisma.hotel.findUnique({ where: { id: req.params.id }, select: { id: true, priceFrom: true } });
  if (!hotel) return res.status(404).json({ error: "Hotel tidak ditemukan" });
  const existing = await prisma.priceAlert.findUnique({ where: { userId_hotelId: { userId: req.userId!, hotelId: hotel.id } } });
  if (existing) {
    await prisma.priceAlert.delete({ where: { id: existing.id } });
    return res.json({ watching: false });
  }
  await prisma.priceAlert.create({ data: { userId: req.userId!, hotelId: hotel.id, lastNotifiedPrice: hotel.priceFrom } });
  res.json({ watching: true });
});

// ═══════════════ Security: sessions, login history, 2FA ═══════════════
app.get("/api/auth/sessions", requireAuth, async (req: AuthRequest, res) => {
  const currentHash = req.body?.refreshToken ? hashToken(String(req.body.refreshToken)) : null;
  const rows = await prisma.refreshToken.findMany({
    where: { userId: req.userId, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
  res.json({ sessions: rows.map((r) => ({ id: r.id, device: r.device || "Perangkat tak dikenal", createdAt: r.createdAt, current: currentHash === r.tokenHash })) });
});
app.post("/api/auth/sessions/current", requireAuth, async (req: AuthRequest, res) => {
  // Same as GET but accepts the refresh token in the body to flag the current device.
  const currentHash = req.body?.refreshToken ? hashToken(String(req.body.refreshToken)) : null;
  const rows = await prisma.refreshToken.findMany({ where: { userId: req.userId, revokedAt: null, expiresAt: { gt: new Date() } }, orderBy: { createdAt: "desc" } });
  res.json({ sessions: rows.map((r) => ({ id: r.id, device: r.device || "Perangkat tak dikenal", createdAt: r.createdAt, current: currentHash === r.tokenHash })) });
});
app.post("/api/auth/sessions/:id/revoke", requireAuth, async (req: AuthRequest, res) => {
  await prisma.refreshToken.updateMany({ where: { id: req.params.id, userId: req.userId }, data: { revokedAt: new Date() } });
  res.json({ ok: true });
});
app.post("/api/auth/sessions/revoke-others", requireAuth, async (req: AuthRequest, res) => {
  const keep = req.body?.refreshToken ? hashToken(String(req.body.refreshToken)) : "";
  await prisma.refreshToken.updateMany({ where: { userId: req.userId, revokedAt: null, tokenHash: { not: keep } }, data: { revokedAt: new Date() } });
  res.json({ ok: true });
});
app.get("/api/auth/login-history", requireAuth, async (req: AuthRequest, res) => {
  const events = await prisma.loginEvent.findMany({ where: { userId: req.userId }, orderBy: { createdAt: "desc" }, take: 30 });
  res.json({ events });
});
app.get("/api/auth/2fa", requireAuth, async (req: AuthRequest, res) => {
  const u = await prisma.user.findUnique({ where: { id: req.userId }, select: { twoFactorEnabled: true } });
  res.json({ enabled: !!u?.twoFactorEnabled });
});
app.post("/api/auth/2fa", requireAuth, async (req: AuthRequest, res) => {
  const enable = req.body?.enable === true || req.body?.enable === "true" || req.body?.enable === 1;
  await prisma.user.update({ where: { id: req.userId }, data: { twoFactorEnabled: enable } });
  res.json({ ok: true, enabled: enable });
});

// ═══════════════ Wishlists / Trips (named, mixed hotel+tour) ═══════════════
app.get("/api/wishlists", requireAuth, async (req: AuthRequest, res) => {
  const wishlists = await prisma.wishlist.findMany({
    where: { userId: req.userId }, orderBy: { createdAt: "asc" },
    include: { items: { orderBy: { createdAt: "desc" } } },
  });
  res.json({ wishlists });
});
app.post("/api/wishlists", requireAuth, async (req: AuthRequest, res) => {
  const name = String(req.body?.name ?? "").trim() || "Trip Baru";
  const wishlist = await prisma.wishlist.create({ data: { userId: req.userId!, name: name.slice(0, 60) } });
  res.json({ wishlist });
});
app.delete("/api/wishlists/:id", requireAuth, async (req: AuthRequest, res) => {
  await prisma.wishlist.deleteMany({ where: { id: req.params.id, userId: req.userId } });
  res.json({ ok: true });
});
app.post("/api/wishlists/:id/items", requireAuth, async (req: AuthRequest, res) => {
  const w = await prisma.wishlist.findFirst({ where: { id: req.params.id, userId: req.userId }, select: { id: true } });
  if (!w) return res.status(404).json({ error: "Daftar tidak ditemukan" });
  const b = req.body;
  const kind = String(b.kind || "HOTEL").toUpperCase();
  if (!["HOTEL", "TOUR"].includes(kind)) return res.status(400).json({ error: "Jenis tidak valid" });
  try {
    const item = await prisma.wishlistItem.create({ data: {
      wishlistId: w.id, kind, refId: String(b.refId), title: String(b.title || ""),
      imageUrl: b.imageUrl || null, subtitle: b.subtitle || null, price: Number(b.price) || 0,
    }});
    res.json({ item });
  } catch { res.json({ ok: true, duplicate: true }); }
});
app.delete("/api/wishlists/items/:itemId", requireAuth, async (req: AuthRequest, res) => {
  await prisma.wishlistItem.deleteMany({ where: { id: req.params.itemId, wishlist: { userId: req.userId } } });
  res.json({ ok: true });
});

// ═══════════════ Similar properties ═══════════════
app.get("/api/hotels/:id/similar", async (req, res) => {
  const hotel = await prisma.hotel.findUnique({ where: { id: req.params.id }, select: { id: true, city: true, priceFrom: true, starRating: true, propertyType: true } });
  if (!hotel) return res.status(404).json({ error: "Hotel tidak ditemukan" });
  const lo = Math.round(hotel.priceFrom * 0.6), hi = Math.round(hotel.priceFrom * 1.6);
  let similar = await prisma.hotel.findMany({
    where: { id: { not: hotel.id }, city: hotel.city, priceFrom: { gte: lo, lte: hi }, ...PUBLIC_HOTEL_GATE },
    select: hotelCard, orderBy: { rating: "desc" }, take: 6,
  });
  if (similar.length < 3) {
    const more = await prisma.hotel.findMany({ where: { id: { not: hotel.id }, city: hotel.city, ...PUBLIC_HOTEL_GATE }, select: hotelCard, take: 6 });
    const seen = new Set(similar.map((h) => h.id));
    similar = [...similar, ...more.filter((h) => !seen.has(h.id))].slice(0, 6);
  }
  res.json({ hotels: similar });
});

// ═══════════════ Recently viewed + recommendations ═══════════════
app.post("/api/hotels/:id/view", requireAuth, async (req: AuthRequest, res) => {
  try {
    await prisma.recentlyViewed.upsert({
      where: { userId_hotelId: { userId: req.userId!, hotelId: req.params.id } },
      create: { userId: req.userId!, hotelId: req.params.id }, update: { viewedAt: new Date() },
    });
  } catch { /* hotel may not exist — ignore */ }
  res.json({ ok: true });
});
app.get("/api/recently-viewed", requireAuth, async (req: AuthRequest, res) => {
  const rows = await prisma.recentlyViewed.findMany({
    where: { userId: req.userId }, orderBy: { viewedAt: "desc" }, take: 12,
    include: { hotel: { select: hotelCard } },
  });
  res.json({ hotels: rows.map((r) => r.hotel) });
});

// ═══════════════ Voucher wallet ("Voucher Saya") ═══════════════
app.get("/api/my-vouchers", requireAuth, async (req: AuthRequest, res) => {
  const [mine, claimable] = await Promise.all([
    prisma.userVoucher.findMany({ where: { userId: req.userId }, orderBy: { claimedAt: "desc" }, include: { promo: true } }),
    prisma.promo.findMany({ where: { claimable: true } }),
  ]);
  const mineIds = new Set(mine.map((m) => m.promoId));
  res.json({
    mine: mine.map((m) => ({ ...m.promo, claimedAt: m.claimedAt, usedAt: m.usedAt })),
    claimable: claimable.filter((p) => !mineIds.has(p.id)),
  });
});
app.post("/api/promos/:id/claim", requireAuth, async (req: AuthRequest, res) => {
  const promo = await prisma.promo.findFirst({ where: { id: req.params.id, claimable: true } });
  if (!promo) return res.status(404).json({ error: "Voucher tidak tersedia" });
  await prisma.userVoucher.upsert({
    where: { userId_promoId: { userId: req.userId!, promoId: promo.id } },
    create: { userId: req.userId!, promoId: promo.id }, update: {},
  });
  res.json({ ok: true, code: promo.code });
});

// ═══════════════ Referral / invite friends ═══════════════
function genReferral(name: string): string {
  const base = (name.replace(/[^A-Za-z]/g, "").slice(0, 4).toUpperCase() || "MIRU");
  return base + Math.floor(1000 + Math.random() * 9000);
}
app.get("/api/referral", requireAuth, async (req: AuthRequest, res) => {
  let u = await prisma.user.findUnique({ where: { id: req.userId }, select: { referralCode: true, name: true } });
  if (!u) return res.status(404).json({ error: "User tidak ditemukan" });
  if (!u.referralCode) {
    let code = genReferral(u.name);
    for (let i = 0; i < 5; i++) { if (!(await prisma.user.findUnique({ where: { referralCode: code } }))) break; code = genReferral(u.name); }
    await prisma.user.update({ where: { id: req.userId }, data: { referralCode: code } });
    u = { ...u, referralCode: code };
  }
  const invited = await prisma.user.count({ where: { referredById: req.userId } });
  res.json({ code: u.referralCode, invited, bonusPoints: 100 });
});
app.post("/api/referral/apply", requireAuth, async (req: AuthRequest, res) => {
  const code = String(req.body?.code || "").toUpperCase().trim();
  const me = await prisma.user.findUnique({ where: { id: req.userId }, select: { referredById: true } });
  if (me?.referredById) return res.status(400).json({ error: "Kamu sudah memakai kode referral" });
  const referrer = await prisma.user.findUnique({ where: { referralCode: code } });
  if (!referrer || referrer.id === req.userId) return res.status(404).json({ error: "Kode referral tidak valid" });
  const BONUS = 100;
  await prisma.$transaction([
    prisma.user.update({ where: { id: req.userId! }, data: { referredById: referrer.id, loyaltyPoints: { increment: BONUS }, lifetimePoints: { increment: BONUS } } }),
    prisma.user.update({ where: { id: referrer.id }, data: { loyaltyPoints: { increment: BONUS }, lifetimePoints: { increment: BONUS } } }),
    prisma.loyaltyTxn.create({ data: { userId: req.userId!, points: BONUS, type: "EARN", note: `Bonus referral (${code})` } }),
    prisma.loyaltyTxn.create({ data: { userId: referrer.id, points: BONUS, type: "EARN", note: "Bonus mengundang teman" } }),
  ]);
  await dispatch(prisma, { userId: referrer.id, title: "Teman bergabung! 🎁", body: `Kamu dapat ${BONUS} poin karena temanmu memakai kode referralmu.`, type: "success" });
  res.json({ ok: true, bonus: BONUS });
});

// ═══════════════ Public property Q&A ═══════════════
app.get("/api/hotels/:id/questions", async (req, res) => {
  const questions = await prisma.hotelQuestion.findMany({ where: { hotelId: req.params.id }, orderBy: { createdAt: "desc" }, take: 50 });
  res.json({ questions });
});
app.post("/api/hotels/:id/questions", requireAuth, async (req: AuthRequest, res) => {
  const body = String(req.body?.body ?? "").trim();
  if (body.length < 3) return res.status(400).json({ error: "Pertanyaan minimal 3 karakter" });
  const verdict = screenChat(body);
  if (verdict.flagged) return res.status(400).json({ error: `Pertanyaan diblokir — ${verdict.reason}` });
  const hotel = await prisma.hotel.findUnique({ where: { id: req.params.id }, select: { id: true, name: true, ownerId: true } });
  if (!hotel) return res.status(404).json({ error: "Hotel tidak ditemukan" });
  const user = await prisma.user.findUnique({ where: { id: req.userId }, select: { name: true } });
  const q = await prisma.hotelQuestion.create({ data: { hotelId: hotel.id, userId: req.userId, authorName: user?.name ?? "Tamu", body: body.slice(0, 500) } });
  if (hotel.ownerId) await dispatch(prisma, { userId: hotel.ownerId, title: `Pertanyaan baru — ${hotel.name}`, body: body.slice(0, 120), type: "info" });
  res.json({ question: q });
});
app.get("/api/partner/questions", requireRole("PARTNER", "ADMIN"), async (req: AuthRequest, res) => {
  const admin = (req as any).role === "ADMIN";
  const questions = await prisma.hotelQuestion.findMany({
    where: admin ? {} : { hotel: { ownerId: req.userId } }, orderBy: { createdAt: "desc" }, take: 100,
    include: { hotel: { select: { name: true } } },
  });
  res.json({ questions });
});
app.post("/api/partner/questions/:id/answer", requireRole("PARTNER", "ADMIN"), async (req: AuthRequest, res) => {
  const admin = (req as any).role === "ADMIN";
  const q = await prisma.hotelQuestion.findFirst({ where: { id: req.params.id, ...(admin ? {} : { hotel: { ownerId: req.userId } }) } });
  if (!q) return res.status(404).json({ error: "Pertanyaan tidak ditemukan" });
  const answer = String(req.body?.answer ?? "").trim();
  if (!answer) return res.status(400).json({ error: "Jawaban kosong" });
  const updated = await prisma.hotelQuestion.update({ where: { id: q.id }, data: { answer: answer.slice(0, 1000), answeredAt: new Date() } });
  if (q.userId) await dispatch(prisma, { userId: q.userId, title: "Pertanyaanmu dijawab", body: answer.slice(0, 120), type: "info" });
  res.json({ question: updated });
});

// Set a hotel's property type (partner or admin).
app.put("/api/partner/hotels/:id/property-type", requireRole("PARTNER", "ADMIN"), async (req: AuthRequest, res) => {
  if (!(await ownsHotel(req, req.params.id))) return res.status(404).json({ error: "Hotel bukan milik Anda" });
  const allowed = ["HOTEL", "VILLA", "APARTMENT", "HOMESTAY", "GUESTHOUSE", "HOSTEL", "RESORT"];
  const t = String(req.body?.propertyType || "").toUpperCase();
  if (!allowed.includes(t)) return res.status(400).json({ error: "Tipe properti tidak valid" });
  await prisma.hotel.update({ where: { id: req.params.id }, data: { propertyType: t } });
  await invalidate("miruum:");
  res.json({ ok: true, propertyType: t });
});

// ═══════════════ Miruum Intelligent (partner rate-intel + per-hotel schedule) ═══════════════
app.get("/api/partner/rate-intelligence", requireRole("PARTNER", "ADMIN"), async (req: AuthRequest, res) => {
  const admin = (req as any).role === "ADMIN";
  const otaChannels = await prisma.supplyChannel.findMany({ where: { type: "OTA", active: true }, orderBy: { sortOrder: "asc" }, select: { id: true, code: true, name: true, color: true } });
  const hotels = await prisma.hotel.findMany({
    where: admin ? {} : { ownerId: req.userId }, orderBy: { name: "asc" },
    select: { id: true, name: true, city: true, priceFrom: true, rateShopFreq: true, rateShoppedAt: true,
      rateObservations: { select: { channelId: true, price: true, source: true } } },
  });
  const s = await getSettings();
  const rows = hotels.map((h) => {
    const obs: Record<string, number> = {}, obsSource: Record<string, string> = {};
    for (const o of h.rateObservations) { obs[o.channelId] = o.price; obsSource[o.channelId] = o.source; }
    const otaPrices = Object.values(obs).filter((p) => p > 0);
    return {
      hotelId: h.id, hotel: h.name, city: h.city, ownPrice: h.priceFrom, obs, obsSource,
      rateShopFreq: h.rateShopFreq, rateShoppedAt: h.rateShoppedAt,
      cheapest: otaPrices.length ? h.priceFrom <= Math.min(...otaPrices) : null,
      marketMin: otaPrices.length ? Math.min(h.priceFrom, ...otaPrices) : h.priceFrom,
    };
  });
  res.json({ otaChannels, rows, aiReady: aiConfigured(s), aiAuto: s.ai_auto === "1", model: s.ai_model || "" });
});

// Partner sets their hotel's auto rate-check frequency (guardrail: 0..3 per day).
app.put("/api/partner/hotels/:id/rate-shop", requireRole("PARTNER", "ADMIN"), async (req: AuthRequest, res) => {
  if (!(await ownsHotel(req, req.params.id))) return res.status(404).json({ error: "Hotel bukan milik Anda" });
  const freq = Math.max(0, Math.min(3, Number(req.body?.freq) || 0)); // clamp 0..3/day
  await prisma.hotel.update({ where: { id: req.params.id }, data: { rateShopFreq: freq } });
  await invalidate("miruum:");
  res.json({ ok: true, freq });
});

app.get("/api/bookings", requireAuth, async (req: AuthRequest, res) => {
  const { status } = req.query as Record<string, string>;
  const where: any = { userId: req.userId };
  if (status) where.status = status;
  const bookings = await prisma.booking.findMany({
    where, orderBy: { createdAt: "desc" },
    include: { hotel: { select: hotelCard }, room: true, channel: { select: { code: true, name: true, type: true } } },
  });
  res.json({ bookings });
});

app.get("/api/bookings/:id", requireAuth, async (req: AuthRequest, res) => {
  const booking = await prisma.booking.findFirst({
    where: { id: req.params.id, userId: req.userId },
    include: { hotel: { select: hotelCard }, room: true, channel: { select: { code: true, name: true, type: true } } },
  });
  if (!booking) return res.status(404).json({ error: "Pesanan tidak ditemukan" });
  res.json({ booking });
});

// Create a payment for a booking → returns instructions (VA / QR / e-wallet URL).
// The booking stays PENDING until the payment settles (webhook or mock settle).
app.post("/api/bookings/:id/pay", requireAuth, async (req: AuthRequest, res) => {
  const schema = z.object({ method: z.string() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Metode pembayaran tidak valid" });
  const method = methodByCode(parsed.data.method);
  if (!method) return res.status(400).json({ error: "Metode pembayaran tidak dikenal" });
  const booking = await prisma.booking.findFirst({ where: { id: req.params.id, userId: req.userId } });
  if (!booking) return res.status(404).json({ error: "Pesanan tidak ditemukan" });
  if (booking.status === "PAID") return res.status(400).json({ error: "Pesanan sudah dibayar" });

  const provider = await activeProvider();
  let ins;
  try {
    ins = await provider.create({
      bookingCode: booking.code, amount: Number(booking.totalPrice), method,
      bookerName: booking.bookerName, bookerEmail: booking.bookerEmail, bookerPhone: booking.bookerPhone,
    });
  } catch (e: any) {
    return res.status(502).json({ error: "Gagal membuat pembayaran: " + e.message });
  }

  const payment = await prisma.payment.create({
    data: {
      bookingId: booking.id, provider: ins.provider, method: method.code, methodLabel: method.label,
      amount: booking.totalPrice, status: "PENDING", externalId: ins.externalId,
      vaNumber: ins.vaNumber, qrString: ins.qrString, payUrl: ins.payUrl, expiresAt: ins.expiresAt,
      raw: ins.raw as any,
    },
  });
  await prisma.booking.update({ where: { id: booking.id }, data: { paymentMethod: method.label } });
  res.json({ payment: clientPayment(payment) });
});

// Never expose the gateway's internal reference or raw response to clients —
// the partner_reff is what a forged callback would need.
function clientPayment(p: any) {
  if (!p) return p;
  const { externalId, raw, ...pub } = p;
  return pub;
}

// Settle a payment as PAID and confirm its booking (+notification). Shared by the
// provider webhook and the mock "I've paid" action.
async function markPaymentPaid(paymentId: string) {
  const payment = await prisma.payment.findUnique({ where: { id: paymentId }, include: { booking: { include: { hotel: true } } } });
  if (!payment || payment.status === "PAID") return payment;
  const updated = await prisma.payment.update({ where: { id: paymentId }, data: { status: "PAID", paidAt: new Date() } });
  await prisma.booking.update({
    where: { id: payment.bookingId },
    data: { status: "PAID", paidAt: new Date(), paymentMethod: payment.methodLabel },
  });
  const b = await prisma.booking.findUnique({ where: { id: payment.bookingId }, include: { hotel: true, room: true } });
  const voucherEmail = b ? await buildVoucherEmail(b) : null;
  await dispatch(prisma, {
    userId: payment.booking.userId,
    title: `E-Voucher · ${payment.booking.hotel.name}`,
    body: `Pembayaran berhasil (${payment.methodLabel}). No. Pesanan ${payment.booking.code}.\nE-voucher: ${PUBLIC_ORIGIN}/api/vouchers/${payment.booking.code}\nUnduh PDF: ${PUBLIC_ORIGIN}/api/vouchers/${payment.booking.code}/pdf\nInvoice: ${PUBLIC_ORIGIN}/api/invoices/${payment.booking.code}`,
    type: "success", hotelName: payment.booking.hotel.name, orderCode: payment.booking.code,
    phone: payment.booking.bookerPhone, email: payment.booking.bookerEmail,
    html: voucherEmail?.html, attachments: voucherEmail?.attachments,
  });
  // Send the property its confirmation receipt (with price + commission).
  if (payment.booking.hotel.ownerId) {
    await dispatch(prisma, {
      userId: payment.booking.hotel.ownerId,
      title: `Pesanan baru — ${payment.booking.hotel.name}`,
      body: `${payment.booking.bookerName} · ${payment.booking.nights} malam · No. ${payment.booking.code}.\nKonfirmasi & komisi: ${PUBLIC_ORIGIN}/api/hotels/receipt/${payment.booking.code}`,
      type: "success",
    });
  }
  // 2-way: a Channex-sourced property → push the confirmed reservation to the
  // channel manager so the hotel's PMS receives it. Best-effort; a failure never
  // unsettles the guest's paid booking — it alerts the owner for manual entry.
  if (b && b.hotel.source === "CHANNEX" && b.hotel.supplierHotelCode && b.room?.supplierRoomTypeId && b.room?.supplierRatePlanId && (await channexConfigured())) {
    try {
      const [first, ...rest] = (b.bookerName || "Guest").trim().split(/\s+/);
      const pushed = await cxCreateBooking({
        propertyId: b.hotel.supplierHotelCode,
        arrivalDate: b.checkIn.toISOString().slice(0, 10),
        departureDate: b.checkOut.toISOString().slice(0, 10),
        customer: { name: first, surname: rest.join(" ") || first, mail: b.bookerEmail || undefined, phone: b.bookerPhone || undefined },
        rooms: [{ roomTypeId: b.room.supplierRoomTypeId, ratePlanId: b.room.supplierRatePlanId, amount: Number(b.totalPrice), occupancy: { adults: b.guests || 2 } }],
        ota_reservation_code: b.code,
      });
      await prisma.booking.update({ where: { id: b.id }, data: { source: "CHANNEX", supplierBookingCode: pushed.id } });
    } catch (e: any) {
      console.warn(`[channex push] booking ${b.code} failed: ${e.message}`);
      if (b.hotel.ownerId) await dispatch(prisma, { userId: b.hotel.ownerId, title: `Push Channex gagal — ${b.hotel.name}`, body: `Pesanan ${b.code} sudah lunas tetapi gagal terkirim ke Channex: ${e.message}. Mohon input manual ke PMS.`, type: "cancel", orderCode: b.code });
    }
  }
  // A bedbank (Hotelbeds) booking → now that the guest has paid Miruum, commit at
  // the supplier using the rateKey stored in supplierRef. Re-check the rate first
  // (bedbank prices expire). Failure → alert the guest for follow-up/refund.
  if (b && b.source === "HOTELBEDS" && b.supplierRef && !b.supplierBookingCode) {
    try {
      const prov = supplyProvider("HOTELBEDS");
      const [first, ...rest] = (b.bookerName || "Guest").trim().split(/\s+/);
      const surname = rest.join(" ") || first;
      const paxSrc = Array.isArray(b.roomGuests) ? (b.roomGuests as any[]) : [];
      const paxes = paxSrc.length
        ? paxSrc.map((x: any) => ({ roomCode: "1", type: (x.type === "CH" ? "CH" : "AD") as "AD" | "CH", name: x.name || first, surname: x.surname || surname, age: x.age }))
        : [{ roomCode: "1", type: "AD" as const, name: first, surname }];
      const rate = await prov.checkRate(b.supplierRef);
      const booked = await prov.book({
        holder: { name: first, surname, email: b.bookerEmail || undefined, phone: b.bookerPhone || undefined },
        rateKey: rate.rateKey, paxes, clientReference: b.code,
      });
      await prisma.booking.update({ where: { id: b.id }, data: { supplierBookingCode: booked.reference } });
    } catch (e: any) {
      console.warn(`[hotelbeds book] booking ${b.code} failed after payment: ${e.message}`);
      await dispatch(prisma, { userId: b.userId, title: `Perlu tindak lanjut — ${b.hotel.name}`, body: `Pembayaran ${b.code} berhasil, namun konfirmasi ke supplier gagal: ${e.message}. Tim kami akan menindaklanjuti atau melakukan refund.`, type: "cancel", orderCode: b.code, email: b.bookerEmail });
    }
  }
  return updated;
}

// ── E-Voucher email (rich HTML + inline QR) ─────────────────────────────────
async function buildVoucherEmail(b: any): Promise<{ html: string; attachments: any[] }> {
  const qrPng = await QRCode.toBuffer(b.code, { width: 320, margin: 1 });
  const O = PUBLIC_ORIGIN;
  const row = (k: string, v: string) =>
    `<tr><td style="padding:7px 0;color:#6c7683;font-size:13px">${k}</td><td style="padding:7px 0;text-align:right;font-weight:600;font-size:13px">${v}</td></tr>`;
  const html = `<!doctype html><html><body style="margin:0;background:#eef0f4;font-family:Arial,Helvetica,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#eef0f4;padding:24px 12px"><tr><td align="center">
  <table width="520" cellpadding="0" cellspacing="0" style="max-width:520px;background:#fff;border-radius:14px;overflow:hidden">
    <tr><td style="background:linear-gradient(135deg,#F5931E,#E07C0C);padding:22px 24px;text-align:center">
      <div style="display:inline-block;background:#fff;border-radius:8px;padding:8px 12px"><img src="${O}/static/logo.png" alt="Miruum" height="26" style="display:block"></div>
      <div style="color:#fff;font-size:12px;letter-spacing:1px;margin-top:12px;opacity:.95">E-VOUCHER HOTEL</div>
      <div style="color:#fff;font-size:20px;font-weight:800;margin-top:2px">${b.hotel.name}</div>
      <div style="color:#fff;font-size:12.5px;opacity:.95">${b.hotel.city}</div>
    </td></tr>
    <tr><td style="padding:22px 24px">
      <div style="background:#f7f6f2;border-radius:12px;padding:16px;text-align:center">
        <img src="cid:qrcheckin" alt="QR" width="150" height="150" style="display:block;margin:0 auto 8px">
        <div style="font-size:11px;color:#6c7683;text-transform:uppercase;letter-spacing:1px">No. Pesanan</div>
        <div style="font-size:22px;font-weight:800;letter-spacing:1px;color:#20344A">${b.code}</div>
        <div style="font-size:11.5px;color:#8a8f98;margin-top:4px">Tunjukkan / pindai kode ini di resepsionis saat check-in.</div>
      </div>
      <div style="font-size:11px;color:#F5931E;font-weight:800;letter-spacing:1px;text-transform:uppercase;margin:18px 0 4px">Detail Menginap</div>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #eee">
        ${row("Tamu", `${b.bookerName} · ${b.guests} tamu`)}
        ${row("Kamar", `${b.rooms}× ${b.room?.name ?? "-"}`)}
        ${row("Check-in", fmtDate(b.checkIn))}
        ${row("Check-out", fmtDate(b.checkOut))}
        ${row("Durasi", `${b.nights} malam`)}
        ${row("Alamat", b.hotel.address)}
      </table>
      <div style="text-align:center;margin-top:20px">
        <a href="${O}/api/vouchers/${b.code}/pdf" style="display:inline-block;background:#F5931E;color:#fff;text-decoration:none;font-weight:700;padding:11px 20px;border-radius:24px;font-size:14px">Unduh E-Voucher (PDF)</a>
        <div style="margin-top:10px"><a href="${O}/api/vouchers/${b.code}" style="color:#0E7DD1;text-decoration:none;font-size:12.5px">Lihat E-Voucher online</a> · <a href="${O}/api/invoices/${b.code}" style="color:#0E7DD1;text-decoration:none;font-size:12.5px">Invoice</a></div>
      </div>
      <div style="margin-top:18px;font-size:11px;color:#8a8f98;line-height:1.6;text-align:center">
        E-voucher resmi Miruum — bukti pemesanan menginap. Butuh bantuan? Live Chat CS di aplikasi Miruum · miruum.id</div>
    </td></tr>
  </table></td></tr></table></body></html>`;
  return { html, attachments: [{ filename: `evoucher-${b.code}.png`, content: qrPng, cid: "qrcheckin", contentType: "image/png" }] };
}

// ── Expiry: cancel the unpaid booking, release allotment, notify the user ────
async function expirePayment(payment: any): Promise<void> {
  await prisma.payment.update({ where: { id: payment.id }, data: { status: "EXPIRED" } });
  const b = await prisma.booking.findUnique({ where: { id: payment.bookingId }, include: { hotel: true } });
  if (!b || b.status !== "PENDING") return; // already paid/cancelled — leave it
  await prisma.booking.update({ where: { id: b.id }, data: { status: "CANCELLED" } });
  if (b.roomId) await release(prisma, b.roomId, b.checkIn, b.checkOut, b.rooms).catch(() => {});
  await dispatch(prisma, {
    userId: b.userId,
    title: `Pembayaran kedaluwarsa · ${b.hotel.name}`,
    body: `Pesanan ${b.code} dibatalkan otomatis karena pembayaran tidak diselesaikan sebelum batas waktu. Silakan pesan ulang jika masih dibutuhkan.`,
    type: "cancel", hotelName: b.hotel.name, orderCode: b.code,
    phone: b.bookerPhone, email: b.bookerEmail,
  });
}

// Background sweep: expire overdue PENDING payments even if the user never
// re-opens the app to trigger the on-poll check.
async function sweepExpiredPayments(): Promise<void> {
  const overdue = await prisma.payment.findMany({
    where: { status: "PENDING", expiresAt: { lt: new Date() } },
    take: 200,
  });
  for (const p of overdue) await expirePayment(p).catch((e) => logger.error({ err: e }, "expire failed"));
}

// Poll payment status (app checks after showing instructions).
app.get("/api/payments/:id", requireAuth, async (req: AuthRequest, res) => {
  const payment = await prisma.payment.findFirst({
    where: { id: req.params.id, booking: { userId: req.userId } },
  });
  if (!payment) return res.status(404).json({ error: "Pembayaran tidak ditemukan" });
  // auto-expire (also cancels the booking, releases allotment, notifies)
  if (payment.status === "PENDING" && payment.expiresAt && payment.expiresAt < new Date()) {
    await expirePayment(payment).catch(() => {});
    const exp = await prisma.payment.findUnique({ where: { id: payment.id } });
    return res.json({ payment: clientPayment(exp) });
  }
  res.json({ payment: clientPayment(payment) });
});

// Mock/dev settle — simulates a successful payment (no real money). Only allowed
// for MOCK-provider payments so it can't force-settle real ones.
app.post("/api/payments/:id/settle", requireAuth, async (req: AuthRequest, res) => {
  const payment = await prisma.payment.findFirst({ where: { id: req.params.id, booking: { userId: req.userId } } });
  if (!payment) return res.status(404).json({ error: "Pembayaran tidak ditemukan" });
  if (payment.provider !== "MOCK") return res.status(403).json({ error: "Menunggu konfirmasi pembayaran dari penyedia" });
  await markPaymentPaid(payment.id);
  const booking = await prisma.booking.findUnique({
    where: { id: payment.bookingId },
    include: { hotel: { select: hotelCard }, room: true, channel: { select: { code: true, name: true, type: true } } },
  });
  if (booking) await awardLoyalty(booking.userId, Number(booking.roomPrice), booking.id, booking.code);
  res.json({ booking });
});

// Provider webhook (Flip/etc.) — public, verified inside parseWebhook.
app.post("/api/payments/webhook", async (req, res) => {
  const provider = await activeProvider();
  const parsed = provider.parseWebhook(req.body, req.headers as any);
  if (!parsed) return res.status(400).json({ error: "Webhook tidak valid" });
  const payment = await prisma.payment.findFirst({ where: { externalId: parsed.externalId } });
  if (!payment) return res.status(404).json({ error: "Pembayaran tidak ditemukan" });
  if (parsed.paid) await markPaymentPaid(payment.id);
  res.json({ ok: true });
});

// LinkQu callback — LinkQu POSTs here (url_callback) and expects {"response":"OK"}.
app.post("/api/payments/webhook/linkqu", async (req, res) => {
  try {
    const reff = String(req.body?.partner_reff || "");
    const paid = String(req.body?.status || "").toUpperCase() === "SUCCESS";
    const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.ip || "";
    // A callback is only trusted if its HMAC signature checks out. Without this,
    // anyone could POST {status:"SUCCESS"} and get a free booking.
    const verified = await verifyLinkquCallback(req.body);
    if (reff && paid && verified) {
      const payment = await prisma.payment.findFirst({ where: { externalId: reff, provider: "LINKQU" } });
      if (payment) await markPaymentPaid(payment.id);
    } else if (paid && !verified) {
      logger.warn({ reff, ip, expectedIp: LINKQU_CALLBACK_IP, sig: String(req.body?.signature || "").slice(0, 10) },
        "LinkQu callback REJECTED — invalid/absent signature (not settled)");
    }
    audit(req as any, "payment.linkqu.callback", "Payment", reff, { status: req.body?.status, verified, ip });
  } catch (e) { logger.error({ err: e }, "linkqu callback failed"); }
  res.json({ response: "OK" }); // LinkQu requires this exact acknowledgement
});

// LinkQu also POSTs reload (merchant balance top-up) and withdraw (disbursement)
// callbacks. Miruum doesn't use those products, but LinkQu requires a URL that
// acknowledges — accept and ignore so its dashboard is satisfied.
app.post("/api/payments/webhook/linkqu/reload", (req, res) => {
  audit(req as any, "payment.linkqu.reload", "Payment", String(req.body?.partner_reff || ""), {});
  res.json({ response: "OK" });
});
app.post("/api/payments/webhook/linkqu/withdraw", (req, res) => {
  audit(req as any, "payment.linkqu.withdraw", "Payment", String(req.body?.partner_reff || ""), {});
  res.json({ response: "OK" });
});

// Single source of truth for the cancellation refund quote (policy is fully
// configurable in Back Office → Pengaturan). Used by both the quote endpoint
// the app shows and the actual cancel endpoint — so they can never disagree.
async function computeRefund(booking: any): Promise<{ refundPct: number; refundAmount: number; wasPaid: boolean; note: string }> {
  const cutoff = await getNum("refundCutoffHours");
  const fullPct = await getNum("refundFullPct");
  const partialPct = await getNum("refundPartialPct");
  const wasPaid = booking.status === "PAID";
  const hoursToCheckIn = (booking.checkIn.getTime() - Date.now()) / 3600000;
  // Prefer the chosen rate plan's policy snapshot; fall back to the room's.
  const freeCancel = booking.planFreeCancellation ?? booking.room.freeCancellation;
  const refundable = booking.planRefundable ?? booking.room.refundable;
  let refundPct = 0;
  if (freeCancel && hoursToCheckIn > cutoff) refundPct = fullPct;
  else if (refundable && hoursToCheckIn > cutoff) refundPct = partialPct;
  const refundAmount = wasPaid ? Math.round((Number(booking.totalPrice) * refundPct) / 100) : 0;
  let note: string;
  if (!wasPaid) note = "Pesanan yang belum dibayar akan dibatalkan tanpa biaya.";
  else if (refundPct > 0) note = `Kamu akan mendapat refund ${refundPct}% = ${rupiah(refundAmount)}.`;
  else if (refundable || freeCancel) note = `Pembatalan kurang dari ${cutoff} jam sebelum check-in — tidak ada pengembalian dana.`;
  else note = "Rate plan ini non-refundable — tidak ada pengembalian dana.";
  return { refundPct, refundAmount, wasPaid, note };
}

// Refund estimate for a booking (shown before the user confirms cancellation).
app.get("/api/bookings/:id/refund-quote", requireAuth, async (req: AuthRequest, res) => {
  const booking = await prisma.booking.findFirst({ where: { id: req.params.id, userId: req.userId }, include: { room: true } });
  if (!booking) return res.status(404).json({ error: "Pesanan tidak ditemukan" });
  const cancellable = !["CANCELLED", "REFUNDED", "COMPLETED"].includes(booking.status);
  const q = await computeRefund(booking);
  const user = await prisma.user.findUnique({ where: { id: req.userId }, select: { name: true } });
  // A cash refund needs the guest's bank account; it must be in their own name.
  res.json({ ...q, cancellable, requiresBank: q.wasPaid && q.refundAmount > 0, accountHolderName: user?.name ?? "" });
});

// Names match ignoring case, extra spaces & punctuation.
const normName = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

app.post("/api/bookings/:id/cancel", requireAuth, async (req: AuthRequest, res) => {
  const booking = await prisma.booking.findFirst({
    where: { id: req.params.id, userId: req.userId },
    include: { room: true, hotel: { select: { name: true } } },
  });
  if (!booking) return res.status(404).json({ error: "Pesanan tidak ditemukan" });
  if (["CANCELLED", "REFUNDED", "COMPLETED"].includes(booking.status))
    return res.status(400).json({ error: "Pesanan tidak dapat dibatalkan" });

  const { refundPct, refundAmount, wasPaid } = await computeRefund(booking);

  // When money is owed back, collect a bank account that MUST be in the account
  // owner's own name (matches Data Pribadi) — anti-fraud / AML control.
  let refundBank: { refundBankName: string; refundBankAccount: string; refundAccountHolder: string } | null = null;
  if (wasPaid && refundAmount > 0) {
    const bankName = String(req.body?.bankName ?? "").trim();
    const bankAccount = String(req.body?.bankAccount ?? "").trim();
    const accountHolder = String(req.body?.accountHolder ?? "").trim();
    if (!bankName || !bankAccount || !accountHolder)
      return res.status(400).json({ error: "Nama bank, nomor rekening, dan nama pemilik rekening wajib diisi untuk refund." });
    if (!/^\d{6,20}$/.test(bankAccount.replace(/\s+/g, "")))
      return res.status(400).json({ error: "Nomor rekening tidak valid (6–20 digit angka)." });
    const owner = await prisma.user.findUnique({ where: { id: req.userId }, select: { name: true } });
    if (!owner?.name || normName(accountHolder) !== normName(owner.name))
      return res.status(400).json({ error: "Nama rekening harus sama dengan nama di Data Pribadi Anda." });
    // Anti-fraud: blocklisted bank account + refund velocity abuse control.
    const bankBlk = await isBlocked(prisma, { bank: bankAccount.replace(/\s+/g, "") });
    if (bankBlk.blocked) return res.status(403).json({ error: "Refund tidak dapat diproses ke rekening ini. Hubungi dukungan." });
    const rv = await refundVelocity(redis(), req.userId!);
    if (rv.block) return res.status(429).json({ error: "Terlalu banyak permintaan refund. Hubungi dukungan Miruum." });
    refundBank = { refundBankName: bankName, refundBankAccount: bankAccount, refundAccountHolder: accountHolder };
  }

  const updated = await prisma.booking.update({
    where: { id: booking.id },
    data: { status: wasPaid && refundAmount > 0 ? "REFUNDED" : "CANCELLED", ...(refundBank ?? {}) },
  });
  await dispatch(prisma, {
    userId: req.userId,
    title: `Pembatalan ${booking.hotel.name}`,
    body: wasPaid
      ? `Pesanan ${booking.code} dibatalkan. Refund ${refundPct}% = ${rupiah(refundAmount)} diproses.`
      : `Pesanan ${booking.code} dibatalkan.`,
    type: "cancel", hotelName: booking.hotel.name, orderCode: booking.code,
    phone: booking.bookerPhone, email: booking.bookerEmail,
  });
  res.json({ booking: updated, refundPct, refundAmount });
});

// ── Reschedule (ubah tanggal) — shared computation for quote + apply ──
async function computeReschedule(booking: any, checkInStr: string, checkOutStr: string) {
  const cutoff = await getNum("refundCutoffHours");
  // Reschedule is only allowed BEFORE payment — once paid, the price is locked
  // (a date change would alter the total without settling the difference).
  if (booking.status !== "PENDING")
    return { allowed: false, reason: "Ubah tanggal hanya bisa sebelum pembayaran. Batalkan lalu pesan ulang jika perlu." };
  if (booking.checkedInAt) return { allowed: false, reason: "Pesanan ini tidak dapat dijadwal ulang." };
  const hoursToCheckIn = (booking.checkIn.getTime() - Date.now()) / 3600000;
  if (hoursToCheckIn < cutoff) return { allowed: false, reason: `Jadwal ulang harus lebih dari ${cutoff} jam sebelum check-in.` };
  const checkIn = new Date(checkInStr), checkOut = new Date(checkOutStr);
  if (isNaN(checkIn.getTime()) || isNaN(checkOut.getTime()) || checkOut <= checkIn)
    return { allowed: false, reason: "Tanggal tidak valid." };
  if (checkIn.getTime() < Date.now() - 86400000) return { allowed: false, reason: "Check-in tidak boleh di masa lalu." };
  const nights = Math.max(1, Math.round((checkOut.getTime() - checkIn.getTime()) / 86400000));
  const perNight = Number(booking.roomPrice) / Math.max(1, booking.nights); // price per night × rooms, from original
  const newRoomPrice = Math.round(perNight * nights);
  const newTax = Math.round(newRoomPrice * (await getNum("taxPct")) / 100);
  const newTotal = newRoomPrice + newTax - Number(booking.discount);
  return { allowed: true, nights, checkIn, checkOut, newRoomPrice, newTax, newTotal, diff: newTotal - Number(booking.totalPrice) };
}

app.get("/api/bookings/:id/reschedule-quote", requireAuth, async (req: AuthRequest, res) => {
  const booking = await prisma.booking.findFirst({ where: { id: req.params.id, userId: req.userId } });
  if (!booking) return res.status(404).json({ error: "Pesanan tidak ditemukan" });
  const q = await computeReschedule(booking, String(req.query.checkIn || ""), String(req.query.checkOut || ""));
  res.json({ ...q, oldTotal: booking.totalPrice });
});

app.post("/api/bookings/:id/reschedule", requireAuth, async (req: AuthRequest, res) => {
  const booking = await prisma.booking.findFirst({ where: { id: req.params.id, userId: req.userId }, include: { hotel: { select: { name: true } } } });
  if (!booking) return res.status(404).json({ error: "Pesanan tidak ditemukan" });
  const q = await computeReschedule(booking, String(req.body?.checkIn || ""), String(req.body?.checkOut || ""));
  if (!q.allowed) return res.status(400).json({ error: q.reason });
  const updated = await prisma.booking.update({
    where: { id: booking.id },
    data: { checkIn: q.checkIn, checkOut: q.checkOut, nights: q.nights, roomPrice: BigInt(q.newRoomPrice!), taxFee: BigInt(q.newTax!), totalPrice: BigInt(q.newTotal!) },
  });
  const diffNote = q.diff! > 0 ? ` Selisih ${rupiah(q.diff!)} akan ditagih.` : q.diff! < 0 ? ` Kelebihan ${rupiah(-q.diff!)} menjadi kredit.` : "";
  await dispatch(prisma, {
    userId: req.userId, title: `Jadwal Diubah — ${booking.hotel.name}`,
    body: `Pesanan ${booking.code} dijadwal ulang ke ${q.checkIn!.toISOString().split("T")[0]} s/d ${q.checkOut!.toISOString().split("T")[0]}.${diffNote}`,
    type: "info", hotelName: booking.hotel.name, orderCode: booking.code, phone: booking.bookerPhone, email: booking.bookerEmail,
  });
  res.json({ booking: updated, diff: q.diff });
});

// Digital (online) check-in by the guest → issues a digital room key/access code.
app.post("/api/bookings/:id/digital-checkin", requireAuth, async (req: AuthRequest, res) => {
  const b = await prisma.booking.findFirst({ where: { id: req.params.id, userId: req.userId } });
  if (!b) return res.status(404).json({ error: "Pesanan tidak ditemukan" });
  if (!["PAID", "PENDING"].includes(b.status)) return res.status(400).json({ error: "Pesanan ini tidak bisa check-in online" });
  if (b.checkedOutAt) return res.status(400).json({ error: "Tamu sudah check-out" });
  // Allow from 1 day before check-in.
  if (b.checkIn.getTime() - Date.now() > 86400000) return res.status(400).json({ error: `Check-in online dibuka H-1 (mulai ${b.checkIn.toISOString().split("T")[0]})` });
  const keyCode = b.keyCode ?? ("MRK-" + Math.floor(100000 + Math.random() * 899999));
  const updated = await prisma.booking.update({ where: { id: b.id }, data: { onlineCheckedIn: true, keyCode } });
  res.json({ booking: updated, keyCode, onlineCheckedIn: true });
});

// ── Shared document styling for e-voucher & invoice (professional, printable) ──
const DOC_CSS = `*{box-sizing:border-box}body{font-family:'Segoe UI',system-ui,-apple-system,Roboto,Helvetica,Arial,sans-serif;background:#eef0f4;margin:0;padding:26px 16px;color:#1f262e;-webkit-font-smoothing:antialiased}
.doc{max-width:560px;margin:0 auto;background:#fff;border-radius:18px;overflow:hidden;box-shadow:0 16px 44px rgba(20,24,30,.12)}
.brand{font-weight:800;font-size:20px;letter-spacing:.5px}.brand span{opacity:.9;font-weight:600}
.logo-plate{display:inline-block;background:#fff;border-radius:11px;padding:8px 14px;box-shadow:0 6px 16px rgba(0,0,0,.18)}.logo-plate img{height:30px;display:block}
.hd{background:linear-gradient(120deg,#E58324,#D06E12);color:#fff;padding:24px 26px;position:relative}
.hd .kind{font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;opacity:.85;margin-bottom:12px}
.hd h1{margin:6px 0 2px;font-size:22px;font-weight:800}.hd .sub{opacity:.9;font-size:13px}
.badge{position:absolute;top:24px;right:26px;padding:6px 13px;border-radius:20px;font-size:11px;font-weight:800;letter-spacing:.4px}
.badge.ok{background:#fff;color:#1E7E38}.badge.wait{background:rgba(255,255,255,.22);color:#fff}
.bd{padding:22px 26px}
.qrbox{display:flex;gap:18px;align-items:center;padding:16px;background:#faf7f2;border:1px solid #f0e9df;border-radius:14px;margin-bottom:20px}
.qrbox .qr{width:112px;height:112px;flex-shrink:0}.qrbox .qr svg{width:100%;height:100%;display:block}
.qrbox .cd{font-size:11px;color:#8a8f98}.qrbox .cc{font-family:'SF Mono',Menlo,monospace;font-size:20px;font-weight:800;letter-spacing:1px;color:#20262e;margin-top:2px}
.qrbox .hint{font-size:11px;color:#9aa0a6;margin-top:8px;line-height:1.4}
.row{display:flex;justify-content:space-between;gap:16px;padding:9px 0;border-bottom:1px solid #f0f1f4;font-size:13.5px}
.row:last-of-type{border-bottom:none}.row .k{color:#727880}.row .v2{font-weight:600;text-align:right;color:#20262e}
.sec{font-size:10.5px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:#a4a9b0;margin:20px 0 6px}
.items{width:100%;border-collapse:collapse;font-size:13.5px;margin-top:4px}
.items td{padding:9px 0;border-bottom:1px solid #f0f1f4}.items .r{text-align:right;font-weight:600}.items .muted{color:#8a8f98;font-size:11.5px}
.tot{margin-top:6px;padding-top:14px;border-top:2px dashed #e0e3e8;display:flex;justify-content:space-between;font-size:19px;font-weight:800;color:#D06E12}
.foot{font-size:11px;color:#9aa0a6;margin-top:20px;text-align:center;line-height:1.6}
.actions{max-width:560px;margin:16px auto 0;text-align:center}
.pbtn{display:inline-block;background:#20262e;color:#fff;border:none;padding:11px 22px;border-radius:10px;font-size:13px;font-weight:600;cursor:pointer;text-decoration:none}
.note{background:#FFF6EC;border:1px solid #F3D8B4;border-left:4px solid #E58324;border-radius:10px;padding:11px 13px;font-size:13px;line-height:1.55;color:#6b4a1e;white-space:pre-wrap;word-break:break-word}
.callout{background:#F6FAF7;border:1px solid #D8ECE0;border-radius:12px;padding:13px 15px;margin-top:6px}
.callout .ct{font-weight:700;font-size:12.5px;color:#1f262e;margin-bottom:7px;display:flex;align-items:center;gap:6px}
.steps{margin:0;padding-left:18px;font-size:12.5px;color:#4a525c;line-height:1.7}
.chips{display:flex;flex-wrap:wrap;gap:7px;margin-top:4px}
.chip{background:#eef1f5;border:1px solid #dfe3ea;border-radius:20px;padding:5px 11px;font-size:11.5px;color:#3a424c;font-weight:600}
.help{margin-top:14px;display:flex;gap:11px;align-items:center;background:#20262e;color:#fff;border-radius:12px;padding:12px 15px}
.help b{font-size:13px}.help span{font-size:11.5px;color:#c9ced6}
@media print{body{background:#fff;padding:0}.doc{box-shadow:none;border-radius:0}.actions{display:none}.note{-webkit-print-color-adjust:exact;print-color-adjust:exact}}`;
// Escape user-supplied text before embedding it in an HTML document.
function esc(s: unknown): string {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ─────────── Branded document family (voucher / receipt / cancellation) ───────────
// Faithful to the Miruum template set: logo header, orange accents, grey section
// bars, bilingual (EN + grey-italic ID) labels, app-store badges + orange wave.
const V_ORANGE = "#F08421";
const CS_PHONE = "0811 9628 286";
const VCSS = `*{box-sizing:border-box}
body{font-family:'Segoe UI',system-ui,-apple-system,Roboto,Helvetica,Arial,sans-serif;background:#e9ecf1;margin:0;padding:24px 14px;color:#20262e;-webkit-font-smoothing:antialiased}
.vdoc{width:794px;max-width:100%;min-height:1123px;margin:0 auto;background:#fff;border-radius:14px;box-shadow:0 12px 40px rgba(20,30,50,.16);overflow:hidden;position:relative;padding:44px 44px 140px}
.vhd{display:flex;justify-content:space-between;align-items:flex-start;gap:16px}
.vhd .logo img{height:66px;display:block}
.vhd .rt{text-align:right}
.vhd .rt h1{margin:0;font-size:26px;font-weight:800;letter-spacing:.5px}
.vhd .rt .tl{color:#9aa1ab;font-style:italic;font-size:13px}
.vhd .rt .time{color:#6b7178;font-size:12px;margin-top:6px}
.tl{color:#9aa1ab;font-style:italic;font-weight:400}
.hotrow{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;margin-top:22px}
.hotrow .hn{font-size:19px;font-weight:800;margin:0 0 3px}
.stars{color:${V_ORANGE};font-size:14px;letter-spacing:1px}
.hotrow .addr{color:#5b626b;font-size:12.5px;line-height:1.55;margin-top:5px}
.bkid{text-align:right}.bkid .l{font-weight:800;font-size:15px}.bkid .c{color:${V_ORANGE};font-size:21px;font-weight:800;margin-top:2px}
.obar{height:6px;background:${V_ORANGE};border-radius:6px;margin:18px 0}
.stayrow{display:flex;gap:14px;flex-wrap:wrap;margin-bottom:6px}
.stay{flex:1;min-width:150px}
.stay .cap{font-weight:800;font-size:14.5px}.stay .cap .tl{font-size:12px}
.stay .d{font-size:14px;margin-top:3px}
.stay .t{display:inline-flex;align-items:center;gap:5px;color:${V_ORANGE};font-size:12.5px;font-weight:600;margin-top:2px}
.statebox{background:#eef1f5;border-radius:12px;padding:12px 15px;min-width:190px}
.statebox b{font-size:14px}.statebox span{font-size:11.5px;color:#6b7178}
.vsec{font-size:17px;font-weight:800;margin:22px 0 10px}.vsec .tl{font-size:13px}
.vtbl{width:100%;border-collapse:collapse;font-size:12.5px}
.vtbl th{background:#f3f5f8;text-align:left;padding:9px 11px;font-weight:700;border:1px solid #e1e5ea;font-size:11.5px}
.vtbl th .tl{font-weight:400;font-size:10.5px}
.vtbl td{padding:9px 11px;border:1px solid #e1e5ea;vertical-align:top}
.grid3{display:flex;gap:14px;flex-wrap:wrap;margin-top:14px}
.gcol{flex:1;min-width:170px}
.gcol .h{font-weight:800;font-size:13.5px;margin-bottom:6px}.gcol .h .tl{font-size:11.5px}
.gbox{background:#f3f5f8;border-radius:10px;padding:11px 13px;font-size:12.5px;color:#3a424c;line-height:1.5;min-height:44px;white-space:pre-wrap;word-break:break-word}
.inc{display:flex;align-items:center;gap:7px;font-size:12.5px;color:#3a424c;padding:3px 0}
.cxl{margin:8px 0 0;padding:0;list-style:none}
.cxl li{display:flex;gap:9px;font-size:12.5px;color:#3a424c;line-height:1.5;padding:4px 0}
.cxl li:before{content:"";flex:0 0 8px;height:8px;background:${V_ORANGE};margin-top:5px;border-radius:2px}
.vfoot{position:absolute;left:0;right:0;bottom:0;padding:0 34px 22px;display:flex;justify-content:space-between;align-items:flex-end;z-index:2}
.badges{display:flex;gap:9px}
.badge2{display:inline-flex;align-items:center;gap:7px;background:#000;color:#fff;border-radius:8px;padding:7px 12px;text-decoration:none;font-size:11px;line-height:1.1}
.badge2 b{font-size:12.5px;font-weight:700}.badge2 .sm{font-size:8.5px;color:#cfcfcf;display:block}
.cs{text-align:right}.cs .l{font-weight:800;font-size:16px}.cs .p{color:${V_ORANGE};font-size:20px;font-weight:800;margin-top:2px}
.wave{position:absolute;left:0;right:0;bottom:0;width:100%;height:110px;z-index:1}
.watermark{position:absolute;left:34px;bottom:150px;font-size:78px;font-weight:800;color:rgba(20,30,50,.06);letter-spacing:2px;z-index:0}
.vact{max-width:820px;margin:16px auto 0;text-align:center}
.vbtn{display:inline-block;background:${V_ORANGE};color:#fff;border:none;border-radius:24px;padding:11px 24px;font-weight:700;font-size:14px;cursor:pointer;text-decoration:none}
/* NEW BOOKING / CANCELLATION + RECEIPT layouts */
.nbhd{display:flex;justify-content:space-between;align-items:flex-start;gap:16px}
.nbtitle{font-size:30px;font-weight:800;margin:0;letter-spacing:.5px}
.nbtime{color:#6b7178;font-size:12.5px;margin-top:5px}
.bkid2{margin-top:16px}.bkid2 .l{font-weight:800;font-size:18px}.bkid2 .c{color:${V_ORANGE};font-size:22px;font-weight:800;margin-top:2px}
.thinbar{height:5px;background:#e4e7ec;border-radius:5px;margin:16px 0 4px}
.bighead{font-size:22px;font-weight:800;margin:20px 0 10px}.bighead .tl{font-size:13px}
.infobox{background:#eef1f5;border-radius:12px;padding:16px 20px}
.hotelname{text-align:center;font-weight:800;font-size:16px;margin-bottom:12px}
.two{display:flex;gap:24px;flex-wrap:wrap}.two>div{flex:1;min-width:230px}
.kvp{display:flex;font-size:13px;padding:3px 0;line-height:1.5}.kvp .kk{width:150px;color:#3a424c}.kvp .vv{font-weight:600;flex:1}
.ratetbl{width:100%;border-collapse:collapse;font-size:12.5px;border:1.5px solid ${V_ORANGE};border-radius:10px;overflow:hidden}
.ratetbl th{text-align:left;padding:12px 14px;font-weight:800;font-size:12.5px}
.ratetbl td{padding:11px 14px;border-top:1px solid #eee}
.ratetbl .tot td{font-weight:700}
.rfoot{display:flex;justify-content:space-between;gap:14px;flex-wrap:wrap;border-top:1.5px solid ${V_ORANGE};padding:12px 14px;font-size:12px}
.rfoot b{font-size:12.5px}
.reqbox{background:#eef1f5;border-radius:10px;padding:13px 16px;font-size:13px;color:#3a424c;line-height:1.5;white-space:pre-wrap;word-break:break-word}
.gbar{background:#e4e7ec;font-weight:800;font-size:14px;padding:8px 14px;border-radius:6px;margin:16px 0 10px}
.rtbl{width:100%;border-collapse:collapse;font-size:12.5px;margin-top:6px}
.rtbl th{background:#f3f5f8;text-align:left;padding:9px 11px;border:1px solid #e1e5ea;font-size:11.5px;font-weight:700}
.rtbl td{padding:9px 11px;border:1px solid #e1e5ea}.rtbl .r{text-align:right}
.rtbl .tot td{font-weight:800;background:#fafbfc}
.cxlbanner{background:#fdeaea;border:1px solid #f0b8b8;color:#b02a2a;border-radius:10px;padding:11px 15px;font-weight:700;font-size:14px;margin-top:6px}
@page{size:A4;margin:0}
@media print{body{background:#fff;padding:0}.vdoc{width:210mm;min-height:297mm;box-shadow:none;border-radius:0;margin:0}.vact{display:none}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
@media(max-width:560px){.vdoc{padding:24px 18px 140px}.vhd .rt h1{font-size:21px}.nbtitle{font-size:23px}.vfoot{padding:0 18px 18px}}`;

// The orange wave graphic at the foot of every branded document.
const V_WAVE = `<svg class="wave" viewBox="0 0 820 110" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg"><path d="M0 55 C 150 10, 300 95, 470 60 C 620 30, 720 80, 820 45 L820 110 L0 110 Z" fill="${V_ORANGE}" opacity="0.95"/><path d="M0 78 C 160 45, 320 100, 500 78 C 660 58, 740 92, 820 72 L820 110 L0 110 Z" fill="${V_ORANGE}" opacity="0.55"/></svg>`;
// App-store badges (self-contained, no external images).
const V_BADGES = `<div class="badges"><a class="badge2" href="https://play.google.com/store/apps/details?id=id.gokar.miruum"><span style="font-size:15px">▶</span><span><span class="sm">GET IT ON</span><b>Google Play</b></span></a><a class="badge2" href="https://miruum.id"><span style="font-size:15px"></span><span><span class="sm">Download on the</span><b>App Store</b></span></a></div>`;
const V_CS = `<div class="cs"><div class="l">Customer Service <span style="color:#2ecc71">📞</span></div><div class="p">${CS_PHONE}</div></div>`;
function vLogo(): string { return `<div class="logo"><img src="${PUBLIC_ORIGIN}/static/logo.png" alt="Miruum"></div>`; }
// Human cancellation-policy bullets (EN + ID) from the stored policy code.
function cxlBullets(policy: string | null): string {
  const P: Record<string, string[]> = {
    FLEXIBLE: ["Free cancellation up to 24 hours before check-in. <span class='tl'>Pembatalan gratis hingga 24 jam sebelum check-in.</span>", "After that, the first night is charged. <span class='tl'>Setelahnya, dikenai biaya 1 malam pertama.</span>"],
    MODERATE: ["Partial refund if cancelled before check-in date. <span class='tl'>Refund sebagian bila batal sebelum tanggal check-in.</span>", "No refund for no-show. <span class='tl'>Tidak ada refund untuk no-show.</span>"],
    STRICT: ["Cancel 1 day prior to arrival: 1 night charge. <span class='tl'>Batal 1 hari sebelum tiba: biaya 1 malam.</span>", "No-show: 100% charge. <span class='tl'>No-show: dikenai 100%.</span>"],
    NON_REFUNDABLE: ["Reservation is non-refundable. <span class='tl'>Reservasi tidak dapat direfund.</span>"],
  };
  const items = P[policy || ""] || ["Cancellation terms follow the property's policy. <span class='tl'>Ketentuan pembatalan mengikuti kebijakan properti.</span>"];
  items.push("Times displayed are based on the accommodation's local time. <span class='tl'>Waktu mengikuti zona waktu properti.</span>");
  return `<ul class="cxl">${items.map((t) => `<li><span>${t}</span></li>`).join("")}</ul>`;
}
const cxlText: Record<string, string> = {
  FLEXIBLE: "Free cancellation up to 24 hours before check-in, then 1 night charge.",
  MODERATE: "Partial refund if cancelled before check-in date. No refund for no-show.",
  STRICT: "Cancel 1 day prior to arrival: 1 night charge. No-show: 100% charge.",
  NON_REFUNDABLE: "Reservation is non-refundable.",
};

// NEW BOOKING (hotel) & CANCELLATION (both) — same layout with a rates table.
function bookingDocHtml(b: any, title: string, opts: { cancelled?: boolean } = {}): string {
  const parts = String(b.bookerName || "").trim().split(/\s+/);
  const first = parts[0] || "-"; const last = parts.slice(1).join(" ") || "-";
  const status = b.payAtHotel ? "Pay at hotel" : "Prepaid";
  const rate = Number(b.roomPrice) * b.rooms; const disc = Number(b.discount);
  const receive = Math.max(0, rate - disc);
  const pkg = b.packageTitle ? esc(b.packageTitle) : "-";
  const bf = b.room.breakfast ? `Yes ${b.guests} Person(s)` : "No";
  return `<!doctype html><html lang="id"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} ${b.code} — Miruum</title><style>${VCSS}</style></head><body>
<div class="vdoc">
  <div class="nbhd"><div><h1 class="nbtitle">${title}</h1><div class="nbtime">Time : ${fmtShort(b.createdAt)}</div></div>${vLogo()}</div>
  <div class="bkid2"><div class="l">Booking ID</div><div class="c">${b.code}</div></div>
  <div class="thinbar"></div>
  ${opts.cancelled ? `<div class="cxlbanner">⚠ Booking CANCELLED <span class="tl" style="color:#b02a2a">Pesanan Dibatalkan</span></div>` : ""}
  <div class="bighead">Reservation information</div>
  <div class="infobox">
    <div class="hotelname">${esc(b.hotel.name)}</div>
    <div class="two">
      <div>
        <div class="kvp"><span class="kk">Hotel ID</span><span class="vv">: ${b.hotel.id.slice(-9)}</span></div>
        <div class="kvp"><span class="kk">City</span><span class="vv">: ${esc(b.hotel.city)}</span></div>
        <div class="kvp"><span class="kk">Status</span><span class="vv">: ${status}</span></div>
      </div>
      <div>
        <div class="kvp"><span class="kk">Guest First Name</span><span class="vv">: ${esc(first)}</span></div>
        <div class="kvp"><span class="kk">Guest Last Name</span><span class="vv">: ${esc(last)}</span></div>
        <div class="kvp"><span class="kk">Check-in</span><span class="vv">: ${fmtDate(b.checkIn)}</span></div>
        <div class="kvp"><span class="kk">Check-out</span><span class="vv">: ${fmtDate(b.checkOut)}</span></div>
      </div>
    </div>
  </div>
  <div class="bighead">Booking Details</div>
  <div class="infobox">
    <div class="two">
      <div>
        <div class="kvp"><span class="kk">Room Type</span><span class="vv">: ${esc(b.room.name)}</span></div>
        <div class="kvp"><span class="kk">Guest(s)</span><span class="vv">: ${b.guests} Adult(s)</span></div>
        <div class="kvp"><span class="kk">No. of Room(s)</span><span class="vv">: ${b.rooms}</span></div>
        <div class="kvp"><span class="kk">Payment</span><span class="vv">: Booked and payable by Miruum</span></div>
      </div>
      <div>
        <div class="kvp"><span class="kk">Extra Bed(s) per Room</span><span class="vv">: 0</span></div>
        <div class="kvp"><span class="kk">Breakfast Included</span><span class="vv">: ${bf}</span></div>
        <div class="kvp"><span class="kk">Package</span><span class="vv">: ${pkg}</span></div>
      </div>
    </div>
  </div>
  <div style="margin-top:18px"><table class="ratetbl">
    <tr><th>Date</th><th>Room Rates</th><th>Extra Bed Rates</th><th>Surcharge Rates</th></tr>
    <tr><td>${fmtDate(b.checkIn)}</td><td>${rupiah(rate)}</td><td>${rupiah(0)}</td><td>${rupiah(0)}</td></tr>
    <tr class="tot"><td>Total</td><td>${rupiah(rate)}</td><td>${rupiah(0)}</td><td>${rupiah(0)}</td></tr>
  </table>
  <div class="rfoot"><span>*Subtotal Rates : ${rupiah(rate)}</span><span>*Promotion and adjustment : ${rupiah(disc)}</span><b>*Rate you will receive : ${rupiah(receive)}</b></div>
  </div>
  <div class="bighead">Special Request</div>
  <div class="reqbox">${b.specialRequest ? esc(b.specialRequest) : "-"}</div>
  <div class="bighead">Cancellation Policy <span class="tl">*Based on your hotel check-in time</span></div>
  <div class="reqbox">${cxlText[b.hotel.cancellationPolicy || ""] || "Follows the property's cancellation policy."}</div>
  <div class="vfoot">${V_BADGES}${V_CS}</div>
  ${V_WAVE}
</div>
<div class="vact"><button class="vbtn" onclick="window.print()">Cetak / Simpan PDF</button></div>
</body></html>`;
}

// RECEIPT (guest) — priced, with taxes and a PAID watermark.
function receiptDocHtml(b: any): string {
  const paid = b.status === "PAID" || b.status === "COMPLETED";
  const accom = Number(b.roomPrice) * b.rooms;
  const tax = Number(b.taxFee);
  const disc = Number(b.discount);
  const total = Number(b.totalPrice);
  return `<!doctype html><html lang="id"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Receipt ${b.code} — Miruum</title><style>${VCSS}</style></head><body>
<div class="vdoc">
  <div class="nbhd">${vLogo()}<div style="text-align:right"><h1 class="nbtitle">RECEIPT</h1><div class="nbtime">Time : ${fmtShort(b.createdAt)}</div></div></div>
  ${paid ? `<div class="watermark">PAID</div>` : ""}
  <div class="two" style="margin-top:18px">
    <div><div class="gbar">Hotel Details</div>
      <div class="kvp"><span class="kk">Name</span><span class="vv">: ${esc(b.hotel.name)}</span></div>
      <div class="kvp"><span class="kk">Address</span><span class="vv">: ${esc(b.hotel.address)}, ${esc(b.hotel.city)}</span></div>
    </div>
    <div><div class="gbar">Billed To</div>
      <div class="kvp"><span class="kk">Name</span><span class="vv">: ${esc(b.bookerName)}</span></div>
      <div class="kvp"><span class="kk">Email</span><span class="vv">: ${esc(b.bookerEmail)}</span></div>
      <div class="kvp"><span class="kk">Contact</span><span class="vv">: ${esc(b.bookerPhone)}</span></div>
    </div>
  </div>
  <div class="gbar">Guest Details</div>
  <div class="two">
    <div><div class="kvp"><span class="kk">Guest Name</span><span class="vv">: ${esc(b.bookerName)}</span></div>
      <div class="kvp"><span class="kk">Room</span><span class="vv">: ${b.rooms}× ${esc(b.room.name)}</span></div></div>
    <div><div class="kvp"><span class="kk">Check-in</span><span class="vv">: ${fmtDate(b.checkIn)}</span></div>
      <div class="kvp"><span class="kk">Check-out</span><span class="vv">: ${fmtDate(b.checkOut)}</span></div>
      <div class="kvp"><span class="kk">Duration</span><span class="vv">: ${b.nights} night(s)</span></div></div>
  </div>
  <div class="gbar">Payment Details</div>
  <div class="two">
    <div><div class="kvp"><span class="kk">Payment Method</span><span class="vv">: ${b.paymentMethod ? esc(b.paymentMethod) + (b.bank ? " · " + esc(b.bank) : "") : "-"}</span></div>
      <div class="kvp"><span class="kk">Transaction Status</span><span class="vv">: ${paid ? "PAID" : "PENDING"}</span></div></div>
    <div><div class="kvp"><span class="kk">Transaction ID</span><span class="vv">: ${b.code}</span></div>
      ${b.paidAt ? `<div class="kvp"><span class="kk">Paid At</span><span class="vv">: ${fmtShort(b.paidAt)}</span></div>` : ""}</div>
  </div>
  <table class="rtbl" style="margin-top:12px">
    <tr><th>No</th><th>Type of Item</th><th>Item Description</th><th class="r">Qty</th><th class="r">Price / item (Rp)</th><th class="r">Total (Rp)</th></tr>
    <tr><td>1</td><td>Accommodation</td><td>${esc(b.room.name)} (${b.rooms} × ${b.nights} night)</td><td class="r">${b.rooms}</td><td class="r">${rupiah(accom).replace("Rp", "").trim()}</td><td class="r">${rupiah(accom).replace("Rp", "").trim()}</td></tr>
    <tr><td>2</td><td>Taxes and Service</td><td>Taxes and Service</td><td class="r">1</td><td class="r">${rupiah(tax).replace("Rp", "").trim()}</td><td class="r">${rupiah(tax).replace("Rp", "").trim()}</td></tr>
    ${disc > 0 ? `<tr><td>3</td><td>Discount${b.promoCode ? " (" + esc(b.promoCode) + ")" : ""}</td><td>Promotion</td><td class="r">1</td><td class="r" style="color:#1E7E38">-${rupiah(disc).replace("Rp", "").trim()}</td><td class="r" style="color:#1E7E38">-${rupiah(disc).replace("Rp", "").trim()}</td></tr>` : ""}
    <tr class="tot"><td colspan="5">Total Amount</td><td class="r">${rupiah(total).replace("Rp", "").trim()}</td></tr>
  </table>
  <div style="font-size:11px;color:#8a8f98;margin-top:7px">*Total Amount is exclude surcharge rate (if any). <span class="tl">Total belum termasuk surcharge (jika ada).</span></div>
  <div class="vfoot">${V_BADGES}${V_CS}</div>
  ${V_WAVE}
</div>
<div class="vact"><a href="/api/vouchers/${b.code}" class="vbtn" style="background:#fff;color:#20262e;border:1px solid #d7dae1;margin-right:6px">Hotel Voucher</a><button class="vbtn" onclick="window.print()">Cetak / Simpan PDF</button></div>
</body></html>`;
}

async function qrSvg(text: string): Promise<string> {
  try { return await QRCode.toString(text, { type: "svg", margin: 0, color: { dark: "#20262e", light: "#00000000" } }); }
  catch { return ""; }
}

const fmtDate = (d: Date) => d.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const fmtShort = (d: Date) => d.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });

// ─────────── Corporate & Government booking (corporate.miruum.id) ───────────
async function corporateOf(req: AuthRequest) {
  const u = await prisma.user.findUnique({ where: { id: req.userId }, select: { name: true, email: true, phone: true, corporate: true } });
  if (!u?.corporate) return null;
  return { ...u.corporate, contactName: u.name, contactEmail: u.email, contactPhone: u.phone };
}

app.get("/api/corporate/overview", requireRole("CORPORATE"), async (req: AuthRequest, res) => {
  const c = await corporateOf(req);
  if (!c) return res.status(404).json({ error: "Akun korporat tidak ditemukan" });
  const since = new Date(Date.now() - 30 * 86400000);
  const [bookings, agg, recent30, recent] = await Promise.all([
    prisma.booking.count({ where: { corporateId: c.id } }),
    prisma.booking.aggregate({ where: { corporateId: c.id, status: { in: ["PAID", "COMPLETED"] } }, _sum: { totalPrice: true } }),
    prisma.booking.count({ where: { corporateId: c.id, createdAt: { gte: since } } }),
    prisma.booking.findMany({ where: { corporateId: c.id }, orderBy: { createdAt: "desc" }, take: 8, include: { hotel: { select: { name: true, city: true } }, room: { select: { name: true } } } }),
  ]);
  const me = await prisma.user.findUnique({ where: { id: req.userId }, select: { corporateRole: true } });
  const myRole = me?.corporateRole || "MAKER";
  const pendingApprovals = await prisma.booking.count({ where: { corporateId: c.id, approvalStatus: "PENDING" } });
  res.json({
    corporate: c,
    discountPct: await corporateDiscountPct(c as any), // effective B2B rate (own or global default)
    myId: req.userId, myRole, canApprove: isCorpApprover(myRole), pendingApprovals,
    stats: { bookings, spend: agg._sum.totalPrice ?? 0, recent30 },
    recent,
  });
});

// Admin: corporate accounts + their negotiated B2B rate.
app.get("/api/admin/corporates", requireRole("ADMIN"), async (_req, res) => {
  const corporates = await prisma.corporate.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true, name: true, type: true, entityType: true, email: true, phone: true,
      discountPct: true, creditLimit: true, active: true,
      _count: { select: { bookings: true, users: true } },
    },
  });
  res.json({
    corporates: corporates.map((c) => ({ ...c, creditLimit: Number(c.creditLimit) })),
    defaultDiscountPct: Number((await getSettings()).corporate_discount_pct ?? 0),
  });
});

app.put("/api/admin/corporates/:id", requireRole("ADMIN"), async (req, res) => {
  const schema = z.object({
    discountPct: z.coerce.number().int().min(0).max(90).optional(),
    creditLimit: z.coerce.number().int().min(0).optional(),
    active: formBool.optional(),
  });
  const p = schema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Data tidak valid (diskon 0–90%)" });
  const data: any = {};
  if (p.data.discountPct !== undefined) data.discountPct = p.data.discountPct;
  if (p.data.creditLimit !== undefined) data.creditLimit = BigInt(p.data.creditLimit);
  if (p.data.active !== undefined) data.active = p.data.active;
  const c = await prisma.corporate.update({ where: { id: req.params.id }, data });
  audit(req, "corporate.update", "Corporate", c.id);
  res.json({ ok: true });
});

// Back Office: manage a corporate account's Maker/Approver users.
app.get("/api/admin/corporates/:id/users", requireRole("ADMIN"), async (req, res) => {
  const corp = await prisma.corporate.findUnique({ where: { id: req.params.id }, select: { id: true, name: true } });
  if (!corp) return res.status(404).json({ error: "Korporat tidak ditemukan" });
  const users = await prisma.user.findMany({
    where: { corporateId: corp.id }, orderBy: { createdAt: "asc" },
    select: { id: true, name: true, email: true, corporateRole: true, createdAt: true },
  });
  res.json({ corporate: corp, users });
});
app.post("/api/admin/corporates/:id/users", requireRole("ADMIN"), async (req, res) => {
  const corp = await prisma.corporate.findUnique({ where: { id: req.params.id }, select: { id: true } });
  if (!corp) return res.status(404).json({ error: "Korporat tidak ditemukan" });
  const schema = z.object({ name: z.string().min(2), email: z.string().email(), corporateRole: z.enum(["ADMIN", "APPROVER", "MAKER"]) });
  const p = schema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Data pengguna tidak valid" });
  try {
    const { user, tempPass } = await createCorporateSubUser(corp.id, p.data.name, p.data.email, p.data.corporateRole);
    audit(req, "corporate.user.add", "User", user.id);
    res.json({ ok: true, credentials: { email: user.email, password: tempPass } });
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});
app.put("/api/admin/corporates/:id/users/:uid", requireRole("ADMIN"), async (req, res) => {
  const role = String(req.body?.corporateRole || "");
  if (!["ADMIN", "APPROVER", "MAKER"].includes(role)) return res.status(400).json({ error: "Peran tidak valid" });
  const target = await prisma.user.findFirst({ where: { id: req.params.uid, corporateId: req.params.id } });
  if (!target) return res.status(404).json({ error: "Pengguna tidak ditemukan" });
  if (target.corporateRole === "ADMIN" && role !== "ADMIN") {
    const admins = await prisma.user.count({ where: { corporateId: req.params.id, corporateRole: "ADMIN" } });
    if (admins <= 1) return res.status(400).json({ error: "Minimal harus ada 1 Admin korporat" });
  }
  await prisma.user.update({ where: { id: target.id }, data: { corporateRole: role } });
  res.json({ ok: true });
});
app.delete("/api/admin/corporates/:id/users/:uid", requireRole("ADMIN"), async (req, res) => {
  const target = await prisma.user.findFirst({ where: { id: req.params.uid, corporateId: req.params.id } });
  if (!target) return res.status(404).json({ error: "Pengguna tidak ditemukan" });
  if (target.corporateRole === "ADMIN") {
    const admins = await prisma.user.count({ where: { corporateId: req.params.id, corporateRole: "ADMIN" } });
    if (admins <= 1) return res.status(400).json({ error: "Minimal harus ada 1 Admin korporat" });
  }
  await prisma.user.delete({ where: { id: target.id } });
  res.json({ ok: true });
});

/**
 * The negotiated B2B discount (%) for a corporate account: its own rate when
 * set, otherwise the global default. B2C never gets this — it is only ever
 * applied inside the role-guarded /api/corporate/* tree, which is also NOT
 * Redis-cached, so a B2B price can never end up in a public cache entry.
 */
async function corporateDiscountPct(corp: { discountPct?: number | null } | null): Promise<number> {
  const own = Number(corp?.discountPct ?? 0);
  if (own > 0) return Math.min(own, 90);
  const fallback = Number((await getSettings()).corporate_discount_pct ?? 0);
  return Math.min(Math.max(fallback, 0), 90);
}
/** Apply a B2B discount to a public rate (rounded to whole rupiah). */
const b2bPrice = (publicPrice: number, pct: number) =>
  Math.max(0, Math.round(publicPrice * (100 - pct) / 100));

app.get("/api/corporate/rooms", requireRole("CORPORATE"), async (req: AuthRequest, res) => {
  const c = await corporateOf(req);
  const pct = await corporateDiscountPct(c as any);
  const hotels = await prisma.hotel.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, city: true, rooms: { orderBy: { price: "asc" }, select: { id: true, name: true, price: true } } },
  });
  // `price` stays the B2B (payable) rate so existing clients keep working;
  // `publicPrice` is the B2C rate we show struck through as the saving.
  const out = hotels.map((h) => ({
    ...h,
    rooms: h.rooms.map((r) => ({
      ...r,
      price: b2bPrice(r.price, pct),
      publicPrice: r.price,
    })),
  }));
  res.json({ hotels: out, discountPct: pct });
});

app.post("/api/corporate/bookings", requireRole("CORPORATE"), async (req: AuthRequest, res) => {
  const c = await corporateOf(req);
  if (!c) return res.status(404).json({ error: "Akun korporat tidak ditemukan" });
  const schema = z.object({
    roomId: z.string().min(1), checkIn: z.string().min(1), checkOut: z.string().min(1),
    travelerName: z.string().min(1), guests: z.coerce.number().int().min(1).default(1), rooms: z.coerce.number().int().min(1).default(1),
    note: z.string().optional(),
  });
  const p = schema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Data pemesanan tidak valid" });
  const room = await prisma.room.findUnique({ where: { id: p.data.roomId }, include: { hotel: true } });
  if (!room) return res.status(404).json({ error: "Kamar tidak ditemukan" });
  const checkIn = new Date(p.data.checkIn), checkOut = new Date(p.data.checkOut);
  const nights = Math.max(1, Math.round((checkOut.getTime() - checkIn.getTime()) / 86400000));
  // Charge the negotiated B2B rate — must match what the portal displayed,
  // otherwise the account sees a cheap price and gets billed the retail one.
  const pct = await corporateDiscountPct(c as any);
  const nightly = b2bPrice(room.price, pct);
  const roomPrice = nightly * nights * p.data.rooms;
  const taxFee = Math.round(roomPrice * (await getNum("taxPct")) / 100); // same configurable tax as retail
  // Maker–approver: create as a PENDING approval REQUEST — not charged, not
  // confirmed, allotment NOT yet consumed. An Approver must approve first.
  const maker = await prisma.user.findUnique({ where: { id: req.userId! }, select: { name: true } });
  const booking = await prisma.booking.create({
    data: {
      code: makeCode(), userId: req.userId!, hotelId: room.hotelId, roomId: room.id,
      corporateId: c.id, channelId: room.hotel.channelId,
      checkIn, checkOut, nights, guests: p.data.guests, rooms: p.data.rooms,
      bookerName: p.data.travelerName, bookerEmail: c.email ?? "", bookerPhone: c.phone ?? "",
      forSelf: false, specialRequest: p.data.note ?? null,
      roomPrice, taxFee, discount: 0, totalPrice: roomPrice + taxFee,
      status: "PENDING", paymentMethod: "CORPORATE",
      approvalStatus: "PENDING", requestedById: req.userId!,
    },
  });
  // Notify every approver (APPROVER + ADMIN) except the maker.
  const approvers = await prisma.user.findMany({
    where: { corporateId: c.id, corporateRole: { in: ["APPROVER", "ADMIN"] }, id: { not: req.userId! } },
    select: { id: true, email: true },
  });
  for (const a of approvers) {
    await dispatch(prisma, {
      userId: a.id, title: "Persetujuan Pesanan Dinas",
      body: `${maker?.name ?? "Maker"} mengajukan pesanan ${room.hotel.name} (${rupiah(roomPrice + taxFee)}) a.n. ${p.data.travelerName}. Tinjau & setujui di Portal Bisnis.`,
      type: "pending", email: a.email ?? undefined, orderCode: booking.code, hotelName: room.hotel.name,
    });
  }
  res.json({ booking, needsApproval: true, noApprover: approvers.length === 0 });
});

// Corporate helper: the caller's role within their corporate account.
async function corporateMe(req: AuthRequest) {
  const u = await prisma.user.findUnique({
    where: { id: req.userId }, select: { id: true, name: true, email: true, phone: true, corporateRole: true, corporate: true },
  });
  if (!u?.corporate) return null;
  return { corp: u.corporate, userId: u.id, name: u.name, email: u.email, phone: u.phone, role: u.corporateRole || "MAKER" };
}
const isCorpApprover = (role?: string | null) => role === "APPROVER" || role === "ADMIN";

// Pending approval requests for the corporate account.
app.get("/api/corporate/approvals", requireRole("CORPORATE"), async (req: AuthRequest, res) => {
  const me = await corporateMe(req);
  if (!me) return res.status(404).json({ error: "Akun korporat tidak ditemukan" });
  const rows = await prisma.booking.findMany({
    where: { corporateId: me.corp.id, approvalStatus: "PENDING" }, orderBy: { createdAt: "desc" }, take: 100,
    include: { hotel: { select: { name: true, city: true } }, room: { select: { name: true } } },
  });
  const makerIds = [...new Set(rows.map((b) => b.requestedById).filter(Boolean) as string[])];
  const makers = await prisma.user.findMany({ where: { id: { in: makerIds } }, select: { id: true, name: true } });
  const nameOf = Object.fromEntries(makers.map((m) => [m.id, m.name]));
  res.json({
    approvals: rows.map((b) => ({ ...b, makerName: b.requestedById ? nameOf[b.requestedById] : null })),
    canApprove: isCorpApprover(me.role), myRole: me.role,
  });
});

app.post("/api/corporate/bookings/:id/approve", requireRole("CORPORATE"), async (req: AuthRequest, res) => {
  const me = await corporateMe(req);
  if (!me) return res.status(404).json({ error: "Akun korporat tidak ditemukan" });
  if (!isCorpApprover(me.role)) return res.status(403).json({ error: "Hanya Approver yang dapat menyetujui" });
  const b = await prisma.booking.findFirst({ where: { id: req.params.id, corporateId: me.corp.id }, include: { hotel: true, room: true } });
  if (!b) return res.status(404).json({ error: "Pesanan tidak ditemukan" });
  if (b.approvalStatus !== "PENDING") return res.status(400).json({ error: "Pesanan sudah diproses" });
  if (b.requestedById === me.userId) return res.status(403).json({ error: "Anda tidak boleh menyetujui pesanan yang Anda ajukan sendiri" });
  // Credit-limit guard (soft): outstanding + this booking must fit the limit.
  const limit = Number(me.corp.creditLimit);
  if (limit > 0) {
    const outAgg = await prisma.booking.aggregate({ where: { corporateId: me.corp.id, status: "PAID", corporateInvoiceId: null }, _sum: { totalPrice: true } });
    if (Number(outAgg._sum.totalPrice ?? 0) + Number(b.totalPrice) > limit) {
      return res.status(400).json({ error: "Melebihi limit kredit korporat. Lunasi tagihan berjalan dulu." });
    }
  }
  await prisma.booking.update({
    where: { id: b.id },
    data: { status: "PAID", paidAt: new Date(), approvalStatus: "APPROVED", approvedById: me.userId, approvedAt: new Date() },
  });
  if (b.roomId) await consume(prisma, b.roomId, b.checkIn, b.checkOut, b.rooms).catch(() => {});
  if (b.requestedById) {
    await dispatch(prisma, {
      userId: b.requestedById, title: `Pesanan disetujui · ${b.hotel.name}`,
      body: `Pesanan ${b.code} a.n. ${b.bookerName} disetujui ${me.name}. E-voucher: ${PUBLIC_ORIGIN}/api/vouchers/${b.code}`,
      type: "success", orderCode: b.code, hotelName: b.hotel.name,
    });
  }
  res.json({ ok: true });
});

app.post("/api/corporate/bookings/:id/reject", requireRole("CORPORATE"), async (req: AuthRequest, res) => {
  const me = await corporateMe(req);
  if (!me) return res.status(404).json({ error: "Akun korporat tidak ditemukan" });
  if (!isCorpApprover(me.role)) return res.status(403).json({ error: "Hanya Approver yang dapat menolak" });
  const b = await prisma.booking.findFirst({ where: { id: req.params.id, corporateId: me.corp.id }, include: { hotel: true } });
  if (!b) return res.status(404).json({ error: "Pesanan tidak ditemukan" });
  if (b.approvalStatus !== "PENDING") return res.status(400).json({ error: "Pesanan sudah diproses" });
  if (b.requestedById === me.userId) return res.status(403).json({ error: "Anda tidak boleh memproses pesanan Anda sendiri" });
  const reason = String(req.body?.reason || "").slice(0, 300);
  await prisma.booking.update({
    where: { id: b.id },
    data: { status: "CANCELLED", approvalStatus: "REJECTED", approvedById: me.userId, approvedAt: new Date(), rejectReason: reason || null },
  });
  if (b.requestedById) {
    await dispatch(prisma, {
      userId: b.requestedById, title: `Pesanan ditolak · ${b.hotel.name}`,
      body: `Pesanan ${b.code} a.n. ${b.bookerName} ditolak ${me.name}.${reason ? ` Alasan: ${reason}` : ""}`,
      type: "cancel", orderCode: b.code, hotelName: b.hotel.name,
    });
  }
  res.json({ ok: true });
});

// ── Corporate sub-users (Maker/Approver) — self-service by the corporate ADMIN ──
async function createCorporateSubUser(corporateId: string, name: string, email: string, role: string) {
  const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (existing) throw new Error("Email sudah terpakai akun lain");
  const tempPass = "MRM" + Math.random().toString(36).slice(2, 8);
  const user = await prisma.user.create({
    data: { name, email: email.toLowerCase(), passwordHash: await bcrypt.hash(tempPass, 10), role: "CORPORATE", corporateId, corporateRole: role },
  });
  await dispatch(prisma, {
    userId: user.id, title: "Akun Bisnis Miruum", email: user.email,
    body: `Anda ditambahkan sebagai ${role} di Portal Bisnis Miruum. Login: ${user.email}, sandi sementara: ${tempPass}. Segera ganti sandi.`, type: "info",
  });
  return { user, tempPass };
}

app.get("/api/corporate/users", requireRole("CORPORATE"), async (req: AuthRequest, res) => {
  const me = await corporateMe(req);
  if (!me) return res.status(404).json({ error: "Akun korporat tidak ditemukan" });
  const users = await prisma.user.findMany({
    where: { corporateId: me.corp.id }, orderBy: { createdAt: "asc" },
    select: { id: true, name: true, email: true, corporateRole: true, createdAt: true },
  });
  res.json({ users, me: { id: me.userId, role: me.role }, canManage: me.role === "ADMIN" });
});

app.post("/api/corporate/users", requireRole("CORPORATE"), async (req: AuthRequest, res) => {
  const me = await corporateMe(req);
  if (!me) return res.status(404).json({ error: "Akun korporat tidak ditemukan" });
  if (me.role !== "ADMIN") return res.status(403).json({ error: "Hanya Admin korporat yang dapat menambah pengguna" });
  const schema = z.object({ name: z.string().min(2), email: z.string().email(), corporateRole: z.enum(["ADMIN", "APPROVER", "MAKER"]) });
  const p = schema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Data pengguna tidak valid" });
  try {
    const { user } = await createCorporateSubUser(me.corp.id, p.data.name, p.data.email, p.data.corporateRole);
    res.json({ ok: true, user: { id: user.id, email: user.email } });
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

app.put("/api/corporate/users/:id", requireRole("CORPORATE"), async (req: AuthRequest, res) => {
  const me = await corporateMe(req);
  if (!me || me.role !== "ADMIN") return res.status(403).json({ error: "Hanya Admin korporat" });
  const role = String(req.body?.corporateRole || "");
  if (!["ADMIN", "APPROVER", "MAKER"].includes(role)) return res.status(400).json({ error: "Peran tidak valid" });
  const target = await prisma.user.findFirst({ where: { id: req.params.id, corporateId: me.corp.id } });
  if (!target) return res.status(404).json({ error: "Pengguna tidak ditemukan" });
  // Don't allow removing the last ADMIN.
  if (target.corporateRole === "ADMIN" && role !== "ADMIN") {
    const admins = await prisma.user.count({ where: { corporateId: me.corp.id, corporateRole: "ADMIN" } });
    if (admins <= 1) return res.status(400).json({ error: "Minimal harus ada 1 Admin korporat" });
  }
  await prisma.user.update({ where: { id: target.id }, data: { corporateRole: role } });
  res.json({ ok: true });
});

app.delete("/api/corporate/users/:id", requireRole("CORPORATE"), async (req: AuthRequest, res) => {
  const me = await corporateMe(req);
  if (!me || me.role !== "ADMIN") return res.status(403).json({ error: "Hanya Admin korporat" });
  if (req.params.id === me.userId) return res.status(400).json({ error: "Tidak dapat menghapus diri sendiri" });
  const target = await prisma.user.findFirst({ where: { id: req.params.id, corporateId: me.corp.id } });
  if (!target) return res.status(404).json({ error: "Pengguna tidak ditemukan" });
  if (target.corporateRole === "ADMIN") {
    const admins = await prisma.user.count({ where: { corporateId: me.corp.id, corporateRole: "ADMIN" } });
    if (admins <= 1) return res.status(400).json({ error: "Minimal harus ada 1 Admin korporat" });
  }
  await prisma.user.delete({ where: { id: target.id } });
  res.json({ ok: true });
});

app.get("/api/corporate/bookings", requireRole("CORPORATE"), async (req: AuthRequest, res) => {
  const c = await corporateOf(req);
  if (!c) return res.status(404).json({ error: "Akun korporat tidak ditemukan" });
  const bookings = await prisma.booking.findMany({
    where: { corporateId: c.id }, orderBy: { createdAt: "desc" }, take: 200,
    include: { hotel: { select: { name: true, city: true } }, room: { select: { name: true } } },
  });
  res.json({ bookings });
});

// ── Corporate billing (Miruum → tagihan ke corporate) ──
app.get("/api/corporate/invoices", requireRole("CORPORATE"), async (req: AuthRequest, res) => {
  const c = await corporateOf(req);
  if (!c) return res.status(404).json({ error: "Akun korporat tidak ditemukan" });
  const invoices = await prisma.corporateInvoice.findMany({ where: { corporateId: c.id }, orderBy: { createdAt: "desc" } });
  res.json({ invoices });
});

// Admin: billing overview + issue/settle bills.
app.get("/api/admin/corporate-billing", requireRole("ADMIN"), async (_req, res) => {
  const corps = await prisma.corporate.findMany({ orderBy: { name: "asc" }, include: { invoices: { orderBy: { createdAt: "desc" } } } });
  const out = [];
  for (const c of corps) {
    const unbilled = await prisma.booking.aggregate({ where: { corporateId: c.id, corporateInvoiceId: null }, _sum: { totalPrice: true }, _count: true });
    const outstanding = await prisma.corporateInvoice.aggregate({ where: { corporateId: c.id, status: "UNPAID" }, _sum: { amount: true } });
    out.push({ id: c.id, name: c.name, type: c.type, email: c.email, invoices: c.invoices, unbilled: unbilled._sum.totalPrice ?? 0, unbilledCount: unbilled._count, outstanding: outstanding._sum.amount ?? 0 });
  }
  res.json({ corporates: out });
});

app.post("/api/admin/corporate-invoices", requireRole("ADMIN"), async (req, res) => {
  const schema = z.object({ corporateId: z.string(), dueDays: z.coerce.number().int().min(1).max(120).default(14), note: z.string().optional() });
  const p = schema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Data tidak valid" });
  const corp = await prisma.corporate.findUnique({ where: { id: p.data.corporateId } });
  if (!corp) return res.status(404).json({ error: "Corporate tidak ditemukan" });
  const bookings = await prisma.booking.findMany({ where: { corporateId: corp.id, corporateInvoiceId: null }, select: { id: true, totalPrice: true } });
  if (!bookings.length) return res.status(400).json({ error: "Tidak ada pemesanan yang belum ditagih" });
  const amount = bookings.reduce((s, b) => s + Number(b.totalPrice), 0);
  const number = "TAG-" + makeCode();
  const dueDate = new Date(Date.now() + p.data.dueDays * 86400000);
  const inv = await prisma.corporateInvoice.create({ data: { corporateId: corp.id, number, amount, bookingsCount: bookings.length, dueDate, note: p.data.note } });
  await prisma.booking.updateMany({ where: { id: { in: bookings.map((b) => b.id) } }, data: { corporateInvoiceId: inv.id } });
  const users = await prisma.user.findMany({ where: { corporateId: corp.id }, select: { id: true, email: true } });
  for (const u of users) await dispatch(prisma, { userId: u.id, title: "Tagihan Baru dari Miruum", body: `Tagihan ${number} sebesar ${rupiah(amount)} (${bookings.length} pesanan), jatuh tempo ${dueDate.toLocaleDateString("id-ID")}. Lihat di portal Corporate.`, type: "pending", email: u.email ?? undefined });
  res.json({ invoice: inv });
});

app.post("/api/admin/corporate-invoices/:id/paid", requireRole("ADMIN"), async (req, res) => {
  const inv = await prisma.corporateInvoice.findUnique({ where: { id: req.params.id }, include: { corporate: { select: { users: { select: { id: true } } } } } });
  if (!inv) return res.status(404).json({ error: "Tagihan tidak ditemukan" });
  await prisma.corporateInvoice.update({ where: { id: inv.id }, data: { status: "PAID", paidAt: new Date() } });
  for (const u of inv.corporate.users) await dispatch(prisma, { userId: u.id, title: "Pembayaran Diterima", body: `Pembayaran tagihan ${inv.number} (${rupiah(Number(inv.amount))}) telah diterima. Terima kasih.`, type: "success" });
  res.json({ ok: true });
});

app.post("/api/admin/corporate-invoices/:id/cancel", requireRole("ADMIN"), async (req, res) => {
  await prisma.booking.updateMany({ where: { corporateInvoiceId: req.params.id }, data: { corporateInvoiceId: null } });
  await prisma.corporateInvoice.update({ where: { id: req.params.id }, data: { status: "CANCELLED" } });
  res.json({ ok: true });
});

// Public printable billing statement (tagihan) — by invoice id.
app.get("/api/corporate-invoices/:id", async (req, res) => {
  const inv = await prisma.corporateInvoice.findUnique({
    where: { id: req.params.id },
    include: { corporate: true, bookings: { include: { hotel: { select: { name: true, city: true } }, room: { select: { name: true } } } } },
  });
  if (!inv) return res.status(404).send("<h1>Tagihan tidak ditemukan</h1>");
  const paid = inv.status === "PAID";
  const rows = inv.bookings.map((b) => `<tr><td>${b.code} · ${b.hotel.name} <span class="muted">(${b.room.name})</span><br><span class="muted">${b.bookerName} · ${b.nights} malam</span></td><td class="r">${rupiah(Number(b.totalPrice))}</td></tr>`).join("");
  res.set("Content-Type", "text/html; charset=utf-8").send(`<!doctype html><html lang="id"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Tagihan ${inv.number} — Miruum</title><style>${DOC_CSS}</style></head><body>
<div class="doc"><div class="hd">
  <div class="logo-plate"><img src="${PUBLIC_ORIGIN}/static/logo.png" alt="Miruum"></div>
  <div class="kind" style="margin-top:14px">Tagihan / Invoice Korporat</div>
  <h1>${inv.number}</h1>
  <div class="sub">Terbit ${fmtShort(inv.createdAt)}${inv.dueDate ? ` · Jatuh tempo ${fmtShort(inv.dueDate)}` : ""}</div>
  <span class="badge ${paid ? "ok" : "wait"}">${paid ? "LUNAS" : inv.status === "CANCELLED" ? "DIBATALKAN" : "BELUM DIBAYAR"}</span>
</div>
<div class="bd">
  <div class="sec" style="margin-top:0">Ditagihkan kepada</div>
  <div style="font-weight:700">${inv.corporate.name}</div>
  <div class="muted" style="color:#8a8f98;font-size:12px">${inv.corporate.address ?? ""}${inv.corporate.taxId ? `<br>NPWP: ${inv.corporate.taxId}` : ""}</div>
  <div class="sec">Rincian Pemesanan (${inv.bookingsCount})</div>
  <table class="items">${rows}</table>
  <div class="tot"><span>Total Tagihan</span><span>${rupiah(Number(inv.amount))}</span></div>
  ${inv.note ? `<div class="muted" style="font-size:12px;margin-top:10px">${inv.note}</div>` : ""}
  <div class="foot">Mohon lakukan pembayaran sebelum jatuh tempo. Diterbitkan elektronik oleh Miruum, sah tanpa tanda tangan.<br>miruum.id · support@miruum.id</div>
</div></div>
<div class="actions"><button class="pbtn" onclick="window.print()">Cetak / Simpan PDF</button></div>
</body></html>`);
});

// ─────────── Corporate entity types & required legality documents ───────────
// Detailed classification (below the coarse CORPORATE/GOVERNMENT billing type)
// and the checklist of legality documents each type must upload. Kept in sync
// with the Flutter app (screens/corporate.dart) and Back Office review view.
const CORP_ENTITY_TYPES = ["SWASTA", "BUMN", "BUMD", "PEMERINTAH"] as const;
const CORP_ENTITY_LABELS: Record<string, string> = {
  SWASTA: "Perusahaan Swasta", BUMN: "BUMN", BUMD: "BUMD", PEMERINTAH: "Pemerintahan",
};
const CORP_DOC_CATALOG: Record<string, { key: string; label: string; required: boolean }[]> = {
  SWASTA: [
    { key: "akta", label: "Akta Pendirian & Perubahan Terakhir", required: true },
    { key: "sk_kemenkumham", label: "SK Pengesahan Kemenkumham", required: true },
    { key: "npwp", label: "NPWP Perusahaan", required: true },
    { key: "nib", label: "NIB / Izin Usaha (OSS)", required: true },
    { key: "ktp_pic", label: "KTP Penanggung Jawab (PIC)", required: true },
    { key: "surat_kuasa", label: "Surat Kuasa / Penunjukan PIC", required: false },
  ],
  BUMN: [
    { key: "dasar_hukum", label: "Dasar Hukum Pendirian (PP / UU / Akta Persero)", required: true },
    { key: "npwp", label: "NPWP Perusahaan", required: true },
    { key: "nib", label: "NIB / Izin Usaha (OSS)", required: true },
    { key: "surat_penunjukan", label: "Surat Penunjukan PIC", required: true },
    { key: "ktp_pic", label: "KTP Penanggung Jawab (PIC)", required: true },
  ],
  BUMD: [
    { key: "perda", label: "Perda / Perkada Pendirian", required: true },
    { key: "npwp", label: "NPWP Perusahaan", required: true },
    { key: "nib", label: "NIB / Izin Usaha (OSS)", required: true },
    { key: "surat_penunjukan", label: "Surat Penunjukan PIC", required: true },
    { key: "ktp_pic", label: "KTP Penanggung Jawab (PIC)", required: true },
  ],
  PEMERINTAH: [
    { key: "sk_instansi", label: "SK / Surat Tugas", required: true },
    { key: "npwp", label: "NPWP Bendahara", required: true },
    { key: "surat_penunjukan", label: "Surat Penunjukan Bendahara / PIC", required: true },
    { key: "ktp_pic", label: "KTP Bendahara / PIC", required: true },
    { key: "dipa", label: "DIPA / Dokumen Anggaran", required: false },
  ],
};
const entityToType = (e: string) => (e === "PEMERINTAH" ? "GOVERNMENT" : "CORPORATE");

// Public: the document checklist so the mobile app can render fields dynamically.
app.get("/api/corporate/doc-requirements", (_req, res) => {
  res.json({ entityTypes: CORP_ENTITY_TYPES, labels: CORP_ENTITY_LABELS, catalog: CORP_DOC_CATALOG });
});

// Public: upload one legality document (PDF/JPG/PNG) for an application.
app.post("/api/corporate/upload-doc", authLimiter, async (req, res) => {
  const schema = z.object({
    dataUrl: z.string().regex(/^data:(image\/(png|jpe?g|webp)|application\/pdf);base64,/, "Format tidak didukung (PDF / JPG / PNG)"),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Data tidak valid" });
  if (!storageReady()) return res.status(503).json({ error: "Penyimpanan belum siap" });
  const m = parsed.data.dataUrl.match(/^data:([a-z/+.-]+);base64,(.*)$/s);
  if (!m) return res.status(400).json({ error: "Data dokumen tidak valid" });
  const [, contentType, b64] = m;
  const buf = Buffer.from(b64, "base64");
  if (buf.length > 8 * 1024 * 1024) return res.status(413).json({ error: "Ukuran file maksimal 8MB" });
  const ext = contentType === "application/pdf" ? "pdf" : contentType.split("/")[1].replace("jpeg", "jpg");
  const key = `legality/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  try {
    const url = await putObject(key, buf, contentType);
    res.json({ url });
  } catch (e: any) {
    res.status(500).json({ error: "Gagal mengunggah dokumen" });
  }
});

// Public: apply for a corporate/government account (pengajuan layanan).
app.post("/api/corporate/apply", authLimiter, async (req, res) => {
  const docSchema = z.object({ key: z.string(), label: z.string().optional(), url: z.string().url() });
  const schema = z.object({
    entityType: z.enum(CORP_ENTITY_TYPES).optional(),
    type: z.enum(["CORPORATE", "GOVERNMENT"]).optional(), // legacy web form (no entityType)
    companyName: z.string().min(2), picName: z.string().min(2), picPosition: z.string().optional(),
    email: z.string().email(), phone: z.string().min(5), address: z.string().optional(),
    taxId: z.string().optional(), regionId: z.string().optional(), employees: z.coerce.number().int().min(0).default(0), note: z.string().optional(),
    documents: z.array(docSchema).optional().default([]),
  });
  const p = schema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Lengkapi data pengajuan dengan benar" });
  const entityType = p.data.entityType ?? (p.data.type === "GOVERNMENT" ? "PEMERINTAH" : "SWASTA");
  const type = entityToType(entityType);
  // When the app sends an entityType, enforce that all required documents are present.
  if (p.data.entityType) {
    const need = CORP_DOC_CATALOG[entityType].filter((d) => d.required).map((d) => d.key);
    const have = new Set((p.data.documents ?? []).map((d) => d.key));
    const missing = need.filter((k) => !have.has(k));
    if (missing.length) return res.status(400).json({ error: "Dokumen wajib belum lengkap" });
  }
  const created = await prisma.corporateApplication.create({
    data: {
      type, entityType,
      companyName: p.data.companyName, picName: p.data.picName, picPosition: p.data.picPosition,
      email: p.data.email, phone: p.data.phone, address: p.data.address, taxId: p.data.taxId,
      regionId: p.data.regionId, employees: p.data.employees, note: p.data.note,
      documents: (p.data.documents ?? []) as any,
    },
  });
  // Notify Miruum admins.
  const admins = await prisma.user.findMany({ where: { role: "ADMIN" }, select: { id: true } });
  for (const a of admins) {
    await dispatch(prisma, { userId: a.id, title: "Pengajuan Akun Korporat Baru", body: `${created.companyName} (${CORP_ENTITY_LABELS[entityType] ?? entityType}) mengajukan layanan. PIC: ${created.picName}. ${(p.data.documents ?? []).length} dokumen legalitas dilampirkan. Tinjau di Back Office.`, type: "info" });
  }
  res.json({ ok: true, application: { id: created.id } });
});

// Admin: review corporate applications.
app.get("/api/admin/corporate-applications", requireRole("ADMIN"), async (_req, res) => {
  const applications = await prisma.corporateApplication.findMany({ orderBy: [{ status: "asc" }, { createdAt: "desc" }] });
  res.json({ applications });
});

app.post("/api/admin/corporate-applications/:id/approve", requireRole("ADMIN"), async (req, res) => {
  const app = await prisma.corporateApplication.findUnique({ where: { id: req.params.id } });
  if (!app) return res.status(404).json({ error: "Pengajuan tidak ditemukan" });
  if (app.status === "APPROVED") return res.status(400).json({ error: "Sudah disetujui" });
  const existingUser = await prisma.user.findUnique({ where: { email: app.email } });
  if (existingUser) return res.status(409).json({ error: "Email sudah terpakai akun lain" });
  const corp = await prisma.corporate.create({
    data: { type: app.type, entityType: (app as any).entityType, name: app.companyName, email: app.email, phone: app.phone, address: app.address, taxId: app.taxId, regionId: app.regionId, picName: app.picName, picPosition: app.picPosition },
  });
  const tempPass = "MRM" + Math.random().toString(36).slice(2, 8);
  await prisma.user.create({
    data: { name: app.picName, email: app.email, passwordHash: await bcrypt.hash(tempPass, 10), role: "CORPORATE", corporateId: corp.id, phone: app.phone, corporateRole: "ADMIN" },
  });
  await prisma.corporateApplication.update({ where: { id: app.id }, data: { status: "APPROVED" } });
  await dispatch(prisma, { title: "Akun Korporat Disetujui", body: `Akun korporat ${app.companyName} aktif. Login di corporate.miruum.id — email: ${app.email}, sandi: ${tempPass}`, type: "success", email: app.email });
  res.json({ ok: true, credentials: { email: app.email, password: tempPass } });
});

app.post("/api/admin/corporate-applications/:id/reject", requireRole("ADMIN"), async (req, res) => {
  await prisma.corporateApplication.update({ where: { id: req.params.id }, data: { status: "REJECTED" } });
  res.json({ ok: true });
});

// ─────────── Region master data (Provinsi → Kab/Kota → Kecamatan → Desa) ───────────
// Public: list regions for cascading pickers. Use ?level=PROVINCE for top level,
// or ?parentId=<id> for children of a region.
app.get("/api/regions", async (req, res) => {
  const where: any = {};
  if (req.query.parentId) where.parentId = String(req.query.parentId);
  else if (req.query.level) where.level = String(req.query.level).toUpperCase();
  else where.level = "PROVINCE";
  const regions = await prisma.region.findMany({ where, orderBy: { name: "asc" }, select: { id: true, name: true, level: true } });
  res.json({ regions });
});

// Ancestor path of a leaf region (for pre-filling edit forms).
app.get("/api/regions/:id/path", async (req, res) => {
  const path: { id: string; name: string; level: string }[] = [];
  let cur = await prisma.region.findUnique({ where: { id: req.params.id }, select: { id: true, name: true, level: true, parentId: true } });
  let guard = 0;
  while (cur && guard++ < 8) {
    path.unshift({ id: cur.id, name: cur.name, level: cur.level });
    cur = cur.parentId ? await prisma.region.findUnique({ where: { id: cur.parentId }, select: { id: true, name: true, level: true, parentId: true } }) : null;
  }
  res.json({ path });
});

// Admin: master-data management (supports pemekaran — add new regions).
app.get("/api/admin/regions", requireRole("ADMIN"), async (req, res) => {
  const where: any = {};
  if (req.query.parentId) where.parentId = String(req.query.parentId);
  else if (req.query.level) where.level = String(req.query.level).toUpperCase();
  else where.level = "PROVINCE";
  if (req.query.q) where.name = { contains: String(req.query.q), mode: "insensitive" };
  const regions = await prisma.region.findMany({
    where, orderBy: { name: "asc" }, take: 1000,
    select: { id: true, name: true, level: true, parentId: true, code: true, _count: { select: { children: true } } },
  });
  res.json({ regions });
});
app.post("/api/admin/regions", requireRole("ADMIN"), async (req, res) => {
  const schema = z.object({ name: z.string().min(1), level: z.enum(["PROVINCE", "CITY", "DISTRICT", "VILLAGE"]), parentId: z.string().optional(), code: z.string().optional() });
  const p = schema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Data wilayah tidak valid" });
  const region = await prisma.region.create({ data: { name: p.data.name.trim(), level: p.data.level, parentId: p.data.parentId || null, code: p.data.code || null } });
  res.json({ region });
});
app.delete("/api/admin/regions/:id", requireRole("ADMIN"), async (req, res) => {
  await prisma.region.delete({ where: { id: req.params.id } }); // cascades children
  res.json({ ok: true });
});

// ── Saved guests (for "booking for someone else", Traveloka-style) ──
app.get("/api/saved-guests", requireAuth, async (req: AuthRequest, res) => {
  const guests = await prisma.savedGuest.findMany({ where: { userId: req.userId }, orderBy: { createdAt: "desc" } });
  res.json({ guests });
});
app.post("/api/saved-guests", requireAuth, async (req: AuthRequest, res) => {
  const schema = z.object({ name: z.string().min(1), email: z.string().optional(), phone: z.string().optional() });
  const p = schema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Nama tamu wajib diisi" });
  // De-dupe by name for this user.
  const existing = await prisma.savedGuest.findFirst({ where: { userId: req.userId!, name: p.data.name.trim() } });
  const guest = existing
    ? await prisma.savedGuest.update({ where: { id: existing.id }, data: { email: p.data.email || null, phone: p.data.phone || null } })
    : await prisma.savedGuest.create({ data: { userId: req.userId!, name: p.data.name.trim(), email: p.data.email || null, phone: p.data.phone || null } });
  res.json({ guest });
});
app.delete("/api/saved-guests/:id", requireAuth, async (req: AuthRequest, res) => {
  await prisma.savedGuest.deleteMany({ where: { id: req.params.id, userId: req.userId } });
  res.json({ ok: true });
});

// Public e-voucher (printable HTML + QR check-in pass), by booking code.
app.get("/api/vouchers/:code", async (req, res) => {
  const b = await prisma.booking.findUnique({ where: { code: req.params.code }, include: { hotel: true, room: true } });
  if (!b) return res.status(404).send("<h1>Voucher tidak ditemukan</h1>");
  const paid = b.status === "PAID" || b.status === "COMPLETED" || b.payAtHotel;
  const qr = await qrSvg(b.code);
  const bf = b.room.breakfast ? "Yes <span class='tl'>Ya</span>" : "No <span class='tl'>Tidak</span>";
  const inc = [b.room.freeWifi ? "📶 Free Wifi <span class='tl'>Wifi Gratis</span>" : "", b.room.breakfast ? "🍳 Breakfast <span class='tl'>Sarapan</span>" : ""].filter(Boolean).join("<br>") || "-";
  res.set("Content-Type", "text/html; charset=utf-8").send(`<!doctype html><html lang="id"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Voucher Hotel ${b.code} — Miruum</title><style>${VCSS}</style></head><body>
<div class="vdoc">
  <div class="vhd">${vLogo()}<div class="rt"><h1>HOTEL VOUCHER</h1><div class="tl">Voucher Hotel</div></div></div>
  <div class="hotrow">
    <div><div class="hn">${esc(b.hotel.name)}</div><div class="stars">${"★".repeat(b.hotel.starRating)}</div>
      <div class="addr">${esc(b.hotel.address)}<br>${esc(b.hotel.city)}, Indonesia</div></div>
    <div class="bkid"><div class="l">Booking ID</div><div class="c">${b.code}</div></div>
  </div>
  <div class="obar"></div>
  <div class="stayrow">
    <div class="stay"><div class="cap">Check-in <span class="tl">Check-in</span></div><div class="d">${fmtDate(b.checkIn)}</div>${b.hotel.checkInInfo ? `<div class="t">⏰ ${esc(b.hotel.checkInInfo)}</div>` : ""}</div>
    <div class="stay"><div class="cap">Check-out <span class="tl">Check-out</span></div><div class="d">${fmtDate(b.checkOut)}</div></div>
    <div class="statebox"><b>${paid ? "Confirmed" : "New Booking"}</b><br><span>Booked and Payable by Miruum</span></div>
  </div>
  <div class="vsec">Booking Details <span class="tl">Detail Pesanan</span></div>
  <table class="vtbl"><tr>
    <th>No. <span class="tl">No.</span></th><th>Room Name <span class="tl">Nama Kamar</span></th>
    <th>Guest(s) <span class="tl">Tamu</span></th><th>Guest(s) per room <span class="tl">Tamu/kamar</span></th>
    <th>Breakfast? <span class="tl">Sarapan</span></th></tr>
    <tr><td>1</td><td>${esc(b.room.name)}</td><td>${esc(b.bookerName)}</td><td>${b.guests} Adult(s) <span class="tl">${b.guests} Dewasa</span></td><td>${bf}</td></tr>
  </table>
  <div class="grid3">
    <div class="gcol"><div class="h">Includes <span class="tl">Termasuk</span></div><div class="gbox">${inc}</div></div>
    <div class="gcol"><div class="h">Special request <span class="tl">Permintaan khusus</span></div><div class="gbox">${b.specialRequest ? esc(b.specialRequest) : "-"}</div></div>
    <div class="gcol"><div class="h">Package <span class="tl">Paket</span></div><div class="gbox">${b.packageTitle ? esc(b.packageTitle) : "-"}</div></div>
  </div>
  <div class="vsec">Hotel Cancellation Policy <span class="tl">Kebijakan Pembatalan Hotel</span></div>
  ${cxlBullets(b.hotel.cancellationPolicy)}
  <div class="vfoot">${V_BADGES}${V_CS}</div>
  ${V_WAVE}
</div>
<div class="vact"><button class="vbtn" onclick="window.print()">Cetak / Simpan PDF</button></div>
</body></html>`);
});

// One-click e-voucher PDF (server-generated, no browser needed), by booking code.
app.get("/api/vouchers/:code/pdf", async (req, res) => {
  const b = await prisma.booking.findUnique({ where: { code: req.params.code }, include: { hotel: true, room: true } });
  if (!b) return res.status(404).send("Voucher tidak ditemukan");
  const paid = b.status === "PAID" || b.status === "COMPLETED" || b.payAtHotel;
  const qrPng = await QRCode.toBuffer(b.code, { width: 360, margin: 1 });
  const O = { orange: "#F5931E", navy: "#20344A", ink: "#25303B", muted: "#78828F", line: "#E8E5DE" };
  const doc = new PDFDocument({ size: "A4", margin: 0 });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="E-Voucher-${b.code}.pdf"`);
  doc.pipe(res);
  const W = doc.page.width, M = 48;
  // Header band
  doc.rect(0, 0, W, 130).fill(O.orange);
  doc.fillColor("#fff").font("Helvetica-Bold").fontSize(11).text("E-VOUCHER HOTEL", M, 34, { characterSpacing: 2 });
  doc.fontSize(24).text(b.hotel.name, M, 52, { width: W - 2 * M });
  doc.font("Helvetica").fontSize(12).fillColor("#ffffff").text(b.hotel.city, M, 88);
  doc.roundedRect(W - M - 140, 34, 140, 26, 13).fill(paid ? "#2FA84F" : "#B08900");
  doc.fillColor("#fff").font("Helvetica-Bold").fontSize(10).text(paid ? "TERKONFIRMASI" : String(b.status), W - M - 140, 42, { width: 140, align: "center" });
  // QR + code block
  let y = 168;
  doc.image(qrPng, M, y, { width: 132, height: 132 });
  doc.fillColor(O.muted).font("Helvetica-Bold").fontSize(9).text("NO. PESANAN", M + 156, y + 14, { characterSpacing: 1 });
  doc.fillColor(O.navy).font("Helvetica-Bold").fontSize(22).text(b.code, M + 156, y + 30);
  doc.fillColor(O.muted).font("Helvetica").fontSize(10).text("Tunjukkan / pindai kode ini di resepsionis saat check-in.", M + 156, y + 62, { width: W - M - (M + 156) });
  // Details
  y += 168;
  doc.fillColor(O.orange).font("Helvetica-Bold").fontSize(11).text("DETAIL MENGINAP", M, y, { characterSpacing: 1 });
  y += 22;
  const rows: [string, string][] = [
    ["Tamu", `${b.bookerName} · ${b.guests} tamu`],
    ["Kamar", `${b.rooms}× ${b.room?.name ?? "-"}`],
    ["Check-in", fmtDate(b.checkIn)],
    ["Check-out", fmtDate(b.checkOut)],
    ["Durasi", `${b.nights} malam`],
    ["Alamat", b.hotel.address],
  ];
  for (const [k, v] of rows) {
    doc.moveTo(M, y + 22).lineTo(W - M, y + 22).lineWidth(0.5).strokeColor(O.line).stroke();
    doc.fillColor(O.muted).font("Helvetica").fontSize(11).text(k, M, y, { width: 140 });
    doc.fillColor(O.ink).font("Helvetica-Bold").fontSize(11).text(v, M + 150, y, { width: W - 2 * M - 150, align: "right" });
    y += 30;
  }
  if (b.hotel.checkInInfo) {
    y += 10;
    doc.fillColor(O.orange).font("Helvetica-Bold").fontSize(11).text("INFORMASI CHECK-IN", M, y); y += 18;
    doc.fillColor(O.ink).font("Helvetica").fontSize(10).text(b.hotel.checkInInfo, M, y, { width: W - 2 * M }); y += 40;
  }
  doc.fillColor(O.muted).font("Helvetica").fontSize(9)
    .text("E-voucher resmi Miruum — bukti pemesanan menginap. Tunjukkan saat check-in. Butuh bantuan? Live Chat CS di aplikasi Miruum · miruum.id",
      M, doc.page.height - 70, { width: W - 2 * M, align: "center" });
  doc.end();
});

// Guest RECEIPT (printable A4 HTML), by booking code.
app.get("/api/invoices/:code", async (req, res) => {
  const b = await prisma.booking.findUnique({ where: { code: req.params.code }, include: { hotel: true, room: true } });
  if (!b) return res.status(404).send("<h1>Receipt tidak ditemukan</h1>");
  res.set("Content-Type", "text/html; charset=utf-8").send(receiptDocHtml(b));
});
// Cancellation voucher (for BOTH guest & hotel), by booking code.
app.get("/api/cancellations/:code", async (req, res) => {
  const b = await prisma.booking.findUnique({ where: { code: req.params.code }, include: { hotel: true, room: true } });
  if (!b) return res.status(404).send("<h1>Dokumen tidak ditemukan</h1>");
  res.set("Content-Type", "text/html; charset=utf-8").send(bookingDocHtml(b, "CANCELLATION", { cancelled: true }));
});

// Per-booking commission split (hotel-facing figures).
async function bookingSplit(b: { roomPrice: number | bigint; channel?: { type: string; commissionPct: number } | null }) {
  const gross = Number(b.roomPrice);
  const isDirect = !b.channel || b.channel.type === "DIRECT";
  const pct = isDirect ? await getNum("directCommissionPct") : b.channel!.commissionPct;
  const commission = isDirect ? Math.round((gross * pct) / 100) : Math.round((gross * pct) / (100 + pct));
  return { gross, isDirect, pct, commission, hotelNet: gross - commission };
}

// Hotel-facing voucher/receipt — full booking detail INCLUDING price & commission.
// Sent to the property on payment; downloadable from the extranet booking list.
app.get("/api/hotels/receipt/:code", async (req, res) => {
  const b = await prisma.booking.findUnique({
    where: { code: req.params.code },
    include: { hotel: true, room: true, channel: { select: { code: true, name: true, type: true, commissionPct: true } } },
  });
  if (!b) return res.status(404).send("<h1>Dokumen tidak ditemukan</h1>");
  res.set("Content-Type", "text/html; charset=utf-8").send(bookingDocHtml(b, "NEW BOOKING"));
});

// ═══════════════════════════ Tour module ═══════════════════════════
async function requireModule(key: "moduleTour" | "moduleShuttle" | "moduleHotelPackage", res: any): Promise<boolean> {
  const s = await getSettings();
  if (s[key] === "0") { res.status(403).json({ error: "Modul sedang tidak aktif" }); return false; }
  return true;
}

// Public: browse active tours.
app.get("/api/tours", async (req, res) => {
  if (!(await requireModule("moduleTour", res))) return;
  const { city, category, q } = req.query as Record<string, string>;
  const where: any = { active: true };
  if (city) where.city = city;
  if (category) where.category = category;
  if (q) where.OR = [{ title: { contains: q, mode: "insensitive" } }, { city: { contains: q, mode: "insensitive" } }];
  const tours = await prisma.tour.findMany({ where, orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }], take: 100 });
  res.json({ tours });
});

app.get("/api/tours/:id", async (req, res) => {
  if (!(await requireModule("moduleTour", res))) return;
  const tour = await prisma.tour.findFirst({ where: { id: req.params.id, active: true } });
  if (!tour) return res.status(404).json({ error: "Tour tidak ditemukan" });
  res.json({ tour });
});

// Book a tour (auth). Mock-pay in one step to keep the demo flow simple.
app.post("/api/tours/:id/book", requireAuth, async (req: AuthRequest, res) => {
  if (!(await requireModule("moduleTour", res))) return;
  const schema = z.object({
    date: z.string(), pax: z.coerce.number().int().min(1).max(50),
    bookerName: z.string().min(1), bookerPhone: z.string().min(3),
    paymentMethod: z.string().default("QRIS"),
  });
  const p = schema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Data tidak valid" });
  const tour = await prisma.tour.findFirst({ where: { id: req.params.id, active: true } });
  if (!tour) return res.status(404).json({ error: "Tour tidak ditemukan" });
  if (p.data.pax > tour.maxPax) return res.status(400).json({ error: `Maksimal ${tour.maxPax} peserta` });
  const total = tour.price * p.data.pax;
  const booking = await prisma.tourBooking.create({
    data: {
      code: "TR-" + Math.floor(1000000 + Math.random() * 8999999),
      userId: req.userId!, tourId: tour.id, date: new Date(p.data.date), pax: p.data.pax,
      unitPrice: tour.price, totalPrice: total, status: "PAID", paidAt: new Date(),
      bookerName: p.data.bookerName, bookerPhone: p.data.bookerPhone, paymentMethod: p.data.paymentMethod,
    },
    include: { tour: true },
  });
  await dispatch(prisma, { userId: req.userId!, title: `Tour terkonfirmasi — ${tour.title}`, body: `${p.data.pax} peserta · No. ${booking.code}`, type: "success" });
  res.json({ booking });
});

app.get("/api/tour-bookings", requireAuth, async (req: AuthRequest, res) => {
  const bookings = await prisma.tourBooking.findMany({ where: { userId: req.userId }, orderBy: { createdAt: "desc" }, include: { tour: true } });
  res.json({ bookings });
});

// ═══════════════════════════ Shuttle module (Grab-style) ═══════════════════════════
const DRIVERS = [
  { name: "Andi Saputra", plate: "B 2481 KXA", rating: 4.9 },
  { name: "Rizky Pratama", plate: "B 1735 TQD", rating: 4.8 },
  { name: "Dewi Lestari", plate: "B 9042 UVP", rating: 5.0 },
  { name: "Bagus Wijaya", plate: "B 6318 MNC", rating: 4.7 },
  { name: "Siti Rahayu", plate: "B 4507 LZK", rating: 4.9 },
];
function havKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371, toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat), dLng = toRad(bLng - aLng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}
function fareFor(vt: { baseFare: number; perKm: number; minFare: number }, km: number) {
  return Math.max(vt.minFare, Math.round((vt.baseFare + vt.perKm * km) / 500) * 500);
}

app.get("/api/shuttle/vehicle-types", async (_req, res) => {
  if (!(await requireModule("moduleShuttle", res))) return;
  const types = await prisma.shuttleVehicleType.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } });
  res.json({ vehicleTypes: types });
});

// Fare estimate for every vehicle type given origin + destination coords.
app.post("/api/shuttle/estimate", async (req, res) => {
  if (!(await requireModule("moduleShuttle", res))) return;
  const schema = z.object({ originLat: z.coerce.number(), originLng: z.coerce.number(), destLat: z.coerce.number(), destLng: z.coerce.number() });
  const p = schema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Koordinat tidak valid" });
  const km = Math.round(havKm(p.data.originLat, p.data.originLng, p.data.destLat, p.data.destLng) * 10) / 10;
  const types = await prisma.shuttleVehicleType.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } });
  const etaMin = Math.max(3, Math.round(km * 3)); // rough city ETA
  res.json({ distanceKm: km, etaMin, options: types.map((t) => ({ ...t, fare: fareFor(t, km) })) });
});

// Request a ride (auth) → creates the ride and instantly assigns a mock driver.
app.post("/api/shuttle/request", requireAuth, async (req: AuthRequest, res) => {
  if (!(await requireModule("moduleShuttle", res))) return;
  const schema = z.object({
    vehicleTypeId: z.string(),
    originLabel: z.string().default("Titik jemput"), originLat: z.coerce.number(), originLng: z.coerce.number(),
    destLabel: z.string().default("Tujuan"), destLat: z.coerce.number(), destLng: z.coerce.number(),
    paymentMethod: z.enum(["CASH", "WALLET", "QRIS"]).default("CASH"),
  });
  const p = schema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Data tidak valid" });
  const vt = await prisma.shuttleVehicleType.findFirst({ where: { id: p.data.vehicleTypeId, active: true } });
  if (!vt) return res.status(404).json({ error: "Jenis kendaraan tidak tersedia" });
  const km = Math.round(havKm(p.data.originLat, p.data.originLng, p.data.destLat, p.data.destLng) * 10) / 10;
  const d = DRIVERS[Math.floor(Math.random() * DRIVERS.length)];
  const ride = await prisma.shuttleRide.create({
    data: {
      code: "SH-" + Math.floor(1000000 + Math.random() * 8999999),
      userId: req.userId!, vehicleTypeId: vt.id,
      originLabel: p.data.originLabel, originLat: p.data.originLat, originLng: p.data.originLng,
      destLabel: p.data.destLabel, destLat: p.data.destLat, destLng: p.data.destLng,
      distanceKm: km, fare: fareFor(vt, km), paymentMethod: p.data.paymentMethod,
      status: "DRIVER_ASSIGNED", driverName: d.name, driverPhone: "0812" + Math.floor(10000000 + Math.random() * 89999999),
      driverPlate: d.plate, driverRating: d.rating,
    },
    include: { vehicleType: true },
  });
  await dispatch(prisma, { userId: req.userId!, title: "Driver ditemukan!", body: `${d.name} · ${vt.name} · ${d.plate}`, type: "success" });
  res.json({ ride });
});

app.get("/api/shuttle/rides", requireAuth, async (req: AuthRequest, res) => {
  const rides = await prisma.shuttleRide.findMany({ where: { userId: req.userId }, orderBy: { createdAt: "desc" }, include: { vehicleType: true }, take: 50 });
  res.json({ rides });
});

app.get("/api/shuttle/rides/:id", requireAuth, async (req: AuthRequest, res) => {
  const ride = await prisma.shuttleRide.findFirst({ where: { id: req.params.id, userId: req.userId }, include: { vehicleType: true } });
  if (!ride) return res.status(404).json({ error: "Perjalanan tidak ditemukan" });
  res.json({ ride });
});

// Advance/cancel a ride (mock lifecycle: DRIVER_ASSIGNED → ONGOING → COMPLETED).
app.post("/api/shuttle/rides/:id/status", requireAuth, async (req: AuthRequest, res) => {
  const next = String(req.body?.status ?? "");
  const allowed = ["ONGOING", "COMPLETED", "CANCELLED"];
  if (!allowed.includes(next)) return res.status(400).json({ error: "Status tidak valid" });
  const ride = await prisma.shuttleRide.findFirst({ where: { id: req.params.id, userId: req.userId } });
  if (!ride) return res.status(404).json({ error: "Perjalanan tidak ditemukan" });
  if (["COMPLETED", "CANCELLED"].includes(ride.status)) return res.status(400).json({ error: "Perjalanan sudah selesai" });
  const updated = await prisma.shuttleRide.update({ where: { id: ride.id }, data: { status: next }, include: { vehicleType: true } });
  res.json({ ride: updated });
});

// ═══════════════════════════ Admin: Tour + Shuttle management ═══════════════════════════
const toArr = (v: any): string[] => Array.isArray(v) ? v.map(String) : typeof v === "string" && v.trim() ? v.split("\n").map((x) => x.trim()).filter(Boolean) : [];

app.get("/api/admin/tours", requireRole("ADMIN"), async (_req, res) => {
  const tours = await prisma.tour.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }], include: { _count: { select: { bookings: true } } } });
  res.json({ tours });
});
app.post("/api/admin/tours", requireRole("ADMIN"), async (req: AuthRequest, res) => {
  const b = req.body;
  const tour = await prisma.tour.create({ data: {
    title: String(b.title || "Tour"), city: String(b.city || ""), category: String(b.category || "Wisata"),
    description: String(b.description || ""), imageUrl: String(b.imageUrl || "https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?w=800"),
    durationHours: Number(b.durationHours) || 4, price: Number(b.price) || 0, maxPax: Number(b.maxPax) || 20,
    highlights: toArr(b.highlights), included: toArr(b.included), meetingPoint: b.meetingPoint || null,
    sortOrder: Number(b.sortOrder) || 0, active: b.active === undefined ? true : (b.active === "1" || b.active === true || b.active === "on"),
  }});
  audit(req, "tour.create", "Tour", tour.id);
  await invalidate("miruum:");
  res.json({ tour });
});
app.put("/api/admin/tours/:id", requireRole("ADMIN"), async (req: AuthRequest, res) => {
  const b = req.body; const data: any = {};
  for (const k of ["title", "city", "category", "description", "imageUrl", "meetingPoint"]) if (b[k] != null) data[k] = String(b[k]);
  for (const k of ["durationHours", "price", "maxPax", "sortOrder"]) if (b[k] != null && b[k] !== "") data[k] = Number(b[k]);
  if (b.highlights != null) data.highlights = toArr(b.highlights);
  if (b.included != null) data.included = toArr(b.included);
  if (b.active != null) data.active = b.active === "1" || b.active === true || b.active === "on";
  const tour = await prisma.tour.update({ where: { id: req.params.id }, data });
  audit(req, "tour.update", "Tour", tour.id);
  await invalidate("miruum:");
  res.json({ tour });
});
app.delete("/api/admin/tours/:id", requireRole("ADMIN"), async (req: AuthRequest, res) => {
  await prisma.tour.delete({ where: { id: req.params.id } });
  audit(req, "tour.delete", "Tour", req.params.id);
  await invalidate("miruum:");
  res.json({ ok: true });
});

app.get("/api/admin/shuttle/vehicle-types", requireRole("ADMIN"), async (_req, res) => {
  const vehicleTypes = await prisma.shuttleVehicleType.findMany({ orderBy: { sortOrder: "asc" }, include: { _count: { select: { rides: true } } } });
  res.json({ vehicleTypes });
});
app.post("/api/admin/shuttle/vehicle-types", requireRole("ADMIN"), async (req: AuthRequest, res) => {
  const b = req.body;
  const vt = await prisma.shuttleVehicleType.create({ data: {
    name: String(b.name || "Ekonomi"), icon: String(b.icon || "car"),
    baseFare: Number(b.baseFare) || 8000, perKm: Number(b.perKm) || 4000, minFare: Number(b.minFare) || 12000,
    capacity: Number(b.capacity) || 4, sortOrder: Number(b.sortOrder) || 0,
    active: b.active === undefined ? true : (b.active === "1" || b.active === true || b.active === "on"),
  }});
  await invalidate("miruum:");
  res.json({ vehicleType: vt });
});
app.put("/api/admin/shuttle/vehicle-types/:id", requireRole("ADMIN"), async (req, res) => {
  const b = req.body; const data: any = {};
  for (const k of ["name", "icon"]) if (b[k] != null) data[k] = String(b[k]);
  for (const k of ["baseFare", "perKm", "minFare", "capacity", "sortOrder"]) if (b[k] != null && b[k] !== "") data[k] = Number(b[k]);
  if (b.active != null) data.active = b.active === "1" || b.active === true || b.active === "on";
  const vt = await prisma.shuttleVehicleType.update({ where: { id: req.params.id }, data });
  await invalidate("miruum:");
  res.json({ vehicleType: vt });
});
app.delete("/api/admin/shuttle/vehicle-types/:id", requireRole("ADMIN"), async (req, res) => {
  await prisma.shuttleVehicleType.delete({ where: { id: req.params.id } });
  await invalidate("miruum:");
  res.json({ ok: true });
});
app.get("/api/admin/shuttle/rides", requireRole("ADMIN"), async (_req, res) => {
  const rides = await prisma.shuttleRide.findMany({ orderBy: { createdAt: "desc" }, take: 100, include: { vehicleType: true, user: { select: { name: true } } } });
  res.json({ rides });
});

// ─────────────────────────── CS Chat (bot + live agent) ───────────────────────────
async function getOrCreateConversation(userId: string) {
  let conv = await prisma.chatConversation.findFirst({ where: { userId, status: { not: "CLOSED" } }, orderBy: { createdAt: "desc" } });
  if (!conv) {
    conv = await prisma.chatConversation.create({ data: { userId } });
    await prisma.chatMessage.create({ data: { conversationId: conv.id, sender: "BOT",
      body: "Halo! 👋 Saya asisten Miruum. Ada yang bisa saya bantu? Tanya soal booking, pembayaran, promo, e-voucher, atau refund — atau ketik 'agen' untuk bicara dengan agen kami." } });
  }
  return conv;
}

app.get("/api/chat", requireAuth, async (req: AuthRequest, res) => {
  const conv = await getOrCreateConversation(req.userId!);
  const messages = await prisma.chatMessage.findMany({ where: { conversationId: conv.id }, orderBy: { createdAt: "asc" } });
  res.json({ conversationId: conv.id, status: conv.status, messages });
});

app.post("/api/chat", requireAuth, async (req: AuthRequest, res) => {
  const body = String(req.body?.body ?? "").trim();
  if (!body) return res.status(400).json({ error: "Pesan kosong" });
  const conv = await getOrCreateConversation(req.userId!);
  await prisma.chatMessage.create({ data: { conversationId: conv.id, sender: "USER", body } });
  let status = conv.status;
  // Bot replies only while not handled by a live agent.
  if (conv.status === "BOT") {
    const reply = botReply(body);
    await prisma.chatMessage.create({ data: { conversationId: conv.id, sender: "BOT", body: reply.body } });
    if (reply.escalate) status = "WAITING_AGENT";
  }
  await prisma.chatConversation.update({ where: { id: conv.id }, data: { status, lastMessageAt: new Date() } });
  const messages = await prisma.chatMessage.findMany({ where: { conversationId: conv.id }, orderBy: { createdAt: "asc" } });
  res.json({ conversationId: conv.id, status, messages });
});

// Admin: live-agent console.
app.get("/api/admin/chats", requireRole("ADMIN"), async (_req, res) => {
  const chats = await prisma.chatConversation.findMany({
    orderBy: { lastMessageAt: "desc" }, take: 100,
    include: { user: { select: { name: true, email: true } }, messages: { orderBy: { createdAt: "desc" }, take: 1 } },
  });
  res.json({ chats });
});
app.get("/api/admin/chats/:id", requireRole("ADMIN"), async (req, res) => {
  const conv = await prisma.chatConversation.findUnique({ where: { id: req.params.id },
    include: { user: { select: { name: true, email: true } }, messages: { orderBy: { createdAt: "asc" } } } });
  if (!conv) return res.status(404).json({ error: "Percakapan tidak ditemukan" });
  res.json({ conversation: conv });
});
app.post("/api/admin/chats/:id/reply", requireRole("ADMIN"), async (req, res) => {
  const body = String(req.body?.body ?? "").trim();
  if (!body) return res.status(400).json({ error: "Balasan kosong" });
  await prisma.chatMessage.create({ data: { conversationId: req.params.id, sender: "AGENT", body } });
  await prisma.chatConversation.update({ where: { id: req.params.id }, data: { status: "AGENT", lastMessageAt: new Date() } });
  res.json({ ok: true });
});

// ─────────────── Finance report (range + monthly series + CSV) ───────────────
app.get("/api/admin/finance/report", requireRole("ADMIN"), async (req, res) => {
  const { from, to, format } = req.query as Record<string, string>;
  const where: any = { status: { in: ["PAID", "COMPLETED"] } };
  if (from || to) where.paidAt = { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to + "T23:59:59") } : {}) };
  const bookings = await prisma.booking.findMany({
    where, orderBy: { paidAt: "desc" },
    include: { hotel: { select: { name: true } }, channel: { select: { code: true, name: true, type: true } } },
  });
  if (format === "csv") {
    const rows = [["Kode", "Tanggal", "Hotel", "Sumber", "Subtotal", "Diskon", "Pajak", "Total"].join(",")];
    for (const b of bookings) rows.push([b.code, (b.paidAt ?? b.createdAt).toISOString().slice(0, 10), `"${b.hotel.name}"`,
      b.channel ? b.channel.name : "Direct", b.roomPrice, b.discount, b.taxFee, b.totalPrice].join(","));
    res.set("Content-Type", "text/csv").set("Content-Disposition", 'attachment; filename="miruum-finance.csv"').send(rows.join("\n"));
    return;
  }
  // Monthly revenue series + totals.
  const series: Record<string, { gross: number; count: number }> = {};
  let gross = 0, tax = 0, discount = 0;
  for (const b of bookings) {
    const mk = (b.paidAt ?? b.createdAt).toISOString().slice(0, 7);
    series[mk] ??= { gross: 0, count: 0 };
    series[mk].gross += Number(b.totalPrice); series[mk].count += 1;
    gross += Number(b.totalPrice); tax += Number(b.taxFee); discount += Number(b.discount);
  }
  res.json({
    count: bookings.length, gross, tax, discount,
    series: Object.entries(series).sort().map(([month, v]) => ({ month, ...v })),
    bookings: bookings.slice(0, 200).map((b) => ({ code: b.code, date: (b.paidAt ?? b.createdAt), hotel: b.hotel.name,
      source: b.channel?.name ?? "Direct", total: b.totalPrice, discount: b.discount })),
  });
});

// ─────────────────────────── Notifications ───────────────────────────
app.get("/api/notifications", requireAuth, async (req: AuthRequest, res) => {
  const notifications = await prisma.notification.findMany({
    where: { OR: [{ userId: req.userId }, { userId: null }] },
    orderBy: { createdAt: "desc" },
  });
  res.json({ notifications });
});

// ═══════════════════════ BACK OFFICE (ADMIN) ═══════════════════════
app.get("/api/admin/stats", requireRole("ADMIN"), async (_req, res) => {
  const [hotels, users, bookings, paid] = await Promise.all([
    prisma.hotel.count(),
    prisma.user.count(),
    prisma.booking.count(),
    prisma.booking.findMany({ where: { status: { in: ["PAID", "COMPLETED"] } }, select: { totalPrice: true } }),
  ]);
  const revenue = paid.reduce((s, b) => s + Number(b.totalPrice), 0);
  const byStatus = await prisma.booking.groupBy({ by: ["status"], _count: true });
  res.json({ hotels, users, bookings, revenue, byStatus });
});

app.get("/api/admin/hotels", requireRole("ADMIN"), async (_req, res) => {
  const hotels = await prisma.hotel.findMany({
    orderBy: { createdAt: "desc" },
    include: { owner: { select: { id: true, name: true, email: true } }, channel: true, _count: { select: { rooms: true, bookings: true } } },
  });
  res.json({ hotels });
});

// Robust boolean from HTML form values — z.coerce.boolean() treats the string
// "false" as true (any non-empty string is truthy). This maps only genuine
// truthy tokens to true; everything else (incl. "false"/"0"/absent) to false.
const formBool = z.preprocess((v) => v === true || v === "true" || v === "on" || v === "1" || v === 1, z.boolean());

app.post("/api/admin/hotels", requireRole("ADMIN"), async (req, res) => {
  const schema = z.object({
    name: z.string().min(2), city: z.string().min(2), address: z.string().min(2),
    regionId: z.string({ required_error: "Wilayah wajib dipilih" }).min(1, "Wilayah wajib dipilih"), // mandatory: no property without a structured area
    description: z.string().default(""), priceFrom: z.coerce.number().int().default(0),
    checkInInfo: z.string().optional(), checkOutInfo: z.string().optional(),
    starRating: z.coerce.number().int().min(1).max(5).default(3), rating: z.coerce.number().default(8),
    imageUrl: z.string().default(""), isPromo: formBool,
    promoLabel: z.string().optional(), ownerId: z.string().optional(),
    productChannelManager: formBool, productPMS: formBool,
    channelId: z.string().optional(), externalId: z.string().optional(),
    propertyType: z.enum(["HOTEL", "VILLA", "APARTMENT", "HOMESTAY", "GUESTHOUSE", "HOSTEL", "RESORT"]).default("HOTEL"),
    foreignMarkupPct: z.union([z.coerce.number().int().min(0).max(100), z.literal("")]).optional(),
  });
  const p = schema.safeParse(req.body);
  if (!p.success) {
    return res.status(400).json({ error: p.error.issues[0]?.message || "Data hotel tidak valid", details: p.error.issues });
  }
  const slug = p.data.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") + "-" + Math.floor(Math.random() * 9000 + 1000);
  const { foreignMarkupPct: fmp, ...rest } = p.data;
  const hotel = await prisma.hotel.create({ data: { ...rest, foreignMarkupPct: fmp === "" || fmp == null ? null : Number(fmp), slug, ownerId: p.data.ownerId || null } });
  await invalidate("miruum:");
  audit(req, "hotel.create", "Hotel", hotel.id, { name: hotel.name });
  res.json({ hotel });
});

app.put("/api/admin/hotels/:id", requireRole("ADMIN"), async (req, res) => {
  const schema = z.object({
    name: z.string().optional(), city: z.string().optional(), address: z.string().optional(),
    regionId: z.string({ required_error: "Wilayah wajib dipilih" }).min(1, "Wilayah wajib dipilih"), // mandatory: no property without a structured area
    description: z.string().optional(), priceFrom: z.coerce.number().int().optional(),
    checkInInfo: z.string().optional(), checkOutInfo: z.string().optional(),
    starRating: z.coerce.number().int().optional(), rating: z.coerce.number().optional(),
    imageUrl: z.string().optional(), isPromo: formBool.optional(),
    promoLabel: z.string().optional(), ownerId: z.string().optional(),
    productChannelManager: formBool.optional(), productPMS: formBool.optional(),
    channelId: z.string().optional(), externalId: z.string().optional(),
    propertyType: z.enum(["HOTEL", "VILLA", "APARTMENT", "HOMESTAY", "GUESTHOUSE", "HOSTEL", "RESORT"]).optional(),
    foreignMarkupPct: z.union([z.coerce.number().int().min(0).max(100), z.literal("")]).optional(),
  });
  const p = schema.safeParse(req.body);
  if (!p.success) {
    return res.status(400).json({ error: p.error.issues[0]?.message || "Data tidak valid", details: p.error.issues });
  }
  const data: any = { ...p.data };
  if (data.ownerId === "") data.ownerId = null;
  if (data.channelId === "") data.channelId = null;
  // Empty string → clear the override (fall back to global markup).
  if (data.foreignMarkupPct === "" || data.foreignMarkupPct == null) data.foreignMarkupPct = null;
  else data.foreignMarkupPct = Number(data.foreignMarkupPct);
  const hotel = await prisma.hotel.update({ where: { id: req.params.id }, data });
  await invalidate("miruum:");
  audit(req, "hotel.update", "Hotel", hotel.id, { fields: Object.keys(data) });
  res.json({ hotel });
});

app.delete("/api/admin/hotels/:id", requireRole("ADMIN"), async (req, res) => {
  await prisma.hotel.delete({ where: { id: req.params.id } });
  await invalidate("miruum:");
  audit(req, "hotel.delete", "Hotel", req.params.id);
  res.json({ ok: true });
});

// Re-pull rate & availability from every supply source.
app.post("/api/admin/offers/sync", requireRole("ADMIN"), async (_req, res) => {
  const stats = await syncOffers(prisma);
  await invalidate("miruum:");
  res.json({ ok: true, ...stats });
});

// ── Connector gateway config (admin) — plug in any B2B API via JSON config ──
app.get("/api/admin/channels", requireRole("ADMIN"), async (_req, res) => {
  const channels = await prisma.supplyChannel.findMany({ orderBy: { sortOrder: "asc" } });
  res.json({ channels });
});

// Rate Intelligence — reads every OTA price per hotel (contracted sub-agents
// AND non-contracted competitors) so admin sees the whole market and can set
// markup (% or Rp) competitively. Non-contracted channels are monitor-only.
// ─────────────── Rate Parity Monitor + alerts ───────────────
// Flags channels whose price deviates from the reference (Direct) beyond the
// tolerance — the core of RateGain Parity+ / STAAH parity monitoring.
app.get("/api/admin/parity", requireRole("ADMIN"), async (_req, res) => {
  const tol = await getNum("parityTolerancePct");
  const hotels = await prisma.hotel.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, city: true, offers: { select: { price: true, available: true, channel: { select: { code: true, name: true, type: true, color: true, contracted: true } } } } },
  });
  let totalViolations = 0;
  const rows = [];
  for (const h of hotels) {
    if (h.offers.length < 2) continue;
    const direct = h.offers.find((o) => o.channel.type === "DIRECT");
    const reference = direct ? direct.price : Math.min(...h.offers.map((o) => o.price));
    const refName = direct ? direct.channel.name : "Harga terendah";
    const channels = h.offers.map((o) => {
      const dev = reference ? Math.round(((o.price - reference) / reference) * 1000) / 10 : 0;
      let status = "OK";
      if (o.channel.type !== "DIRECT") {
        if (dev < -tol) status = "UNDERCUT";       // selling cheaper than our direct rate → parity broken
        else if (dev > tol) status = "OVERPRICED"; // selling above → lost competitiveness
      }
      return { channel: o.channel.name, code: o.channel.code, type: o.channel.type, color: o.channel.color, price: o.price, deviationPct: dev, status };
    }).sort((a, b) => a.deviationPct - b.deviationPct);
    const violations = channels.filter((c) => c.status !== "OK");
    totalViolations += violations.length;
    rows.push({ hotelId: h.id, hotel: h.name, city: h.city, reference, refName, channels, violations: violations.length });
  }
  res.json({ tolerance: tol, totalViolations, rows: rows.sort((a, b) => b.violations - a.violations) });
});
// Alert: notify all admins of current parity violations.
app.post("/api/admin/parity/alert", requireRole("ADMIN"), async (req: AuthRequest, res) => {
  const tol = await getNum("parityTolerancePct");
  const hotels = await prisma.hotel.findMany({ select: { name: true, offers: { select: { price: true, channel: { select: { name: true, type: true } } } } } });
  let n = 0;
  const admins = await prisma.user.findMany({ where: { role: "ADMIN" }, select: { id: true } });
  for (const h of hotels) {
    const direct = h.offers.find((o) => o.channel.type === "DIRECT");
    if (!direct) continue;
    for (const o of h.offers) {
      if (o.channel.type === "DIRECT") continue;
      const dev = ((o.price - direct.price) / direct.price) * 100;
      if (dev < -tol) { n++; for (const a of admins) await dispatch(prisma, { userId: a.id, title: "⚠ Pelanggaran Parity", body: `${o.channel.name} menjual ${h.name} ${Math.abs(Math.round(dev * 10) / 10)}% lebih murah dari rate Direct.`, type: "warning" }); }
    }
  }
  audit(req, "parity.alert", "Parity", undefined, { violations: n });
  res.json({ ok: true, alerts: n });
});

// ─────────────── Metasearch & GDS distribution ───────────────
async function ensureMetaChannels() {
  if ((await prisma.metaChannel.count()) > 0) return;
  await prisma.metaChannel.createMany({ data: [
    { code: "GOOGLE_HOTEL", name: "Google Hotel Ads", kind: "METASEARCH", color: "#4285F4" },
    { code: "TRIVAGO", name: "Trivago", kind: "METASEARCH", color: "#E30A52" },
    { code: "TRIPADVISOR", name: "TripAdvisor", kind: "METASEARCH", color: "#00AA6C" },
    { code: "KAYAK", name: "KAYAK", kind: "METASEARCH", color: "#FF690F" },
    { code: "AMADEUS", name: "Amadeus GDS", kind: "GDS", color: "#0A2472" },
    { code: "SABRE", name: "Sabre GDS", kind: "GDS", color: "#C4122E" },
  ] });
}
app.get("/api/admin/meta-channels", requireRole("ADMIN"), async (_req, res) => {
  await ensureMetaChannels();
  const channels = await prisma.metaChannel.findMany({ orderBy: [{ kind: "asc" }, { name: "asc" }] });
  const feedHotels = await prisma.hotel.count({ where: { channel: { type: "DIRECT" } } });
  res.json({ channels, feedHotels, feedUrl: `${PUBLIC_ORIGIN}/api/feed/hotels` });
});
app.put("/api/admin/meta-channels/:id", requireRole("ADMIN"), async (req: AuthRequest, res) => {
  const connected = req.body?.connected === true || req.body?.connected === "true" || req.body?.connected === "on";
  const channel = await prisma.metaChannel.update({ where: { id: req.params.id }, data: { connected } });
  audit(req, "meta.toggle", "MetaChannel", channel.id, { name: channel.name, connected });
  res.json({ channel });
});
app.post("/api/admin/meta-channels/push", requireRole("ADMIN"), async (req: AuthRequest, res) => {
  const r = await prisma.metaChannel.updateMany({ where: { connected: true }, data: { lastPushAt: new Date() } });
  audit(req, "meta.push", "MetaChannel", undefined, { count: r.count });
  res.json({ ok: true, pushed: r.count });
});
// Public price feed (the format a metasearch/GDS would ingest).
app.get("/api/feed/hotels", async (_req, res) => {
  const hotels = await prisma.hotel.findMany({
    where: { channel: { type: "DIRECT" } },
    select: { id: true, name: true, city: true, address: true, lat: true, lng: true, starRating: true, priceFrom: true, imageUrl: true },
  });
  res.json({ currency: "IDR", provider: "Miruum", hotels: hotels.map((h) => ({ ...h, deeplink: `${PUBLIC_ORIGIN}/hotel/${h.id}` })) });
});

// ─────────────── Revenue Management & Demand Forecast ───────────────
app.get("/api/admin/revenue-management", requireRole("ADMIN"), async (_req, res) => {
  const now = new Date();
  const horizon = 30;
  const windowEnd = new Date(now.getTime() + horizon * 86400000);
  const hotels = await prisma.hotel.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, city: true, priceFrom: true, rooms: { select: { stock: true } } },
  });
  const rows = [];
  for (const h of hotels) {
    const totalRooms = h.rooms.reduce((s, r) => s + r.stock, 0);
    if (totalRooms === 0) continue;
    const capacity = totalRooms * horizon; // room-nights available in the window
    const bookings = await prisma.booking.findMany({
      where: { hotelId: h.id, status: { in: ["PENDING", "PAID", "COMPLETED"] }, checkIn: { lt: windowEnd }, checkOut: { gt: now } },
      select: { checkIn: true, checkOut: true, rooms: true, createdAt: true },
    });
    let bookedNights = 0, pace7 = 0;
    const weekAgo = new Date(now.getTime() - 7 * 86400000);
    for (const b of bookings) {
      const start = b.checkIn > now ? b.checkIn : now;
      const end = b.checkOut < windowEnd ? b.checkOut : windowEnd;
      const nights = Math.max(0, Math.round((end.getTime() - start.getTime()) / 86400000));
      bookedNights += nights * b.rooms;
      if (b.createdAt >= weekAgo) pace7++;
    }
    const occupancy = Math.min(100, Math.round((bookedNights / capacity) * 1000) / 10);
    let rec, recPct = 0;
    if (occupancy >= 70) { rec = "Naikkan tarif — permintaan tinggi"; recPct = 15; }
    else if (occupancy >= 45) { rec = "Pertahankan tarif"; recPct = 0; }
    else if (occupancy >= 20) { rec = "Turunkan tarif / promo ringan"; recPct = -10; }
    else { rec = "Promo agresif — okupansi rendah"; recPct = -20; }
    const suggestedPrice = Math.round(h.priceFrom * (1 + recPct / 100) / 1000) * 1000;
    rows.push({ hotelId: h.id, hotel: h.name, city: h.city, totalRooms, occupancy, pace7, currentPrice: h.priceFrom, recPct, suggestedPrice, recommendation: rec, forecastOccupancy: occupancy });
  }
  const avgOcc = rows.length ? Math.round(rows.reduce((s, r) => s + r.occupancy, 0) / rows.length * 10) / 10 : 0;
  res.json({ horizon, avgOccupancy: avgOcc, rows: rows.sort((a, b) => b.occupancy - a.occupancy) });
});

// Rate Intelligence = a manual price-comparison board. Admin records the price
// of the SAME hotel on external OTA platforms (Tiket.com, Agoda, Traveloka…);
// Miruum shows where our own rate stands vs the market. Informational only —
// no API, no integration, nothing sellable.
app.get("/api/admin/rate-intelligence", requireRole("ADMIN"), async (_req, res) => {
  const otaChannels = await prisma.supplyChannel.findMany({
    where: { type: "OTA", active: true }, orderBy: { sortOrder: "asc" },
    select: { id: true, code: true, name: true, color: true },
  });
  const hotels = await prisma.hotel.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, city: true, priceFrom: true,
      rateObservations: { select: { channelId: true, price: true, source: true, updatedAt: true } } },
  });
  const rows = hotels.map((h) => {
    const obs: Record<string, number> = {};
    const obsSource: Record<string, string> = {};
    let lastUpdated: Date | null = null;
    for (const o of h.rateObservations) {
      obs[o.channelId] = o.price;
      obsSource[o.channelId] = o.source;
      if (!lastUpdated || o.updatedAt > lastUpdated) lastUpdated = o.updatedAt;
    }
    const otaPrices = Object.values(obs).filter((p) => p > 0);
    const marketPrices = [h.priceFrom, ...otaPrices].filter((p) => p > 0);
    const marketMin = marketPrices.length ? Math.min(...marketPrices) : null;
    const marketMax = marketPrices.length ? Math.max(...marketPrices) : null;
    return {
      hotelId: h.id, hotel: h.name, city: h.city, ownPrice: h.priceFrom,
      obs, obsSource, marketMin, marketMax, observedCount: otaPrices.length,
      cheapest: otaPrices.length ? h.priceFrom <= Math.min(...otaPrices) : null,
      lastUpdated,
    };
  });
  const s = await getSettings();
  res.json({ otaChannels, rows, ai: { enabled: aiConfigured(s), auto: s.ai_auto === "1", model: s.ai_model || "" } });
});

// Trigger the AI rate shopper for all hotels (runs in the background).
app.post("/api/admin/rate-intelligence/search", requireRole("ADMIN"), async (_req, res) => {
  const s = await getSettings();
  if (!aiConfigured(s)) return res.status(400).json({ error: "Agen AI belum aktif. Aktifkan & isi API key di Integrasi." });
  runRateShopping(true).then((r) => logger.info(r, "[rateshopper] done")).catch((e) => logger.error({ err: e }, "[rateshopper] failed"));
  res.json({ ok: true, started: true });
});

// Save observed OTA prices for one hotel (price ≤ 0 clears that observation).
app.put("/api/admin/rate-observations", requireRole("ADMIN"), async (req: AuthRequest, res) => {
  const schema = z.object({
    hotelId: z.string(),
    observations: z.array(z.object({ channelId: z.string(), price: z.coerce.number().int() })),
  });
  const p = schema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Data tidak valid" });
  const hotel = await prisma.hotel.findUnique({ where: { id: p.data.hotelId }, select: { id: true } });
  if (!hotel) return res.status(404).json({ error: "Hotel tidak ditemukan" });
  for (const o of p.data.observations) {
    if (o.price > 0) {
      await prisma.rateObservation.upsert({
        where: { hotelId_channelId: { hotelId: hotel.id, channelId: o.channelId } },
        create: { hotelId: hotel.id, channelId: o.channelId, price: o.price },
        update: { price: o.price },
      });
    } else {
      await prisma.rateObservation.deleteMany({ where: { hotelId: hotel.id, channelId: o.channelId } });
    }
  }
  audit(req, "rate.observe", "Hotel", hotel.id, { count: p.data.observations.length });
  await invalidate("miruum:");
  res.json({ ok: true });
});

app.put("/api/admin/channels/:id", requireRole("ADMIN"), async (req, res) => {
  const schema = z.object({
    name: z.string().optional(),
    commissionPct: z.coerce.number().optional(),
    feeIncluded: formBool.optional(),
    contracted: formBool.optional(),
    markupType: z.enum(["PCT", "NOMINAL"]).optional(),
    markupNominal: z.coerce.number().int().optional(),
    active: z.coerce.boolean().optional(), // not sent by the config form → left unchanged
    connectorType: z.enum(["MOCK", "HTTP", "DIRECT"]).optional(),
    config: z.any().optional(), // gateway config JSON (or null to clear)
  });
  const p = schema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Data channel tidak valid" });
  const data: any = { ...p.data };
  if (typeof data.config === "string") {
    try { data.config = data.config.trim() ? JSON.parse(data.config) : null; }
    catch { return res.status(400).json({ error: "Config JSON tidak valid" }); }
  }
  const channel = await prisma.supplyChannel.update({ where: { id: req.params.id }, data });
  await invalidate("miruum:");
  audit(req, "channel.update", "SupplyChannel", channel.id, { name: channel.name, contracted: channel.contracted, markupType: channel.markupType, commissionPct: channel.commissionPct, markupNominal: channel.markupNominal });
  res.json({ channel });
});

// Test a channel's connector against one hotel — returns the mapped offer or error.
app.post("/api/admin/channels/:id/test", requireRole("ADMIN"), async (req, res) => {
  const channel = await prisma.supplyChannel.findUnique({ where: { id: req.params.id } });
  if (!channel) return res.status(404).json({ error: "Channel tidak ditemukan" });
  const hotel = req.body?.hotelId
    ? await prisma.hotel.findUnique({ where: { id: req.body.hotelId } })
    : await prisma.hotel.findFirst();
  if (!hotel) return res.status(404).json({ error: "Tidak ada hotel untuk diuji" });
  try {
    const offer = await getConnector(channel).fetchOffer(hotel);
    const { price } = applyMarkup(offer.basePrice, channel as any);
    res.json({ ok: true, hotel: hotel.name, offer: { ...offer, price } });
  } catch (e: any) {
    res.json({ ok: false, error: e.message });
  }
});

// Channel Manager overview: hotels with their per-source offers (cheapest first).
app.get("/api/admin/channel-manager", requireRole("ADMIN"), async (_req, res) => {
  const hotels = await prisma.hotel.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true, name: true, slug: true, city: true, priceFrom: true, channelId: true,
      offers: {
        orderBy: { price: "asc" },
        select: { id: true, basePrice: true, markupPct: true, price: true, available: true, roomsLeft: true,
          channel: { select: { code: true, name: true, type: true, color: true } } },
      },
    },
  });
  const channels = await prisma.supplyChannel.findMany({ orderBy: { sortOrder: "asc" } });

  // ── Channel Manager module overview (Inventory, Rate, Reservation, Mapping,
  //    Channels, Analytics, PMS, Booking Engine) ──
  const since30 = new Date(Date.now() - 30 * 24 * 3600 * 1000);
  const [roomCount, lowStock, rateRules, mappingCount, bookingsTotal, bookingsRecent, grouped] = await Promise.all([
    prisma.room.count(),
    prisma.room.count({ where: { stock: { lte: 3 } } }),
    prisma.roomAvailability.count(),
    prisma.roomChannelMap.count(),
    prisma.booking.count(),
    prisma.booking.count({ where: { createdAt: { gte: since30 } } }),
    prisma.booking.groupBy({ by: ["channelId", "status"], _count: { _all: true }, _sum: { totalPrice: true } }),
  ]);

  // Aggregate bookings per channel → count, revenue (paid/completed), cancellation rate.
  const chById: Record<string, any> = Object.fromEntries(channels.map((c) => [c.id, c]));
  const stat: Record<string, { name: string; type: string; color: string; total: number; revenue: number; cancelled: number }> = {};
  for (const g of grouped) {
    const key = g.channelId ?? "DIRECT_NULL";
    const ch = g.channelId ? chById[g.channelId] : null;
    const s = (stat[key] ??= { name: ch?.name ?? "Tanpa kanal", type: ch?.type ?? "DIRECT", color: ch?.color ?? "#8892a0", total: 0, revenue: 0, cancelled: 0 });
    const n = g._count._all;
    s.total += n;
    if (g.status === "PAID" || g.status === "COMPLETED") s.revenue += Number(g._sum.totalPrice) ?? 0;
    if (g.status === "CANCELLED" || g.status === "REFUNDED") s.cancelled += n;
  }
  const channelStats = Object.values(stat)
    .map((s) => ({ ...s, cancelRate: s.total ? Math.round((s.cancelled / s.total) * 1000) / 10 : 0 }))
    .sort((a, b) => b.total - a.total);

  const otaCount = channels.filter((c) => c.type === "OTA").length;
  const roomsWithMap = mappingCount; // room↔OTA links established
  const overview = {
    inventory: { rooms: roomCount, lowStock, overbookingGuard: true },
    rate: { rules: rateRules, rooms: roomCount },
    reservation: { total: bookingsTotal, recent30: bookingsRecent },
    mapping: { mapped: roomsWithMap, otaChannels: otaCount },
    channels: { total: channels.length, ota: otaCount, direct: channels.filter((c) => c.type === "DIRECT").length, active: channels.filter((c) => c.connectorType !== "OFF").length },
    pms: { connected: false }, // two-way PMS sync — connect via connector config
    bookingEngine: { base: process.env.PUBLIC_APP_URL || "https://miruum.id" },
    channelStats,
  };

  res.json({ hotels, channels, overview });
});

// Finance summary: revenue, commission by source, payouts due to DIRECT hotels.
app.get("/api/admin/finance", requireRole("ADMIN"), async (_req, res) => {
  res.json(await computeFinance(prisma));
});

// Record a payout to a DIRECT hotel (marks its outstanding due as settled).
app.post("/api/admin/settlements", requireRole("ADMIN"), async (req, res) => {
  const schema = z.object({ hotelId: z.string(), amount: z.coerce.number().int().positive(), bookingsCount: z.coerce.number().int().default(0), note: z.string().optional() });
  const p = schema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Data settlement tidak valid" });
  const settlement = await prisma.settlement.create({ data: p.data });
  audit(req, "settlement.create", "Settlement", settlement.id, { hotelId: p.data.hotelId, amount: p.data.amount });
  res.json({ settlement });
});

app.get("/api/admin/settlements", requireRole("ADMIN"), async (_req, res) => {
  const settlements = await prisma.settlement.findMany({ orderBy: { createdAt: "desc" }, take: 100, include: { hotel: { select: { name: true } } } });
  res.json({ settlements });
});

// Reconciliation: per-hotel gross → commission → net payout → settled → outstanding.
// CSV export for accounting. `?format=csv`.
app.get("/api/admin/reconciliation", requireRole("ADMIN"), async (req, res) => {
  const earn = await partnerEarnings(undefined, true);
  if (String(req.query.format) === "csv") {
    const head = "Hotel,Pesanan,Bruto,KomisiPct,KomisiRp,Payout,Settled,Outstanding\n";
    const rows = earn.hotels.map((h: any) => [
      String(h.name).replace(/[",\n]/g, " "), h.bookings, h.gross, earn.platformPct, h.gross - h.payout, h.payout, h.settled, h.claimable,
    ].join(",")).join("\n");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="rekonsiliasi-miruum.csv"');
    return res.send(head + rows + "\n");
  }
  res.json(earn);
});

// Automatic batch settlement: settle every hotel's outstanding balance at once
// (records a Settlement per hotel + notifies the owner). Reconciliation-grade.
app.post("/api/admin/settlements/auto", requireRole("ADMIN"), async (req, res) => {
  const earn = await partnerEarnings(undefined, true);
  const due = earn.hotels.filter((h: any) => h.claimable > 0);
  let count = 0, total = 0;
  for (const h of due) {
    await prisma.settlement.create({ data: { hotelId: h.hotelId, amount: h.claimable, bookingsCount: h.bookings, note: "Settlement otomatis (batch rekonsiliasi)" } });
    count++; total += h.claimable;
    const hotel = await prisma.hotel.findUnique({ where: { id: h.hotelId }, select: { ownerId: true, name: true } });
    if (hotel?.ownerId) await dispatch(prisma, { userId: hotel.ownerId, title: `Pencairan diproses — ${hotel.name}`, body: `Payout ${rupiah(h.claimable)} untuk ${h.bookings} pesanan telah diselesaikan.`, type: "success" });
  }
  audit(req, "settlement.auto", "Settlement", "batch", { count, total });
  res.json({ ok: true, count, total });
});

// ─────────────── Promo CRUD ───────────────
app.get("/api/admin/promos", requireRole("ADMIN"), async (_req, res) => {
  res.json({ promos: await prisma.promo.findMany({ orderBy: { code: "asc" } }) });
});
app.post("/api/admin/promos", requireRole("ADMIN"), async (req, res) => {
  const schema = z.object({ code: z.string().min(2), title: z.string().min(2), description: z.string().default(""),
    discountPct: z.coerce.number().int().min(1).max(100), imageUrl: z.string().default(""), validUntil: z.string().optional(),
    claimable: formBool });
  const p = schema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Data promo tidak valid" });
  try {
    const promo = await prisma.promo.create({ data: { ...p.data, code: p.data.code.toUpperCase() } });
    await invalidate("miruum:"); res.json({ promo });
  } catch { res.status(400).json({ error: "Kode promo sudah ada" }); }
});
app.put("/api/admin/promos/:id", requireRole("ADMIN"), async (req, res) => {
  const schema = z.object({ title: z.string().optional(), description: z.string().optional(),
    discountPct: z.coerce.number().int().optional(), imageUrl: z.string().optional(), validUntil: z.string().optional() });
  const p = schema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Data tidak valid" });
  const promo = await prisma.promo.update({ where: { id: req.params.id }, data: p.data });
  await invalidate("miruum:"); res.json({ promo });
});
app.delete("/api/admin/promos/:id", requireRole("ADMIN"), async (req, res) => {
  await prisma.promo.delete({ where: { id: req.params.id } }); await invalidate("miruum:"); res.json({ ok: true });
});

// ─────────────── Banner CRUD ───────────────
app.get("/api/admin/banners", requireRole("ADMIN"), async (_req, res) => {
  res.json({ banners: await prisma.banner.findMany({ orderBy: { sortOrder: "asc" } }) });
});
app.post("/api/admin/banners", requireRole("ADMIN"), async (req, res) => {
  const schema = z.object({ title: z.string().min(1), subtitle: z.string().default(""), imageUrl: z.string().min(1),
    badge: z.string().optional(), linkUrl: z.string().optional(), active: z.coerce.boolean().default(true), sortOrder: z.coerce.number().int().default(0) });
  const p = schema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Data banner tidak valid" });
  const banner = await prisma.banner.create({ data: p.data }); await invalidate("miruum:"); res.json({ banner });
});
app.put("/api/admin/banners/:id", requireRole("ADMIN"), async (req, res) => {
  const schema = z.object({ title: z.string().optional(), subtitle: z.string().optional(), imageUrl: z.string().optional(),
    badge: z.string().optional(), linkUrl: z.string().optional(), active: z.coerce.boolean().optional(), sortOrder: z.coerce.number().int().optional() });
  const p = schema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Data tidak valid" });
  const banner = await prisma.banner.update({ where: { id: req.params.id }, data: p.data });
  await invalidate("miruum:"); res.json({ banner });
});
app.delete("/api/admin/banners/:id", requireRole("ADMIN"), async (req, res) => {
  await prisma.banner.delete({ where: { id: req.params.id } }); await invalidate("miruum:"); res.json({ ok: true });
});

// ─────────────── Package (Hotel Package) CRUD ───────────────
app.get("/api/admin/packages", requireRole("ADMIN"), async (_req, res) => {
  const packages = await prisma.hotelPackage.findMany({ orderBy: { createdAt: "desc" }, include: { hotel: { select: { name: true } } } });
  res.json({ packages });
});
app.post("/api/admin/packages", requireRole("ADMIN"), async (req, res) => {
  const schema = z.object({ title: z.string().min(2), hotelId: z.string(), nights: z.coerce.number().int().min(1),
    days: z.coerce.number().int().min(1), guests: z.coerce.number().int().min(1).default(2),
    originalPrice: z.coerce.number().int(), price: z.coerce.number().int(), inclusions: z.string().default(""),
    boardBasis: z.enum(["ROOM_ONLY", "BREAKFAST", "HALF_BOARD", "FULL_BOARD", "ALL_INCLUSIVE"]).default("BREAKFAST"),
    badge: z.string().optional(), imageUrl: z.string().default(""), isPopular: z.coerce.boolean().default(false), description: z.string().default("") });
  const p = schema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Data paket tidak valid" });
  const hotel = await prisma.hotel.findUnique({ where: { id: p.data.hotelId } });
  if (!hotel) return res.status(404).json({ error: "Hotel tidak ditemukan" });
  const room = await prisma.room.findFirst({ where: { hotelId: hotel.id } });
  if (!room) return res.status(400).json({ error: "Hotel belum punya kamar" });
  const slug = p.data.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") + "-" + Math.floor(Math.random() * 9000 + 1000);
  const discountPct = p.data.originalPrice > 0 ? Math.round((1 - p.data.price / p.data.originalPrice) * 100) : 0;
  const pkg = await prisma.hotelPackage.create({ data: {
    slug, title: p.data.title, city: hotel.city, description: p.data.description || "", imageUrl: p.data.imageUrl || hotel.imageUrl,
    hotelId: hotel.id, roomId: room.id, nights: p.data.nights, days: p.data.days, guests: p.data.guests,
    boardBasis: p.data.boardBasis,
    inclusions: p.data.inclusions.split("\n").map((s) => s.trim()).filter(Boolean),
    originalPrice: p.data.originalPrice, price: p.data.price, discountPct, rating: hotel.rating, reviewCount: hotel.reviewCount,
    starRating: hotel.starRating, badge: p.data.badge, isPopular: p.data.isPopular } });
  await invalidate("miruum:"); res.json({ package: pkg });
});
app.put("/api/admin/packages/:id", requireRole("ADMIN"), async (req, res) => {
  const schema = z.object({ title: z.string().optional(), nights: z.coerce.number().int().optional(), days: z.coerce.number().int().optional(),
    guests: z.coerce.number().int().optional(), originalPrice: z.coerce.number().int().optional(), price: z.coerce.number().int().optional(),
    inclusions: z.string().optional(), boardBasis: z.enum(["ROOM_ONLY", "BREAKFAST", "HALF_BOARD", "FULL_BOARD", "ALL_INCLUSIVE"]).optional(),
    badge: z.string().optional(), imageUrl: z.string().optional(), isPopular: z.coerce.boolean().optional() });
  const p = schema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Data tidak valid" });
  const data: any = { ...p.data };
  if (data.inclusions !== undefined) data.inclusions = String(data.inclusions).split("\n").map((s: string) => s.trim()).filter(Boolean);
  if (data.originalPrice != null && data.price != null) data.discountPct = Math.round((1 - data.price / data.originalPrice) * 100);
  const pkg = await prisma.hotelPackage.update({ where: { id: req.params.id }, data });
  await invalidate("miruum:"); res.json({ package: pkg });
});
app.delete("/api/admin/packages/:id", requireRole("ADMIN"), async (req, res) => {
  await prisma.hotelPackage.delete({ where: { id: req.params.id } }); await invalidate("miruum:"); res.json({ ok: true });
});

// ─────────────── App config: announcement popup + update prompt ───────────────
// Public — the mobile app calls this on launch.
app.get("/api/app/config", async (_req, res) => {
  const s = await getSettings();
  const popup = await prisma.appPopup.findFirst({ where: { active: true }, orderBy: { updatedAt: "desc" } });
  res.json({
    taxPct: Number(s.taxPct) || 0, // so the app itemizes tax exactly like the server computes it
    modules: moduleFlags(s),
    popup: popup ? { id: popup.id, title: popup.title, body: popup.body, imageUrl: popup.imageUrl, ctaText: popup.ctaText, ctaUrl: popup.ctaUrl, updatedAt: popup.updatedAt } : null,
    update: {
      latestVersion: s.app_latest_version || "",
      minVersion: s.app_min_version || "",
      url: s.app_update_url || "https://api.miruum.id/ota.apk",
      notes: s.app_update_notes || "",
    },
  });
});

// Public facility catalog — for the app's amenities filter.
app.get("/api/facilities", async (_req, res) => {
  const facilities = await prisma.facility.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, icon: true } });
  res.json({ facilities });
});

app.get("/api/admin/app-popup", requireRole("ADMIN"), async (_req, res) => {
  const popup = await prisma.appPopup.findFirst({ orderBy: { updatedAt: "desc" } });
  res.json({ popup });
});
app.put("/api/admin/app-popup", requireRole("ADMIN"), async (req: AuthRequest, res) => {
  const schema = z.object({ active: formBool, title: z.string().min(1), body: z.string().min(1),
    imageUrl: z.string().optional(), ctaText: z.string().optional(), ctaUrl: z.string().optional() });
  const p = schema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Judul & isi pop-up wajib diisi" });
  const data = { active: p.data.active, title: p.data.title, body: p.data.body,
    imageUrl: p.data.imageUrl || null, ctaText: p.data.ctaText || null, ctaUrl: p.data.ctaUrl || null };
  const existing = await prisma.appPopup.findFirst();
  const popup = existing
    ? await prisma.appPopup.update({ where: { id: existing.id }, data })
    : await prisma.appPopup.create({ data });
  audit(req, "app_popup.update", "AppPopup", popup.id, { active: popup.active });
  res.json({ popup });
});

// ─────────────── Settings ───────────────
app.get("/api/admin/settings", requireRole("ADMIN"), async (_req, res) => {
  res.json({ settings: await getSettings(), defaults: SETTING_DEFAULTS });
});
app.put("/api/admin/settings", requireRole("ADMIN"), async (req, res) => {
  const kv: Record<string, string> = {};
  for (const k of Object.keys(SETTING_DEFAULTS)) if (req.body[k] != null) kv[k] = String(req.body[k]);
  await setSettings(kv); await invalidate("miruum:");
  res.json({ ok: true, settings: await getSettings() });
});

// ─────────────── Integrasi (Email/SMTP, FCM, WhatsApp) — configurable in Back Office ───────────────
const INTEGRATION_KEYS = ["mail_enabled", "smtp_host", "smtp_port", "smtp_secure", "smtp_user", "smtp_pass", "smtp_from", "fcm_enabled", "fcm_service_account", "wa_enabled", "wa_api_url", "wa_api_token", "google_client_id", "ai_enabled", "ai_api_key", "ai_model", "ai_auto", "payment_provider", "linkqu_base", "linkqu_client_id", "linkqu_client_secret", "linkqu_username", "linkqu_pin", "linkqu_server_key", "hotelbeds_enabled", "hotelbeds_base", "hotelbeds_api_key", "hotelbeds_secret", "channex_enabled", "channex_base", "channex_api_key"];
app.get("/api/admin/integrations", requireRole("ADMIN"), async (_req, res) => {
  const s = await getSettings();
  const out: Record<string, string> = {};
  for (const k of INTEGRATION_KEYS) out[k] = s[k] ?? "";
  res.json({ integrations: out });
});
app.put("/api/admin/integrations", requireRole("ADMIN"), async (req, res) => {
  const kv: Record<string, string> = {};
  for (const k of INTEGRATION_KEYS) if (req.body[k] != null) kv[k] = String(req.body[k]);
  await setSettings(kv);
  res.json({ ok: true });
});
app.post("/api/admin/integrations/test-email", requireRole("ADMIN"), async (req, res) => {
  const to = String(req.body?.to || "");
  if (!to.includes("@")) return res.status(400).json({ error: "Email tujuan tidak valid" });
  try { await sendMail(to, "Tes Email Miruum", "Ini email uji dari Back Office Miruum. Konfigurasi SMTP Anda berfungsi."); res.json({ ok: true }); }
  catch (e: any) { res.status(400).json({ error: e.message }); }
});
app.post("/api/admin/integrations/test-fcm", requireRole("ADMIN"), async (req, res) => {
  const s = await getSettings();
  const sa = String(req.body?.fcm_service_account || s.fcm_service_account || "");
  if (!sa) return res.status(400).json({ error: "Service account belum diisi" });
  const r = await testFcm(sa);
  if (r.ok) res.json({ ok: true, projectId: r.projectId }); else res.status(400).json({ error: r.error });
});

// Mobile: register an FCM device token.
app.post("/api/devices", optionalAuth, async (req: AuthRequest, res) => {
  const token = String(req.body?.token || "");
  if (!token) return res.status(400).json({ error: "token wajib" });
  await prisma.deviceToken.upsert({
    where: { token },
    create: { token, userId: req.userId ?? null, platform: req.body?.platform ?? null },
    update: { userId: req.userId ?? null },
  });
  res.json({ ok: true });
});

// ─────────────── Broadcast notification ───────────────
app.post("/api/admin/notifications", requireRole("ADMIN"), async (req, res) => {
  const schema = z.object({ title: z.string().min(2), body: z.string().min(2), type: z.string().default("info") });
  const p = schema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Judul & isi wajib diisi" });
  // userId null → broadcast to all users (GET /notifications includes null-user rows).
  await prisma.notification.create({ data: { userId: null, title: p.data.title, body: p.data.body, type: p.data.type } });
  res.json({ ok: true });
});

// ─────────────── Central Channel Manager: rooms + availability ───────────────
app.get("/api/admin/rate-manager", requireRole("ADMIN"), async (_req, res) => {
  const hotels = await prisma.hotel.findMany({
    where: { channel: { type: "DIRECT" } },
    orderBy: { name: "asc" },
    select: { id: true, name: true, city: true, rooms: { select: { id: true, name: true, price: true, stock: true } } },
  });
  res.json({ hotels });
});

// ─────────────── Distribution: room-type mapping + outbound push ───────────────
app.get("/api/admin/distribution", requireRole("ADMIN"), async (_req, res) => {
  const otaChannels = await prisma.supplyChannel.findMany({ where: { type: "OTA", active: true }, orderBy: { sortOrder: "asc" }, select: { id: true, code: true, name: true, color: true } });
  const hotels = await prisma.hotel.findMany({
    where: { channel: { type: "DIRECT" } },
    orderBy: { name: "asc" },
    select: {
      id: true, name: true, city: true,
      rooms: { select: { id: true, name: true, channelMaps: { select: { channelId: true, externalRoomId: true, enabled: true, lastPushedAt: true, pushStatus: true } } } },
    },
  });
  res.json({ hotels, otaChannels });
});

app.put("/api/admin/rooms/:roomId/channel-maps/:channelId", requireRole("ADMIN"), async (req, res) => {
  const schema = z.object({ externalRoomId: z.string().min(1), enabled: z.coerce.boolean().default(true) });
  const p = schema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "ID kamar OTA wajib diisi" });
  const map = await prisma.roomChannelMap.upsert({
    where: { roomId_channelId: { roomId: req.params.roomId, channelId: req.params.channelId } },
    create: { roomId: req.params.roomId, channelId: req.params.channelId, externalRoomId: p.data.externalRoomId, enabled: p.data.enabled },
    update: { externalRoomId: p.data.externalRoomId, enabled: p.data.enabled },
  });
  res.json({ map });
});

app.delete("/api/admin/rooms/:roomId/channel-maps/:channelId", requireRole("ADMIN"), async (req, res) => {
  await prisma.roomChannelMap.deleteMany({ where: { roomId: req.params.roomId, channelId: req.params.channelId } });
  res.json({ ok: true });
});

app.post("/api/admin/distribution/push", requireRole("ADMIN"), async (_req, res) => {
  const stats = await pushDistribution(prisma);
  res.json({ ok: true, ...stats });
});

app.get("/api/admin/bookings", requireRole("ADMIN"), async (_req, res) => {
  const bookings = await prisma.booking.findMany({
    orderBy: { createdAt: "desc" }, take: 100,
    include: { hotel: { select: { name: true, city: true } }, user: { select: { name: true, email: true } }, room: { select: { name: true } } },
  });
  res.json({ bookings });
});

app.get("/api/admin/users", requireRole("ADMIN"), async (_req, res) => {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, email: true, role: true, phone: true, createdAt: true, _count: { select: { bookings: true } } },
  });
  res.json({ users });
});

// Audit trail of sensitive admin/partner actions.
app.get("/api/admin/audit", requireRole("ADMIN"), async (req, res) => {
  const action = String(req.query.action || "");
  const logs = await prisma.auditLog.findMany({
    where: action ? { action } : {},
    orderBy: { createdAt: "desc" }, take: 300,
  });
  const actions = await prisma.auditLog.findMany({ distinct: ["action"], select: { action: true }, orderBy: { action: "asc" } });
  res.json({ logs, actions: actions.map((a) => a.action) });
});

// ── Reviews moderation ──
app.get("/api/admin/reviews", requireRole("ADMIN"), async (_req, res) => {
  const reviews = await prisma.review.findMany({
    orderBy: { createdAt: "desc" },
    take: 300,
    include: { hotel: { select: { id: true, name: true, city: true } }, user: { select: { name: true, email: true } } },
  });
  const agg = await prisma.review.aggregate({ _avg: { rating: true }, _count: true });
  res.json({ reviews, stats: { total: agg._count, avg: Math.round((agg._avg.rating ?? 0) * 10) / 10 } });
});

app.delete("/api/admin/reviews/:id", requireRole("ADMIN"), async (req, res) => {
  const review = await prisma.review.findUnique({ where: { id: req.params.id } });
  if (!review) return res.status(404).json({ error: "not found" });
  await prisma.review.delete({ where: { id: review.id } });
  // Recompute the hotel's rating & count after removing the review.
  const agg = await prisma.review.aggregate({ where: { hotelId: review.hotelId }, _avg: { rating: true }, _count: true });
  await prisma.hotel.update({
    where: { id: review.hotelId },
    data: { rating: Math.round((agg._avg.rating ?? 0) * 10) / 10, reviewCount: agg._count },
  });
  res.json({ ok: true });
});

// ── Static content management (T&C / Privacy / About) ──
app.get("/api/admin/content", requireRole("ADMIN"), async (_req, res) => {
  const content = await prisma.content.findMany({ orderBy: { slug: "asc" } });
  res.json({ content });
});
app.put("/api/admin/content/:slug", requireRole("ADMIN"), async (req, res) => {
  const schema = z.object({ title: z.string().min(1), body: z.string() });
  const p = schema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Data tidak valid" });
  const content = await prisma.content.upsert({
    where: { slug: req.params.slug },
    create: { slug: req.params.slug, title: p.data.title, body: p.data.body },
    update: { title: p.data.title, body: p.data.body },
  });
  res.json({ content });
});

// ── Hotel facilities moderation ──
app.get("/api/admin/facilities", requireRole("ADMIN"), async (_req, res) => {
  const facilities = await prisma.facility.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { hotels: true } } },
  });
  const hotels = await prisma.hotel.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, city: true, facilities: { select: { facilityId: true } } },
  });
  res.json({ facilities, hotels });
});
app.post("/api/admin/facilities", requireRole("ADMIN"), async (req, res) => {
  const schema = z.object({ name: z.string().min(1), icon: z.string().min(1) });
  const p = schema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Data tidak valid" });
  try {
    const facility = await prisma.facility.create({ data: { name: p.data.name.trim(), icon: p.data.icon.trim() } });
    res.json({ facility });
  } catch (_) {
    res.status(409).json({ error: "Fasilitas dengan nama ini sudah ada" });
  }
});
app.delete("/api/admin/facilities/:id", requireRole("ADMIN"), async (req, res) => {
  await prisma.facility.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});
// Set the full facility list for a hotel (replace assignment).
app.put("/api/admin/hotels/:id/facilities", requireRole("ADMIN"), async (req, res) => {
  const ids: string[] = Array.isArray(req.body.facilityIds) ? req.body.facilityIds : [];
  await prisma.hotelFacility.deleteMany({ where: { hotelId: req.params.id } });
  if (ids.length) {
    await prisma.hotelFacility.createMany({
      data: ids.map((facilityId) => ({ hotelId: req.params.id, facilityId })),
      skipDuplicates: true,
    });
  }
  res.json({ ok: true });
});

// ═══════════════════════ EXTRANET (PARTNER) ═══════════════════════
// Product entitlements — which paid modules the partner's hotels have contracted.
// Extranet is implicit for any partner; Channel Manager & PMS are separate.
app.get("/api/partner/entitlements", requireRole("PARTNER", "ADMIN"), async (req: AuthRequest, res) => {
  const admin = (req as any).role === "ADMIN";
  const hotels = await prisma.hotel.findMany({
    where: admin ? {} : { ownerId: req.userId },
    select: { id: true, name: true, productChannelManager: true, productPMS: true },
    orderBy: { name: "asc" },
  });
  res.json({
    extranet: true,
    channelManager: admin || hotels.some((h) => h.productChannelManager),
    pms: admin || hotels.some((h) => h.productPMS),
    hotels,
  });
});

// Content/onboarding completeness score (like Booking.com's Content Score): a
// checklist that guides the partner to a go-live-ready listing. A property only
// appears publicly once it has bookable rooms (see PUBLIC_HOTEL_GATE); this score
// nudges them to complete the rest for better conversion.
function hotelContentScore(h: any): { score: number; ready: boolean; items: { key: string; label: string; done: boolean }[] } {
  const rooms = h.rooms ?? [];
  const items = [
    { key: "rooms", label: "Tambah kamar & harga", done: rooms.some((r: any) => Number(r.price ?? 0) > 0) },
    { key: "photos", label: "Unggah minimal 1 foto", done: (h.photos?.length ?? h._count?.photos ?? 0) >= 1 },
    { key: "description", label: "Isi deskripsi properti", done: String(h.description ?? "").trim().length >= 30 },
    { key: "facilities", label: "Pilih minimal 3 fasilitas", done: (h.facilities?.length ?? 0) >= 3 },
    { key: "location", label: "Set lokasi (peta / wilayah)", done: (h.lat != null && h.lng != null) || !!h.regionId },
    { key: "policy", label: "Set kebijakan pembatalan", done: !!h.cancellationPolicy },
    { key: "legal", label: "Lengkapi legalitas & NPWP", done: !!(h.legalName && h.taxId) },
    { key: "payout", label: "Isi rekening payout", done: !!(h.payoutBankName && h.payoutBankAccount) },
  ];
  const done = items.filter((i) => i.done).length;
  return { score: Math.round((done / items.length) * 100), ready: items[0].done, items };
}

app.get("/api/partner/overview", requireRole("PARTNER", "ADMIN"), async (req: AuthRequest, res) => {
  const hotels = await prisma.hotel.findMany({
    where: { ownerId: req.userId },
    include: { _count: { select: { rooms: true, bookings: true, reviews: true, photos: true } }, rooms: { select: { price: true } }, facilities: { select: { facilityId: true } } },
  });
  const hotelIds = hotels.map((h) => h.id);
  const bookings = await prisma.booking.findMany({ where: { hotelId: { in: hotelIds } }, select: { totalPrice: true, status: true } });
  const revenue = bookings.filter((b) => b.status === "PAID" || b.status === "COMPLETED").reduce((s, b) => s + Number(b.totalPrice), 0);
  const withScore = hotels.map((h) => ({ ...h, contentScore: hotelContentScore(h) }));
  res.json({ hotels: withScore, totalBookings: bookings.length, revenue });
});

app.get("/api/partner/hotels/:id", requireRole("PARTNER", "ADMIN"), async (req: AuthRequest, res) => {
  const hotel = await prisma.hotel.findFirst({
    where: { id: req.params.id, ...((req as any).role === "ADMIN" ? {} : { ownerId: req.userId }) },
    include: {
      rooms: { orderBy: { price: "asc" }, include: { ratePlans: { orderBy: { sortOrder: "asc" } }, photos: { orderBy: { sort: "asc" } } } },
      photos: { orderBy: { sort: "asc" } }, facilities: { select: { facilityId: true } },
      nearby: { orderBy: { distanceKm: "asc" } },
    },
  });
  if (!hotel) return res.status(404).json({ error: "Hotel tidak ditemukan / bukan milik Anda" });
  res.json({ hotel, contentScore: hotelContentScore(hotel) });
});

// Partner edits legal/tax, payout bank, cancellation policy & check-in/out.
app.put("/api/partner/hotels/:id/legal", requireRole("PARTNER", "ADMIN"), async (req: AuthRequest, res) => {
  if (!(await ownsHotel(req, req.params.id))) return res.status(403).json({ error: "Bukan properti Anda" });
  const isAdmin = (req as any).role === "ADMIN";
  const existing = await prisma.hotel.findUnique({ where: { id: req.params.id }, select: { legalLockedAt: true } });
  // Once the partner has submitted legal & payout data it locks — only Miruum
  // back office (admin) may change it afterwards.
  if (existing?.legalLockedAt && !isAdmin) {
    return res.status(423).json({ error: "Data legalitas & rekening sudah terkunci. Hubungi Miruum (back office) untuk perubahan." });
  }
  const schema = z.object({
    legalName: z.string().optional(), businessRegNo: z.string().optional(), taxId: z.string().optional(),
    payoutBankName: z.string().optional(), payoutBankAccount: z.string().optional(), payoutBankHolder: z.string().optional(),
    cancellationPolicy: z.enum(["FLEXIBLE", "MODERATE", "STRICT", "NON_REFUNDABLE"]).optional().or(z.literal("")),
    checkInInfo: z.string().optional(), checkOutInfo: z.string().optional(),
    unlock: z.any().optional(), // admin-only: clear the lock
  });
  const p = schema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Data tidak valid" });
  const data: any = { ...p.data };
  const unlock = data.unlock; delete data.unlock;
  if (data.cancellationPolicy === "") data.cancellationPolicy = null;
  if (isAdmin && (unlock === "1" || unlock === true || unlock === "on")) {
    data.legalLockedAt = null; // admin unlocks so the partner can edit again
  } else if (!existing?.legalLockedAt) {
    // first submission by the partner (or admin) — lock it
    const hasData = data.legalName || data.businessRegNo || data.taxId || data.payoutBankName || data.payoutBankAccount || data.payoutBankHolder;
    if (hasData && !isAdmin) data.legalLockedAt = new Date();
  }
  await prisma.hotel.update({ where: { id: req.params.id }, data });
  res.json({ ok: true, locked: !!(data.legalLockedAt ?? existing?.legalLockedAt) });
});

// Verify a hotel belongs to the partner (admins pass through).
async function ownsHotel(req: AuthRequest, hotelId: string): Promise<boolean> {
  if ((req as any).role === "ADMIN") return true;
  const h = await prisma.hotel.findFirst({ where: { id: hotelId, ownerId: req.userId }, select: { id: true } });
  return !!h;
}

async function ownsRoom(req: AuthRequest, roomId: string): Promise<boolean> {
  if ((req as any).role === "ADMIN") return true;
  const r = await prisma.room.findFirst({ where: { id: roomId, hotel: { ownerId: req.userId } }, select: { id: true } });
  return !!r;
}

// ─────────── Partner Channel Manager (chanel.miruum.id) ───────────
// The hotel partner distributes its own inventory & rates host-to-host to every
// OTA connected to Miruum's Channel Manager. Scoped to the partner's hotels.
app.get("/api/partner/channel-manager", requireRole("PARTNER", "ADMIN"), async (req: AuthRequest, res) => {
  const admin = (req as any).role === "ADMIN";
  const hotelWhere: any = admin ? {} : { ownerId: req.userId, productChannelManager: true };
  const otaChannels = await prisma.supplyChannel.findMany({
    where: { type: "OTA", active: true }, orderBy: { sortOrder: "asc" },
    select: { id: true, code: true, name: true, color: true, commissionPct: true, connectorType: true },
  });
  const hotels = await prisma.hotel.findMany({
    where: hotelWhere,
    orderBy: { name: "asc" },
    select: {
      id: true, name: true, city: true,
      rooms: {
        orderBy: { price: "asc" },
        select: {
          id: true, name: true, price: true, stock: true,
          channelMaps: { select: { channelId: true, externalRoomId: true, enabled: true, lastPushedAt: true, pushStatus: true } },
          _count: { select: { availability: true } },
        },
      },
    },
  });

  // Per-OTA analytics scoped to this partner's hotels.
  const hotelIds = hotels.map((h) => h.id);
  const chById: Record<string, any> = Object.fromEntries(otaChannels.map((c) => [c.id, c]));
  const grouped = hotelIds.length
    ? await prisma.booking.groupBy({ by: ["channelId", "status"], where: { hotelId: { in: hotelIds } }, _count: { _all: true }, _sum: { totalPrice: true } })
    : [];
  const stat: Record<string, any> = {};
  for (const g of grouped) {
    const key = g.channelId ?? "direct";
    const ch = g.channelId ? chById[g.channelId] : null;
    const s = (stat[key] ??= { name: ch?.name ?? "Direct (Miruum)", color: ch?.color ?? "#8892a0", total: 0, revenue: 0, cancelled: 0 });
    s.total += g._count._all;
    if (g.status === "PAID" || g.status === "COMPLETED") s.revenue += g._sum.totalPrice ?? 0;
    if (g.status === "CANCELLED" || g.status === "REFUNDED") s.cancelled += g._count._all;
  }
  const channelStats = Object.values(stat).map((s: any) => ({ ...s, cancelRate: s.total ? Math.round((s.cancelled / s.total) * 1000) / 10 : 0 })).sort((a: any, b: any) => b.total - a.total);

  // Distribution health across this partner's mappings.
  const allMaps = hotels.flatMap((h) => h.rooms.flatMap((r) => r.channelMaps));
  const totalRooms = hotels.reduce((n, h) => n + h.rooms.length, 0);
  const summary = {
    hotels: hotels.length, rooms: totalRooms, otaConnected: otaChannels.length,
    mapped: allMaps.length, pushedOk: allMaps.filter((m) => (m.pushStatus || "").startsWith("OK")).length,
  };
  res.json({ hotels, otaChannels, channelStats, summary });
});

app.put("/api/partner/rooms/:roomId/channel-maps/:channelId", requireRole("PARTNER", "ADMIN"), async (req: AuthRequest, res) => {
  if (!(await ownsRoom(req, req.params.roomId))) return res.status(403).json({ error: "Bukan kamar Anda" });
  const schema = z.object({ externalRoomId: z.string().min(1), enabled: z.coerce.boolean().default(true) });
  const p = schema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "ID/kode kamar OTA wajib diisi" });
  const map = await prisma.roomChannelMap.upsert({
    where: { roomId_channelId: { roomId: req.params.roomId, channelId: req.params.channelId } },
    create: { roomId: req.params.roomId, channelId: req.params.channelId, externalRoomId: p.data.externalRoomId, enabled: p.data.enabled },
    update: { externalRoomId: p.data.externalRoomId, enabled: p.data.enabled },
  });
  res.json({ map });
});

app.delete("/api/partner/rooms/:roomId/channel-maps/:channelId", requireRole("PARTNER", "ADMIN"), async (req: AuthRequest, res) => {
  if (!(await ownsRoom(req, req.params.roomId))) return res.status(403).json({ error: "Bukan kamar Anda" });
  await prisma.roomChannelMap.deleteMany({ where: { roomId: req.params.roomId, channelId: req.params.channelId } });
  res.json({ ok: true });
});

// Distribute this partner's rate & availability to ALL connected OTAs (host-to-host).
app.post("/api/partner/distribution/push", requireRole("PARTNER", "ADMIN"), async (req: AuthRequest, res) => {
  const admin = (req as any).role === "ADMIN";
  const stats = await pushDistribution(prisma, admin ? undefined : req.userId);
  res.json({ ok: true, ...stats });
});

// ─────────── Partner earnings & payout claims (pencairan) ───────────
async function partnerEarnings(ownerId: string | undefined, adminAll: boolean) {
  const DIRECT_PCT = await getNum("directCommissionPct");
  const hotelWhere: any = adminAll ? { channel: { type: "DIRECT" } } : { ownerId, channel: { type: "DIRECT" } };
  const hotels = await prisma.hotel.findMany({ where: hotelWhere, select: { id: true, name: true } });
  const ids = hotels.map((h) => h.id);
  const empty = { hotels: [], total: { payout: 0, settled: 0, pending: 0, claimable: 0 }, platformPct: DIRECT_PCT };
  if (!ids.length) return empty;
  const [bookings, settle, claims] = await Promise.all([
    prisma.booking.findMany({ where: { hotelId: { in: ids }, status: { in: ["PAID", "COMPLETED"] } }, select: { hotelId: true, roomPrice: true } }),
    prisma.settlement.groupBy({ by: ["hotelId"], where: { hotelId: { in: ids } }, _sum: { amount: true } }),
    prisma.payoutClaim.groupBy({ by: ["hotelId"], where: { hotelId: { in: ids }, status: "PENDING" }, _sum: { amount: true } }),
  ]);
  const settledBy: Record<string, number> = Object.fromEntries(settle.map((s) => [s.hotelId, Number(s._sum.amount) ?? 0]));
  const pendingBy: Record<string, number> = Object.fromEntries(claims.map((c) => [c.hotelId, Number(c._sum.amount) ?? 0]));
  const map: Record<string, any> = {};
  for (const h of hotels) map[h.id] = { hotelId: h.id, name: h.name, gross: 0, payout: 0, bookings: 0 };
  for (const b of bookings) { const g = Number(b.roomPrice); const rev = Math.round((g * DIRECT_PCT) / 100); const m = map[b.hotelId]; m.gross += g; m.payout += g - rev; m.bookings += 1; }
  const rows = Object.values(map).map((m: any) => {
    const settled = settledBy[m.hotelId] ?? 0, pending = pendingBy[m.hotelId] ?? 0;
    return { ...m, settled, pending, claimable: Math.max(0, m.payout - settled - pending) };
  }).sort((a: any, b: any) => b.claimable - a.claimable);
  const total = rows.reduce((t: any, r: any) => ({ payout: t.payout + r.payout, settled: t.settled + r.settled, pending: t.pending + r.pending, claimable: t.claimable + r.claimable }), { payout: 0, settled: 0, pending: 0, claimable: 0 });
  return { hotels: rows, total, platformPct: DIRECT_PCT };
}

app.get("/api/partner/earnings", requireRole("PARTNER", "ADMIN"), async (req: AuthRequest, res) => {
  res.json(await partnerEarnings(req.userId, (req as any).role === "ADMIN"));
});

app.get("/api/partner/claims", requireRole("PARTNER", "ADMIN"), async (req: AuthRequest, res) => {
  const where: any = (req as any).role === "ADMIN" ? {} : { hotel: { ownerId: req.userId } };
  const claims = await prisma.payoutClaim.findMany({ where, orderBy: { createdAt: "desc" }, take: 100, include: { hotel: { select: { name: true } } } });
  res.json({ claims });
});

app.post("/api/partner/claims", requireRole("PARTNER", "ADMIN"), async (req: AuthRequest, res) => {
  const schema = z.object({ hotelId: z.string(), amount: z.coerce.number().int().positive(), bankName: z.string().optional(), bankAccount: z.string().optional(), accountHolder: z.string().optional(), note: z.string().optional() });
  const p = schema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Data klaim tidak valid" });
  if (!(await ownsHotel(req, p.data.hotelId))) return res.status(403).json({ error: "Bukan hotel Anda" });
  const earn = await partnerEarnings(req.userId, (req as any).role === "ADMIN");
  const row = earn.hotels.find((h: any) => h.hotelId === p.data.hotelId);
  if (!row || p.data.amount > row.claimable) return res.status(400).json({ error: `Jumlah melebihi saldo yang bisa dicairkan (maks ${rupiah(row ? row.claimable : 0)})` });
  const claim = await prisma.payoutClaim.create({ data: { ...p.data, bookingsCount: row.bookings } });
  const admins = await prisma.user.findMany({ where: { role: "ADMIN" }, select: { id: true } });
  for (const a of admins) await dispatch(prisma, { userId: a.id, title: "Pengajuan Pencairan (Klaim)", body: `${row.name} mengajukan pencairan ${rupiah(p.data.amount)}. Tinjau di Keuangan → Klaim.`, type: "info" });
  res.json({ claim });
});

app.get("/api/admin/claims", requireRole("ADMIN"), async (_req, res) => {
  const claims = await prisma.payoutClaim.findMany({ orderBy: [{ status: "asc" }, { createdAt: "desc" }], take: 200, include: { hotel: { select: { name: true, owner: { select: { name: true, email: true } } } } } });
  res.json({ claims });
});

app.post("/api/admin/claims/:id/pay", requireRole("ADMIN"), async (req, res) => {
  const claim = await prisma.payoutClaim.findUnique({ where: { id: req.params.id }, include: { hotel: { select: { name: true, owner: { select: { id: true, email: true } } } } } });
  if (!claim) return res.status(404).json({ error: "Klaim tidak ditemukan" });
  if (claim.status !== "PENDING") return res.status(400).json({ error: "Klaim sudah diproses" });
  await prisma.$transaction([
    prisma.settlement.create({ data: { hotelId: claim.hotelId, amount: claim.amount, bookingsCount: claim.bookingsCount, note: `Pencairan klaim ${claim.id}` } }),
    prisma.payoutClaim.update({ where: { id: claim.id }, data: { status: "PAID", paidAt: new Date() } }),
  ]);
  if (claim.hotel.owner) await dispatch(prisma, { userId: claim.hotel.owner.id, title: "Pencairan Disetujui", body: `Pencairan ${rupiah(Number(claim.amount))} untuk ${claim.hotel.name} telah dibayarkan.`, type: "success", email: claim.hotel.owner.email ?? undefined });
  audit(req, "claim.pay", "PayoutClaim", claim.id, { hotel: claim.hotel.name, amount: claim.amount });
  res.json({ ok: true });
});

app.post("/api/admin/claims/:id/reject", requireRole("ADMIN"), async (req, res) => {
  await prisma.payoutClaim.update({ where: { id: req.params.id }, data: { status: "REJECTED" } });
  audit(req, "claim.reject", "PayoutClaim", req.params.id);
  res.json({ ok: true });
});

// ─────────── PMS — Property Management System (pms.miruum.id) ───────────
// Front-office operations for the hotel: arrivals/departures/in-house, check-in
// & check-out, and housekeeping. Integrated: reservations from OTAs (via Channel
// Manager) & direct all land here; check-out frees inventory back to the channels.
async function ownsBooking(req: AuthRequest, bookingId: string): Promise<any> {
  const where: any = { id: bookingId };
  if ((req as any).role !== "ADMIN") where.hotel = { ownerId: req.userId };
  return prisma.booking.findFirst({ where, include: { room: true } });
}

app.get("/api/partner/pms", requireRole("PARTNER", "ADMIN"), async (req: AuthRequest, res) => {
  const admin = (req as any).role === "ADMIN";
  const hotelWhere: any = admin ? {} : { ownerId: req.userId, productPMS: true };
  const hotels = await prisma.hotel.findMany({ where: hotelWhere, select: { id: true, name: true } });
  const hotelIds = hotels.map((h) => h.id);

  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endToday = new Date(startToday.getTime() + 86400000);
  const active = { in: ["PENDING", "PAID", "COMPLETED"] as any };

  const rooms = await prisma.room.findMany({
    where: { hotelId: { in: hotelIds } },
    orderBy: [{ hotelId: "asc" }, { name: "asc" }],
    select: { id: true, name: true, housekeeping: true, hotel: { select: { name: true } },
      bookings: { where: { checkedInAt: { not: null }, checkedOutAt: null }, select: { id: true } } },
  });

  const reservations = await prisma.booking.findMany({
    where: { hotelId: { in: hotelIds }, status: active },
    orderBy: { checkIn: "asc" }, take: 100,
    select: { id: true, code: true, bookerName: true, guests: true, checkIn: true, checkOut: true, status: true,
      checkedInAt: true, checkedOutAt: true, channelId: true,
      hotel: { select: { name: true } }, room: { select: { name: true } },
      channel: { select: { name: true, type: true } } },
  });

  const [arrivals, departures, inhouse] = await Promise.all([
    prisma.booking.count({ where: { hotelId: { in: hotelIds }, status: active, checkIn: { gte: startToday, lt: endToday }, checkedInAt: null } }),
    prisma.booking.count({ where: { hotelId: { in: hotelIds }, checkedInAt: { not: null }, checkedOutAt: null, checkOut: { gte: startToday, lt: endToday } } }),
    prisma.booking.count({ where: { hotelId: { in: hotelIds }, checkedInAt: { not: null }, checkedOutAt: null } }),
  ]);

  const roomsOut = rooms.map((r) => ({ id: r.id, name: r.name, hotel: r.hotel.name, housekeeping: r.housekeeping, occupied: r.bookings.length > 0 }));
  const occupancyPct = rooms.length ? Math.round((roomsOut.filter((r) => r.occupied).length / rooms.length) * 100) : 0;
  const dirty = roomsOut.filter((r) => r.housekeeping !== "CLEAN").length;

  res.json({
    today: { arrivals, departures, inhouse, occupancyPct, dirty, rooms: rooms.length },
    rooms: roomsOut, reservations, hotels,
  });
});

// Generate numbered room units from each room type's stock (once).
async function ensureRoomUnits(hotelId: string) {
  const rooms = await prisma.room.findMany({ where: { hotelId }, select: { id: true, stock: true, _count: { select: { units: true } } } });
  for (let ri = 0; ri < rooms.length; ri++) {
    const r = rooms[ri];
    if (r._count.units > 0 || r.stock <= 0) continue;
    const floor = ri + 1;
    const data = Array.from({ length: r.stock }, (_, i) => ({ roomId: r.id, number: `${floor}${String(i + 1).padStart(2, "0")}` }));
    await prisma.roomUnit.createMany({ data });
  }
}

app.post("/api/partner/bookings/:id/checkin", requireRole("PARTNER", "ADMIN"), async (req: AuthRequest, res) => {
  const b = await ownsBooking(req, req.params.id);
  if (!b) return res.status(404).json({ error: "Reservasi tidak ditemukan" });
  if (b.checkedOutAt) return res.status(400).json({ error: "Tamu sudah check-out" });
  const roomUnitId = String(req.body?.roomUnitId || "") || null;
  if (roomUnitId) {
    const unit = await prisma.roomUnit.findFirst({ where: { id: roomUnitId, roomId: b.roomId } });
    if (!unit) return res.status(400).json({ error: "Nomor kamar tidak valid untuk tipe ini" });
  }
  await prisma.booking.update({ where: { id: b.id }, data: { checkedInAt: new Date(), ...(roomUnitId ? { roomUnitId } : {}) } });
  res.json({ ok: true });
});

app.post("/api/partner/bookings/:id/checkout", requireRole("PARTNER", "ADMIN"), async (req: AuthRequest, res) => {
  const b = await ownsBooking(req, req.params.id);
  if (!b) return res.status(404).json({ error: "Reservasi tidak ditemukan" });
  if (!b.checkedInAt) return res.status(400).json({ error: "Tamu belum check-in" });
  const ops: any[] = [
    prisma.booking.update({ where: { id: b.id }, data: { checkedOutAt: new Date(), status: "COMPLETED" } }),
    prisma.room.update({ where: { id: b.roomId }, data: { housekeeping: "DIRTY" } }),
  ];
  if (b.roomUnitId) ops.push(prisma.roomUnit.update({ where: { id: b.roomUnitId }, data: { status: "DIRTY" } }));
  await prisma.$transaction(ops);
  res.json({ ok: true });
});

app.post("/api/partner/rooms/:id/housekeeping", requireRole("PARTNER", "ADMIN"), async (req: AuthRequest, res) => {
  if (!(await ownsRoom(req, req.params.id))) return res.status(403).json({ error: "Bukan kamar Anda" });
  const status = String(req.body?.status || "").toUpperCase();
  if (!["CLEAN", "DIRTY", "INSPECT"].includes(status)) return res.status(400).json({ error: "Status housekeeping tidak valid" });
  await prisma.room.update({ where: { id: req.params.id }, data: { housekeeping: status } });
  res.json({ ok: true });
});

// ─────────── PMS: room-unit assignment ───────────
app.get("/api/partner/bookings/:id/room-units", requireRole("PARTNER", "ADMIN"), async (req: AuthRequest, res) => {
  const b = await ownsBooking(req, req.params.id);
  if (!b) return res.status(404).json({ error: "Reservasi tidak ditemukan" });
  await ensureRoomUnits(b.hotelId);
  const units = await prisma.roomUnit.findMany({ where: { roomId: b.roomId }, orderBy: { number: "asc" },
    include: { bookings: { where: { checkedInAt: { not: null }, checkedOutAt: null }, select: { id: true } } } });
  res.json({ units: units.map((u) => ({ id: u.id, number: u.number, status: u.status, occupied: u.bookings.some((x) => x.id !== b.id) && u.bookings.length > 0, assigned: u.id === b.roomUnitId })) });
});
app.post("/api/partner/room-units/:id/housekeeping", requireRole("PARTNER", "ADMIN"), async (req: AuthRequest, res) => {
  const unit = await prisma.roomUnit.findUnique({ where: { id: req.params.id }, include: { room: { select: { hotel: { select: { ownerId: true } } } } } });
  if (!unit) return res.status(404).json({ error: "Kamar tidak ditemukan" });
  if ((req as any).role !== "ADMIN" && unit.room.hotel.ownerId !== req.userId) return res.status(403).json({ error: "Bukan kamar Anda" });
  const status = String(req.body?.status || "").toUpperCase();
  if (!["CLEAN", "DIRTY", "INSPECT", "OOO"].includes(status)) return res.status(400).json({ error: "Status tidak valid" });
  await prisma.roomUnit.update({ where: { id: req.params.id }, data: { status } });
  res.json({ ok: true });
});

// ─────────── PMS: guest folio & billing ───────────
app.get("/api/partner/bookings/:id/folio", requireRole("PARTNER", "ADMIN"), async (req: AuthRequest, res) => {
  const b = await ownsBooking(req, req.params.id);
  if (!b) return res.status(404).json({ error: "Reservasi tidak ditemukan" });
  const full = await prisma.booking.findUnique({ where: { id: b.id }, include: { folioCharges: { orderBy: { createdAt: "asc" } }, room: { select: { name: true } }, roomUnit: { select: { number: true } } } });
  const extras = full!.folioCharges.reduce((s, c) => s + Number(c.amount) * c.qty, 0);
  res.json({
    booking: { code: full!.code, guest: full!.bookerName, room: full!.room.name, roomNumber: full!.roomUnit?.number ?? null, nights: full!.nights, status: full!.status },
    roomTotal: Number(full!.totalPrice), charges: full!.folioCharges, extras, grandTotal: Number(full!.totalPrice) + extras,
  });
});
app.post("/api/partner/bookings/:id/folio", requireRole("PARTNER", "ADMIN"), async (req: AuthRequest, res) => {
  const b = await ownsBooking(req, req.params.id);
  if (!b) return res.status(404).json({ error: "Reservasi tidak ditemukan" });
  const schema = z.object({ kind: z.enum(["ROOM", "MINIBAR", "FNB", "LAUNDRY", "SPA", "OTHER"]).default("OTHER"), description: z.string().min(1), amount: z.coerce.number().int(), qty: z.coerce.number().int().min(1).default(1) });
  const p = schema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Data charge tidak valid" });
  const charge = await prisma.folioCharge.create({ data: { bookingId: b.id, ...p.data } });
  res.json({ charge });
});
app.delete("/api/partner/folio/:id", requireRole("PARTNER", "ADMIN"), async (req: AuthRequest, res) => {
  const charge = await prisma.folioCharge.findUnique({ where: { id: req.params.id }, include: { booking: { select: { hotel: { select: { ownerId: true } } } } } });
  if (!charge) return res.status(404).json({ error: "Charge tidak ditemukan" });
  if ((req as any).role !== "ADMIN" && charge.booking.hotel.ownerId !== req.userId) return res.status(403).json({ error: "Bukan milik Anda" });
  await prisma.folioCharge.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});

// ─────────── PMS: night audit ───────────
app.post("/api/partner/pms/night-audit", requireRole("PARTNER", "ADMIN"), async (req: AuthRequest, res) => {
  const admin = (req as any).role === "ADMIN";
  const hotels = await prisma.hotel.findMany({ where: admin ? {} : { ownerId: req.userId, productPMS: true }, select: { id: true, rooms: { select: { stock: true } } } });
  const ids = hotels.map((h) => h.id);
  const totalRooms = hotels.reduce((s, h) => s + h.rooms.reduce((a, r) => a + r.stock, 0), 0);
  const startToday = new Date(); startToday.setHours(0, 0, 0, 0);
  const endToday = new Date(startToday.getTime() + 86400000);

  // 1) No-shows → cancel.
  const noShows = await prisma.booking.findMany({ where: { hotelId: { in: ids }, status: { in: ["PENDING", "PAID"] }, checkedInAt: null, checkIn: { lt: startToday } }, select: { id: true } });
  if (noShows.length) await prisma.booking.updateMany({ where: { id: { in: noShows.map((b) => b.id) } }, data: { noShow: true, status: "CANCELLED" } });

  // 2) Post today's room charge to the folio of each in-house PAY-AT-HOTEL guest
  //    (avoid double posting per business date).
  const inhouseBookings = await prisma.booking.findMany({
    where: { hotelId: { in: ids }, checkedInAt: { not: null }, checkedOutAt: null },
    select: { id: true, roomPrice: true, nights: true, status: true },
  });
  let posted = 0;
  for (const b of inhouseBookings) {
    if (b.status !== "PENDING") continue; // PAID reservations are already settled
    const nightly = Math.round(Number(b.roomPrice) / Math.max(1, b.nights));
    const already = await prisma.folioCharge.findFirst({ where: { bookingId: b.id, kind: "ROOM", createdAt: { gte: startToday, lt: endToday } } });
    if (already) continue;
    await prisma.folioCharge.create({ data: { bookingId: b.id, kind: "ROOM", description: `Room charge ${startToday.toISOString().split("T")[0]}`, amount: nightly, qty: 1 } });
    posted++;
  }

  // 3) Manager's D-report metrics.
  const occupiedRooms = inhouseBookings.reduce((s, b) => s + 1, 0);
  const occupancyPct = totalRooms ? Math.round((occupiedRooms / totalRooms) * 1000) / 10 : 0;
  const [overstays, arrivalsDone, revAgg, extraAgg] = await Promise.all([
    prisma.booking.count({ where: { hotelId: { in: ids }, checkedInAt: { not: null }, checkedOutAt: null, checkOut: { lt: startToday } } }),
    prisma.booking.count({ where: { hotelId: { in: ids }, checkedInAt: { gte: startToday, lt: endToday } } }),
    prisma.booking.aggregate({ where: { hotelId: { in: ids }, status: { in: ["PAID", "COMPLETED"] }, createdAt: { gte: startToday, lt: endToday } }, _sum: { roomPrice: true, totalPrice: true } }),
    prisma.folioCharge.aggregate({ where: { kind: { not: "ROOM" }, createdAt: { gte: startToday, lt: endToday }, booking: { hotelId: { in: ids } } }, _sum: { amount: true } }),
  ]);
  const roomRevenue = Number(revAgg._sum.roomPrice ?? 0);
  const extraRevenue = Number(extraAgg._sum.amount ?? 0);
  const totalRevenue = Number(revAgg._sum.totalPrice ?? 0) + extraRevenue;
  const adr = occupiedRooms ? Math.round(roomRevenue / occupiedRooms) : 0;
  const revpar = totalRooms ? Math.round(roomRevenue / totalRooms) : 0;
  const departures = await prisma.booking.count({ where: { hotelId: { in: ids }, checkedOutAt: { gte: startToday, lt: endToday } } });

  const log = await prisma.nightAuditLog.create({ data: {
    hotelId: admin ? null : ids[0], businessDate: startToday, rooms: totalRooms, occupiedRooms, occupancyPct,
    adr, revpar, arrivals: arrivalsDone, departures, inhouse: occupiedRooms, noShows: noShows.length, roomRevenue, extraRevenue, totalRevenue,
  } });
  audit(req, "pms.night-audit", "NightAudit", log.id, { noShows: noShows.length, posted });
  res.json({ ok: true, report: log, roomChargesPosted: posted, overstays });
});

// Past D-reports.
app.get("/api/partner/pms/reports", requireRole("PARTNER", "ADMIN"), async (req: AuthRequest, res) => {
  const admin = (req as any).role === "ADMIN";
  const hotels = admin ? [] : await prisma.hotel.findMany({ where: { ownerId: req.userId }, select: { id: true } });
  const reports = await prisma.nightAuditLog.findMany({
    where: admin ? {} : { hotelId: { in: hotels.map((h) => h.id) } },
    orderBy: { createdAt: "desc" }, take: 60,
  });
  res.json({ reports });
});

// ─────────── PMS: POS integration (restoran/spa → auto-charge folio by room) ───────────
const POS_OUTLETS = ["Restoran", "Bar", "Room Service", "Spa", "Laundry", "Minibar"];
app.get("/api/partner/pos/rooms", requireRole("PARTNER", "ADMIN"), async (req: AuthRequest, res) => {
  const admin = (req as any).role === "ADMIN";
  const where: any = { checkedInAt: { not: null }, checkedOutAt: null, roomUnitId: { not: null } };
  if (!admin) where.hotel = { ownerId: req.userId };
  const inhouse = await prisma.booking.findMany({ where, select: { id: true, bookerName: true, roomUnit: { select: { number: true } }, hotel: { select: { name: true } } } });
  res.json({ outlets: POS_OUTLETS, rooms: inhouse.map((b) => ({ bookingId: b.id, guest: b.bookerName, roomNumber: b.roomUnit?.number, hotel: b.hotel.name })) });
});
app.post("/api/partner/pos/charge", requireRole("PARTNER", "ADMIN"), async (req: AuthRequest, res) => {
  const schema = z.object({ bookingId: z.string(), outlet: z.string().min(1), description: z.string().min(1), amount: z.coerce.number().int().positive(), qty: z.coerce.number().int().min(1).default(1) });
  const p = schema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Data POS tidak valid" });
  const b = await ownsBooking(req, p.data.bookingId);
  if (!b || !b.checkedInAt || b.checkedOutAt) return res.status(400).json({ error: "Tamu tidak sedang menginap" });
  const kindByOutlet: Record<string, string> = { Restoran: "FNB", Bar: "FNB", "Room Service": "FNB", Spa: "SPA", Laundry: "LAUNDRY", Minibar: "MINIBAR" };
  const charge = await prisma.folioCharge.create({ data: { bookingId: b.id, kind: kindByOutlet[p.data.outlet] ?? "OTHER", description: `[${p.data.outlet}] ${p.data.description}`, amount: p.data.amount, qty: p.data.qty } });
  res.json({ charge });
});

// ─────────── PMS: maintenance / work orders ───────────
app.get("/api/partner/work-orders", requireRole("PARTNER", "ADMIN"), async (req: AuthRequest, res) => {
  const admin = (req as any).role === "ADMIN";
  const hotels = await prisma.hotel.findMany({ where: admin ? {} : { ownerId: req.userId }, select: { id: true, name: true } });
  const ids = hotels.map((h) => h.id);
  const orders = await prisma.workOrder.findMany({ where: { hotelId: { in: ids } }, orderBy: [{ status: "asc" }, { createdAt: "desc" }], take: 200 });
  res.json({ orders, hotels });
});
app.post("/api/partner/work-orders", requireRole("PARTNER", "ADMIN"), async (req: AuthRequest, res) => {
  const schema = z.object({ hotelId: z.string(), roomNumber: z.string().optional(), category: z.enum(["MAINTENANCE", "HOUSEKEEPING", "IT", "OTHER"]).default("MAINTENANCE"), title: z.string().min(2), description: z.string().default(""), priority: z.enum(["LOW", "MEDIUM", "HIGH"]).default("MEDIUM") });
  const p = schema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Data work order tidak valid" });
  if (!(await ownsHotel(req, p.data.hotelId))) return res.status(403).json({ error: "Bukan hotel Anda" });
  const order = await prisma.workOrder.create({ data: p.data });
  // Put the room out-of-order if a specific room is flagged.
  if (p.data.roomNumber) await prisma.roomUnit.updateMany({ where: { number: p.data.roomNumber, room: { hotelId: p.data.hotelId } }, data: { status: "OOO" } });
  res.json({ order });
});
app.put("/api/partner/work-orders/:id", requireRole("PARTNER", "ADMIN"), async (req: AuthRequest, res) => {
  const order = await prisma.workOrder.findUnique({ where: { id: req.params.id } });
  if (!order) return res.status(404).json({ error: "Tidak ditemukan" });
  if (!(await ownsHotel(req, order.hotelId))) return res.status(403).json({ error: "Bukan hotel Anda" });
  const status = String(req.body?.status || "").toUpperCase();
  if (!["OPEN", "IN_PROGRESS", "DONE"].includes(status)) return res.status(400).json({ error: "Status tidak valid" });
  const updated = await prisma.workOrder.update({ where: { id: order.id }, data: { status, resolvedAt: status === "DONE" ? new Date() : null } });
  // Free the room back to housekeeping when resolved.
  if (status === "DONE" && order.roomNumber) await prisma.roomUnit.updateMany({ where: { number: order.roomNumber, room: { hotelId: order.hotelId }, status: "OOO" }, data: { status: "DIRTY" } });
  res.json({ order: updated });
});

// ─────────── PMS: guest profiles / history ───────────
app.get("/api/partner/guests", requireRole("PARTNER", "ADMIN"), async (req: AuthRequest, res) => {
  const admin = (req as any).role === "ADMIN";
  const hotels = await prisma.hotel.findMany({ where: admin ? {} : { ownerId: req.userId }, select: { id: true } });
  const ids = hotels.map((h) => h.id);
  const bookings = await prisma.booking.findMany({ where: { hotelId: { in: ids } }, select: { bookerName: true, bookerEmail: true, bookerPhone: true, totalPrice: true, nights: true, status: true, checkIn: true } });
  const map: Record<string, any> = {};
  for (const b of bookings) {
    const key = (b.bookerEmail || b.bookerName || "").toLowerCase();
    if (!key) continue;
    const g = (map[key] ??= { name: b.bookerName, email: b.bookerEmail, phone: b.bookerPhone, stays: 0, nights: 0, spend: 0, lastStay: null as any });
    g.stays++; g.nights += b.nights;
    if (b.status === "PAID" || b.status === "COMPLETED") g.spend += b.totalPrice;
    if (!g.lastStay || b.checkIn > g.lastStay) g.lastStay = b.checkIn;
  }
  res.json({ guests: Object.values(map).sort((a: any, b: any) => b.spend - a.spend) });
});
app.get("/api/partner/guests/:email", requireRole("PARTNER", "ADMIN"), async (req: AuthRequest, res) => {
  const admin = (req as any).role === "ADMIN";
  const email = decodeURIComponent(req.params.email);
  const hotels = await prisma.hotel.findMany({ where: admin ? {} : { ownerId: req.userId }, select: { id: true } });
  const ids = hotels.map((h) => h.id);
  const bookings = await prisma.booking.findMany({ where: { hotelId: { in: ids }, bookerEmail: { equals: email, mode: "insensitive" } }, orderBy: { checkIn: "desc" }, include: { hotel: { select: { name: true } }, room: { select: { name: true } } } });
  const note = ids.length ? await prisma.guestNote.findFirst({ where: { hotelId: { in: ids }, email: { equals: email, mode: "insensitive" } } }) : null;
  res.json({ email, bookings, note });
});
app.put("/api/partner/guests/:email/note", requireRole("PARTNER", "ADMIN"), async (req: AuthRequest, res) => {
  const email = decodeURIComponent(req.params.email);
  const hotels = await prisma.hotel.findMany({ where: (req as any).role === "ADMIN" ? {} : { ownerId: req.userId }, select: { id: true } });
  if (!hotels.length) return res.status(403).json({ error: "Tidak ada properti" });
  const hotelId = hotels[0].id;
  const note = await prisma.guestNote.upsert({
    where: { hotelId_email: { hotelId, email } },
    create: { hotelId, email, note: String(req.body?.note ?? ""), preferences: String(req.body?.preferences ?? "") },
    update: { note: String(req.body?.note ?? ""), preferences: String(req.body?.preferences ?? "") },
  });
  res.json({ note });
});

// ─────────── Promo & Campaign PROGRAMS (Miruum → hotels opt-in) ───────────
// Admin creates a program → auto-invites every hotel + notifies each partner
// (in-app + email). Hotels opt in via the Extranet/Channel Manager.
app.get("/api/admin/programs", requireRole("ADMIN"), async (_req, res) => {
  const programs = await prisma.promoProgram.findMany({
    orderBy: { createdAt: "desc" },
    include: { participations: { select: { status: true } } },
  });
  const out = programs.map((p) => {
    const joined = p.participations.filter((x) => x.status === "JOINED").length;
    const declined = p.participations.filter((x) => x.status === "DECLINED").length;
    return { ...p, participations: undefined, invited: p.participations.length, joined, declined };
  });
  res.json({ programs: out });
});

app.get("/api/admin/programs/:id", requireRole("ADMIN"), async (req, res) => {
  const program = await prisma.promoProgram.findUnique({
    where: { id: req.params.id },
    include: { participations: { include: { hotel: { select: { name: true, city: true, owner: { select: { name: true } } } } }, orderBy: { status: "asc" } } },
  });
  if (!program) return res.status(404).json({ error: "Program tidak ditemukan" });
  res.json({ program });
});

app.post("/api/admin/programs", requireRole("ADMIN"), async (req, res) => {
  const schema = z.object({
    type: z.enum(["PROMO", "CAMPAIGN"]).default("PROMO"),
    title: z.string().min(1), description: z.string().min(1),
    discountPct: z.coerce.number().int().min(0).max(90).default(0),
    imageUrl: z.string().optional(), terms: z.string().optional(),
    startDate: z.string().optional(), endDate: z.string().optional(),
  });
  const p = schema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Data program tidak valid" });
  const program = await prisma.promoProgram.create({
    data: {
      type: p.data.type, title: p.data.title, description: p.data.description, discountPct: p.data.discountPct,
      imageUrl: p.data.imageUrl || null, terms: p.data.terms || null,
      startDate: p.data.startDate ? new Date(p.data.startDate) : null,
      endDate: p.data.endDate ? new Date(p.data.endDate) : null,
    },
  });
  // Broadcast: invite every hotel + notify its partner owner.
  const hotels = await prisma.hotel.findMany({ select: { id: true, name: true, owner: { select: { id: true, email: true } } } });
  if (hotels.length) {
    await prisma.promoParticipation.createMany({
      data: hotels.map((h) => ({ programId: program.id, hotelId: h.id })), skipDuplicates: true,
    });
    const kind = p.data.type === "CAMPAIGN" ? "Campaign" : "Promo";
    for (const h of hotels) {
      if (!h.owner) continue;
      await dispatch(prisma, {
        userId: h.owner.id,
        title: `Undangan ${kind}: ${program.title}`,
        body: `Miruum mengundang ${h.name} untuk ikut ${kind.toLowerCase()} "${program.title}"${program.discountPct ? ` (disarankan diskon ${program.discountPct}%)` : ""}. Buka Channel Manager / Extranet untuk ikut serta.`,
        type: "info", hotelName: h.name, email: h.owner.email ?? undefined,
      });
    }
  }
  res.json({ program, invited: hotels.length });
});

app.patch("/api/admin/programs/:id", requireRole("ADMIN"), async (req, res) => {
  const data: any = {};
  if (typeof req.body.active !== "undefined") data.active = req.body.active === true || req.body.active === "true" || req.body.active === "on";
  const program = await prisma.promoProgram.update({ where: { id: req.params.id }, data });
  res.json({ program });
});

app.delete("/api/admin/programs/:id", requireRole("ADMIN"), async (req, res) => {
  await prisma.promoProgram.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});

// Partner: my program invitations + join/decline.
app.get("/api/partner/programs", requireRole("PARTNER", "ADMIN"), async (req: AuthRequest, res) => {
  const admin = (req as any).role === "ADMIN";
  const where: any = admin ? {} : { hotel: { ownerId: req.userId } };
  const parts = await prisma.promoParticipation.findMany({
    where,
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    include: { program: true, hotel: { select: { id: true, name: true, city: true } } },
  });
  res.json({ participations: parts });
});

app.post("/api/partner/programs/:id/join", requireRole("PARTNER", "ADMIN"), async (req: AuthRequest, res) => {
  const part = await prisma.promoParticipation.findFirst({
    where: { id: req.params.id, ...((req as any).role === "ADMIN" ? {} : { hotel: { ownerId: req.userId } }) },
    include: { program: true },
  });
  if (!part) return res.status(404).json({ error: "Undangan tidak ditemukan" });
  const offerPct = Math.max(0, Math.min(90, parseInt(req.body?.offerPct ?? part.program.discountPct ?? 0, 10) || 0));
  const updated = await prisma.promoParticipation.update({
    where: { id: part.id },
    data: { status: "JOINED", offerPct, note: (req.body?.note ?? "").toString().slice(0, 300), joinedAt: new Date() },
  });
  res.json({ participation: updated });
});

app.post("/api/partner/programs/:id/decline", requireRole("PARTNER", "ADMIN"), async (req: AuthRequest, res) => {
  const part = await prisma.promoParticipation.findFirst({
    where: { id: req.params.id, ...((req as any).role === "ADMIN" ? {} : { hotel: { ownerId: req.userId } }) },
  });
  if (!part) return res.status(404).json({ error: "Undangan tidak ditemukan" });
  await prisma.promoParticipation.update({ where: { id: part.id }, data: { status: "DECLINED" } });
  res.json({ ok: true });
});

// Public/mobile: active programs by type + participating (JOINED) hotels.
app.get("/api/programs", async (req, res) => {
  const type = String(req.query.type || "").toUpperCase();
  const where: any = { active: true };
  if (type === "PROMO" || type === "CAMPAIGN") where.type = type;
  const programs = await prisma.promoProgram.findMany({
    where, orderBy: { createdAt: "desc" },
    include: {
      participations: {
        where: { status: "JOINED" },
        include: { hotel: { select: hotelCard } },
      },
    },
  });
  const out = programs.map((p) => ({
    id: p.id, type: p.type, title: p.title, description: p.description, discountPct: p.discountPct,
    imageUrl: p.imageUrl, startDate: p.startDate, endDate: p.endDate, terms: p.terms,
    hotels: p.participations.map((x) => ({ ...x.hotel, offerPct: x.offerPct })),
  }));
  res.json({ programs: out });
});

const PHOTO_CATEGORIES = ["BUILDING", "LOBBY", "BEDROOM", "BATHROOM", "POOL", "RESTAURANT", "AMENITIES", "FACILITIES", "VIEW", "OTHER"];

// Partner: manage hotel photos. Accepts a single `url` or a bulk `urls` array,
// tagged with a `category` (Building/Bedroom/Bathroom/…) and optionally scoped to
// a specific `roomId` (per-room photos used when mapping rooms to a channel API).
app.post("/api/partner/hotels/:id/photos", requireRole("PARTNER", "ADMIN"), async (req: AuthRequest, res) => {
  if (!(await ownsHotel(req, req.params.id))) return res.status(403).json({ error: "Bukan hotel Anda" });
  const body = req.body || {};
  const urls: string[] = Array.isArray(body.urls) ? body.urls : (body.url ? [body.url] : []);
  const clean = urls.map((u) => String(u || "")).filter((u) => /^https?:\/\//.test(u));
  if (!clean.length) return res.status(400).json({ error: "URL foto tidak valid" });
  const category = PHOTO_CATEGORIES.includes(String(body.category)) ? String(body.category) : "OTHER";
  let roomId: string | null = body.roomId ? String(body.roomId) : null;
  if (roomId) {
    // the room must belong to this hotel
    const room = await prisma.room.findFirst({ where: { id: roomId, hotelId: req.params.id }, select: { id: true } });
    if (!room) roomId = null;
  }
  let count = await prisma.hotelPhoto.count({ where: { hotelId: req.params.id } });
  await prisma.hotelPhoto.createMany({
    data: clean.map((url) => ({ hotelId: req.params.id, url, category, roomId, sort: count++ })),
  });
  await invalidate("miruum:");
  res.json({ ok: true, added: clean.length });
});

// Partner: change the hotel cover / profile photo (imageUrl).
app.put("/api/partner/hotels/:id/cover", requireRole("PARTNER", "ADMIN"), async (req: AuthRequest, res) => {
  if (!(await ownsHotel(req, req.params.id))) return res.status(403).json({ error: "Bukan hotel Anda" });
  const url = String(req.body?.url ?? "");
  if (!/^https?:\/\//.test(url)) return res.status(400).json({ error: "URL foto tidak valid" });
  await prisma.hotel.update({ where: { id: req.params.id }, data: { imageUrl: url } });
  await invalidate("miruum:");
  res.json({ ok: true });
});

app.delete("/api/partner/photos/:photoId", requireRole("PARTNER", "ADMIN"), async (req: AuthRequest, res) => {
  const photo = await prisma.hotelPhoto.findUnique({ where: { id: req.params.photoId } });
  if (!photo) return res.status(404).json({ error: "Foto tidak ditemukan" });
  if (!(await ownsHotel(req, photo.hotelId))) return res.status(403).json({ error: "Bukan hotel Anda" });
  await prisma.hotelPhoto.delete({ where: { id: req.params.photoId } });
  await invalidate("miruum:");
  res.json({ ok: true });
});

// Partner: guest reviews for their hotels + reply.
app.get("/api/partner/reviews", requireRole("PARTNER", "ADMIN"), async (req: AuthRequest, res) => {
  const admin = (req as any).role === "ADMIN";
  const reviews = await prisma.review.findMany({
    where: admin ? {} : { hotel: { ownerId: req.userId } },
    orderBy: [{ reply: "asc" }, { createdAt: "desc" }],
    include: { hotel: { select: { name: true } } },
    take: 200,
  });
  res.json({ reviews });
});
app.post("/api/partner/reviews/:id/reply", requireRole("PARTNER", "ADMIN"), async (req: AuthRequest, res) => {
  const review = await prisma.review.findUnique({ where: { id: req.params.id }, include: { hotel: { select: { ownerId: true, name: true } } } });
  if (!review) return res.status(404).json({ error: "Ulasan tidak ditemukan" });
  if ((req as any).role !== "ADMIN" && review.hotel.ownerId !== req.userId) return res.status(403).json({ error: "Bukan hotel Anda" });
  const reply = String(req.body?.reply ?? "").trim();
  if (!reply) return res.status(400).json({ error: "Balasan tidak boleh kosong" });
  const updated = await prisma.review.update({ where: { id: review.id }, data: { reply: reply.slice(0, 800), repliedAt: new Date() } });
  await invalidate("miruum:");
  audit(req, "review.reply", "Review", review.id, { hotel: review.hotel.name });
  res.json({ review: updated });
});

// Partner: edit property content (description, check-in/out policy).
// Partner (Extranet): set the property's structured area + street address.
// Region is mandatory — every property must be findable by area search.
app.put("/api/partner/hotels/:id/location", requireRole("PARTNER", "ADMIN"), async (req: AuthRequest, res) => {
  if (!(await ownsHotel(req, req.params.id))) return res.status(403).json({ error: "Bukan hotel Anda" });
  const schema = z.object({
    regionId: z.string({ required_error: "Wilayah wajib dipilih" }).min(1, "Wilayah wajib dipilih"),
    address: z.string().min(2, "Alamat wajib diisi").max(300),
    city: z.string().max(120).optional(),
  });
  const p = schema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: p.error.issues[0]?.message || "Data lokasi tidak valid" });
  const region = await prisma.region.findUnique({ where: { id: p.data.regionId }, select: { id: true } });
  if (!region) return res.status(400).json({ error: "Wilayah tidak ditemukan" });
  const hotel = await prisma.hotel.update({
    where: { id: req.params.id },
    data: { regionId: p.data.regionId, address: p.data.address, ...(p.data.city ? { city: p.data.city } : {}) },
  });
  await invalidate("miruum:");
  audit(req, "hotel.location", "Hotel", hotel.id, { regionId: p.data.regionId });
  res.json({ hotel });
});

app.put("/api/partner/hotels/:id/content", requireRole("PARTNER", "ADMIN"), async (req: AuthRequest, res) => {
  if (!(await ownsHotel(req, req.params.id))) return res.status(403).json({ error: "Bukan hotel Anda" });
  const schema = z.object({
    description: z.string().max(4000).optional(),
    checkInInfo: z.string().max(200).optional(),
    checkOutInfo: z.string().max(200).optional(),
  });
  const p = schema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Data konten tidak valid" });
  const hotel = await prisma.hotel.update({ where: { id: req.params.id }, data: p.data });
  await invalidate("miruum:");
  audit(req, "hotel.content", "Hotel", hotel.id, { fields: Object.keys(p.data) });
  res.json({ hotel });
});

// Partner: set the facility list for their hotel.
app.put("/api/partner/hotels/:id/facilities", requireRole("PARTNER", "ADMIN"), async (req: AuthRequest, res) => {
  if (!(await ownsHotel(req, req.params.id))) return res.status(403).json({ error: "Bukan hotel Anda" });
  const ids: string[] = Array.isArray(req.body.facilityIds) ? req.body.facilityIds : (req.body.facilityIds ? [req.body.facilityIds] : []);
  await prisma.hotelFacility.deleteMany({ where: { hotelId: req.params.id } });
  if (ids.length) await prisma.hotelFacility.createMany({ data: ids.map((facilityId) => ({ hotelId: req.params.id, facilityId })), skipDuplicates: true });
  await invalidate("miruum:");
  res.json({ ok: true });
});

// ─────────── Guest ↔ Hotel messaging ───────────
async function getThread(userId: string, hotelId: string) {
  return prisma.hotelThread.upsert({
    where: { userId_hotelId: { userId, hotelId } },
    create: { userId, hotelId },
    update: {},
  });
}

// Guest: conversation with a hotel (creates the thread on first open).
app.get("/api/hotel-chat/:hotelId", requireAuth, async (req: AuthRequest, res) => {
  const hotel = await prisma.hotel.findUnique({ where: { id: req.params.hotelId }, select: { id: true, name: true } });
  if (!hotel) return res.status(404).json({ error: "Hotel tidak ditemukan" });
  const thread = await getThread(req.userId!, hotel.id);
  await prisma.hotelMessage.updateMany({ where: { threadId: thread.id, fromGuest: false, readByGuest: false }, data: { readByGuest: true } });
  const messages = await prisma.hotelMessage.findMany({ where: { threadId: thread.id }, orderBy: { createdAt: "asc" }, take: 200 });
  res.json({ hotel, messages });
});
app.post("/api/hotel-chat/:hotelId", requireAuth, async (req: AuthRequest, res) => {
  const body = String(req.body?.body ?? "").trim();
  if (!body) return res.status(400).json({ error: "Pesan kosong" });
  const thread = await getThread(req.userId!, req.params.hotelId);
  const h = await prisma.hotel.findUnique({ where: { id: req.params.hotelId }, select: { name: true, owner: { select: { id: true } } } });

  // Moderation: block sharing of contact details / off-system transactions.
  const verdict = screenChat(body);
  if (verdict.flagged) {
    const msg = await prisma.hotelMessage.create({ data: {
      threadId: thread.id, fromGuest: true, body: violationNotice(verdict.reason!),
      flagged: true, violation: verdict.reason, readByGuest: true } });
    await prisma.hotelThread.update({ where: { id: thread.id }, data: { lastAt: new Date() } });
    audit(req, "chat.violation", "HotelThread", thread.id, { by: "guest", reason: verdict.reason });
    if (h?.owner) await dispatch(prisma, { userId: h.owner.id, title: `Pelanggaran chat — ${h.name}`, body: "Sebuah pesan tamu diblokir karena berbagi kontak / transaksi di luar sistem.", type: "info" });
    return res.json({ message: msg, flagged: true, reason: verdict.reason });
  }

  const msg = await prisma.hotelMessage.create({ data: { threadId: thread.id, fromGuest: true, body: body.slice(0, 1000), readByGuest: true } });
  await prisma.hotelThread.update({ where: { id: thread.id }, data: { lastAt: new Date() } });
  // Notify the hotel owner.
  if (h?.owner) await dispatch(prisma, { userId: h.owner.id, title: `Pesan tamu — ${h.name}`, body: body.slice(0, 120), type: "info" });
  res.json({ message: msg });
});

// Partner: message inbox (threads across the partner's hotels) + a thread + reply.
app.get("/api/partner/messages", requireRole("PARTNER", "ADMIN"), async (req: AuthRequest, res) => {
  const admin = (req as any).role === "ADMIN";
  const threads = await prisma.hotelThread.findMany({
    where: admin ? {} : { hotel: { ownerId: req.userId } },
    orderBy: { lastAt: "desc" }, take: 100,
    include: {
      hotel: { select: { name: true } }, user: { select: { name: true } },
      messages: { orderBy: { createdAt: "desc" }, take: 1 },
      _count: { select: { messages: { where: { fromGuest: true, readByHotel: false } } } },
    },
  });
  res.json({ threads: threads.map((t) => ({ id: t.id, hotel: t.hotel.name, guest: t.user.name, lastAt: t.lastAt, last: t.messages[0]?.body ?? "", unread: t._count.messages })) });
});
app.get("/api/partner/messages/:threadId", requireRole("PARTNER", "ADMIN"), async (req: AuthRequest, res) => {
  const admin = (req as any).role === "ADMIN";
  const thread = await prisma.hotelThread.findFirst({ where: { id: req.params.threadId, ...(admin ? {} : { hotel: { ownerId: req.userId } }) }, include: { hotel: { select: { name: true } }, user: { select: { name: true } } } });
  if (!thread) return res.status(404).json({ error: "Percakapan tidak ditemukan" });
  await prisma.hotelMessage.updateMany({ where: { threadId: thread.id, fromGuest: true, readByHotel: false }, data: { readByHotel: true } });
  const messages = await prisma.hotelMessage.findMany({ where: { threadId: thread.id }, orderBy: { createdAt: "asc" }, take: 200 });
  res.json({ thread: { id: thread.id, hotel: thread.hotel.name, guest: thread.user.name }, messages });
});
app.post("/api/partner/messages/:threadId", requireRole("PARTNER", "ADMIN"), async (req: AuthRequest, res) => {
  const admin = (req as any).role === "ADMIN";
  const thread = await prisma.hotelThread.findFirst({ where: { id: req.params.threadId, ...(admin ? {} : { hotel: { ownerId: req.userId } }) } });
  if (!thread) return res.status(404).json({ error: "Percakapan tidak ditemukan" });
  const body = String(req.body?.reply ?? req.body?.body ?? "").trim();
  if (!body) return res.status(400).json({ error: "Balasan kosong" });

  // Moderation applies to the hotel side too.
  const verdict = screenChat(body);
  if (verdict.flagged) {
    const msg = await prisma.hotelMessage.create({ data: {
      threadId: thread.id, fromGuest: false, body: violationNotice(verdict.reason!),
      flagged: true, violation: verdict.reason, readByHotel: true } });
    await prisma.hotelThread.update({ where: { id: thread.id }, data: { lastAt: new Date() } });
    audit(req, "chat.violation", "HotelThread", thread.id, { by: "hotel", reason: verdict.reason });
    await dispatch(prisma, { userId: thread.userId, title: "Pelanggaran chat", body: "Sebuah pesan dari hotel diblokir karena berbagi kontak / transaksi di luar sistem.", type: "info" });
    return res.json({ message: msg, flagged: true, reason: verdict.reason });
  }

  const msg = await prisma.hotelMessage.create({ data: { threadId: thread.id, fromGuest: false, body: body.slice(0, 1000), readByHotel: true } });
  await prisma.hotelThread.update({ where: { id: thread.id }, data: { lastAt: new Date() } });
  await dispatch(prisma, { userId: thread.userId, title: "Balasan dari Hotel", body: body.slice(0, 120), type: "info" });
  res.json({ message: msg });
});

// Partner performance report — revenue trend, occupancy proxy, per-channel.
app.get("/api/partner/report", requireRole("PARTNER", "ADMIN"), async (req: AuthRequest, res) => {
  const admin = (req as any).role === "ADMIN";
  const hotels = await prisma.hotel.findMany({ where: admin ? {} : { ownerId: req.userId }, select: { id: true, name: true } });
  const ids = hotels.map((h) => h.id);
  if (!ids.length) return res.json({ months: [], channels: [], totals: { revenue: 0, bookings: 0, nights: 0, cancelRate: 0 }, roomNights: 0 });
  const since = new Date(); since.setMonth(since.getMonth() - 5); since.setDate(1);
  const bookings = await prisma.booking.findMany({
    where: { hotelId: { in: ids }, createdAt: { gte: since } },
    select: { totalPrice: true, roomPrice: true, nights: true, rooms: true, status: true, createdAt: true, channelId: true },
  });
  const paid = (b: any) => b.status === "PAID" || b.status === "COMPLETED";
  const key = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  const monthMap: Record<string, { revenue: number; bookings: number }> = {};
  for (let i = 5; i >= 0; i--) { const d = new Date(); d.setMonth(d.getMonth() - i); d.setDate(1); monthMap[key(d)] = { revenue: 0, bookings: 0 }; }
  const chans = await prisma.supplyChannel.findMany({ select: { id: true, name: true, color: true } });
  const chById: Record<string, any> = Object.fromEntries(chans.map((c) => [c.id, c]));
  const chanMap: Record<string, { name: string; color: string; bookings: number; revenue: number }> = {};
  let revenue = 0, nights = 0, cancelled = 0;
  for (const b of bookings) {
    const mk = key(new Date(b.createdAt));
    if (monthMap[mk]) { monthMap[mk].bookings++; if (paid(b)) monthMap[mk].revenue += Number(b.totalPrice); }
    if (paid(b)) { revenue += Number(b.totalPrice); nights += b.nights * b.rooms; }
    if (b.status === "CANCELLED" || b.status === "REFUNDED") cancelled++;
    const ck = b.channelId ?? "direct";
    const c = b.channelId ? chById[b.channelId] : null;
    const cm = (chanMap[ck] ??= { name: c?.name ?? "Direct (Miruum)", color: c?.color ?? "#8892a0", bookings: 0, revenue: 0 });
    cm.bookings++; if (paid(b)) cm.revenue += Number(b.totalPrice);
  }
  res.json({
    months: Object.entries(monthMap).map(([m, v]) => ({ month: m, ...v })),
    channels: Object.values(chanMap).sort((a, b) => b.revenue - a.revenue),
    totals: { revenue, bookings: bookings.length, nights, cancelRate: bookings.length ? Math.round((cancelled / bookings.length) * 1000) / 10 : 0 },
    hotels: hotels.length,
  });
});

// Partner: toggle hotel promo (isPromo + label).
app.put("/api/partner/hotels/:id/promo", requireRole("PARTNER", "ADMIN"), async (req: AuthRequest, res) => {
  if (!(await ownsHotel(req, req.params.id))) return res.status(403).json({ error: "Bukan hotel Anda" });
  const isPromo = req.body?.isPromo === "on" || req.body?.isPromo === true || req.body?.isPromo === "true";
  const promoLabel = String(req.body?.promoLabel ?? "").trim() || null;
  const hotel = await prisma.hotel.update({ where: { id: req.params.id }, data: { isPromo, promoLabel } });
  await invalidate("miruum:");
  res.json({ hotel });
});

app.get("/api/partner/bookings", requireRole("PARTNER", "ADMIN"), async (req: AuthRequest, res) => {
  const hotels = await prisma.hotel.findMany({ where: { ownerId: req.userId }, select: { id: true } });
  const bookings = await prisma.booking.findMany({
    where: { hotelId: { in: hotels.map((h) => h.id) } },
    orderBy: { createdAt: "desc" }, take: 100,
    include: { hotel: { select: { name: true } }, user: { select: { name: true, email: true } }, room: { select: { name: true } } },
  });
  res.json({ bookings });
});

app.put("/api/partner/rooms/:id", requireRole("PARTNER", "ADMIN"), async (req: AuthRequest, res) => {
  const schema = z.object({
    price: z.coerce.number().int().optional(), stock: z.coerce.number().int().optional(),
    capacity: z.coerce.number().int().min(1).optional(), bedInfo: z.string().optional(),
    refundable: formBool.optional(), breakfast: formBool.optional(), freeCancellation: formBool.optional(),
  });
  const p = schema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Data kamar tidak valid" });
  const room = await prisma.room.findUnique({ where: { id: req.params.id }, include: { hotel: true } });
  if (!room) return res.status(404).json({ error: "Kamar tidak ditemukan" });
  if ((req as any).role !== "ADMIN" && room.hotel.ownerId !== req.userId) return res.status(403).json({ error: "Kamar bukan milik Anda" });
  const updated = await prisma.room.update({ where: { id: req.params.id }, data: p.data });
  if (p.data.price != null) await refreshPriceFrom(room.hotelId); // update headline price + harga-turun badge
  await invalidate("miruum:");
  audit(req, "room.update", "Room", updated.id, { hotel: room.hotel.name, ...p.data });
  res.json({ room: updated });
});

// Partner: add a NEW room type to a hotel. A hotel is only publicly discoverable
// once it has ≥1 room with price > 0 (PUBLIC_HOTEL_GATE), so this is what makes a
// freshly-onboarded property go live. refreshPriceFrom() sets the headline price.
app.post("/api/partner/hotels/:id/rooms", requireRole("PARTNER", "ADMIN"), async (req: AuthRequest, res) => {
  if (!(await ownsHotel(req, req.params.id))) return res.status(403).json({ error: "Bukan properti Anda" });
  const schema = z.object({
    name: z.string().min(1, "Nama kamar wajib diisi"),
    bedInfo: z.string().optional(),
    price: z.coerce.number().int().positive("Harga harus lebih dari 0"),
    stock: z.coerce.number().int().min(0).default(5),
    capacity: z.coerce.number().int().min(1).default(2),
    breakfast: formBool.optional(), refundable: formBool.optional(), freeCancellation: formBool.optional(),
  });
  const p = schema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: p.error.issues[0]?.message || "Data kamar tidak valid" });
  const room = await prisma.room.create({ data: {
    hotelId: req.params.id, name: p.data.name, price: p.data.price, stock: p.data.stock, capacity: p.data.capacity,
    ...(p.data.bedInfo && p.data.bedInfo.trim() ? { bedInfo: p.data.bedInfo.trim() } : {}),
    breakfast: p.data.breakfast ?? false,
    refundable: p.data.refundable ?? true,
    freeCancellation: p.data.freeCancellation ?? true,
  } });
  await refreshPriceFrom(req.params.id); // sets priceFrom so the hotel becomes bookable & shows in the app
  await invalidate("miruum:");
  audit(req, "room.create", "Room", room.id, { hotelId: req.params.id, name: room.name, price: room.price });
  res.json({ room });
});

// Partner: delete a room type (refused if it has bookings — history must stay intact).
app.delete("/api/partner/rooms/:id", requireRole("PARTNER", "ADMIN"), async (req: AuthRequest, res) => {
  if (!(await ownsRoom(req, req.params.id))) return res.status(403).json({ error: "Kamar bukan milik Anda" });
  const room = await prisma.room.findUnique({ where: { id: req.params.id }, select: { hotelId: true, _count: { select: { bookings: true } } } });
  if (!room) return res.status(404).json({ error: "Kamar tidak ditemukan" });
  if (room._count.bookings > 0) return res.status(409).json({ error: "Kamar tidak bisa dihapus karena sudah punya pesanan. Set stok 0 untuk menutup penjualan." });
  await prisma.room.delete({ where: { id: req.params.id } });
  await refreshPriceFrom(room.hotelId);
  await invalidate("miruum:");
  audit(req, "room.delete", "Room", req.params.id, { hotelId: room.hotelId });
  res.json({ ok: true });
});

// Partner deal (buat promo sendiri): a % off a room. Uses originalPrice as the
// baseline so the discount shows as a strikethrough in the app + booking pays less.
app.put("/api/partner/rooms/:id/deal", requireRole("PARTNER", "ADMIN"), async (req: AuthRequest, res) => {
  const dealPct = Math.max(0, Math.min(90, Number(req.body?.dealPct) || 0));
  const room = await prisma.room.findUnique({ where: { id: req.params.id }, include: { hotel: true } });
  if (!room) return res.status(404).json({ error: "Kamar tidak ditemukan" });
  if ((req as any).role !== "ADMIN" && room.hotel.ownerId !== req.userId) return res.status(403).json({ error: "Kamar bukan milik Anda" });
  const baseline = room.originalPrice ?? room.price;
  const data = dealPct > 0
    ? { originalPrice: baseline, price: Math.round(baseline * (1 - dealPct / 100)) }
    : { price: baseline, originalPrice: null };
  const updated = await prisma.room.update({ where: { id: req.params.id }, data });
  await invalidate("miruum:");
  audit(req, "room.deal", "Room", updated.id, { hotel: room.hotel.name, dealPct });
  res.json({ room: updated });
});

app.put("/api/partner/bookings/:id/status", requireRole("PARTNER", "ADMIN"), async (req: AuthRequest, res) => {
  const status = String(req.body?.status ?? "");
  if (!["COMPLETED", "CANCELLED"].includes(status)) return res.status(400).json({ error: "Status tidak valid" });
  const booking = await prisma.booking.findUnique({ where: { id: req.params.id }, include: { hotel: true } });
  if (!booking || booking.hotel.ownerId !== req.userId) return res.status(403).json({ error: "Pesanan bukan milik Anda" });
  const updated = await prisma.booking.update({ where: { id: req.params.id }, data: { status: status as any } });
  res.json({ booking: updated });
});

// Central error handler — logs (pino) + reports (Sentry when configured) and
// returns a clean 500 instead of leaking a stack or crashing the process.
const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  (req as any).log?.error({ err }, "unhandled error");
  if (process.env.SENTRY_DSN) Sentry.captureException(err);
  if (res.headersSent) return;
  res.status(500).json({ error: "Terjadi kesalahan pada server." });
};
app.use(errorHandler);

// Never let an unhandled rejection/exception silently take the process down.
process.on("unhandledRejection", (reason) => { logger.error({ reason }, "unhandledRejection"); if (process.env.SENTRY_DSN) Sentry.captureException(reason); });
process.on("uncaughtException", (err) => { logger.error({ err }, "uncaughtException"); if (process.env.SENTRY_DSN) Sentry.captureException(err); });

// ═══════════════════════ EXTRANET FINANCE SUITE ═══════════════════════
// 1) Promo & Campaign self-registration  2) Advance Deposit Program
// 3) Perhitungan Invoice (monthly)       4) (analytics upgrade below)

const periodKey = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
function periodBounds(period: string) {
  const [y, m] = period.split("-").map(Number);
  return { start: new Date(Date.UTC(y, m - 1, 1)), end: new Date(Date.UTC(y, m, 1)) };
}

// Apply a hotel-wide campaign discount across every room (reuses the deal
// mechanism: originalPrice = baseline, price = discounted).
async function applyCampaignDiscount(hotelId: string, pct: number) {
  const rooms = await prisma.room.findMany({ where: { hotelId }, select: { id: true, price: true, originalPrice: true } });
  for (const r of rooms) {
    const baseline = r.originalPrice ?? r.price;
    await prisma.room.update({ where: { id: r.id }, data: { originalPrice: baseline, price: Math.round(baseline * (1 - pct / 100)) } });
  }
  await refreshPriceFrom(hotelId);
  await invalidate("miruum:");
}
async function revertCampaignDiscount(hotelId: string) {
  const rooms = await prisma.room.findMany({ where: { hotelId, originalPrice: { not: null } }, select: { id: true, originalPrice: true } });
  for (const r of rooms) await prisma.room.update({ where: { id: r.id }, data: { price: r.originalPrice!, originalPrice: null } });
  await refreshPriceFrom(hotelId);
  await invalidate("miruum:");
}

// Activate due campaigns / revert expired ones (called on approve + hourly).
async function sweepCampaigns() {
  const now = new Date();
  const toApply = await prisma.hotelCampaign.findMany({ where: { status: "APPROVED", applied: false, startDate: { lte: now }, endDate: { gte: now } } });
  for (const c of toApply) {
    await applyCampaignDiscount(c.hotelId, c.discountPct);
    await prisma.hotel.update({ where: { id: c.hotelId }, data: { isPromo: true, promoLabel: c.name } });
    await prisma.hotelCampaign.update({ where: { id: c.id }, data: { applied: true } });
  }
  const toRevert = await prisma.hotelCampaign.findMany({ where: { applied: true, OR: [{ endDate: { lt: now } }, { status: { not: "APPROVED" } }] } });
  for (const c of toRevert) {
    await revertCampaignDiscount(c.hotelId);
    await prisma.hotel.update({ where: { id: c.hotelId }, data: { isPromo: false, promoLabel: null } });
    await prisma.hotelCampaign.update({ where: { id: c.id }, data: { applied: false } });
  }
  return { applied: toApply.length, reverted: toRevert.length };
}

// ── Advance Deposit ledger helpers ──
async function creditDeposit(hotelId: string, amount: number, kind: string, note?: string) {
  const amt = BigInt(Math.round(amount));
  await prisma.$transaction([
    prisma.depositTxn.create({ data: { hotelId, kind, amount: amt, status: "CONFIRMED", note, confirmedAt: new Date() } }),
    prisma.hotel.update({ where: { id: hotelId }, data: { depositBalance: { increment: amt } } }),
  ]);
}
async function debitDeposit(hotelId: string, amount: number, kind: string, note?: string, period?: string): Promise<number> {
  const h = await prisma.hotel.findUnique({ where: { id: hotelId }, select: { depositBalance: true } });
  const bal = Number(h?.depositBalance ?? 0);
  const deb = Math.min(bal, Math.round(amount));
  if (deb <= 0) return 0;
  await prisma.$transaction([
    prisma.depositTxn.create({ data: { hotelId, kind, amount: BigInt(-deb), status: "CONFIRMED", note, period, confirmedAt: new Date() } }),
    prisma.hotel.update({ where: { id: hotelId }, data: { depositBalance: { decrement: BigInt(deb) } } }),
  ]);
  return deb;
}

// Generate/refresh monthly invoices for every hotel, by check-out month.
async function generateInvoicesForPeriod(period: string) {
  const { start, end } = periodBounds(period);
  const DIRECT_PCT = await getNum("directCommissionPct");
  const bookings = await prisma.booking.findMany({
    where: { status: { in: ["PAID", "COMPLETED"] }, checkOut: { gte: start, lt: end } },
    select: { hotelId: true, roomPrice: true, payAtHotel: true, channel: { select: { type: true } } },
  });
  const agg: Record<string, { commission: number; payout: number; count: number }> = {};
  for (const b of bookings) {
    const isDirect = !b.channel || b.channel.type === "DIRECT";
    if (!isDirect) continue; // OTA sub-agent settlements are handled by the OTA, not invoiced here
    const gross = Number(b.roomPrice);
    const commission = Math.round((gross * DIRECT_PCT) / 100);
    const a = (agg[b.hotelId] ??= { commission: 0, payout: 0, count: 0 });
    a.count++;
    if (b.payAtHotel) a.commission += commission;      // hotel collected cash → owes Miruum (hutang)
    else a.payout += gross - commission;               // Miruum collected → owes hotel net (piutang)
  }
  const dueDate = new Date(end); dueDate.setDate(dueDate.getDate() + 15);
  let n = 0;
  for (const [hotelId, a] of Object.entries(agg)) {
    const existing = await prisma.hotelInvoice.findUnique({ where: { hotelId_period: { hotelId, period } } });
    let offset = existing ? Number(existing.offsetFromDeposit) : 0;
    if (!existing && a.commission > 0) offset = await debitDeposit(hotelId, a.commission, "COMMISSION", `Auto-offset invoice ${period}`, period);
    const status = a.commission > 0 && offset >= a.commission ? "OFFSET" : "OPEN";
    await prisma.hotelInvoice.upsert({
      where: { hotelId_period: { hotelId, period } },
      create: { hotelId, period, commissionOwed: BigInt(a.commission), payoutOwed: BigInt(a.payout), bookingsCount: a.count, offsetFromDeposit: BigInt(offset), status, dueDate, paidAt: status === "OFFSET" ? new Date() : null },
      update: { commissionOwed: BigInt(a.commission), payoutOwed: BigInt(a.payout), bookingsCount: a.count, status, dueDate },
    });
    n++;
  }
  return { period, hotels: n, bookings: bookings.length };
}

// ── Partner: Promo & Campaign registration ──
app.get("/api/partner/campaigns", requireRole("PARTNER", "ADMIN"), async (req: AuthRequest, res) => {
  const admin = (req as any).role === "ADMIN";
  const hotels = await prisma.hotel.findMany({ where: admin ? {} : { ownerId: req.userId }, select: { id: true, name: true } });
  const campaigns = await prisma.hotelCampaign.findMany({ where: { hotelId: { in: hotels.map((h) => h.id) } }, orderBy: { createdAt: "desc" }, take: 100, include: { hotel: { select: { name: true } } } });
  res.json({ campaigns, hotels });
});
app.post("/api/partner/campaigns", requireRole("PARTNER", "ADMIN"), async (req: AuthRequest, res) => {
  const schema = z.object({ hotelId: z.string(), type: z.enum(["FLASH_SALE", "EARLY_BIRD", "LAST_MINUTE", "CUSTOM"]).default("FLASH_SALE"), name: z.string().min(2), discountPct: z.coerce.number().int().min(1).max(90), startDate: z.string(), endDate: z.string(), minNights: z.coerce.number().int().min(1).max(30).default(1) });
  const p = schema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Data campaign tidak valid" });
  if (!(await ownsHotel(req, p.data.hotelId))) return res.status(403).json({ error: "Bukan hotel Anda" });
  const start = new Date(p.data.startDate), endD = new Date(p.data.endDate);
  if (isNaN(+start) || isNaN(+endD) || endD <= start) return res.status(400).json({ error: "Periode campaign tidak valid" });
  const c = await prisma.hotelCampaign.create({ data: { hotelId: p.data.hotelId, type: p.data.type, name: p.data.name.slice(0, 80), discountPct: p.data.discountPct, startDate: start, endDate: endD, minNights: p.data.minNights } });
  const admins = await prisma.user.findMany({ where: { role: "ADMIN" }, select: { id: true } });
  const hotel = await prisma.hotel.findUnique({ where: { id: c.hotelId }, select: { name: true } });
  for (const a of admins) await dispatch(prisma, { userId: a.id, title: "Pendaftaran Campaign Baru", body: `${hotel?.name} mendaftarkan "${c.name}" (${c.discountPct}%). Tinjau di Pemasaran → Campaign Hotel.`, type: "info" });
  res.json({ campaign: c });
});
app.post("/api/partner/campaigns/:id/cancel", requireRole("PARTNER", "ADMIN"), async (req: AuthRequest, res) => {
  const admin = (req as any).role === "ADMIN";
  const c = await prisma.hotelCampaign.findFirst({ where: { id: req.params.id, ...(admin ? {} : { hotel: { ownerId: req.userId } }) } });
  if (!c) return res.status(404).json({ error: "Campaign tidak ditemukan" });
  await prisma.hotelCampaign.update({ where: { id: c.id }, data: { status: "REJECTED" } });
  await sweepCampaigns();
  res.json({ ok: true });
});

// ── Admin: campaign approval ──
app.get("/api/admin/campaigns", requireRole("ADMIN"), async (_req, res) => {
  const campaigns = await prisma.hotelCampaign.findMany({ orderBy: [{ status: "asc" }, { createdAt: "desc" }], take: 200, include: { hotel: { select: { name: true, owner: { select: { name: true } } } } } });
  res.json({ campaigns });
});
app.post("/api/admin/campaigns/:id/approve", requireRole("ADMIN"), async (req, res) => {
  const c = await prisma.hotelCampaign.findUnique({ where: { id: req.params.id }, include: { hotel: { select: { name: true, ownerId: true } } } });
  if (!c) return res.status(404).json({ error: "Campaign tidak ditemukan" });
  await prisma.hotelCampaign.update({ where: { id: c.id }, data: { status: "APPROVED" } });
  const sw = await sweepCampaigns();
  if (c.hotel.ownerId) await dispatch(prisma, { userId: c.hotel.ownerId, title: "Campaign Disetujui", body: `Campaign "${c.name}" (${c.discountPct}%) untuk ${c.hotel.name} telah disetujui${sw.applied ? " & aktif sekarang" : ""}.`, type: "success" });
  audit(req, "campaign.approve", "HotelCampaign", c.id);
  res.json({ ok: true, ...sw });
});
app.post("/api/admin/campaigns/:id/reject", requireRole("ADMIN"), async (req, res) => {
  const c = await prisma.hotelCampaign.findUnique({ where: { id: req.params.id }, include: { hotel: { select: { name: true, ownerId: true } } } });
  if (!c) return res.status(404).json({ error: "Campaign tidak ditemukan" });
  await prisma.hotelCampaign.update({ where: { id: c.id }, data: { status: "REJECTED" } });
  await sweepCampaigns();
  if (c.hotel.ownerId) await dispatch(prisma, { userId: c.hotel.ownerId, title: "Campaign Ditolak", body: `Campaign "${c.name}" untuk ${c.hotel.name} ditolak.`, type: "cancel" });
  audit(req, "campaign.reject", "HotelCampaign", c.id);
  res.json({ ok: true });
});

// ── Partner: Advance Deposit Program ──
app.get("/api/partner/deposit", requireRole("PARTNER", "ADMIN"), async (req: AuthRequest, res) => {
  const admin = (req as any).role === "ADMIN";
  const hotels = await prisma.hotel.findMany({ where: admin ? {} : { ownerId: req.userId }, select: { id: true, name: true, depositBalance: true } });
  const ids = hotels.map((h) => h.id);
  const txns = await prisma.depositTxn.findMany({ where: { hotelId: { in: ids } }, orderBy: { createdAt: "desc" }, take: 100, include: { hotel: { select: { name: true } } } });
  const totalBalance = hotels.reduce((s, h) => s + Number(h.depositBalance), 0);
  res.json({ hotels, txns, totalBalance });
});
app.post("/api/partner/deposit/topup", requireRole("PARTNER", "ADMIN"), async (req: AuthRequest, res) => {
  const schema = z.object({ hotelId: z.string(), amount: z.coerce.number().int().positive(), note: z.string().optional() });
  const p = schema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Nominal top-up tidak valid" });
  if (!(await ownsHotel(req, p.data.hotelId))) return res.status(403).json({ error: "Bukan hotel Anda" });
  const t = await prisma.depositTxn.create({ data: { hotelId: p.data.hotelId, kind: "TOPUP", amount: BigInt(p.data.amount), status: "PENDING", note: (p.data.note ?? "").slice(0, 200) } });
  const hotel = await prisma.hotel.findUnique({ where: { id: p.data.hotelId }, select: { name: true } });
  const admins = await prisma.user.findMany({ where: { role: "ADMIN" }, select: { id: true } });
  for (const a of admins) await dispatch(prisma, { userId: a.id, title: "Permintaan Top-up Deposit", body: `${hotel?.name} mengajukan top-up deposit ${rupiah(p.data.amount)}. Konfirmasi di Keuangan → Deposit.`, type: "info" });
  res.json({ txn: t });
});

// ── Admin: deposit top-up confirmation ──
app.get("/api/admin/deposits", requireRole("ADMIN"), async (_req, res) => {
  const [pending, hotels] = await Promise.all([
    prisma.depositTxn.findMany({ where: { status: "PENDING", kind: "TOPUP" }, orderBy: { createdAt: "asc" }, include: { hotel: { select: { name: true } } } }),
    prisma.hotel.findMany({ where: { depositBalance: { gt: 0 } }, select: { id: true, name: true, depositBalance: true }, orderBy: { name: "asc" } }),
  ]);
  res.json({ pending, hotels });
});
app.post("/api/admin/deposits/:id/confirm", requireRole("ADMIN"), async (req, res) => {
  const t = await prisma.depositTxn.findUnique({ where: { id: req.params.id }, include: { hotel: { select: { name: true, ownerId: true } } } });
  if (!t || t.status !== "PENDING") return res.status(400).json({ error: "Transaksi tidak valid" });
  await prisma.$transaction([
    prisma.depositTxn.update({ where: { id: t.id }, data: { status: "CONFIRMED", confirmedAt: new Date() } }),
    prisma.hotel.update({ where: { id: t.hotelId }, data: { depositBalance: { increment: t.amount } } }),
  ]);
  if (t.hotel.ownerId) await dispatch(prisma, { userId: t.hotel.ownerId, title: "Top-up Deposit Dikonfirmasi", body: `Deposit ${rupiah(Number(t.amount))} untuk ${t.hotel.name} telah masuk.`, type: "success" });
  audit(req, "deposit.confirm", "DepositTxn", t.id, { amount: t.amount });
  res.json({ ok: true });
});
app.post("/api/admin/deposits/:id/reject", requireRole("ADMIN"), async (req, res) => {
  await prisma.depositTxn.update({ where: { id: req.params.id }, data: { status: "REJECTED" } });
  audit(req, "deposit.reject", "DepositTxn", req.params.id);
  res.json({ ok: true });
});

// ── Invoices (monthly) ──
app.get("/api/partner/invoices", requireRole("PARTNER", "ADMIN"), async (req: AuthRequest, res) => {
  const admin = (req as any).role === "ADMIN";
  const hotels = await prisma.hotel.findMany({ where: admin ? {} : { ownerId: req.userId }, select: { id: true, name: true, depositBalance: true } });
  const invoices = await prisma.hotelInvoice.findMany({ where: { hotelId: { in: hotels.map((h) => h.id) } }, orderBy: { period: "desc" }, take: 60, include: { hotel: { select: { name: true } } } });
  res.json({ invoices, hotels });
});
app.get("/api/partner/invoices/:id/detail", requireRole("PARTNER", "ADMIN"), async (req: AuthRequest, res) => {
  const admin = (req as any).role === "ADMIN";
  const inv = await prisma.hotelInvoice.findFirst({ where: { id: req.params.id, ...(admin ? {} : { hotel: { ownerId: req.userId } }) }, include: { hotel: { select: { name: true } } } });
  if (!inv) return res.status(404).send("Invoice tidak ditemukan");
  const { start, end } = periodBounds(inv.period);
  const DIRECT_PCT = await getNum("directCommissionPct");
  const bookings = await prisma.booking.findMany({ where: { hotelId: inv.hotelId, status: { in: ["PAID", "COMPLETED"] }, checkOut: { gte: start, lt: end }, OR: [{ channelId: null }, { channel: { type: "DIRECT" } }] }, orderBy: { checkOut: "asc" }, select: { code: true, bookerName: true, checkIn: true, checkOut: true, roomPrice: true, payAtHotel: true } });
  const rows = [["Kode", "Tamu", "Check-in", "Check-out", "Harga Kamar", "Tipe", "Komisi", "Net ke Hotel"]];
  for (const b of bookings) {
    const gross = Number(b.roomPrice); const com = Math.round((gross * DIRECT_PCT) / 100);
    rows.push([b.code, b.bookerName, b.checkIn.toISOString().slice(0, 10), b.checkOut.toISOString().slice(0, 10), String(gross), b.payAtHotel ? "Bayar di Hotel" : "Prabayar", String(com), b.payAtHotel ? "0" : String(gross - com)]);
  }
  const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
  res.set("Content-Type", "text/csv").set("Content-Disposition", `attachment; filename="invoice-${inv.hotel.name}-${inv.period}.csv"`).send(csv);
});
app.get("/api/admin/invoices", requireRole("ADMIN"), async (req, res) => {
  const period = String(req.query.period || "");
  const invoices = await prisma.hotelInvoice.findMany({ where: period ? { period } : {}, orderBy: [{ period: "desc" }], take: 200, include: { hotel: { select: { name: true } } } });
  res.json({ invoices });
});
app.post("/api/admin/invoices/generate", requireRole("ADMIN"), async (req, res) => {
  const period = String(req.body?.period || periodKey(new Date()));
  if (!/^\d{4}-\d{2}$/.test(period)) return res.status(400).json({ error: "Periode harus format YYYY-MM" });
  const r = await generateInvoicesForPeriod(period);
  audit(req, "invoice.generate", "HotelInvoice", period, r);
  res.json({ ok: true, ...r });
});

// ── Partner: Analytics upgrade (Room Night / ADR / Revenue, daily + delta) ──
app.get("/api/partner/analytics", requireRole("PARTNER", "ADMIN"), async (req: AuthRequest, res) => {
  const admin = (req as any).role === "ADMIN";
  const hotels = await prisma.hotel.findMany({ where: admin ? {} : { ownerId: req.userId }, select: { id: true } });
  const ids = hotels.map((h) => h.id);
  const empty = { days: [], kpi: { roomNights: 0, revenue: 0, adr: 0, bookings: 0 }, delta: { roomNights: 0, revenue: 0, adr: 0 }, hotels: hotels.length };
  if (!ids.length) return res.json(empty);
  const now = new Date();
  const startCur = new Date(now); startCur.setDate(startCur.getDate() - 29); startCur.setHours(0, 0, 0, 0);
  const startPrev = new Date(startCur); startPrev.setDate(startPrev.getDate() - 30);
  const bookings = await prisma.booking.findMany({ where: { hotelId: { in: ids }, status: { in: ["PAID", "COMPLETED"] }, checkIn: { gte: startPrev } }, select: { checkIn: true, nights: true, rooms: true, totalPrice: true } });
  const dayKey = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x.toISOString().slice(0, 10); };
  const days: { date: string; roomNights: number; revenue: number; bookings: number }[] = [];
  const dmap: Record<string, any> = {};
  for (let i = 29; i >= 0; i--) { const d = new Date(now); d.setDate(d.getDate() - i); const k = dayKey(d); const o = { date: k, roomNights: 0, revenue: 0, bookings: 0 }; days.push(o); dmap[k] = o; }
  let curRN = 0, curRev = 0, curBk = 0, prevRN = 0, prevRev = 0;
  for (const b of bookings) {
    const rn = b.nights * b.rooms; const rev = Number(b.totalPrice); const k = dayKey(b.checkIn);
    if (b.checkIn >= startCur) { curRN += rn; curRev += rev; curBk++; if (dmap[k]) { dmap[k].roomNights += rn; dmap[k].revenue += rev; dmap[k].bookings++; } }
    else { prevRN += rn; prevRev += rev; }
  }
  const adr = (rev: number, rn: number) => (rn > 0 ? Math.round(rev / rn) : 0);
  const pct = (cur: number, prev: number) => (prev > 0 ? Math.round(((cur - prev) / prev) * 1000) / 10 : (cur > 0 ? 100 : 0));
  res.json({
    days,
    kpi: { roomNights: curRN, revenue: curRev, adr: adr(curRev, curRN), bookings: curBk },
    delta: { roomNights: pct(curRN, prevRN), revenue: pct(curRev, prevRev), adr: pct(adr(curRev, curRN), adr(prevRev, prevRN)) },
    hotels: hotels.length,
  });
});

// ═══════════════════════ ARTICLES / BLOG ═══════════════════════
const slugify = (s: string) => ((s || "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 60) || "item");

app.get("/api/articles", async (_req, res) => {
  const articles = await prisma.article.findMany({ where: { published: true }, orderBy: { publishedAt: "desc" }, take: 50 });
  res.json({ articles });
});
app.get("/api/articles/:slug", async (req, res) => {
  const article = await prisma.article.findUnique({ where: { slug: req.params.slug } });
  if (!article || !article.published) return res.status(404).json({ error: "Artikel tidak ditemukan" });
  res.json({ article });
});
app.get("/api/admin/articles", requireRole("ADMIN"), async (_req, res) => {
  res.json({ articles: await prisma.article.findMany({ orderBy: { createdAt: "desc" } }) });
});
app.post("/api/admin/articles", requireRole("ADMIN"), async (req, res) => {
  const schema = z.object({ title: z.string().min(3), excerpt: z.string().default(""), body: z.string().default(""), coverImage: z.string().default(""), category: z.string().default("Tips"), published: formBool.optional() });
  const p = schema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Data artikel tidak valid" });
  const slug = slugify(p.data.title) + "-" + Math.random().toString(36).slice(2, 6);
  const article = await prisma.article.create({ data: { ...p.data, published: p.data.published ?? true, slug } });
  audit(req, "article.create", "Article", article.id);
  res.json({ article });
});
app.put("/api/admin/articles/:id", requireRole("ADMIN"), async (req, res) => {
  const schema = z.object({ title: z.string().optional(), excerpt: z.string().optional(), body: z.string().optional(), coverImage: z.string().optional(), category: z.string().optional(), published: formBool.optional() });
  const p = schema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Data tidak valid" });
  const article = await prisma.article.update({ where: { id: req.params.id }, data: p.data });
  res.json({ article });
});
app.delete("/api/admin/articles/:id", requireRole("ADMIN"), async (req, res) => {
  await prisma.article.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});

// ═══════════════════════ PARTNER (PROPERTY) SELF-REGISTRATION ═══════════════════════
app.post("/api/partner-apply", async (req, res) => {
  const schema = z.object({
    propertyName: z.string().min(2), propertyType: z.enum(["HOTEL", "VILLA", "APARTMENT", "HOMESTAY", "GUESTHOUSE", "HOSTEL", "RESORT"]).default("HOTEL"),
    city: z.string().min(2), address: z.string().min(2), picName: z.string().min(2),
    email: z.string().email(), phone: z.string().min(5), website: z.string().optional(),
    roomCount: z.coerce.number().int().min(0).optional(), note: z.string().optional(),
    // Structured location + star (industry-standard)
    regionId: z.string().optional(), lat: z.coerce.number().optional(), lng: z.coerce.number().optional(),
    starRating: z.coerce.number().int().min(1).max(5).optional(),
    // Legal, tax & payout
    legalName: z.string().optional(), businessRegNo: z.string().optional(), taxId: z.string().optional(),
    bankName: z.string().optional(), bankAccount: z.string().optional(), bankHolder: z.string().optional(),
    cancellationPolicy: z.enum(["FLEXIBLE", "MODERATE", "STRICT", "NON_REFUNDABLE"]).optional(),
  });
  const p = schema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Lengkapi data properti dengan benar" });
  const application = await prisma.partnerApplication.create({ data: p.data });
  const admins = await prisma.user.findMany({ where: { role: "ADMIN" }, select: { id: true } });
  for (const a of admins) await dispatch(prisma, { userId: a.id, title: "Pendaftaran Properti Baru", body: `${p.data.propertyName} (${p.data.city}) ingin bergabung sebagai mitra. Tinjau di Pengajuan Mitra.`, type: "info" });
  res.json({ application });
});
app.get("/api/admin/partner-applications", requireRole("ADMIN"), async (_req, res) => {
  res.json({ applications: await prisma.partnerApplication.findMany({ orderBy: [{ status: "asc" }, { createdAt: "desc" }], take: 200 }) });
});
app.post("/api/admin/partner-applications/:id/approve", requireRole("ADMIN"), async (req, res) => {
  const a0 = await prisma.partnerApplication.findUnique({ where: { id: req.params.id } });
  if (!a0) return res.status(404).json({ error: "Pengajuan tidak ditemukan" });
  if (a0.status === "APPROVED") return res.status(400).json({ error: "Sudah disetujui" });
  if (await prisma.user.findUnique({ where: { email: a0.email } })) return res.status(409).json({ error: "Email sudah terpakai akun lain" });
  const tempPass = "MRM" + Math.random().toString(36).slice(2, 8);
  const owner = await prisma.user.create({ data: { name: a0.picName, email: a0.email, passwordHash: await bcrypt.hash(tempPass, 10), role: "PARTNER", phone: a0.phone } });
  const slug = slugify(a0.propertyName) + "-" + Math.random().toString(36).slice(2, 6);
  await prisma.hotel.create({ data: {
    name: a0.propertyName, slug, city: a0.city, address: a0.address,
    regionId: a0.regionId || null, lat: a0.lat ?? null, lng: a0.lng ?? null,
    description: a0.note || `${a0.propertyName} — properti mitra Miruum di ${a0.city}.`,
    imageUrl: "", // no stock photo — placeholder until the partner uploads real photos
    propertyType: a0.propertyType, ownerId: owner.id, starRating: a0.starRating || 3, rating: 0,
    // Carry over the legal/tax/payout/policy captured at registration.
    legalName: a0.legalName, businessRegNo: a0.businessRegNo, taxId: a0.taxId,
    payoutBankName: a0.bankName, payoutBankAccount: a0.bankAccount, payoutBankHolder: a0.bankHolder,
    cancellationPolicy: a0.cancellationPolicy,
  } });
  await prisma.partnerApplication.update({ where: { id: a0.id }, data: { status: "APPROVED" } });
  await dispatch(prisma, { title: "Pendaftaran Properti Disetujui", body: `Properti ${a0.propertyName} aktif. Login Extranet di https://extranet.miruum.id — email: ${a0.email}, sandi: ${tempPass}`, type: "success", email: a0.email });
  audit(req, "partner.approve", "PartnerApplication", a0.id, { property: a0.propertyName });
  res.json({ ok: true, credentials: { email: a0.email, password: tempPass } });
});
app.post("/api/admin/partner-applications/:id/reject", requireRole("ADMIN"), async (req, res) => {
  await prisma.partnerApplication.update({ where: { id: req.params.id }, data: { status: "REJECTED" } });
  audit(req, "partner.reject", "PartnerApplication", req.params.id);
  res.json({ ok: true });
});

// ─────────────────────────── Anti-fraud (Back Office) ───────────────────────────
app.get("/api/admin/fraud/blocks", requireRole("ADMIN"), async (_req, res) => {
  const blocks = await prisma.fraudBlock.findMany({ orderBy: { createdAt: "desc" } });
  res.json({ blocks });
});
app.post("/api/admin/fraud/blocks", requireRole("ADMIN"), async (req, res) => {
  const schema = z.object({ type: z.enum(["EMAIL", "IP", "PHONE", "BANK", "DEVICE"]), value: z.string().min(1), reason: z.string().optional() });
  const p = schema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Data blokir tidak valid" });
  const value = p.data.type === "EMAIL" ? p.data.value.toLowerCase().trim() : p.data.value.trim();
  const block = await prisma.fraudBlock.upsert({
    where: { type_value: { type: p.data.type, value } },
    create: { type: p.data.type, value, reason: p.data.reason, active: true },
    update: { active: true, reason: p.data.reason },
  });
  audit(req, "fraud.block.add", "FraudBlock", block.id, { type: block.type });
  res.json({ ok: true, block });
});
app.delete("/api/admin/fraud/blocks/:id", requireRole("ADMIN"), async (req, res) => {
  await prisma.fraudBlock.delete({ where: { id: req.params.id } }).catch(() => {});
  res.json({ ok: true });
});
// Bookings flagged by the risk engine, awaiting manual review.
app.get("/api/admin/fraud/flagged", requireRole("ADMIN"), async (_req, res) => {
  const bookings = await prisma.booking.findMany({
    where: { flagged: true }, orderBy: { createdAt: "desc" }, take: 100,
    include: { hotel: { select: { name: true } }, user: { select: { name: true, email: true } } },
  });
  res.json({ bookings });
});
app.post("/api/admin/bookings/:id/clear-flag", requireRole("ADMIN"), async (req, res) => {
  await prisma.booking.update({ where: { id: req.params.id }, data: { flagged: false } });
  audit(req, "fraud.flag.clear", "Booking", req.params.id);
  res.json({ ok: true });
});

// ═══════════════════════ SITE CONTENT (admin-managed web copy) ═══════════════════════
// All customer-web marketing copy lives here so admins can edit it (Back Office →
// Konten Web) instead of it being hardcoded in the Nuxt app.
const DEFAULT_SITE_CONTENT: any = {
  homeHeadline: "Dari hotel mewah sampai budget, semua ada di Miruum",
  homeSub: "Harga terbaik dijamin — pesan mudah, bayar aman.",
  ctaPropertyTitle: "Punya hotel atau properti?",
  ctaPropertyText: "Daftarkan properti Anda — tampil di aplikasi & web Miruum, kelola harga & pesanan lewat Extranet. Gratis untuk memulai.",
  ctaCorpTitle: "Perusahaan atau Corporate?",
  ctaCorpText: "Kelola perjalanan dinas karyawan/pegawai dengan tagihan & laporan terpusat. Ajukan akun Corporate/Government.",
  mitraHeadline: "Kembangkan bisnis properti Anda bersama Miruum",
  mitraSub: "Tampil di aplikasi & web Miruum. Kelola kamar, harga, dan pesanan dari satu Extranet — gratis untuk memulai.",
  features: [
    { t: "Harga Terbaik", d: "Bandingkan & dapatkan harga termurah otomatis." },
    { t: "Pembayaran Aman", d: "VA bank, e-wallet & QRIS — terenkripsi." },
    { t: "Bantuan 24/7", d: "Tim CS siap membantu kapan saja." },
  ],
  benefits: [
    { t: "Jangkauan Luas", d: "Properti Anda tampil di aplikasi & web Miruum — dilihat calon tamu dari berbagai kota." },
    { t: "Extranet Lengkap", d: "Atur kamar, rate plan, foto, promo, kalender allotment & campaign dari satu dasbor." },
    { t: "Channel Manager", d: "Distribusikan satu inventaris ke banyak OTA host-to-host — anti overbooking." },
    { t: "Pembayaran Aman", d: "Dana pesanan dibayarkan tepat waktu & aman langsung ke rekening Anda." },
    { t: "Analitik & Miruum Intelligent", d: "Pantau Room Night, ADR & pendapatan; AI membandingkan harga Anda dengan OTA lain." },
    { t: "Dukungan Mitra", d: "Tim Miruum & live chat siap membantu Anda kapan saja." },
  ],
  stats: [
    { value: "Gratis", label: "Mulai tanpa biaya" }, { value: "100%", label: "Gratis mendaftar" },
    { value: "24/7", label: "Dukungan mitra" }, { value: "Real-time", label: "Kelola harga & stok" },
  ],
  steps: [
    { t: "Daftarkan Properti", d: "Isi form data properti Anda — hanya beberapa menit." },
    { t: "Verifikasi", d: "Tim Miruum meninjau & mengaktifkan akun Extranet Anda." },
    { t: "Atur Kamar & Harga", d: "Lengkapi kamar, foto, dan harga lewat Extranet." },
    { t: "Terima Tamu", d: "Pesanan masuk otomatis & dana dibayarkan aman." },
  ],
  commission: [
    "Gratis mendaftar & tanpa biaya langganan", "Bayar komisi hanya saat mendapat pesanan",
    "Dana dibayarkan aman via transfer bank", "Bisa nonaktifkan/keluar kapan saja",
  ],
  testimonials: [
    { name: "Panji Wibowo", role: "Pemilik, Hotel Panji", quote: "Okupansi naik signifikan sejak gabung Miruum. Extranet-nya mudah dipakai." },
    { name: "Sari Melati", role: "Manajer, Villa Melati", quote: "Dana pesanan cair tepat waktu. Tim supportnya responsif banget." },
    { name: "Broto Santoso", role: "Owner, Guest House Broto", quote: "Channel Manager-nya bikin distribusi ke OTA jadi gampang, tanpa overbooking." },
  ],
  faqs: [
    { q: "Apakah gratis mendaftar?", a: "Ya, mendaftar dan mengelola properti di Extranet Miruum 100% gratis. Anda hanya membayar komisi saat mendapat pesanan." },
    { q: "Berapa lama proses verifikasi?", a: "Tim Miruum biasanya meninjau pengajuan dalam 1–3 hari kerja, lalu mengirim akun Extranet ke email Anda." },
    { q: "Bagaimana saya menerima pembayaran?", a: "Dana pesanan dibayarkan ke rekening bank Anda secara berkala melalui menu Pencairan / Invoice di Extranet." },
    { q: "Tipe properti apa saja yang bisa didaftarkan?", a: "Hotel, villa, apartemen, homestay, guest house, hostel, dan resort — semuanya bisa." },
  ],

  // ── Trust & assurance copy (header strip, footer, booking & payment pages) ──
  // Values may be a plain string (same for both languages) or { id, en }.
  trustStrip: {
    id: "Konfirmasi instan · Pembayaran aman · Batal gratis di properti terpilih",
    en: "Instant confirmation · Secure payment · Free cancellation at selected properties",
  },
  trustSecure: { id: "Pembayaran aman & terenkripsi", en: "Secure, encrypted payment" },
  trustInstant: { id: "Konfirmasi instan", en: "Instant confirmation" },
  trustSupport: { id: "Dukungan 24/7", en: "24/7 support" },
  paymentMethodsTitle: { id: "Metode Pembayaran", en: "Payment Methods" },
  paySecureNote: {
    id: "Pembayaran diproses dengan aman. Data kartu/rekening tidak kami simpan.",
    en: "Payments are processed securely. We never store your card or bank details.",
  },
  payInstantNote: {
    id: "Konfirmasi instan setelah pembayaran terverifikasi.",
    en: "Instant confirmation once your payment is verified.",
  },
  // Where the "Mobile App" button in the web footer points (a URL — not translated).
  appStoreUrl: "https://play.google.com/store/apps/details?id=id.gokar.miruum",
  appStoreLabel: { id: "Unduh di Google Play", en: "Get it on Google Play" },
  destinationsTitle: { id: "Destinasi Populer", en: "Popular Destinations" },
  socialTitle: { id: "Apa kata tamu kami", en: "What our guests say" },
  socialSub: {
    id: "Angka dan ulasan di bawah diambil langsung dari data Miruum.",
    en: "The numbers and reviews below come straight from Miruum data.",
  },
};
app.get("/api/site-content", async (_req, res) => {
  const s = await getSettings();
  let stored: any = {};
  try { stored = s.siteContent ? JSON.parse(s.siteContent) : {}; } catch { stored = {}; }
  res.json({ content: { ...DEFAULT_SITE_CONTENT, ...stored } });
});
app.get("/api/admin/site-content", requireRole("ADMIN"), async (_req, res) => {
  const s = await getSettings();
  let stored: any = {};
  try { stored = s.siteContent ? JSON.parse(s.siteContent) : {}; } catch { stored = {}; }
  res.json({ content: { ...DEFAULT_SITE_CONTENT, ...stored }, defaults: DEFAULT_SITE_CONTENT });
});
app.put("/api/admin/site-content", requireRole("ADMIN"), async (req, res) => {
  const body = req.body || {};
  // Merge over defaults so partial saves keep the rest intact.
  const merged = { ...DEFAULT_SITE_CONTENT, ...body };
  await setSettings({ siteContent: JSON.stringify(merged) });
  audit(req, "site-content.update", "Setting", "siteContent");
  res.json({ ok: true });
});

export { app };

// Only bind the port when run directly (tests import `app` without listening).
if (process.env.NODE_ENV !== "test") {
  const server = app.listen(PORT, () => {
    logger.info({ port: PORT, sentry: !!process.env.SENTRY_DSN }, "[miruum] API listening");
    redis().ping().then(() => logger.info("[redis] ready")).catch(() => logger.warn("[redis] unavailable"));
    ensureBucket();
    // Data-retention purge (UU PDP): now + every 24h.
    runRetention();
    setInterval(runRetention, 24 * 3600_000).unref();
    // Expire overdue unpaid payments (cancel booking + release + notify): every 2 min.
    sweepExpiredPayments().catch(() => {});
    setInterval(() => sweepExpiredPayments().catch(() => {}), 2 * 60_000).unref();
    // Miruum Intelligent: tick every 4h; each hotel runs at its own 1/2/3×-per-day
    // cadence (only hotels that are "due" get an API call).
    setInterval(() => {
      getSettings().then((s) => { if (s.ai_auto === "1") runRateShopping(false).catch(() => {}); }).catch(() => {});
    }, 4 * 3600_000).unref();
    // Price-drop alerts: every 6h.
    setInterval(() => runPriceAlerts().catch(() => {}), 6 * 3600_000).unref();
    // Post-stay review requests: now + every 12h.
    runReviewRequests();
    setInterval(() => runReviewRequests().catch(() => {}), 12 * 3600_000).unref();
    // Campaign activation/expiry sweep: now + hourly.
    sweepCampaigns().catch(() => {});
    setInterval(() => sweepCampaigns().catch(() => {}), 3600_000).unref();
    // Monthly invoice refresh (current + previous month, auto-offset deposit): daily.
    const genInvoices = () => { const n = new Date(); const prev = new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth() - 1, 1)); generateInvoicesForPeriod(periodKey(n)).catch(() => {}); generateInvoicesForPeriod(periodKey(prev)).catch(() => {}); };
    genInvoices();
    setInterval(genInvoices, 24 * 3600_000).unref();
  });
  // Graceful shutdown — stop accepting connections, then exit.
  for (const sig of ["SIGTERM", "SIGINT"] as const) {
    process.on(sig, () => { logger.info({ sig }, "shutting down"); server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 10000); });
  }
}
