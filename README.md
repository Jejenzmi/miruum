# Miruum — Aplikasi Booking Hotel (OTA)

Mockup OTA **Miruum** diimplementasikan penuh dari desain Figma *"Mockup OTA Miruum"*.
Stack: **Flutter** (mobile + web) + **Node/TypeScript/Express/Prisma/PostgreSQL**.

Live: **https://miruum.gokar.id**

## Struktur

```
miruum/
├── backend/        Node + TS + Express + Prisma + PostgreSQL (API :5013, semua route /api)
│   ├── prisma/schema.prisma
│   └── src/ (server.ts, auth.ts, seed.ts, prisma.ts)
├── app/            Flutter (Bloc-free, provider) — mobile & web
│   ├── lib/screens/  (splash, auth, home, jelajah, menu_hotel, results, filter,
│   │                  hotel_detail, reviews, pilih_kamar, rincian_pesanan,
│   │                  pembayaran, voucher, pesanan, favorit, notifikasi,
│   │                  profile, personal_data, setting, shell)
│   ├── lib/theme.dart  (design tokens Miruum: hijau #2FA84F, oranye #F5A623)
│   ├── Dockerfile.web  (nginx serve build/web + proxy /api)
│   └── nginx.conf
└── deploy/         docker-compose.yml, .env.example, nginx host site
```

## Design tokens (dari Figma)
| Token | Nilai |
|---|---|
| Primary (hijau) | `#2FA84F` |
| Accent (oranye) | `#F5A623` |
| Text | `#04021D` |
| Cover dark | `#2B2B2D` |

## Akun demo
`demo@miruum.id` / `demo123` (Andri Hirata)

## Alur booking (4 langkah)
Hotel Detail → **Pilih Kamar** → **Rincian Pesanan** → **Pembayaran** (pilih bank) → **Voucher** (e-voucher sukses).

## Menjalankan backend lokal
```bash
cd backend
npm install
# set DATABASE_URL ke Postgres lokal
npx prisma db push && npm run seed && npm run dev
```

## Build web
```bash
cd app
flutter build web --release
```

## Deploy (VPS + Docker Compose)
```bash
cd deploy
cp .env.example .env   # isi DB_PASSWORD & JWT_SECRET
docker compose up -d --build
# nginx host: pasang miruum.gokar.id.conf → sites-enabled, lalu certbot --nginx -d miruum.gokar.id
```
