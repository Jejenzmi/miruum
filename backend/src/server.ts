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
import { signToken, requireAuth, optionalAuth, issueSession, rotateRefresh, revokeRefresh, revokeAllRefresh, type AuthRequest } from "./auth.js";
import { config } from "./config.js";
import { redis, cached, invalidate } from "./redis.js";
import { ensureBucket, putObject, storageReady } from "./storage.js";
import { syncOffers, getConnector, applyMarkup } from "./connectors.js";
import QRCode from "qrcode";
import { PAYMENT_METHODS, methodByCode, activeProvider } from "./payments.js";
import { computeFinance } from "./finance.js";
import { getSettings, getNum, setSettings, SETTING_DEFAULTS } from "./settings.js";
import { pushDistribution } from "./distribution.js";
import { botReply } from "./chatbot.js";
import { screenChat, violationNotice } from "./moderation.js";
import { dispatch, sendMail } from "./notify.js";
import { testFcm } from "./fcm.js";
import { quote, consume } from "./availability.js";

// ── Observability: structured logging + error tracking ──
// Sentry activates only when SENTRY_DSN is set (configure in the environment,
// like the other integrations) — no code change needed to turn it on.
if (process.env.SENTRY_DSN) {
  Sentry.init({ dsn: process.env.SENTRY_DSN, environment: process.env.NODE_ENV || "production", tracesSampleRate: 0.1 });
}
export const logger = pino({ level: process.env.LOG_LEVEL || "info" });

const app = express();
app.set("trust proxy", 1); // behind nginx → real client IP via X-Forwarded-For (for rate limiting)
app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === "/api/health" } })); // structured request logs
app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: "cross-origin" } })); // security headers (JSON API)
app.use(cors());
app.use(express.json({ limit: "8mb" })); // allow base64 image uploads
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
const PUBLIC_ORIGIN = process.env.PUBLIC_ORIGIN || "https://ota.gokar.id";
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
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Data tidak valid", details: parsed.error.issues });
  const { name, email, password } = parsed.data;
  const exists = await prisma.user.findUnique({ where: { email } });
  if (exists) return res.status(409).json({ error: "Email sudah terdaftar" });
  const user = await prisma.user.create({
    data: { name, email, passwordHash: await bcrypt.hash(password, 10) },
  });
  res.json({ ...(await issueSession(user.id)), user: publicUser(user) });
});

