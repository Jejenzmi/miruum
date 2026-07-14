import express, { type Response, type NextFunction } from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "./prisma.js";
import { signToken, requireAuth, optionalAuth, type AuthRequest } from "./auth.js";
import { config } from "./config.js";
import { redis, cached, invalidate } from "./redis.js";
import { ensureBucket, putObject, storageReady } from "./storage.js";
import { syncOffers, getConnector } from "./connectors.js";
import { PAYMENT_METHODS, methodByCode, activeProvider } from "./payments.js";
import { computeFinance } from "./finance.js";
import { getSettings, getNum, setSettings, SETTING_DEFAULTS } from "./settings.js";
import { pushDistribution } from "./distribution.js";
import { botReply } from "./chatbot.js";
import { dispatch } from "./notify.js";
import { quote, consume } from "./availability.js";

const app = express();
app.use(cors());
app.use(express.json({ limit: "8mb" })); // allow base64 image uploads
app.use(express.urlencoded({ extended: true })); // provider webhooks (form-encoded)

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
});

// Role guard — verifies JWT then checks the user's role from DB.
function requireRole(...roles: string[]) {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    requireAuth(req, res, async () => {
      const user = await prisma.user.findUnique({ where: { id: req.userId } });
      if (!user || !roles.includes(user.role)) return res.status(403).json({ error: "Akses ditolak" });
      (req as any).role = user.role;
      next();
    });
  };
}

// ─────────────────────────── Health ───────────────────────────
app.get("/api/health", async (_req, res) => {
  let redisOk = false;
  try { redisOk = (await redis().ping()) === "PONG"; } catch { redisOk = false; }
  res.json({ ok: true, service: "miruum", ts: Date.now(), redis: redisOk, minio: storageReady() });
});

// ─────────────────────────── Auth ───────────────────────────
app.post("/api/auth/register", async (req, res) => {
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
  res.json({ token: signToken(user.id), user: publicUser(user) });
});

