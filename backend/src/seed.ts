import bcrypt from "bcryptjs";
import { prisma } from "./prisma.js";
import { syncOffers } from "./connectors.js";
import { seedAvailability } from "./availability.js";

const img = (id: string, w = 800) =>
  `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${w}&q=60`;

const LOREM =
  "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Vestibulum non odio pulvinar, tincidunt purus vel, efficitur turpis. Aenean tempus odio nisi, ac malesuada ligula ornare in.";

const FACILITIES = [
  { name: "Wi-Fi", icon: "wifi" },
  { name: "TV", icon: "tv" },
  { name: "Pool", icon: "pool" },
  { name: "AC", icon: "ac_unit" },
  { name: "Restaurant", icon: "restaurant" },
  { name: "Parking", icon: "local_parking" },
  { name: "Gym", icon: "fitness_center" },
  { name: "Spa", icon: "spa" },
  { name: "Sarapan", icon: "free_breakfast" },
];

interface HotelSeed {
  slug: string; name: string; city: string; address: string;
  rating: number; reviewCount: number; priceFrom: number; starRating: number;
  image: string; photos: string[]; facilities: string[];
  isPromo?: boolean; promoLabel?: string;
  lat?: number; lng?: number;
}

const HOTELS: HotelSeed[] = [
  {
    slug: "hotel-panji", name: "Hotel Panji", city: "Sleman, Yogyakarta",
    address: "Jl. Kaliurang KM 5, Sleman, Yogyakarta", rating: 8.5, reviewCount: 60,
    priceFrom: 520000, starRating: 4, image: img("1566073771259-6a8506099945"),
    photos: ["1566073771259-6a8506099945", "1590490360182-c33d57733427", "1582719478250-c89cae4dc85b", "1611892440504-42a792e24d32"].map((x) => img(x)),
    facilities: ["Wi-Fi", "TV", "Pool", "AC", "Restaurant", "Sarapan"],
    isPromo: true, promoLabel: "Save up to 30%", lat: -7.7, lng: 110.4,
  },
  {
    slug: "hillside-hotel", name: "Hillside Hotel", city: "Sleman, Yogyakarta",
    address: "Jl. Palagan Tentara Pelajar, Sleman, Yogyakarta", rating: 8.5, reviewCount: 234,
    priceFrom: 520000, starRating: 4, image: img("1520250497591-112f2f40a3f4"),
    photos: ["1520250497591-112f2f40a3f4", "1618773928121-c32242e63f39", "1551882547-ff40c63fe5fa", "1445019980597-93fa8acb246c"].map((x) => img(x)),
    facilities: ["Wi-Fi", "TV", "Pool", "Gym", "Spa", "Restaurant"],
    isPromo: true, promoLabel: "Private Sale 10%", lat: -7.72, lng: 110.39,
  },
  {
    slug: "hotel-tulip", name: "Hotel Tulip", city: "Moestopo, Jakarta",
    address: "Jl. Prof. Dr. Moestopo, Jakarta", rating: 8.2, reviewCount: 88,
    priceFrom: 480000, starRating: 3, image: img("1571896349842-33c89424de2d"),
    photos: ["1571896349842-33c89424de2d", "1590490360182-c33d57733427", "1611892440504-42a792e24d32"].map((x) => img(x)),
    facilities: ["Wi-Fi", "TV", "AC", "Restaurant", "Parking"],
    isPromo: true, promoLabel: "Newest Promo", lat: -6.2, lng: 106.8,
  },
  {
    slug: "penginapan-rio", name: "Penginapan Rio", city: "Jatinegara, Jakarta",
    address: "Jl. Jatinegara Barat, Jakarta Timur", rating: 8.0, reviewCount: 42,
    priceFrom: 350000, starRating: 3, image: img("1551882547-ff40c63fe5fa"),
    photos: ["1551882547-ff40c63fe5fa", "1582719478250-c89cae4dc85b", "1542314831-068cd1dbfeeb"].map((x) => img(x)),
    facilities: ["Wi-Fi", "TV", "AC", "Parking"], lat: -6.22, lng: 106.87,
  },
  {
    slug: "hotel-broto", name: "Hotel Broto", city: "Sleman, Yogyakarta",
    address: "Jl. Kaliurang KM 10, Sleman, Yogyakarta", rating: 8.7, reviewCount: 120,
    priceFrom: 468000, starRating: 4, image: img("1618773928121-c32242e63f39"),
    photos: ["1618773928121-c32242e63f39", "1566073771259-6a8506099945", "1520250497591-112f2f40a3f4"].map((x) => img(x)),
    facilities: ["Wi-Fi", "TV", "Pool", "AC", "Restaurant", "Sarapan", "Gym"],
    isPromo: true, promoLabel: "Private Sale : Save 10 %", lat: -7.68, lng: 110.41,
  },
  {
    slug: "hotel-mandarin", name: "Hotel Mandarin", city: "Yogyakarta",
    address: "Jl. Malioboro No. 60, Yogyakarta", rating: 9.0, reviewCount: 310,
    priceFrom: 350000, starRating: 5, image: img("1445019980597-93fa8acb246c"),
    photos: ["1445019980597-93fa8acb246c", "1571896349842-33c89424de2d", "1590490360182-c33d57733427"].map((x) => img(x)),
    facilities: ["Wi-Fi", "TV", "Pool", "AC", "Restaurant", "Sarapan", "Gym", "Spa"],
    lat: -7.79, lng: 110.36,
  },
  {
    slug: "hotel-ambacang", name: "Hotel Ambacang", city: "Padang",
    address: "Jl. Bundo Kanduang No. 14, Padang", rating: 8.3, reviewCount: 76,
    priceFrom: 410000, starRating: 4, image: img("1582719478250-c89cae4dc85b"),
    photos: ["1582719478250-c89cae4dc85b", "1611892440504-42a792e24d32", "1542314831-068cd1dbfeeb"].map((x) => img(x)),
    facilities: ["Wi-Fi", "TV", "Pool", "Restaurant", "Parking"], lat: -0.95, lng: 100.35,
  },
];