app.post("/api/auth/login", authLimiter, async (req, res) => {
  const schema = z.object({ email: z.string().email(), password: z.string() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Data tidak valid" });
  const { email, password } = parsed.data;
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return res.status(401).json({ error: "Pengguna tidak terdaftar" });
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return res.status(401).json({ error: "Email atau kata sandi salah" });
  res.json({ ...(await issueSession(user.id)), user: publicUser(user) });
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

// Mock OTP — accepts any 4-digit code or "1234".
// Request an OTP for the logged-in user — sent via email / WhatsApp if configured.
app.post("/api/auth/otp/request", otpLimiter, requireAuth, async (req: AuthRequest, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  const code = await issueCode(user.id, "OTP", 4, 10);
  await dispatch(prisma, {
    userId: user.id, title: "Kode Verifikasi Miruum",
    body: `Kode OTP Anda: ${code}. Berlaku 10 menit. Jangan bagikan ke siapa pun.`,
    type: "otp", email: user.email, phone: user.phone || undefined,
  });
  const settings = await getSettings();
  const noChannel = settings.mail_enabled !== "1" && settings.wa_enabled !== "1";
  res.json({ ok: true, ...(noChannel ? { devCode: code } : {}) }); // devCode only when no delivery channel configured
});
app.post("/api/auth/otp/verify", otpLimiter, requireAuth, async (req: AuthRequest, res) => {
  const code = String(req.body?.code ?? "");
  if (!/^\d{4,6}$/.test(code)) return res.status(400).json({ error: "Format kode tidak valid" });
  if (await checkCode(req.userId!, "OTP", code)) return res.json({ ok: true });
  return res.status(400).json({ error: "Kode OTP salah atau kedaluwarsa" });
});

// Forgot password — sends a reset code (mock "1234"; real would email/SMS it).
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
const hotelCard = {
  id: true, name: true, slug: true, city: true, address: true, rating: true,
  reviewCount: true, priceFrom: true, starRating: true, imageUrl: true,
  isPromo: true, promoLabel: true, lat: true, lng: true,
  channel: { select: { code: true, name: true, type: true, color: true, commissionPct: true } },
} as const;

app.get("/api/hotels", async (req, res) => {
  const { query, city, minPrice, maxPrice, star, sort } = req.query as Record<string, string>;
  const where: any = {};
  if (query) where.OR = [
    { name: { contains: query, mode: "insensitive" } },
    { city: { contains: query, mode: "insensitive" } },
    { address: { contains: query, mode: "insensitive" } },
  ];
  if (city) where.city = { contains: city, mode: "insensitive" };
  if (minPrice || maxPrice) where.priceFrom = {
    ...(minPrice ? { gte: Number(minPrice) } : {}),
    ...(maxPrice ? { lte: Number(maxPrice) } : {}),
  };
  if (star) where.starRating = { gte: Number(star) };
  if (req.query.promo) where.isPromo = true;
  if (req.query.minRating) where.rating = { gte: Number(req.query.minRating) };
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

app.get("/api/hotels/promo", async (_req, res) => {
  const hotels = await prisma.hotel.findMany({ where: { isPromo: true }, select: hotelCard });
  res.json({ hotels });
});

app.get("/api/hotels/recommended", async (_req, res) => {
  const hotels = await cached("miruum:hotels:recommended", 120, () =>
    prisma.hotel.findMany({ orderBy: { rating: "desc" }, take: 10, select: hotelCard }));
  res.json({ hotels });
});

app.get("/api/hotels/:id", async (req, res) => {
  const hotel = await prisma.hotel.findUnique({
    where: { id: req.params.id },
    include: {
      photos: { orderBy: { sort: "asc" } },
      facilities: { include: { facility: true } },
      rooms: true,
      reviews: { orderBy: { createdAt: "desc" }, take: 5 },
      channel: { select: { code: true, name: true, type: true, color: true, commissionPct: true } },
      offers: {
        orderBy: { price: "asc" },
        include: { channel: { select: { code: true, name: true, type: true, color: true } } },
      },
    },
  });
  if (!hotel) return res.status(404).json({ error: "Hotel tidak ditemukan" });
  res.json({
    hotel: {
      ...hotel,
      facilities: hotel.facilities.map((f) => f.facility),
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

// Submit a review (1–5 stars, stored on a 0–10 scale) → recompute hotel rating.
app.post("/api/hotels/:id/reviews", requireAuth, async (req: AuthRequest, res) => {
  const schema = z.object({ rating: z.number().min(1).max(5), body: z.string().min(3) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Beri rating & ulasan minimal 3 karakter" });
  const hotel = await prisma.hotel.findUnique({ where: { id: req.params.id } });
  if (!hotel) return res.status(404).json({ error: "Hotel tidak ditemukan" });
  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  await prisma.review.create({
    data: { hotelId: hotel.id, userId: req.userId, authorName: user?.name ?? "Tamu", rating: parsed.data.rating * 2, body: parsed.data.body },
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
app.get("/api/config", async (_req, res) => {
  const s = await getSettings();
  res.json({ taxPct: Number(s.taxPct), currency: s.currency, appName: s.appName });
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

app.get("/api/payment-methods", (_req, res) => {
  // Group the gateway's method catalog for the app's picker.
  const groups: Record<string, any[]> = {};
  for (const m of PAYMENT_METHODS) (groups[m.group] ??= []).push({ code: m.code, name: m.label, type: m.type });
  res.json({ methods: Object.entries(groups).map(([group, items]) => ({ group, items })) });
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
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Data pemesanan tidak valid", details: parsed.error.issues });
  const d = parsed.data;

  let hotelId = d.hotelId;
  let roomId = d.roomId;
  let packageId: string | undefined;
  let packageTitle: string | undefined;
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
  }

  const taxFee = Math.round(baseAmount * (await getNum("taxPct")) / 100); // configurable tax & service
  // Apply promo code (discount off the accommodation subtotal).
  let discount = 0;
  let promoCode: string | null = null;
  if (d.promoCode) {
    const promo = await prisma.promo.findUnique({ where: { code: d.promoCode.toUpperCase() } });
    if (promo) { discount = Math.round((baseAmount * promo.discountPct) / 100); promoCode = promo.code; }
  }

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

  const booking = await prisma.booking.create({
    data: {
      code: makeCode(),
      userId: req.userId!,
      hotelId: hotelId!,
      roomId: roomId!,
      packageId, packageTitle,
      channelId, supplierRef,
      checkIn, checkOut, nights,
      guests: d.guests, rooms: d.rooms,
      bookerName: d.bookerName, bookerEmail: d.bookerEmail, bookerPhone: d.bookerPhone,
      forSelf: d.forSelf, specialRequest: d.specialRequest,
      roomPrice: baseAmount, taxFee, discount, promoCode, totalPrice,
      status: "PENDING",
    },
    include: { hotel: { select: hotelCard }, room: true, channel: { select: { code: true, name: true, type: true } } },
  });
  if (!packageId) await consume(prisma, roomId!, checkIn, checkOut, d.rooms); // decrement calendar allotment
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
    prisma.user.update({ where: { id: userId }, data: { loyaltyPoints: { increment: pts } } }),
  ]);
  await dispatch(prisma, { userId, title: "Poin Miruum Bertambah 🎉", body: `Kamu mendapat ${pts} poin dari pesanan ${code}. Tukarkan jadi diskon di pemesanan berikutnya!`, type: "success" });
}

// Loyalty balance + history.
app.get("/api/loyalty", requireAuth, async (req: AuthRequest, res) => {
  const s = await getSettings();
  const user = await prisma.user.findUnique({ where: { id: req.userId }, select: { loyaltyPoints: true } });
  const txns = await prisma.loyaltyTxn.findMany({ where: { userId: req.userId }, orderBy: { createdAt: "desc" }, take: 50 });
  res.json({
    enabled: s.loyaltyEnabled === "1",
    points: user?.loyaltyPoints ?? 0,
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

  const provider = activeProvider();
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
  res.json({ payment });
});

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
  await dispatch(prisma, {
    userId: payment.booking.userId,
    title: `Pesanan ${payment.booking.hotel.name}`,
    body: `Pembayaran berhasil (${payment.methodLabel}). No. Pesanan ${payment.booking.code}.\nE-voucher: ${PUBLIC_ORIGIN}/api/vouchers/${payment.booking.code}\nInvoice: ${PUBLIC_ORIGIN}/api/invoices/${payment.booking.code}`,
    type: "success", hotelName: payment.booking.hotel.name, orderCode: payment.booking.code,
    phone: payment.booking.bookerPhone, email: payment.booking.bookerEmail,
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
  return updated;
}

// Poll payment status (app checks after showing instructions).
app.get("/api/payments/:id", requireAuth, async (req: AuthRequest, res) => {
  const payment = await prisma.payment.findFirst({
    where: { id: req.params.id, booking: { userId: req.userId } },
  });
  if (!payment) return res.status(404).json({ error: "Pembayaran tidak ditemukan" });
  // auto-expire
  if (payment.status === "PENDING" && payment.expiresAt && payment.expiresAt < new Date()) {
    const exp = await prisma.payment.update({ where: { id: payment.id }, data: { status: "EXPIRED" } });
    return res.json({ payment: exp });
  }
  res.json({ payment });
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
  const provider = activeProvider();
  const parsed = provider.parseWebhook(req.body, req.headers as any);
  if (!parsed) return res.status(400).json({ error: "Webhook tidak valid" });
  const payment = await prisma.payment.findFirst({ where: { externalId: parsed.externalId } });
  if (!payment) return res.status(404).json({ error: "Pembayaran tidak ditemukan" });
  if (parsed.paid) await markPaymentPaid(payment.id);
  res.json({ ok: true });
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
  let refundPct = 0;
  if (booking.room.freeCancellation && hoursToCheckIn > cutoff) refundPct = fullPct;
  else if (booking.room.refundable && hoursToCheckIn > cutoff) refundPct = partialPct;
  const refundAmount = wasPaid ? Math.round((booking.totalPrice * refundPct) / 100) : 0;
  let note: string;
  if (!wasPaid) note = "Pesanan yang belum dibayar akan dibatalkan tanpa biaya.";
  else if (refundPct > 0) note = `Kamu akan mendapat refund ${refundPct}% = ${rupiah(refundAmount)}.`;
  else if (booking.room.refundable || booking.room.freeCancellation) note = `Pembatalan kurang dari ${cutoff} jam sebelum check-in — tidak ada pengembalian dana.`;
  else note = "Kamar ini non-refundable — tidak ada pengembalian dana.";
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
  const perNight = booking.roomPrice / Math.max(1, booking.nights); // price per night × rooms, from original
  const newRoomPrice = Math.round(perNight * nights);
  const newTax = Math.round(newRoomPrice * (await getNum("taxPct")) / 100);
  const newTotal = newRoomPrice + newTax - booking.discount;
  return { allowed: true, nights, checkIn, checkOut, newRoomPrice, newTax, newTotal, diff: newTotal - booking.totalPrice };
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
    data: { checkIn: q.checkIn, checkOut: q.checkOut, nights: q.nights, roomPrice: q.newRoomPrice, taxFee: q.newTax, totalPrice: q.newTotal },
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
@media print{body{background:#fff;padding:0}.doc{box-shadow:none;border-radius:0}.actions{display:none}}`;

async function qrSvg(text: string): Promise<string> {
  try { return await QRCode.toString(text, { type: "svg", margin: 0, color: { dark: "#20262e", light: "#00000000" } }); }
  catch { return ""; }
}

const fmtDate = (d: Date) => d.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const fmtShort = (d: Date) => d.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });

// ─────────── Corporate & Government booking (corporate.gokar.id) ───────────
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
  res.json({ corporate: c, stats: { bookings, spend: agg._sum.totalPrice ?? 0, recent30 }, recent });
});

app.get("/api/corporate/rooms", requireRole("CORPORATE"), async (_req, res) => {
  const hotels = await prisma.hotel.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, city: true, rooms: { orderBy: { price: "asc" }, select: { id: true, name: true, price: true } } },
  });
  res.json({ hotels });
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
  const roomPrice = room.price * nights * p.data.rooms;
  const taxFee = Math.round(roomPrice * (await getNum("taxPct")) / 100); // same configurable tax as retail
  const booking = await prisma.booking.create({
    data: {
      code: makeCode(), userId: req.userId!, hotelId: room.hotelId, roomId: room.id,
      corporateId: c.id, channelId: room.hotel.channelId,
      checkIn, checkOut, nights, guests: p.data.guests, rooms: p.data.rooms,
      bookerName: p.data.travelerName, bookerEmail: c.email ?? "", bookerPhone: c.phone ?? "",
      forSelf: false, specialRequest: p.data.note ?? null,
      roomPrice, taxFee, discount: 0, totalPrice: roomPrice + taxFee,
      status: "PAID", paymentMethod: "CORPORATE", paidAt: new Date(),
    },
  });
  await consume(prisma, room.id, checkIn, checkOut, p.data.rooms).catch(() => {});
  res.json({ booking });
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

// ── Corporate billing (Miruum → tagihan ke instansi) ──
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
  if (!corp) return res.status(404).json({ error: "Instansi tidak ditemukan" });
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
  <div class="foot">Mohon lakukan pembayaran sebelum jatuh tempo. Diterbitkan elektronik oleh Miruum, sah tanpa tanda tangan.<br>ota.gokar.id · support@miruum.id</div>
</div></div>
<div class="actions"><button class="pbtn" onclick="window.print()">Cetak / Simpan PDF</button></div>
</body></html>`);
});

// Public: apply for a corporate/government account (pengajuan layanan).
app.post("/api/corporate/apply", async (req, res) => {
  const schema = z.object({
    type: z.enum(["CORPORATE", "GOVERNMENT"]).default("CORPORATE"),
    companyName: z.string().min(2), picName: z.string().min(2), picPosition: z.string().optional(),
    email: z.string().email(), phone: z.string().min(5), address: z.string().optional(),
    taxId: z.string().optional(), regionId: z.string().optional(), employees: z.coerce.number().int().min(0).default(0), note: z.string().optional(),
  });
  const p = schema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Lengkapi data pengajuan dengan benar" });
  const app = await prisma.corporateApplication.create({ data: p.data });
  // Notify Miruum admins.
  const admins = await prisma.user.findMany({ where: { role: "ADMIN" }, select: { id: true } });
  for (const a of admins) {
    await dispatch(prisma, { userId: a.id, title: "Pengajuan Akun Korporat Baru", body: `${app.companyName} (${app.type === "GOVERNMENT" ? "Pemerintah" : "Korporat"}) mengajukan layanan. PIC: ${app.picName}. Tinjau di Back Office.`, type: "info" });
  }
  res.json({ ok: true, application: { id: app.id } });
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
    data: { type: app.type, name: app.companyName, email: app.email, phone: app.phone, address: app.address, taxId: app.taxId, regionId: app.regionId, picName: app.picName, picPosition: app.picPosition },
  });
  const tempPass = "MRM" + Math.random().toString(36).slice(2, 8);
  await prisma.user.create({
    data: { name: app.picName, email: app.email, passwordHash: await bcrypt.hash(tempPass, 10), role: "CORPORATE", corporateId: corp.id, phone: app.phone },
  });
  await prisma.corporateApplication.update({ where: { id: app.id }, data: { status: "APPROVED" } });
  await dispatch(prisma, { title: "Akun Korporat Disetujui", body: `Akun korporat ${app.companyName} aktif. Login di corporate.gokar.id — email: ${app.email}, sandi: ${tempPass}`, type: "success", email: app.email });
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
  const paid = b.status === "PAID" || b.status === "COMPLETED";
  const qr = await qrSvg(b.code);
  res.set("Content-Type", "text/html; charset=utf-8").send(`<!doctype html><html lang="id"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>E-Voucher ${b.code} — Miruum</title><style>${DOC_CSS}</style></head><body>
<div class="doc"><div class="hd">
  <div class="logo-plate"><img src="${PUBLIC_ORIGIN}/static/logo.png" alt="Miruum"></div>
  <div class="kind" style="margin-top:14px">E-Voucher Hotel</div>
  <h1>${b.hotel.name}</h1>
  <div class="sub">${b.hotel.city}</div>
  <span class="badge ${paid ? "ok" : "wait"}">${paid ? "TERKONFIRMASI" : b.status}</span>
</div>
<div class="bd">
  <div class="qrbox">
    <div class="qr">${qr}</div>
    <div><div class="cd">No. Pesanan</div><div class="cc">${b.code}</div>
    <div class="hint">Tunjukkan / pindai kode ini di resepsionis saat check-in.</div></div>
  </div>
  <div class="sec">Detail Menginap</div>
  <div class="row"><span class="k">Tamu</span><span class="v2">${b.bookerName} · ${b.guests} tamu</span></div>
  <div class="row"><span class="k">Kamar</span><span class="v2">${b.rooms}× ${b.room.name}</span></div>
  <div class="row"><span class="k">Check-in</span><span class="v2">${fmtDate(b.checkIn)}</span></div>
  <div class="row"><span class="k">Check-out</span><span class="v2">${fmtDate(b.checkOut)}</span></div>
  <div class="row"><span class="k">Durasi</span><span class="v2">${b.nights} malam</span></div>
  <div class="row"><span class="k">Alamat</span><span class="v2">${b.hotel.address}</span></div>
  ${b.hotel.checkInInfo ? `<div class="sec">Informasi Check-in</div><div style="font-size:12.5px;color:#5a6069;line-height:1.6">${b.hotel.checkInInfo}</div>` : ""}
  <div class="foot">E-voucher resmi Miruum — bukti pemesanan menginap. Tunjukkan saat check-in.<br>Butuh bantuan? Live Chat CS di aplikasi Miruum · ota.gokar.id</div>
</div></div>
<div class="actions"><button class="pbtn" onclick="window.print()">Cetak / Simpan PDF</button></div>
</body></html>`);
});

// Public invoice (printable HTML), by booking code.
app.get("/api/invoices/:code", async (req, res) => {
  const b = await prisma.booking.findUnique({ where: { code: req.params.code }, include: { hotel: true, room: true } });
  if (!b) return res.status(404).send("<h1>Invoice tidak ditemukan</h1>");
  const paid = b.status === "PAID" || b.status === "COMPLETED";
  const subtotal = Number(b.roomPrice);
  res.set("Content-Type", "text/html; charset=utf-8").send(`<!doctype html><html lang="id"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Invoice INV-${b.code} — Miruum</title><style>${DOC_CSS}</style></head><body>
<div class="doc"><div class="hd">
  <div class="logo-plate"><img src="${PUBLIC_ORIGIN}/static/logo.png" alt="Miruum"></div>
  <div class="kind" style="margin-top:14px">Invoice</div>
  <h1>INV-${b.code}</h1>
  <div class="sub">Tanggal ${fmtShort(b.createdAt)}</div>
  <span class="badge ${paid ? "ok" : "wait"}">${paid ? "LUNAS" : "MENUNGGU BAYAR"}</span>
</div>
<div class="bd">
  <div style="display:flex;justify-content:space-between;gap:20px;flex-wrap:wrap">
    <div><div class="sec" style="margin-top:0">Ditagihkan kepada</div><div style="font-weight:700">${b.bookerName}</div><div class="muted" style="color:#8a8f98;font-size:12px">${b.bookerEmail}<br>${b.bookerPhone}</div></div>
    <div style="text-align:right"><div class="sec" style="margin-top:0">Penerbit</div><div style="font-weight:700">Miruum OTA</div><div class="muted" style="color:#8a8f98;font-size:12px">ota.gokar.id<br>support@miruum.id</div></div>
  </div>
  <div class="sec">Rincian</div>
  <table class="items">
    <tr><td>${b.room.name} <span class="muted">(${b.rooms} kamar × ${b.nights} malam)</span><br><span class="muted">${b.hotel.name} · ${b.hotel.city}</span></td><td class="r">${rupiah(subtotal)}</td></tr>
    <tr><td>Pajak & biaya layanan</td><td class="r">${rupiah(Number(b.taxFee))}</td></tr>
    ${Number(b.discount) > 0 ? `<tr><td>Diskon${b.promoCode ? ` (${b.promoCode})` : ""}</td><td class="r" style="color:#1E7E38">−${rupiah(Number(b.discount))}</td></tr>` : ""}
  </table>
  <div class="tot"><span>Total</span><span>${rupiah(Number(b.totalPrice))}</span></div>
  <div class="sec">Pembayaran</div>
  <div class="row"><span class="k">Status</span><span class="v2">${paid ? "Lunas" : "Menunggu pembayaran"}</span></div>
  ${b.paymentMethod ? `<div class="row"><span class="k">Metode</span><span class="v2">${b.paymentMethod}${b.bank ? " · " + b.bank : ""}</span></div>` : ""}
  ${b.paidAt ? `<div class="row"><span class="k">Dibayar pada</span><span class="v2">${fmtShort(b.paidAt)}</span></div>` : ""}
  <div class="foot">Invoice ini diterbitkan secara elektronik oleh Miruum dan sah tanpa tanda tangan.<br>ota.gokar.id</div>
</div></div>
<div class="actions"><a href="/api/vouchers/${b.code}" class="pbtn" style="background:#fff;color:#20262e;border:1px solid #d7dae1;margin-right:8px">Lihat E-Voucher</a><button class="pbtn" onclick="window.print()">Cetak / Simpan PDF</button></div>
</body></html>`);
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
  if (!b) return res.status(404).send("<h1>Receipt tidak ditemukan</h1>");
  const paid = b.status === "PAID" || b.status === "COMPLETED";
  const qr = await qrSvg(b.code);
  const f = await bookingSplit(b);
  const chLabel = f.isDirect ? "Direct (Channel Manager Miruum)" : (b.channel?.name ?? "OTA");
  const payoutLine = f.isDirect
    ? `<div class="row"><span class="k">Dibayarkan ke hotel (settlement)</span><span class="v2" style="color:#1E7E38">${rupiah(f.hotelNet)}</span></div>`
    : `<div class="row"><span class="k">Diterima hotel via ${b.channel?.name ?? "OTA"}</span><span class="v2">${rupiah(f.hotelNet)}</span></div>`;
  res.set("Content-Type", "text/html; charset=utf-8").send(`<!doctype html><html lang="id"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Konfirmasi Hotel ${b.code} — Miruum</title><style>${DOC_CSS}</style></head><body>
<div class="doc"><div class="hd">
  <div class="logo-plate"><img src="${PUBLIC_ORIGIN}/static/logo.png" alt="Miruum"></div>
  <div class="kind" style="margin-top:14px">Konfirmasi Pemesanan — Untuk Hotel</div>
  <h1>${b.hotel.name}</h1>
  <div class="sub">${b.hotel.city} · Kanal: ${chLabel}</div>
  <span class="badge ${paid ? "ok" : "wait"}">${paid ? "TERKONFIRMASI" : b.status}</span>
</div>
<div class="bd">
  <div class="qrbox">
    <div class="qr">${qr}</div>
    <div><div class="cd">No. Pesanan</div><div class="cc">${b.code}</div>
    <div class="hint">Pindai untuk verifikasi tamu saat check-in.</div></div>
  </div>
  <div class="sec">Detail Menginap</div>
  <div class="row"><span class="k">Tamu</span><span class="v2">${b.bookerName} · ${b.guests} tamu</span></div>
  <div class="row"><span class="k">Kontak tamu</span><span class="v2">${b.bookerPhone || "-"}</span></div>
  <div class="row"><span class="k">Kamar</span><span class="v2">${b.rooms}× ${b.room.name}</span></div>
  <div class="row"><span class="k">Check-in</span><span class="v2">${fmtDate(b.checkIn)}</span></div>
  <div class="row"><span class="k">Check-out</span><span class="v2">${fmtDate(b.checkOut)}</span></div>
  <div class="row"><span class="k">Durasi</span><span class="v2">${b.nights} malam</span></div>
  <div class="sec">Rincian Keuangan</div>
  <table class="items">
    <tr><td>Harga kamar <span class="muted">(${b.rooms} × ${b.nights} malam)</span></td><td class="r">${rupiah(f.gross)}</td></tr>
    <tr><td>Komisi Miruum <span class="muted">(${f.pct}%)</span></td><td class="r" style="color:#C0392B">−${rupiah(f.commission)}</td></tr>
  </table>
  ${payoutLine}
  <div class="tot"><span>Net untuk Hotel</span><span>${rupiah(f.hotelNet)}</span></div>
  <div class="foot">Dokumen internal untuk pihak hotel. Nominal komisi mengikuti perjanjian kanal.<br>Miruum OTA · ota.gokar.id</div>
</div></div>
<div class="actions"><button class="pbtn" onclick="window.print()">Cetak / Simpan PDF</button></div>
</body></html>`);
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
    regionId: z.string().optional(),
    description: z.string().default(""), priceFrom: z.coerce.number().int().default(0),
    starRating: z.coerce.number().int().min(1).max(5).default(3), rating: z.coerce.number().default(8),
    imageUrl: z.string().default(""), isPromo: formBool,
    promoLabel: z.string().optional(), ownerId: z.string().optional(),
    productChannelManager: formBool, productPMS: formBool,
    channelId: z.string().optional(), externalId: z.string().optional(),
  });
  const p = schema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Data hotel tidak valid", details: p.error.issues });
  const slug = p.data.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") + "-" + Math.floor(Math.random() * 9000 + 1000);
  const hotel = await prisma.hotel.create({ data: { ...p.data, slug, ownerId: p.data.ownerId || null } });
  await invalidate("miruum:");
  audit(req, "hotel.create", "Hotel", hotel.id, { name: hotel.name });
  res.json({ hotel });
});

app.put("/api/admin/hotels/:id", requireRole("ADMIN"), async (req, res) => {
  const schema = z.object({
    name: z.string().optional(), city: z.string().optional(), address: z.string().optional(),
    regionId: z.string().optional(),
    description: z.string().optional(), priceFrom: z.coerce.number().int().optional(),
    starRating: z.coerce.number().int().optional(), rating: z.coerce.number().optional(),
    imageUrl: z.string().optional(), isPromo: formBool.optional(),
    promoLabel: z.string().optional(), ownerId: z.string().optional(),
    productChannelManager: formBool.optional(), productPMS: formBool.optional(),
    channelId: z.string().optional(), externalId: z.string().optional(),
  });
  const p = schema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Data tidak valid" });
  const data: any = { ...p.data };
  if (data.ownerId === "") data.ownerId = null;
  if (data.channelId === "") data.channelId = null;
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

app.get("/api/admin/rate-intelligence", requireRole("ADMIN"), async (_req, res) => {
  const hotels = await prisma.hotel.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true, name: true, city: true, priceFrom: true,
      offers: {
        select: {
          basePrice: true, price: true, available: true, roomsLeft: true,
          channel: { select: { code: true, name: true, type: true, contracted: true, color: true,
            markupType: true, commissionPct: true, markupNominal: true, feeIncluded: true } },
        },
      },
    },
  });
  const rows = hotels.filter((h) => h.offers.length).map((h) => {
    const offers = h.offers.map((o) => ({
      channel: o.channel.name, code: o.channel.code, color: o.channel.color,
      type: o.channel.type, contracted: o.channel.contracted,
      basePrice: o.basePrice, price: o.price, available: o.available, roomsLeft: o.roomsLeft,
      markupType: o.channel.feeIncluded ? "INCLUDED" : o.channel.markupType,
      markupPct: o.channel.commissionPct, markupNominal: o.channel.markupNominal,
    })).sort((a, b) => a.price - b.price);
    const sellable = offers.filter((o) => o.contracted && o.available).map((o) => o.price);
    const market = offers.map((o) => o.price);
    const bestSellable = sellable.length ? Math.min(...sellable) : null;
    const marketMin = market.length ? Math.min(...market) : null;
    const marketMax = market.length ? Math.max(...market) : null;
    return {
      hotelId: h.id, hotel: h.name, city: h.city, offers, bestSellable, marketMin, marketMax,
      contractedCount: offers.filter((o) => o.contracted).length,
      monitorCount: offers.filter((o) => !o.contracted).length,
      isCheapest: bestSellable != null && marketMin != null && bestSellable <= marketMin,
    };
  });
  res.json({ rows });
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
    bookingEngine: { base: process.env.PUBLIC_APP_URL || "https://ota.gokar.id" },
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

// ─────────────── Promo CRUD ───────────────
app.get("/api/admin/promos", requireRole("ADMIN"), async (_req, res) => {
  res.json({ promos: await prisma.promo.findMany({ orderBy: { code: "asc" } }) });
});
app.post("/api/admin/promos", requireRole("ADMIN"), async (req, res) => {
  const schema = z.object({ code: z.string().min(2), title: z.string().min(2), description: z.string().default(""),
    discountPct: z.coerce.number().int().min(1).max(100), imageUrl: z.string().default(""), validUntil: z.string().optional() });
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
    popup: popup ? { id: popup.id, title: popup.title, body: popup.body, imageUrl: popup.imageUrl, ctaText: popup.ctaText, ctaUrl: popup.ctaUrl, updatedAt: popup.updatedAt } : null,
    update: {
      latestVersion: s.app_latest_version || "",
      minVersion: s.app_min_version || "",
      url: s.app_update_url || "https://ota.gokar.id/ota.apk",
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
const INTEGRATION_KEYS = ["mail_enabled", "smtp_host", "smtp_port", "smtp_secure", "smtp_user", "smtp_pass", "smtp_from", "fcm_enabled", "fcm_service_account", "wa_enabled", "wa_api_url", "wa_api_token", "google_client_id"];
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

app.get("/api/partner/overview", requireRole("PARTNER", "ADMIN"), async (req: AuthRequest, res) => {
  const hotels = await prisma.hotel.findMany({
    where: { ownerId: req.userId },
    include: { _count: { select: { rooms: true, bookings: true, reviews: true } } },
  });
  const hotelIds = hotels.map((h) => h.id);
  const bookings = await prisma.booking.findMany({ where: { hotelId: { in: hotelIds } }, select: { totalPrice: true, status: true } });
  const revenue = bookings.filter((b) => b.status === "PAID" || b.status === "COMPLETED").reduce((s, b) => s + Number(b.totalPrice), 0);
  res.json({ hotels, totalBookings: bookings.length, revenue });
});

app.get("/api/partner/hotels/:id", requireRole("PARTNER", "ADMIN"), async (req: AuthRequest, res) => {
  const hotel = await prisma.hotel.findFirst({
    where: { id: req.params.id, ownerId: req.userId },
    include: { rooms: { orderBy: { price: "asc" } }, photos: true, facilities: { select: { facilityId: true } } },
  });
  if (!hotel) return res.status(404).json({ error: "Hotel tidak ditemukan / bukan milik Anda" });
  res.json({ hotel });
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

// ─────────── Partner Channel Manager (cm.gokar.id) ───────────
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

// ─────────── PMS — Property Management System (pms.gokar.id) ───────────
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

// Partner: manage hotel photos.
app.post("/api/partner/hotels/:id/photos", requireRole("PARTNER", "ADMIN"), async (req: AuthRequest, res) => {
  if (!(await ownsHotel(req, req.params.id))) return res.status(403).json({ error: "Bukan hotel Anda" });
  const url = String(req.body?.url ?? "");
  if (!/^https?:\/\//.test(url)) return res.status(400).json({ error: "URL foto tidak valid" });
  const count = await prisma.hotelPhoto.count({ where: { hotelId: req.params.id } });
  const photo = await prisma.hotelPhoto.create({ data: { hotelId: req.params.id, url, sort: count } });
  await invalidate("miruum:");
  res.json({ photo });
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
    capacity: z.coerce.number().int().min(1).optional(),
    refundable: formBool.optional(), breakfast: formBool.optional(), freeCancellation: formBool.optional(),
  });
  const p = schema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Data kamar tidak valid" });
  const room = await prisma.room.findUnique({ where: { id: req.params.id }, include: { hotel: true } });
  if (!room || room.hotel.ownerId !== req.userId) return res.status(403).json({ error: "Kamar bukan milik Anda" });
  const updated = await prisma.room.update({ where: { id: req.params.id }, data: p.data });
  await invalidate("miruum:");
  audit(req, "room.update", "Room", updated.id, { hotel: room.hotel.name, ...p.data });
  res.json({ room: updated });
});

// Partner deal (buat promo sendiri): a % off a room. Uses originalPrice as the
// baseline so the discount shows as a strikethrough in the app + booking pays less.
app.put("/api/partner/rooms/:id/deal", requireRole("PARTNER", "ADMIN"), async (req: AuthRequest, res) => {
  const dealPct = Math.max(0, Math.min(90, Number(req.body?.dealPct) || 0));
  const room = await prisma.room.findUnique({ where: { id: req.params.id }, include: { hotel: true } });
  if (!room || room.hotel.ownerId !== req.userId) return res.status(403).json({ error: "Kamar bukan milik Anda" });
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
  });
  // Graceful shutdown — stop accepting connections, then exit.
  for (const sig of ["SIGTERM", "SIGINT"] as const) {
    process.on(sig, () => { logger.info({ sig }, "shutting down"); server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 10000); });
  }
}
