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

// Supply channels — Miruum's own Channel Manager (DIRECT) + OTA sub-agent sources.
const CHANNELS = [
  { code: "DIRECT",    name: "Direct (Channel Manager)", type: "DIRECT" as const, commissionPct: 0,  color: "#2FA84F", sortOrder: 0 },
  { code: "TIKETCOM",  name: "Tiket.com",                type: "OTA" as const,    commissionPct: 8,  color: "#0064D2", sortOrder: 1 },
  { code: "AGODA",     name: "Agoda",                    type: "OTA" as const,    commissionPct: 10, color: "#5A34A5", sortOrder: 2 },
  { code: "TRAVELOKA", name: "Traveloka",                type: "OTA" as const,    commissionPct: 9,  color: "#1BA0E2", sortOrder: 3 },
];
// Which source each demo hotel comes from (rest default to DIRECT).
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

async function main() {
  console.log("[seed] start");

  // Supply channels are always (re)ensured — additive & non-destructive, so they
  // apply even on live DBs where the catalog reseed below is skipped.
  await ensureChannels();

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
    console.log(`[seed] catalog already present — channels + ${s.offers} offers + ${av} availability days synced, skipping reseed`);
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

  console.log(`[seed] done — ${HOTELS.length} hotels, ${pkgCount} packages, ${PROMOS.length} promos, ${PARTNERS.length} partners, ${CHANNELS.length} channels, ${offerStats.offers} offers, ${avDays} availability days`);
  console.log("[seed] logins: demo@miruum.id/demo123 (user) · admin@miruum.id/admin123 (admin) · partner@panji.id/partner123 (partner)");
}

main()
  .catch((e) => { console.error("[seed] error", e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