const REVIEWS = [
  { authorName: "Ajeng", rating: 8.5, body: "Lorem Ipsum is simply dummy text of the printing and typesetting industry. Kamar bersih dan pelayanan ramah." },
  { authorName: "Abdul Ghoni", rating: 7.0, body: "Lorem Ipsum is simply dummy text of the printing and typesetting industry. Lokasi strategis, sarapan enak." },
  { authorName: "Sinta", rating: 9.0, body: "Sangat nyaman, kolam renang bagus, staff helpful. Recommended!" },
];

// Partner (hotel owner) accounts → which hotel slugs they own.
const PARTNERS = [
  { name: "Panji Group", email: "partner@panji.id", owns: ["hotel-panji", "hotel-broto"] },
  { name: "Hillside Management", email: "partner@hillside.id", owns: ["hillside-hotel"] },
  { name: "Mandarin Hospitality", email: "partner@mandarin.id", owns: ["hotel-mandarin", "hotel-tulip"] },
];

// Supply channels — Miruum's own Channel Manager (DIRECT) + OTA sub-agent slots.
// OTA sub-agents start NOT contracted & MOCK: no contract with any OTA yet, so
// they produce no offers until their real API is connected (connectorType HTTP).
const CHANNELS = [
  { code: "DIRECT",    name: "Direct (Channel Manager)", type: "DIRECT" as const, commissionPct: 0,  color: "#2FA84F", sortOrder: 0, contracted: true },
  { code: "TIKETCOM",  name: "Tiket.com",                type: "OTA" as const,    commissionPct: 8,  color: "#0064D2", sortOrder: 1, contracted: false },
  { code: "AGODA",     name: "Agoda",                    type: "OTA" as const,    commissionPct: 10, color: "#5A34A5", sortOrder: 2, contracted: false },
  { code: "TRAVELOKA", name: "Traveloka",                type: "OTA" as const,    commissionPct: 9,  color: "#1BA0E2", sortOrder: 3, contracted: false },
];
// Which source each demo hotel comes from (all DIRECT until an OTA API connects).
const HOTEL_CHANNEL: Record<string, string> = {
  "hotel-tulip": "TRAVELOKA",
  "hotel-mandarin": "AGODA",
  "hotel-ambacang": "TIKETCOM",
  "penginapan-rio": "TIKETCOM",
};

// Ready-to-use gateway config templates per OTA, modeled on each provider's
// common B2B pattern. Preloaded so Back Office shows a starting point — adjust
// endpoint/field paths to the real API docs, set the token ENV var, then flip
// connectorType to HTTP. Secrets go in the server .env (referenced by *Env).
const CONNECTOR_TEMPLATES: Record<string, unknown> = {
  TIKETCOM: {
    baseUrl: "https://api.tiket.com",
    auth: { type: "header", header: "Authorization", valueEnv: "TIKETCOM_SECRET" },
    request: {
      method: "GET",
      path: "/v2/hotels/{externalId}/rates",
      query: { checkin: "{checkIn}", checkout: "{checkOut}", night: "1", room: "1", adult: "2", currency: "IDR" },
      headers: { Accept: "application/json" },
    },
    map: {
      basePrice: "data.rooms.0.rates.0.fare.rateWithTax",
      available: "data.rooms.0.available",
      roomsLeft: "data.rooms.0.availableRoom",
      deeplink: "data.detailUrl",
      supplierRef: "data.rooms.0.rates.0.rateCode",
      priceMultiplier: 1,
    },
  },
  AGODA: {
    baseUrl: "https://affiliateapi7643.agoda.com",
    auth: { type: "header", header: "Authorization", valueEnv: "AGODA_AUTH" }, // value = "{siteId}:{apiKey}"
    request: {
      method: "POST",
      path: "/affiliateservice/lt_v1",
      headers: { "Content-Type": "application/json" },
      body: {
        criteria: {
          checkInDate: "{checkIn}", checkOutDate: "{checkOut}", hotelId: ["{externalId}"],
          additional: { currency: "IDR", language: "id-id", maxResult: 1, occupancy: { numberOfAdult: 2, numberOfChildren: 0 } },
        },
      },
    },
    map: {
      basePrice: "results.0.dailyRate",
      available: "results.0.available",
      roomsLeft: "results.0.roomsLeft",
      deeplink: "results.0.landingURL",
      supplierRef: "results.0.hotelId",
      priceMultiplier: 1,
    },
  },
  TRAVELOKA: {
    baseUrl: "https://api.traveloka.com",
    auth: { type: "header", header: "X-API-Key", valueEnv: "TRAVELOKA_API_KEY" },
    request: {
      method: "POST",
      path: "/v2/hotel/search/rooms",
      headers: { "Content-Type": "application/json" },
      body: {
        hotelId: "{externalId}", checkInDate: "{checkIn}", checkOutDate: "{checkOut}",
        numOfNights: 1, numOfRooms: 1, numOfAdults: 2, currency: "IDR",
      },
    },
    map: {
      basePrice: "data.rooms.0.rateDisplay.nightlyPrice.amount",
      available: "data.rooms.0.isAvailable",
      roomsLeft: "data.rooms.0.remainingRooms",
      deeplink: "data.redirectUrl",
      supplierRef: "data.rooms.0.roomId",
      priceMultiplier: 1,
    },
  },
};

// Idempotent (runs even when catalog exists): seed home banners once.
async function ensureBanners() {
  if ((await prisma.banner.count()) > 0) return;
  await prisma.banner.createMany({ data: [
    { title: "Newest Promo", subtitle: "Diskon hingga 30% hotel pilihan", imageUrl: img("1566073771259-6a8506099945"), badge: "30%", sortOrder: 0 },
    { title: "Weekend Getaway", subtitle: "Hemat 15% menginap akhir pekan", imageUrl: img("1618773928121-c32242e63f39"), badge: "15%", sortOrder: 1 },
    { title: "Staycation Deals", subtitle: "Paket menginap keluarga terbaik", imageUrl: img("1445019980597-93fa8acb246c"), badge: "Hot", sortOrder: 2 },
  ] });
}

