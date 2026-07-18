# Miruum — Persiapan Upload Google Play Store

## 1. Berkas rilis (AAB)
- **File:** Android App Bundle (release, signed)
- **Unduh:** https://api.miruum.id/miruum.aab  (28.7 MB)
- **Di server:** `/root/ota/app/build/app/outputs/bundle/release/app-release.aab`
- **Package name (Application ID):** `id.gokar.miruum`  *(permanen — tidak bisa diubah setelah publish)*
- **versionName / versionCode:** `1.1.0` / `2`  (atur di `app/pubspec.yaml` → `version: 1.1.0+2`)
- **Signing:** upload key `miruum-release.keystore` (alias `miruum`), SHA-1 `27:6C:77:E5:DF:5C:95:34:A3:BB:CA:BE:99:B8:44:C9:C2:05:61:19`
  - Aktifkan **Play App Signing** saat upload pertama (disarankan Google).
  - **PENTING:** simpan `miruum-release.keystore` + `key.properties` baik-baik; hilang = tak bisa update app.

### Rebuild AAB (bila perlu versi baru)
Naikkan dulu `version:` di `app/pubspec.yaml` (mis. `1.1.1+3`), lalu:
```
docker run --rm -v /root/ota/app:/app -v /root/.pubcache:/root/.pub-cache -w /app \
  ghcr.io/cirruslabs/flutter:3.24.5 bash -lc \
  "flutter pub get && flutter build appbundle --release \
   --dart-define=API_BASE=https://api.miruum.id/api \
   --dart-define=GOOGLE_SERVER_CLIENT_ID=987023196687-0dj97fungsqi4ai98mqcs92nqboghlqg.apps.googleusercontent.com"
```

---

## 2. Store listing — Teks

**Nama aplikasi (maks 30):**
```
Miruum
```

**Deskripsi singkat (maks 80 karakter):**
```
Pesan hotel, paket, tour & transfer bandara dengan harga terbaik.
```

**Deskripsi lengkap (maks 4000 karakter):**
```
Miruum adalah aplikasi pemesanan hotel dan perjalanan yang membuat liburan & perjalanan dinas Anda jadi mudah, cepat, dan hemat.

Temukan tempat menginap terbaik — dari hotel bintang lima, resort, villa, apartemen, homestay, hingga guest house — dengan harga terbaik yang dijamin. Bandingkan, pilih, pesan, dan bayar dalam hitungan menit.

FITUR UTAMA
• Cari & filter hotel berdasarkan harga, rating, bintang, fasilitas, dan tipe properti
• Detail lengkap: foto, kamar & rate plan, ulasan tamu, peta lokasi, dan yang ada di sekitar
• Paket menginap hemat (kamar + sarapan + benefit) dalam satu harga
• Tour & aktivitas serta transfer Bandara Soekarno-Hatta
• Pembayaran aman: Virtual Account bank, e-wallet, dan QRIS
• E-voucher & invoice resmi, check-in online dengan kode akses kamar
• Kelola pesanan: reschedule, pembatalan & refund
• Poin loyalti Miruum, voucher, dan program undang teman
• Favorit, bandingkan hotel, pantau harga turun, dan notifikasi
• Live chat CS + chat langsung dengan hotel
• Login mudah dengan email atau akun Google

KENAPA MIRUUM?
• Harga terbaik otomatis dari berbagai sumber
• Pembayaran terenkripsi & aman
• Dukungan pelanggan 24/7
• Antarmuka simpel & nyaman dipakai

Unduh Miruum sekarang dan rencanakan perjalanan Anda berikutnya dengan tenang!

Punya hotel atau properti? Daftarkan properti Anda di https://miruum.id/mitra dan jangkau jutaan tamu.
```

---

## 3. Aset grafis yang WAJIB disiapkan
| Aset | Ukuran | Catatan |
|---|---|---|
| Ikon aplikasi | **512 × 512** PNG (32-bit, < 1 MB) | pakai logo/mark Miruum (kotak) |
| Feature graphic | **1024 × 500** PNG/JPG | banner toko (judul + logo) |
| Screenshot HP | 2–8 gambar, min sisi 320px, rasio 9:16 | ambil dari layar: Beranda, Cari, Detail Hotel, Pembayaran, Pesanan |
| (Opsional) Screenshot Tablet 7"/10" | — | jika menargetkan tablet |

> Ikon 512×512 & feature graphic belum saya buatkan (butuh desain gambar). Bisa saya bantu buat versi sederhana dari logo Miruum bila Anda mau.

---

## 4. Kolom listing lain (isi di Play Console)
- **Kategori:** Travel & Local
- **Email kontak:** support@miruum.id
- **Website:** https://miruum.id
- **Kebijakan Privasi (URL wajib):** https://miruum.id/content/privacy
- **Syarat & Ketentuan:** https://miruum.id/content/terms
- **Content rating:** isi kuesioner (perkiraan hasil: Rated for 3+ / Everyone)
- **Data safety:** deklarasikan data yang dikumpulkan — Nama, Email, No. HP, lokasi (opsional untuk "hotel di sekitar"), data pembayaran diproses oleh payment gateway. Semua dienkripsi saat transit; pengguna dapat meminta hapus akun (fitur Hapus Akun tersedia di app).
- **Target audience:** Dewasa / 18+ (opsional 13+)
- **Ads:** Tidak ada iklan

---

## 5. Langkah upload ringkas
1. Buat app baru di **Google Play Console** → isi nama "Miruum", bahasa default Indonesia.
2. Lengkapi **Store listing** (teks di atas + aset grafis).
3. **App content**: Privacy policy, Data safety, Content rating, Target audience, Ads.
4. **Production → Create new release** → upload `miruum.aab` → aktifkan Play App Signing.
5. Isi **release notes**, lalu **Review & Rollout**.
6. Tunggu peninjauan Google (biasanya beberapa jam–beberapa hari).
