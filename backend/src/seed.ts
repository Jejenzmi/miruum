import bcrypt from "bcryptjs";
import { prisma } from "./prisma.js";

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

async function main() {
  console.log("[seed] start");

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
      },
      update: {
        name: h.name, city: h.city, address: h.address, rating: h.rating,
        reviewCount: h.reviewCount, priceFrom: h.priceFrom, starRating: h.starRating,
        imageUrl: h.image, isPromo: h.isPromo ?? false, promoLabel: h.promoLabel,
        lat: h.lat, lng: h.lng,
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

  console.log(`[seed] done — ${HOTELS.length} hotels, ${PROMOS.length} promos, demo user demo@miruum.id / demo123`);
}

main()
  .catch((e) => { console.error("[seed] error", e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