async function ensureContent() {
  const defaults = [
    { slug: "terms", title: "Syarat & Ketentuan", body:
`Selamat datang di Miruum. Dengan menggunakan aplikasi Miruum, Anda menyetujui syarat & ketentuan berikut.

1. Pemesanan
Setiap pemesanan yang dikonfirmasi merupakan perjanjian antara Anda dan pihak hotel/mitra. Harga yang ditampilkan sudah termasuk pajak & biaya layanan kecuali dinyatakan lain.

2. Pembayaran
Pembayaran diproses melalui kanal resmi Miruum. E-voucher terbit setelah pembayaran berhasil.

3. Pembatalan & Refund
Kebijakan pembatalan mengikuti ketentuan kamar (refundable / non-refundable) yang tertera pada saat pemesanan.

4. Tanggung Jawab
Miruum bertindak sebagai perantara pemesanan. Fasilitas & layanan disediakan oleh hotel/mitra terkait.` },
    { slug: "privacy", title: "Kebijakan Privasi", body:
`Miruum menghormati privasi Anda. Kebijakan ini menjelaskan bagaimana kami mengelola data Anda.

1. Data yang Kami Kumpulkan
Nama, email, nomor telepon, dan riwayat pemesanan untuk memproses transaksi.

2. Penggunaan Data
Data digunakan untuk memproses pemesanan, mengirim e-voucher, dan meningkatkan layanan.

3. Keamanan
Kami menerapkan langkah keamanan untuk melindungi data Anda dan tidak membagikannya kepada pihak ketiga tanpa persetujuan Anda, kecuali diwajibkan hukum.

4. Hak Anda
Anda dapat meminta akses, perbaikan, atau penghapusan data pribadi melalui layanan pelanggan Miruum.` },
    { slug: "about", title: "Tentang Miruum", body:
`Miruum adalah Online Travel Agent yang fokus pada pemesanan Hotel dan Paket Hotel di seluruh Indonesia.

Kami menghubungkan Anda dengan hotel terbaik melalui mitra langsung dan jaringan OTA, memberikan harga terbaik dan pengalaman menginap yang menyenangkan.

Versi aplikasi 1.0
Hubungi kami melalui menu Live Chat CS di aplikasi.` },
  ];
  for (const c of defaults) {
    await prisma.content.upsert({ where: { slug: c.slug }, create: c, update: {} });
  }
}

async function ensureChannels() {
  for (const c of CHANNELS) {
    await prisma.supplyChannel.upsert({ where: { code: c.code }, create: c, update: c });
  }
  // Preload a starter config template where none is set yet (keeps user edits).
  for (const [code, template] of Object.entries(CONNECTOR_TEMPLATES)) {
    const ch = await prisma.supplyChannel.findUnique({ where: { code } });
    if (ch && ch.config == null) {
      await prisma.supplyChannel.update({ where: { code }, data: { config: template as any } });
    }
  }
}

// Idempotent + non-destructive: assign existing hotels to a supply channel.
async function assignChannels() {
  const channels = await prisma.supplyChannel.findMany();
  const byCode: Record<string, string> = Object.fromEntries(channels.map((c) => [c.code, c.id]));
  for (const [slug, code] of Object.entries(HOTEL_CHANNEL)) {
    await prisma.hotel.updateMany({ where: { slug }, data: { channelId: byCode[code] } });
  }
  // any hotel still without a channel → DIRECT (own Channel Manager)
  await prisma.hotel.updateMany({ where: { channelId: null }, data: { channelId: byCode["DIRECT"] } });
}

