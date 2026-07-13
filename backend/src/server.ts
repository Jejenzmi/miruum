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

const app = express();
app.use(cors());
app.use(express.json({ limit: "8mb" })); // allow base64 image uploads
app.use(express.urlencoded({ extended: true })); // provider webhooks (form-encoded)

const PORT = config.port;

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

app.get("/api/auth/me", requireAuth, async (req: AuthRequest, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  if (!user) return res.status(404).json({ error: "Not found" });
  res.json({ user: publicUser(user) });
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
  isPromo: true, promoLabel: true,
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
    nights = Math.max(1, Math.round((checkOut.getTime() - checkIn.getTime()) / 86400000));
    baseAmount = room.price * nights * d.rooms;
  }

  const taxFee = Math.round(baseAmount * 0.11); // 11% tax & service
  const totalPrice = baseAmount + taxFee;

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
      roomPrice: baseAmount, taxFee, totalPrice,
      status: "PENDING",
    },
    include: { hotel: { select: hotelCard }, room: true, channel: { select: { code: true, name: true, type: true } } },
  });
  res.json({ booking });
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
  await prisma.notification.create({
    data: {
      userId: payment.booking.userId,
      title: `Pesanan ${payment.booking.hotel.name}`,
      body: `Pembayaran berhasil (${payment.methodLabel}). No. Pesanan ${payment.booking.code}`,
      type: "success", hotelName: payment.booking.hotel.name, orderCode: payment.booking.code,
    },
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
  const booking = await prisma.booking.findFirst({ where: { id: req.params.id, userId: req.userId } });
  if (!booking) return res.status(404).json({ error: "Pesanan tidak ditemukan" });
  const updated = await prisma.booking.update({ where: { id: booking.id }, data: { status: "CANCELLED" } });
  res.json({ booking: updated });
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
