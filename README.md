# Miruum — OTA Booking Hotel

Implementasi penuh dari desain Figma **"Mockup OTA Miruum"**. Arsitektur tiga sisi:

| Komponen | Untuk | Stack |
|---|---|---|
| **Mobile app** | User (pemesan) | **Flutter + Bloc** (Android/iOS) |
| **Back Office** | Admin internal | **Node.js** (Express + EJS) — `miruum.id/admin` |
| **Extranet** | Mitra hotel | **Node.js** (Express + EJS) — `miruum.id/extranet` |
| Core API + DB | dipakai semua | Node/TypeScript/Prisma/PostgreSQL |

**Live:** https://miruum.id

## Struktur
```
miruum/
├── backend/   Core API (Express+Prisma+PG). Auth+role, hotels, bookings, payment,
│              admin (/api/admin/*) & partner (/api/partner/*) endpoints, seed.
├── web/       Portal Node/Express/EJS: landing + Back Office (admin) + Extranet (mitra).
├── app/       Mobile Flutter + Bloc (flutter_bloc). Distribusi APK.
│   ├── lib/bloc/     AuthBloc + feature Cubits (Home, Hotels, HotelDetail,
│   │                 Reviews, Bookings, Notifications, Favorites)
│   └── lib/screens/  Splash, Auth, Home, Jelajah, Search, Results, Filter,
│                     HotelDetail, Ulasan, PilihKamar, Rincian→Pembayaran→Voucher,
│                     Pesanan, Favorit, Notifikasi, Profile, Setting
└── deploy/    docker-compose.yml (db+backend+web+backup), nginx host, .env.example
```

## Design tokens (Figma)
Primary hijau `#2FA84F` · Accent oranye `#F5A623` · Text `#04021D` · Cover `#2B2B2D`

## Akun demo
| Peran | Login |
|---|---|
| User (mobile) | `demo@miruum.id` / `demo123` |
| Admin (Back Office) | `admin@miruum.id` / `admin123` |
| Mitra (Extranet) | `partner@panji.id` / `partner123` |

## Menjalankan
**Deploy (VPS):** `cd deploy && cp .env.example .env && docker compose up -d --build`, lalu pasang nginx site + `certbot --nginx -d miruum.id`.

**Mobile:** `cd app && flutter build apk --release --dart-define=API_BASE=https://miruum.id/api`
Dev: `flutter run --dart-define=API_BASE=http://<host>:5013/api`