// Realistic booking history so dashboards, analytics, PMS front-desk & finance
// look like a live property — not empty demos. Idempotent (skips once seeded).
async function ensureBookings() {
  if ((await prisma.booking.count()) > 12) return 0;
  const hotels = await prisma.hotel.findMany({
    select: { id: true, name: true, slug: true, channelId: true, rooms: { select: { id: true, name: true, price: true } } },
  });
  if (!hotels.length) return 0;
  const channels = await prisma.supplyChannel.findMany({ select: { id: true, code: true, type: true } });
  const directCh = channels.find((c) => c.code === "DIRECT");
  const otaChs = channels.filter((c) => c.type === "OTA");

  const NAMES = ["Budi Santoso","Siti Rahayu","Ahmad Fauzi","Dewi Lestari","Rizki Pratama","Nur Aisyah","Andi Wijaya","Putri Handayani","Eko Prasetyo","Maya Sari","Hendra Gunawan","Fitri Anggraini","Bayu Nugroho","Ratna Dewi","Dimas Aditya","Lia Permatasari","Agus Salim","Wulandari","Fajar Ramadhan","Indah Puspita"];
  const guests: { id: string; name: string; email: string }[] = [];
  for (let i = 0; i < NAMES.length; i++) {
    const email = `guest${i + 1}@miruum-demo.id`;
    const u = await prisma.user.upsert({
      where: { email },
      create: { name: NAMES[i], email, passwordHash: await bcrypt.hash("guest123", 10), phone: `0812${String(30000000 + i * 137317).slice(0, 8)}` },
      update: {},
    });
    guests.push({ id: u.id, name: NAMES[i], email });
  }

  const sod = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const today = sod(new Date());
  const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86400000);
  const rows: any[] = [];
  const push = (o: any) => rows.push(o);

  for (let i = 0; i < 44; i++) {
    const hotel = hotels[i % hotels.length];
    if (!hotel.rooms.length) continue;
    const room = hotel.rooms[i % hotel.rooms.length];
    const guest = guests[i % guests.length];
    const nights = 1 + (i % 4);
    const bucket = i % 10;
    let checkIn: Date, status: string, cin: Date | null = null, cout: Date | null = null, paidAt: Date | null = null;
    if (bucket <= 4) { checkIn = addDays(today, -(6 + (i % 55))); status = "COMPLETED"; cin = checkIn; cout = addDays(checkIn, nights); paidAt = addDays(checkIn, -2); }
    else if (bucket <= 6) { checkIn = addDays(today, 2 + (i % 24)); status = "PAID"; paidAt = addDays(today, -(i % 5)); }
    else if (bucket === 7) { checkIn = addDays(today, -(i % 2)); status = "PAID"; cin = checkIn; paidAt = addDays(checkIn, -1); }
    else if (bucket === 8) { checkIn = addDays(today, 1 + (i % 10)); status = "PENDING"; }
    else { checkIn = addDays(today, -(i % 20)); status = i % 3 === 0 ? "REFUNDED" : "CANCELLED"; if (status === "REFUNDED") paidAt = addDays(checkIn, -3); }
    const checkOut = addDays(checkIn, nights);
    const channelId = i % 2 === 0 && directCh ? directCh.id : otaChs.length ? otaChs[i % otaChs.length].id : directCh?.id ?? null;
    const roomPrice = room.price * nights;
    const taxFee = Math.round(roomPrice * 0.11);
    const discount = i % 7 === 0 ? Math.round(roomPrice * 0.1 / 1000) * 1000 : 0;
    push({
      code: `MRM${String(240000 + i * 137).slice(0, 6)}`, userId: guest.id, hotelId: hotel.id, roomId: room.id, channelId,
      checkIn, checkOut, nights, guests: 1 + (i % 3), rooms: 1,
      bookerName: guest.name, bookerEmail: guest.email, bookerPhone: `0812${String(3400000 + i * 5171).slice(0, 8)}`,
      forSelf: true, roomPrice, taxFee, discount, totalPrice: roomPrice + taxFee - discount, status,
      paymentMethod: status === "PENDING" ? null : "VA", bank: status === "PENDING" ? null : "BCA",
      paidAt, checkedInAt: cin, checkedOutAt: cout, createdAt: addDays(checkIn, -3),
    });
  }

  // Guarantee PMS front-desk data for partner@panji's hotel (arrivals/in-house/departure today).
  const h0 = hotels.find((h) => h.slug === "hotel-panji") ?? hotels[0];
  if (h0 && h0.rooms.length) {
    const mk = (idx: number, code: string, ci: Date, co: Date, cin: Date | null, extra: any = {}) => {
      const room = h0.rooms[idx % h0.rooms.length]; const g = guests[(28 + idx) % guests.length];
      const n = Math.max(1, Math.round((co.getTime() - ci.getTime()) / 86400000));
      const rp = room.price * n, tf = Math.round(rp * 0.11);
      push({ code, userId: g.id, hotelId: h0.id, roomId: room.id, channelId: directCh?.id ?? null, checkIn: ci, checkOut: co, nights: n, guests: 2, rooms: 1, bookerName: g.name, bookerEmail: g.email, bookerPhone: "0812990010" + idx, forSelf: true, roomPrice: rp, taxFee: tf, discount: 0, totalPrice: rp + tf, status: "PAID", paymentMethod: "VA", bank: "BCA", paidAt: addDays(ci, -1), createdAt: addDays(ci, -4), ...extra });
    };
    mk(0, "MRMFD001", today, addDays(today, 2), null);                        // arrival today
    mk(1, "MRMFD002", today, addDays(today, 1), null);                        // arrival today
    mk(2, "MRMFD003", addDays(today, -1), addDays(today, 2), addDays(today, -1)); // in-house
    mk(3, "MRMFD004", addDays(today, -2), addDays(today, 1), addDays(today, -2)); // in-house
    mk(0, "MRMFD005", addDays(today, -2), today, addDays(today, -2));          // departure today (in-house, checkout today)
  }

  await prisma.booking.createMany({ data: rows, skipDuplicates: true });
  return rows.length;
}

// Master data of Indonesian regions (Provinsi → Kab/Kota → Kecamatan → Desa).
// Seeds all 38 provinces + a representative hierarchy sample; admins add the rest
// (incl. pemekaran) via Back Office → Master Wilayah.
async function ensureRegions() {
  if ((await prisma.region.count()) > 0) return 0;
  const PROVINCES = ["Aceh", "Sumatera Utara", "Sumatera Barat", "Riau", "Jambi", "Sumatera Selatan", "Bengkulu", "Lampung", "Kepulauan Bangka Belitung", "Kepulauan Riau", "DKI Jakarta", "Jawa Barat", "Jawa Tengah", "DI Yogyakarta", "Jawa Timur", "Banten", "Bali", "Nusa Tenggara Barat", "Nusa Tenggara Timur", "Kalimantan Barat", "Kalimantan Tengah", "Kalimantan Selatan", "Kalimantan Timur", "Kalimantan Utara", "Sulawesi Utara", "Sulawesi Tengah", "Sulawesi Selatan", "Sulawesi Tenggara", "Gorontalo", "Sulawesi Barat", "Maluku", "Maluku Utara", "Papua", "Papua Barat", "Papua Selatan", "Papua Tengah", "Papua Pegunungan", "Papua Barat Daya"];
  const HIER: Record<string, Record<string, Record<string, string[]>>> = {
    "DKI Jakarta": {
      "Jakarta Pusat": { "Gambir": ["Gambir", "Cideng", "Petojo Utara"], "Menteng": ["Menteng", "Pegangsaan", "Cikini"] },
      "Jakarta Selatan": { "Kebayoran Baru": ["Melawai", "Gunung", "Senayan"], "Setiabudi": ["Setiabudi", "Karet", "Kuningan Timur"] },
      "Jakarta Timur": {}, "Jakarta Barat": {}, "Jakarta Utara": {}, "Kepulauan Seribu": {},
    },
    "DI Yogyakarta": {
      "Kota Yogyakarta": { "Gondokusuman": ["Terban", "Kotabaru", "Klitren", "Baciro", "Demangan"], "Umbulharjo": ["Semaki", "Muja Muju", "Tahunan"], "Mergangsan": ["Wirogunan", "Brontokusuman", "Keparakan"] },
      "Sleman": { "Depok": ["Caturtunggal", "Maguwoharjo", "Condongcatur"], "Mlati": ["Sinduadi", "Sendangadi", "Tlogoadi"] },
      "Bantul": {}, "Kulon Progo": {}, "Gunungkidul": {},
    },
    "Jawa Barat": {
      "Kota Bandung": { "Coblong": ["Dago", "Lebakgede", "Sekeloa"], "Sukajadi": ["Cipedes", "Sukagalih", "Pasteur"] },
      "Kota Bekasi": {}, "Kabupaten Bekasi": {}, "Kota Bogor": {}, "Kota Depok": {},
    },
    "Jawa Tengah": { "Kota Semarang": {}, "Kota Surakarta": {}, "Kabupaten Magelang": {} },
    "Jawa Timur": { "Kota Surabaya": {}, "Kota Malang": {}, "Kabupaten Sidoarjo": {} },
    "Bali": { "Kota Denpasar": {}, "Kabupaten Badung": {}, "Kabupaten Gianyar": {} },
    "Sumatera Barat": { "Kota Padang": {}, "Kota Bukittinggi": {} },
  };
  let n = 0;
  const provId: Record<string, string> = {};
  for (const pv of PROVINCES) { const p = await prisma.region.create({ data: { name: pv, level: "PROVINCE" } }); provId[pv] = p.id; n++; }
  for (const [pv, cities] of Object.entries(HIER)) {
    for (const [city, dists] of Object.entries(cities)) {
      const c = await prisma.region.create({ data: { name: city, level: "CITY", parentId: provId[pv] } }); n++;
      for (const [dist, villages] of Object.entries(dists)) {
        const d = await prisma.region.create({ data: { name: dist, level: "DISTRICT", parentId: c.id } }); n++;
        for (const vg of villages) { await prisma.region.create({ data: { name: vg, level: "VILLAGE", parentId: d.id } }); n++; }
      }
    }
  }
  return n;
}