app.post("/api/auth/login", async (req, res) => {
  const schema = z.object({ email: z.string().email(), password: z.string() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Data tidak valid" });
  const { email, password } = parsed.data;
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return res.status(401).json({ error: "Pengguna tidak terdaftar" });
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return res.status(401).json({ error: "Email atau kata sandi salah" });
  res.json({ token: signToken(user.id), user: publicUser(user) });
});

// Mock OTP — accepts any 4-digit code or "1234".
app.post("/api/auth/otp/request", (_req, res) => res.json({ ok: true, hint: "1234" }));
app.post("/api/auth/otp/verify", (req, res) => {
  const code = String(req.body?.code ?? "");
  if (/^\d{4}$/.test(code)) return res.json({ ok: true });
  return res.status(400).json({ error: "Kode OTP salah" });
});

// Forgot password — sends a reset code (mock "1234"; real would email/SMS it).
app.post("/api/auth/forgot", async (req, res) => {
  const email = String(req.body?.email ?? "");
  const user = await prisma.user.findUnique({ where: { email } });
  // Don't reveal whether the email exists.
  res.json({ ok: true, hint: user ? "1234" : "1234" });
});

// Reset password with the code.
app.post("/api/auth/reset", async (req, res) => {
  const schema = z.object({ email: z.string().email(), code: z.string(), password: z.string().min(6) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Kata sandi baru minimal 6 karakter" });
  if (!/^\d{4}$/.test(parsed.data.code)) return res.status(400).json({ error: "Kode reset salah" });
  const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (!user) return res.status(404).json({ error: "Email tidak terdaftar" });
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(parsed.data.password, 10) } });
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

app.put("/api/auth/me", requireAuth, async (req: AuthRequest, res) => {
  const schema = z.object({
    name: z.string().min(2).optional(),
    phone: z.string().optional(),
    gender: z.string().optional(),
    birthDate: z.string().optional(),
    avatarUrl: z.string().optional(),
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
  const orderBy =
    sort === "price_asc" ? { priceFrom: "asc" as const } :
    sort === "price_desc" ? { priceFrom: "desc" as const } :
    sort === "rating" ? { rating: "desc" as const } :
    { createdAt: "desc" as const };
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
  rating: true, reviewCount: true, starRating: true, badge: true, isPopular: true, inclusions: true,
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
  res.json({ booking });
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
      bookingCode: booking.code, amount: booking.totalPrice, method,
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
    body: `Pembayaran berhasil (${payment.methodLabel}). No. Pesanan ${payment.booking.code}. E-voucher: ${PUBLIC_ORIGIN}/api/vouchers/${payment.booking.code}`,
    type: "success", hotelName: payment.booking.hotel.name, orderCode: payment.booking.code,
    phone: payment.booking.bookerPhone, email: payment.booking.bookerEmail,
  });
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

app.post("/api/bookings/:id/cancel", requireAuth, async (req: AuthRequest, res) => {
  const booking = await prisma.booking.findFirst({
    where: { id: req.params.id, userId: req.userId },
    include: { room: true, hotel: { select: { name: true } } },
  });
  if (!booking) return res.status(404).json({ error: "Pesanan tidak ditemukan" });
  if (["CANCELLED", "REFUNDED", "COMPLETED"].includes(booking.status))
    return res.status(400).json({ error: "Pesanan tidak dapat dibatalkan" });

  // Refund policy: free-cancellation room & >24h before check-in → full refund;
  // otherwise refundable → 50%; non-refundable → 0.
  const hoursToCheckIn = (booking.checkIn.getTime() - Date.now()) / 3600000;
  let refundPct = 0;
  if (booking.room.freeCancellation && hoursToCheckIn > 24) refundPct = 100;
  else if (booking.room.refundable && hoursToCheckIn > 24) refundPct = 50;
  const wasPaid = booking.status === "PAID";
  const refundAmount = wasPaid ? Math.round((booking.totalPrice * refundPct) / 100) : 0;

  const updated = await prisma.booking.update({
    where: { id: booking.id },
    data: { status: wasPaid && refundAmount > 0 ? "REFUNDED" : "CANCELLED" },
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

// Public e-voucher (printable HTML), addressed by the booking code.
app.get("/api/vouchers/:code", async (req, res) => {
  const b = await prisma.booking.findUnique({
    where: { code: req.params.code },
    include: { hotel: true, room: true, channel: true },
  });
  if (!b) return res.status(404).send("<h1>Voucher tidak ditemukan</h1>");
  const fmt = (d: Date) => d.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const paid = b.status === "PAID" || b.status === "COMPLETED";
  res.set("Content-Type", "text/html; charset=utf-8").send(`<!doctype html><html lang="id"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>E-Voucher ${b.code} — Miruum</title>
<style>body{font-family:system-ui,Segoe UI,Roboto,sans-serif;background:#f6f7fb;margin:0;padding:24px;color:#1b2430}
.v{max-width:520px;margin:0 auto;background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 10px 40px rgba(0,0,0,.08)}
.hd{background:linear-gradient(135deg,#f9a23c,#f2872a);color:#fff;padding:22px 24px}
.hd h1{margin:0;font-size:20px}.hd .code{opacity:.9;font-size:13px;margin-top:4px}
.bd{padding:22px 24px}.row{display:flex;justify-content:space-between;padding:9px 0;border-bottom:1px solid #eef0f4;font-size:14px}
.row .k{color:#6b7280}.row .v2{font-weight:600;text-align:right}
.status{display:inline-block;padding:5px 12px;border-radius:20px;font-size:12px;font-weight:700;background:${paid ? "#EAF7EE;color:#1c7a3f" : "#FDECE0;color:#b8791a"}}
.tot{margin-top:14px;padding-top:14px;border-top:2px dashed #e5e7eb;display:flex;justify-content:space-between;font-size:18px;font-weight:800;color:#E07C17}
.src{font-size:11px;color:#9aa0a6;margin-top:16px;text-align:center}
@media print{body{background:#fff;padding:0}.v{box-shadow:none}}</style></head><body>
<div class="v"><div class="hd"><h1>🐾 Miruum E-Voucher</h1><div class="code">No. Pesanan: ${b.code}</div></div>
<div class="bd">
<div style="margin-bottom:14px"><span class="status">${paid ? "LUNAS / CONFIRMED" : b.status}</span></div>
<div class="row"><span class="k">Hotel</span><span class="v2">${b.hotel.name}</span></div>
<div class="row"><span class="k">Alamat</span><span class="v2">${b.hotel.address}</span></div>
<div class="row"><span class="k">Kamar</span><span class="v2">${b.rooms}× ${b.room.name}</span></div>
<div class="row"><span class="k">Tamu</span><span class="v2">${b.bookerName} · ${b.guests} dewasa</span></div>
<div class="row"><span class="k">Check-in</span><span class="v2">${fmt(b.checkIn)}</span></div>
<div class="row"><span class="k">Check-out</span><span class="v2">${fmt(b.checkOut)}</span></div>
<div class="row"><span class="k">Durasi</span><span class="v2">${b.nights} malam</span></div>
${b.channel ? `<div class="row"><span class="k">Sumber</span><span class="v2">${b.channel.type === "DIRECT" ? "Direct" : "via " + b.channel.name}</span></div>` : ""}
<div class="tot"><span>Total</span><span>${rupiah(b.totalPrice)}</span></div>
<div class="src">Tunjukkan e-voucher ini saat check-in · miruum.gokar.id</div>
</div></div></body></html>`);
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
    series[mk].gross += b.totalPrice; series[mk].count += 1;
    gross += b.totalPrice; tax += b.taxFee; discount += b.discount;
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
  const revenue = paid.reduce((s, b) => s + b.totalPrice, 0);
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

app.post("/api/admin/hotels", requireRole("ADMIN"), async (req, res) => {
  const schema = z.object({
    name: z.string().min(2), city: z.string().min(2), address: z.string().min(2),
    description: z.string().default(""), priceFrom: z.coerce.number().int().default(0),
    starRating: z.coerce.number().int().min(1).max(5).default(3), rating: z.coerce.number().default(8),
    imageUrl: z.string().default(""), isPromo: z.coerce.boolean().default(false),
    promoLabel: z.string().optional(), ownerId: z.string().optional(),
    channelId: z.string().optional(), externalId: z.string().optional(),
  });
  const p = schema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Data hotel tidak valid", details: p.error.issues });
  const slug = p.data.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") + "-" + Math.floor(Math.random() * 9000 + 1000);
  const hotel = await prisma.hotel.create({ data: { ...p.data, slug, ownerId: p.data.ownerId || null } });
  await invalidate("miruum:");
  res.json({ hotel });
});

app.put("/api/admin/hotels/:id", requireRole("ADMIN"), async (req, res) => {
  const schema = z.object({
    name: z.string().optional(), city: z.string().optional(), address: z.string().optional(),
    description: z.string().optional(), priceFrom: z.coerce.number().int().optional(),
    starRating: z.coerce.number().int().optional(), rating: z.coerce.number().optional(),
    imageUrl: z.string().optional(), isPromo: z.coerce.boolean().optional(),
    promoLabel: z.string().optional(), ownerId: z.string().optional(),
    channelId: z.string().optional(), externalId: z.string().optional(),
  });
  const p = schema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Data tidak valid" });
  const data: any = { ...p.data };
  if (data.ownerId === "") data.ownerId = null;
  if (data.channelId === "") data.channelId = null;
  const hotel = await prisma.hotel.update({ where: { id: req.params.id }, data });
  await invalidate("miruum:");
  res.json({ hotel });
});

app.delete("/api/admin/hotels/:id", requireRole("ADMIN"), async (req, res) => {
  await prisma.hotel.delete({ where: { id: req.params.id } });
  await invalidate("miruum:");
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

app.put("/api/admin/channels/:id", requireRole("ADMIN"), async (req, res) => {
  const schema = z.object({
    name: z.string().optional(),
    commissionPct: z.coerce.number().optional(),
    active: z.coerce.boolean().optional(),
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
    const price = Math.round(offer.basePrice * (1 + channel.commissionPct / 100));
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
      id: true, name: true, city: true, priceFrom: true, channelId: true,
      offers: {
        orderBy: { price: "asc" },
        select: { id: true, basePrice: true, markupPct: true, price: true, available: true, roomsLeft: true,
          channel: { select: { code: true, name: true, type: true, color: true } } },
      },
    },
  });
  const channels = await prisma.supplyChannel.findMany({ orderBy: { sortOrder: "asc" } });
  res.json({ hotels, channels });
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
    inclusions: p.data.inclusions.split("\n").map((s) => s.trim()).filter(Boolean),
    originalPrice: p.data.originalPrice, price: p.data.price, discountPct, rating: hotel.rating, reviewCount: hotel.reviewCount,
    starRating: hotel.starRating, badge: p.data.badge, isPopular: p.data.isPopular } });
  await invalidate("miruum:"); res.json({ package: pkg });
});
app.put("/api/admin/packages/:id", requireRole("ADMIN"), async (req, res) => {
  const schema = z.object({ title: z.string().optional(), nights: z.coerce.number().int().optional(), days: z.coerce.number().int().optional(),
    guests: z.coerce.number().int().optional(), originalPrice: z.coerce.number().int().optional(), price: z.coerce.number().int().optional(),
    inclusions: z.string().optional(), badge: z.string().optional(), imageUrl: z.string().optional(), isPopular: z.coerce.boolean().optional() });
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

// ═══════════════════════ EXTRANET (PARTNER) ═══════════════════════
app.get("/api/partner/overview", requireRole("PARTNER", "ADMIN"), async (req: AuthRequest, res) => {
  const hotels = await prisma.hotel.findMany({
    where: { ownerId: req.userId },
    include: { _count: { select: { rooms: true, bookings: true, reviews: true } } },
  });
  const hotelIds = hotels.map((h) => h.id);
  const bookings = await prisma.booking.findMany({ where: { hotelId: { in: hotelIds } }, select: { totalPrice: true, status: true } });
  const revenue = bookings.filter((b) => b.status === "PAID" || b.status === "COMPLETED").reduce((s, b) => s + b.totalPrice, 0);
  res.json({ hotels, totalBookings: bookings.length, revenue });
});

app.get("/api/partner/hotels/:id", requireRole("PARTNER", "ADMIN"), async (req: AuthRequest, res) => {
  const hotel = await prisma.hotel.findFirst({
    where: { id: req.params.id, ownerId: req.userId },
    include: { rooms: true, photos: true },
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
  const schema = z.object({ price: z.coerce.number().int().optional(), stock: z.coerce.number().int().optional() });
  const p = schema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Data kamar tidak valid" });
  const room = await prisma.room.findUnique({ where: { id: req.params.id }, include: { hotel: true } });
  if (!room || room.hotel.ownerId !== req.userId) return res.status(403).json({ error: "Kamar bukan milik Anda" });
  const updated = await prisma.room.update({ where: { id: req.params.id }, data: p.data });
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

app.listen(PORT, () => {
  console.log(`[miruum] API listening on :${PORT}`);
  redis().ping().then(() => console.log("[redis] ready")).catch(() => console.warn("[redis] unavailable"));
  ensureBucket();
});