// Demo corporate & government booking accounts (corporate.miruum.id).
async function ensureCorporate() {
  const orgs = [
    { type: "CORPORATE" as const, name: "PT Nusantara Jaya", email: "billing@nusantarajaya.co.id", phone: "0215551234", address: "Jl. Sudirman No. 1, Jakarta", taxId: "01.234.567.8-901.000", creditLimit: 100000000, adminName: "Corporate Admin", adminEmail: "corp@nusantara.id", pass: "corp123" },
    { type: "GOVERNMENT" as const, name: "Dinas Pariwisata Provinsi", email: "keuangan@disparprov.go.id", phone: "0227778888", address: "Jl. Diponegoro No. 22, Bandung", taxId: "00.987.654.3-210.000", creditLimit: 250000000, adminName: "Bendahara Dinas", adminEmail: "gov@disparprov.id", pass: "gov123" },
  ];
  for (const o of orgs) {
    const existing = await prisma.corporate.findFirst({ where: { name: o.name } });
    const corp = existing ?? await prisma.corporate.create({
      data: { type: o.type, name: o.name, email: o.email, phone: o.phone, address: o.address, taxId: o.taxId, creditLimit: o.creditLimit },
    });
    await prisma.user.upsert({
      where: { email: o.adminEmail },
      create: { name: o.adminName, email: o.adminEmail, passwordHash: await bcrypt.hash(o.pass, 10), role: "CORPORATE", corporateId: corp.id, phone: o.phone },
      update: { role: "CORPORATE", corporateId: corp.id },
    });
  }
}

async function main() {
  console.log("[seed] start");

  // Always (re)ensured — additive & non-destructive, so they apply even on live
  // DBs where the catalog reseed below is skipped.
  await ensureChannels();
  await ensureBanners();
  await ensureContent();

  // Idempotent restart guard: the hotel/room/review/package block below is
  // DESTRUCTIVE (deleteMany then recreate). Once seeded, re-running it on every
  // container start would fail on FK from HotelPackage/Booking → Room, and would
  // wipe real customer bookings. So if the catalog already exists, skip reseed.
  // (To force a refresh: `docker compose run --rm backend node dist/seed.js --force`
  //  after clearing dependent rows, or reset the DB volume.)
  const force = process.argv.includes("--force");
  if (!force && (await prisma.hotel.count()) > 0) {
    await assignChannels();
    const s = await syncOffers(prisma);
    const av = await seedAvailability(prisma);
    const bk = await ensureBookings(); // additive & idempotent — safe on live DB
    await ensureCorporate();
    await ensureRegions();
    console.log(`[seed] catalog already present — channels + ${s.offers} offers + ${av} availability days synced${bk ? `, +${bk} demo bookings` : ""}, skipping reseed`);
    return;
  }

  // Admin (Back Office)
  await prisma.user.upsert({
    where: { email: "admin@miruum.id" },
    create: { name: "Admin Miruum", email: "admin@miruum.id", passwordHash: await bcrypt.hash("admin123", 10), role: "ADMIN" },
    update: { role: "ADMIN" },
  });

  // Partners (Extranet) + ownership map
  const ownerBySlug: Record<string, string> = {};
  for (const p of PARTNERS) {
    const partner = await prisma.user.upsert({
      where: { email: p.email },
      create: { name: p.name, email: p.email, passwordHash: await bcrypt.hash("partner123", 10), role: "PARTNER" },
      update: { role: "PARTNER", name: p.name },
    });
    for (const slug of p.owns) ownerBySlug[slug] = partner.id;
  }

  // Facilities catalog
  const facMap: Record<string, string> = {};
  for (const f of FACILITIES) {
    const rec = await prisma.facility.upsert({
      where: { name: f.name }, create: f, update: { icon: f.icon },
    });
    facMap[f.name] = rec.id;
  }

  // Hotels + children (idempotent: reset children on each run)
  for (const h of HOTELS) {
    const hotel = await prisma.hotel.upsert({
      where: { slug: h.slug },
      create: {
        slug: h.slug, name: h.name, city: h.city, address: h.address,
        rating: h.rating, reviewCount: h.reviewCount, priceFrom: h.priceFrom,
        starRating: h.starRating, imageUrl: h.image, description: LOREM,
        isPromo: h.isPromo ?? false, promoLabel: h.promoLabel, lat: h.lat, lng: h.lng,
        ownerId: ownerBySlug[h.slug] ?? null,
      },
      update: {
        name: h.name, city: h.city, address: h.address, rating: h.rating,
        reviewCount: h.reviewCount, priceFrom: h.priceFrom, starRating: h.starRating,
        imageUrl: h.image, isPromo: h.isPromo ?? false, promoLabel: h.promoLabel,
        lat: h.lat, lng: h.lng, ownerId: ownerBySlug[h.slug] ?? null,
      },
    });

    await prisma.hotelPhoto.deleteMany({ where: { hotelId: hotel.id } });
    await prisma.hotelPhoto.createMany({
      data: h.photos.map((url, i) => ({ hotelId: hotel.id, url, sort: i })),
    });

    await prisma.hotelFacility.deleteMany({ where: { hotelId: hotel.id } });
    await prisma.hotelFacility.createMany({
      data: h.facilities.map((name) => ({ hotelId: hotel.id, facilityId: facMap[name] })),
      skipDuplicates: true,
    });

    await prisma.room.deleteMany({ where: { hotelId: hotel.id } });
    const base = h.priceFrom;
    await prisma.room.createMany({
      data: [
        {
          hotelId: hotel.id, name: "Deluxe Room Only", bedInfo: "1 Double bed dan 2 Ranjang Twin",
          capacity: 2, price: Math.round(base * 0.9), originalPrice: base,
          discountLabel: "Private Sale : Save 10 %", refundable: true, breakfast: false,
          freeWifi: true, freeCancellation: true, stock: 4,
        },
        {
          hotelId: hotel.id, name: "Deluxe B'fast", bedInfo: "1 Double bed dan 2 Ranjang Twin",
          capacity: 2, price: base, originalPrice: null, discountLabel: null,
          refundable: true, breakfast: true, freeWifi: true, freeCancellation: true, stock: 6,
        },
        {
          hotelId: hotel.id, name: "Superior Twin (Non Refundable)", bedInfo: "2 Ranjang Single",
          capacity: 2, price: Math.round(base * 0.8), originalPrice: null, discountLabel: null,
          refundable: false, breakfast: false, freeWifi: true, freeCancellation: false, stock: 8,
        },
      ],
    });

    await prisma.review.deleteMany({ where: { hotelId: hotel.id } });
    await prisma.review.createMany({
      data: REVIEWS.map((r) => ({ hotelId: hotel.id, authorName: r.authorName, rating: r.rating, body: r.body })),
    });
  }

  // ── Hotel Packages (bundled staycation deals tied to a hotel + base room) ──
  interface PkgSeed {
    slug: string; title: string; hotelSlug: string; nights: number; days: number;
    guests: number; inclusions: string[]; originalPrice: number; price: number;
    badge?: string; isPopular?: boolean; image: string;
  }
  const PACKAGES: PkgSeed[] = [
    {
      slug: "panji-staycation-2n3d", title: "Staycation Santai 2N3D",
      hotelSlug: "hotel-panji", nights: 2, days: 3, guests: 2,
      inclusions: ["Menginap 2 malam Deluxe Room", "Sarapan 2 orang / hari", "Antar-jemput bandara", "Welcome drink"],
      originalPrice: 1560000, price: 1180000, badge: "Best Seller", isPopular: true,
      image: img("1566073771259-6a8506099945"),
    },
    {
      slug: "hillside-honeymoon-2n3d", title: "Honeymoon Escape 2N3D",
      hotelSlug: "hillside-hotel", nights: 2, days: 3, guests: 2,
      inclusions: ["Menginap 2 malam Deluxe", "Sarapan romantis in-room", "Spa couple 60 menit", "Dekorasi kamar bunga"],
      originalPrice: 1740000, price: 1290000, badge: "Romantic", isPopular: true,
      image: img("1520250497591-112f2f40a3f4"),
    },
    {
      slug: "mandarin-family-3n4d", title: "Family Getaway 3N4D",
      hotelSlug: "hotel-mandarin", nights: 3, days: 4, guests: 4,
      inclusions: ["Menginap 3 malam Family Room", "Sarapan 4 orang / hari", "Tiket wisata Malioboro", "Late check-out 15.00"],
      originalPrice: 1650000, price: 1290000, badge: "Family",
      image: img("1445019980597-93fa8acb246c"),
    },
    {
      slug: "broto-workation-3n4d", title: "Workation Produktif 3N4D",
      hotelSlug: "hotel-broto", nights: 3, days: 4, guests: 1,
      inclusions: ["Menginap 3 malam Deluxe", "Sarapan tiap hari", "High-speed Wi-Fi & meja kerja", "Akses gym & kolam renang"],
      originalPrice: 1620000, price: 1240000, badge: "Staycation",
      image: img("1618773928121-c32242e63f39"),
    },
    {
      slug: "ambacang-weekend-1n2d", title: "Weekend Gateway 1N2D",
      hotelSlug: "hotel-ambacang", nights: 1, days: 2, guests: 2,
      inclusions: ["Menginap 1 malam Deluxe", "Sarapan 2 orang", "Voucher kuliner Rp100.000", "Free cancellation"],
      originalPrice: 820000, price: 640000, badge: "Weekend",
      image: img("1582719478250-c89cae4dc85b"),
    },
    {
      slug: "tulip-city-2n3d", title: "City Break Jakarta 2N3D",
      hotelSlug: "hotel-tulip", nights: 2, days: 3, guests: 2,
      inclusions: ["Menginap 2 malam", "Sarapan 2 orang / hari", "Antar-jemput stasiun", "Diskon laundry 20%"],
      originalPrice: 1200000, price: 940000, badge: "City Break",
      image: img("1571896349842-33c89424de2d"),
    },
  ];

  let pkgCount = 0;
  for (const p of PACKAGES) {
    const hotel = await prisma.hotel.findUnique({ where: { slug: p.hotelSlug } });
    if (!hotel) continue;
    // base room: prefer the breakfast room, else the first
    const room =
      (await prisma.room.findFirst({ where: { hotelId: hotel.id, breakfast: true } })) ??
      (await prisma.room.findFirst({ where: { hotelId: hotel.id } }));
    if (!room) continue;
    const discountPct = Math.round((1 - p.price / p.originalPrice) * 100);
    await prisma.hotelPackage.upsert({
      where: { slug: p.slug },
      create: {
        slug: p.slug, title: p.title, city: hotel.city, description: LOREM,
        imageUrl: p.image, hotelId: hotel.id, roomId: room.id,
        nights: p.nights, days: p.days, guests: p.guests, inclusions: p.inclusions,
        originalPrice: p.originalPrice, price: p.price, discountPct,
        rating: hotel.rating, reviewCount: hotel.reviewCount, starRating: hotel.starRating,
        badge: p.badge, isPopular: p.isPopular ?? false,
      },
      update: {
        title: p.title, city: hotel.city, imageUrl: p.image, hotelId: hotel.id, roomId: room.id,
        nights: p.nights, days: p.days, guests: p.guests, inclusions: p.inclusions,
        originalPrice: p.originalPrice, price: p.price, discountPct,
        rating: hotel.rating, reviewCount: hotel.reviewCount, starRating: hotel.starRating,
        badge: p.badge, isPopular: p.isPopular ?? false,
      },
    });
    pkgCount++;
  }

  // Promos / vouchers
  const PROMOS = [
    { code: "MIRUUM30", title: "Save up to 30%", description: "Yuk pilih hotel sesukamu. Diskon hingga 30% untuk hotel pilihan.", discountPct: 30, imageUrl: img("1571896349842-33c89424de2d") },
    { code: "NEWEST10", title: "Newest Promo", description: "Promo terbaru untuk pengguna Miruum. Nikmati potongan harga spesial.", discountPct: 10, imageUrl: img("1445019980597-93fa8acb246c") },
    { code: "WEEKEND15", title: "Weekend Getaway", description: "Diskon 15% untuk menginap di akhir pekan.", discountPct: 15, imageUrl: img("1618773928121-c32242e63f39") },
  ];
  for (const p of PROMOS) {
    await prisma.promo.upsert({ where: { code: p.code }, create: p, update: p });
  }

  // Demo user (Andri Hirata)
  const demo = await prisma.user.upsert({
    where: { email: "demo@miruum.id" },
    create: {
      name: "Andri Hirata", email: "demo@miruum.id",
      passwordHash: await bcrypt.hash("demo123", 10),
      phone: "0829127128922", gender: "Laki - laki", birthDate: "27 Sep 1997",
    },
    update: {},
  });

  // Notifications for demo user (idempotent-ish: reset)
  await prisma.notification.deleteMany({ where: { userId: demo.id } });
  await prisma.notification.createMany({
    data: [
      { userId: demo.id, title: "Pesanan Hotel Ambacang", body: "Berhasil. No. Pesanan 83792032", type: "success", hotelName: "Hotel Ambacang", orderCode: "83792032" },
      { userId: demo.id, title: "Pesanan Hotel Tulip", body: "Menunggu pembayaran. Batas waktu 5 menit dari sekarang. No. Pesanan 83792033", type: "pending", hotelName: "Hotel Tulip", orderCode: "83792033" },
      { userId: demo.id, title: "Pesanan Penginapan Rio", body: "Pembatalan pesanan telah diproses.", type: "cancel", hotelName: "Penginapan Rio", orderCode: "83792031" },
    ],
  });

  await assignChannels();
  const offerStats = await syncOffers(prisma);
  const avDays = await seedAvailability(prisma);
  const bkCount = await ensureBookings();
  await ensureCorporate();
  await ensureRegions();
  await ensureToursAndShuttle();
  await ensureRoomContent();

  console.log(`[seed] done — ${HOTELS.length} hotels, ${pkgCount} packages, ${PROMOS.length} promos, ${PARTNERS.length} partners, ${CHANNELS.length} channels, ${offerStats.offers} offers, ${avDays} availability days, ${bkCount} demo bookings`);
  console.log("[seed] logins: demo@miruum.id/demo123 (user) · admin@miruum.id/admin123 (admin) · partner@panji.id/partner123 (partner)");
}

// Demo data for the Tour & Shuttle modules (idempotent — keyed by title/name).
async function ensureToursAndShuttle() {
  const TOURS = [
    { title: "Sunrise Kawah Ijen & Blue Fire", city: "Banyuwangi", category: "Petualangan", price: 385000, durationHours: 8, imageUrl: "https://images.unsplash.com/photo-1589553416260-f586c8f1514f?w=800",
      description: "Trekking malam menuju kawah Ijen menyaksikan fenomena api biru langka dan matahari terbit di atas danau belerang.", highlights: ["Blue fire langka", "Sunrise kawah", "Pemandu bersertifikat"], included: ["Pemandu lokal", "Tiket masuk", "Masker gas", "Air mineral"], meetingPoint: "Paltuding Base Camp" },
    { title: "Nusa Penida Instagram Tour", city: "Bali", category: "Bahari", price: 550000, durationHours: 10, imageUrl: "https://images.unsplash.com/photo-1537996194471-e657df975ab4?w=800",
      description: "Jelajah spot ikonik Nusa Penida: Kelingking Beach, Angel's Billabong, Broken Beach, dan Crystal Bay.", highlights: ["Kelingking Beach", "Snorkeling Crystal Bay", "Fast boat PP"], included: ["Fast boat", "Mobil + sopir", "Makan siang", "Snorkeling gear"], meetingPoint: "Sanur Beach" },
    { title: "Borobudur Sunrise & Prambanan", city: "Yogyakarta", category: "Budaya", price: 425000, durationHours: 9, imageUrl: "https://images.unsplash.com/photo-1596422846543-75c6fc197f07?w=800",
      description: "Sunrise di Candi Borobudur dilanjutkan menjelajah kemegahan Candi Prambanan bersama pemandu budaya.", highlights: ["Sunrise Borobudur", "Candi Prambanan", "Pemandu budaya"], included: ["Tiket 2 candi", "Transport AC", "Sarapan", "Air mineral"], meetingPoint: "Hotel pickup Yogyakarta" },
    { title: "Komodo Sailing 3 Pulau", city: "Labuan Bajo", category: "Bahari", price: 750000, durationHours: 12, imageUrl: "https://images.unsplash.com/photo-1518509562904-e7ef99cdcc86?w=800",
      description: "Sailing trip melihat komodo di Pulau Rinca, Pink Beach, dan Pulau Padar dengan panorama ikonik.", highlights: ["Komodo Rinca", "Pink Beach", "Padar viewpoint"], included: ["Kapal wisata", "Ranger fee", "Makan siang", "Snorkeling gear"], meetingPoint: "Pelabuhan Labuan Bajo" },
    { title: "Bromo Jeep Sunrise Adventure", city: "Malang", category: "Petualangan", price: 350000, durationHours: 7, imageUrl: "https://images.unsplash.com/photo-1605540436563-5bca919ae766?w=800",
      description: "Naik jeep 4x4 menuju Penanjakan menyaksikan sunrise legendaris Gunung Bromo dan lautan pasir.", highlights: ["Sunrise Penanjakan", "Jeep 4x4", "Lautan pasir"], included: ["Jeep + sopir", "Tiket TNBTS", "Pemandu"], meetingPoint: "Cemoro Lawang" },
    { title: "Kuliner Malam Kota Tua", city: "Jakarta", category: "Kuliner", price: 185000, durationHours: 4, imageUrl: "https://images.unsplash.com/photo-1555126634-323283e090fa?w=800",
      description: "Food tour menyusuri jajanan legendaris Kota Tua Jakarta bersama pemandu kuliner lokal.", highlights: ["6 spot kuliner", "Pemandu kuliner", "Cerita sejarah"], included: ["Semua cicipan makanan", "Pemandu", "Air mineral"], meetingPoint: "Stasiun Jakarta Kota" },
  ];
  let tCount = 0;
  for (const [i, t] of TOURS.entries()) {
    const existing = await prisma.tour.findFirst({ where: { title: t.title } });
    if (existing) { await prisma.tour.update({ where: { id: existing.id }, data: { ...t, sortOrder: i } }); }
    else { await prisma.tour.create({ data: { ...t, sortOrder: i, rating: 4.7 + (i % 3) * 0.1, reviewCount: 40 + i * 17 } }); tCount++; }
  }

  const VTYPES = [
    { name: "MiruumBike", icon: "bike", baseFare: 5000, perKm: 2500, minFare: 8000, capacity: 1, sortOrder: 0 },
    { name: "Ekonomi", icon: "car", baseFare: 8000, perKm: 4000, minFare: 12000, capacity: 4, sortOrder: 1 },
    { name: "Premium", icon: "premium", baseFare: 15000, perKm: 6500, minFare: 22000, capacity: 4, sortOrder: 2 },
    { name: "Van (6 kursi)", icon: "van", baseFare: 20000, perKm: 7500, minFare: 30000, capacity: 6, sortOrder: 3 },
  ];
  for (const v of VTYPES) {
    const ex = await prisma.shuttleVehicleType.findFirst({ where: { name: v.name } });
    if (ex) await prisma.shuttleVehicleType.update({ where: { id: ex.id }, data: v });
    else await prisma.shuttleVehicleType.create({ data: v });
  }
  console.log(`[seed] tours=${TOURS.length} (+${tCount} new), shuttle vehicle types=${VTYPES.length}`);
}

// Section A content: rate plans per room, property types, and "what's nearby".
async function ensureRoomContent() {
  const PLANS = [
    { name: "Kamar Saja", boardBasis: "ROOM_ONLY", refundable: true, freeCancellation: false, priceDelta: 0, sortOrder: 0 },
    { name: "Termasuk Sarapan", boardBasis: "BREAKFAST", refundable: true, freeCancellation: false, priceDelta: 55000, sortOrder: 1 },
    { name: "Bebas Batal + Sarapan", boardBasis: "BREAKFAST", refundable: true, freeCancellation: true, priceDelta: 90000, sortOrder: 2 },
    { name: "Non-refundable (Hemat)", boardBasis: "ROOM_ONLY", refundable: false, freeCancellation: false, priceDelta: -45000, sortOrder: 3 },
  ];
  const rooms = await prisma.room.findMany({ select: { id: true } });
  let planCount = 0;
  for (const r of rooms) {
    const existing = await prisma.ratePlan.count({ where: { roomId: r.id } });
    if (existing > 0) continue;
    for (const p of PLANS) { await prisma.ratePlan.create({ data: { roomId: r.id, ...p } }); planCount++; }
  }

  // Property types for a bit of variety across the demo catalog.
  const TYPE_BY_SLUG: Record<string, string> = {
    "hotel-tulip": "RESORT", "hotel-mandarin": "APARTMENT", "penginapan-rio": "GUESTHOUSE",
    "hillside-hotel": "VILLA", "hotel-ambacang": "HOTEL",
  };
  for (const [slug, type] of Object.entries(TYPE_BY_SLUG)) {
    await prisma.hotel.updateMany({ where: { slug }, data: { propertyType: type } });
  }

  // "What's nearby" for every hotel (idempotent — skip if already present).
  const NEARBY = [
    { name: "Bandara terdekat", category: "AIRPORT", distanceKm: 12.4 },
    { name: "Stasiun Kota", category: "STATION", distanceKm: 2.1 },
    { name: "Mall & Pusat Belanja", category: "MALL", distanceKm: 0.8 },
    { name: "Pantai / Objek Wisata", category: "ATTRACTION", distanceKm: 3.5 },
    { name: "Rumah Sakit", category: "HOSPITAL", distanceKm: 1.6 },
  ];
  const hotels = await prisma.hotel.findMany({ select: { id: true } });
  let nearbyCount = 0;
  for (const h of hotels) {
    const existing = await prisma.hotelNearby.count({ where: { hotelId: h.id } });
    if (existing > 0) continue;
    for (const [i, n] of NEARBY.entries()) { await prisma.hotelNearby.create({ data: { hotelId: h.id, ...n, sortOrder: i } }); nearbyCount++; }
  }
  console.log(`[seed] room content — rate plans +${planCount}, nearby +${nearbyCount}, property types set`);
}

main()
  .catch((e) => { console.error("[seed] error", e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
