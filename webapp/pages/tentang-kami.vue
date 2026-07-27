<template>
  <div>
    <!-- Hero -->
    <section class="relative overflow-hidden">
      <div class="absolute inset-0 bg-gradient-to-br from-[#1C3A52] via-[#20465f] to-[#122736]"></div>
      <div class="absolute -top-24 -right-24 w-96 h-96 rounded-full border border-[#FDCB3C]/20"></div>
      <div class="absolute -top-10 -right-10 w-72 h-72 rounded-full border border-brand/25"></div>
      <div class="relative container-site py-16 sm:py-24 text-white">
        <span class="pill bg-white/15 text-white mb-4">{{ t('Tentang Kami', 'About Us') }}</span>
        <h1 class="text-3xl sm:text-5xl font-display font-bold leading-tight max-w-3xl">
          {{ t('Dari hotel mewah sampai budget, semua ada di Miruum.', 'From luxury to budget hotels — everything is on Miruum.') }}
        </h1>
        <p class="mt-4 text-white/85 text-lg max-w-2xl">
          {{ t('Miruum adalah platform Online Travel Agent (OTA) yang dikembangkan oleh PT. Muara Mandita Indonesia.',
                'Miruum is an Online Travel Agent (OTA) platform developed by PT. Muara Mandita Indonesia.') }}
        </p>
        <div class="flex flex-wrap gap-3 mt-7">
          <a href="https://api.miruum.id/static/company-profile.html" target="_blank" rel="noopener"
             class="btn bg-[#FDCB3C] text-[#3a2f08] hover:brightness-95 px-6 py-3.5 font-bold shadow-pop">
            {{ t('Unduh Company Profile (PDF)', 'Download Company Profile (PDF)') }}
          </a>
          <a href="/mitra" class="btn border border-white/40 text-white hover:bg-white/10 px-6 py-3.5 font-semibold">{{ t('Untuk Mitra', 'For Partners') }}</a>
        </div>
      </div>
    </section>

    <!-- Background -->
    <section class="container-site py-14 sm:py-16">
      <div class="grid md:grid-cols-2 gap-10 items-start">
        <div>
          <span class="text-brand font-bold tracking-widest text-xs uppercase">{{ t('Latar Belakang', 'Our Background') }}</span>
          <h2 class="text-2xl sm:text-3xl font-display font-bold text-[#1C3A52] mt-2">{{ t('Perjalanan kami', 'Our journey') }}</h2>
          <div class="w-16 h-1 bg-[#FDCB3C] rounded mt-3 mb-5"></div>
          <p class="text-ink-muted leading-relaxed text-justify">
            {{ t('Berdiri sejak tahun 2021 dengan founder asal Indonesia, Bapak Iman R. Soegandono, Miruum lahir dari komitmen terhadap kepuasan pelanggan dan layanan perhotelan yang unggul. Standar keunggulan inilah yang mendorong kami tumbuh menjadi bisnis seperti hari ini.',
                  'Established in 2021 by its Indonesian founder, Mr. Iman R. Soegandono, Miruum was born from a commitment to customer satisfaction and excellent hospitality service. This standard of excellence has driven us to grow into the business we are today.') }}
          </p>
          <p class="text-ink-muted leading-relaxed text-justify mt-4">
            {{ t('Kami percaya bahwa pelanggan selalu yang utama — dan itu berarti produk yang luar biasa serta layanan yang luar biasa.',
                  'We believe the customer always comes first — and that means exceptional products and exceptional service.') }}
          </p>
        </div>
        <div class="grid gap-4">
          <div class="card p-6">
            <div class="text-2xl">🎯</div>
            <h3 class="font-bold mt-2">{{ t('Visi', 'Vision') }}</h3>
            <p class="text-ink-muted text-sm mt-1 text-justify">{{ t('Menjadi platform pemesanan akomodasi yang paling tepercaya, mudah, dan transparan di Indonesia.', 'To be the most trusted, easy, and transparent accommodation-booking platform in Indonesia.') }}</p>
          </div>
          <div class="card p-6">
            <div class="text-2xl">🚀</div>
            <h3 class="font-bold mt-2">{{ t('Misi', 'Mission') }}</h3>
            <p class="text-ink-muted text-sm mt-1 text-justify">{{ t('Menghadirkan harga terbaik, pembayaran aman, teknologi distribusi modern untuk mitra, dan layanan pelanggan yang responsif 24/7.', 'To deliver the best prices, secure payments, modern distribution technology for partners, and responsive 24/7 customer service.') }}</p>
          </div>
        </div>
      </div>
    </section>

    <!-- Services / Ecosystem -->
    <section class="bg-paper py-14 sm:py-16">
      <div class="container-site">
        <div class="text-center max-w-2xl mx-auto mb-10">
          <span class="text-brand font-bold tracking-widest text-xs uppercase">{{ t('Layanan Kami', 'Our Services') }}</span>
          <h2 class="text-2xl sm:text-3xl font-display font-bold text-[#1C3A52] mt-2">{{ t('Satu ekosistem, banyak solusi', 'One ecosystem, many solutions') }}</h2>
        </div>
        <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          <div v-for="s in services" :key="s.t" class="card p-6">
            <div class="text-2xl">{{ s.ic }}</div>
            <h3 class="font-bold mt-2">{{ s.t }}</h3>
            <p class="text-ink-muted text-sm mt-1 text-justify">{{ s.d }}</p>
          </div>
        </div>
        <div class="flex flex-wrap justify-center gap-2 mt-8">
          <span v-for="p in propertyTypes" :key="p" class="pill bg-white border border-line text-ink-muted">{{ p }}</span>
        </div>
      </div>
    </section>

    <!-- For guests / partners -->
    <section class="container-site py-14 sm:py-16">
      <div class="grid md:grid-cols-2 gap-10">
        <div>
          <h2 class="text-xl font-display font-bold text-[#1C3A52]">{{ t('Untuk Tamu', 'For Guests') }}</h2>
          <div class="w-14 h-1 bg-[#FDCB3C] rounded mt-2 mb-4"></div>
          <ul class="space-y-2.5">
            <li v-for="g in forGuests" :key="g" class="flex gap-3 text-sm"><span class="text-brand font-bold">✓</span><span>{{ g }}</span></li>
          </ul>
        </div>
        <div>
          <h2 class="text-xl font-display font-bold text-[#1C3A52]">{{ t('Untuk Mitra Properti', 'For Property Partners') }}</h2>
          <div class="w-14 h-1 bg-[#FDCB3C] rounded mt-2 mb-4"></div>
          <ul class="space-y-2.5">
            <li v-for="p in forPartners" :key="p" class="flex gap-3 text-sm"><span class="text-brand font-bold">✓</span><span>{{ p }}</span></li>
          </ul>
        </div>
      </div>
    </section>

    <!-- Technology partner -->
    <section class="container-site pb-6">
      <div class="rounded-2xl bg-[#1C3A52] text-white p-7 sm:p-9">
        <div class="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div class="text-[11px] tracking-widest text-white/60">{{ t('DIKEMBANGKAN BERSAMA', 'DEVELOPED WITH') }}</div>
            <div class="text-2xl font-display font-bold mt-1">PT. Zen Multimedia Indonesia</div>
          </div>
          <span class="pill bg-[#FDCB3C] text-[#3a2f08] font-bold">Technology Partner</span>
        </div>
        <p class="text-white/80 mt-4 text-sm max-w-3xl text-justify">
          {{ t('Platform Miruum — aplikasi mobile, website, Channel Manager, dan Extranet mitra — dibangun melalui kolaborasi teknologi dengan PT. Zen Multimedia Indonesia sebagai mitra pengembangan.',
                'The Miruum platform — mobile app, website, Channel Manager, and partner Extranet — is built through a technology collaboration with PT. Zen Multimedia Indonesia as development partner.') }}
        </p>
      </div>
    </section>

    <!-- Contact -->
    <section class="container-site py-14 sm:py-16">
      <div class="text-center max-w-xl mx-auto mb-8">
        <span class="text-brand font-bold tracking-widest text-xs uppercase">{{ t('Hubungi Kami', 'Get In Touch') }}</span>
        <h2 class="text-2xl sm:text-3xl font-display font-bold text-[#1C3A52] mt-2">{{ t('Mari terhubung', "Let's connect") }}</h2>
      </div>
      <div class="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div class="card p-5"><div class="text-[11px] text-ink-faint uppercase tracking-wide">{{ t('Alamat', 'Address') }}</div><div class="font-semibold mt-1 text-sm">Griya D'Ros 2nd Fl. Tebet Utara #34, South Jakarta — Indonesia 12820</div></div>
        <div class="card p-5"><div class="text-[11px] text-ink-faint uppercase tracking-wide">Email</div><div class="font-semibold mt-1">business@miruum.id</div><div class="text-[11px] text-ink-faint uppercase tracking-wide mt-3">Website</div><div class="font-semibold mt-1">miruum.id</div></div>
        <div class="card p-5"><div class="text-[11px] text-ink-faint uppercase tracking-wide">Customer Service</div><div class="font-bold mt-1 text-brand-700">0811 9628 286</div></div>
        <div class="card p-5"><div class="text-[11px] text-ink-faint uppercase tracking-wide">{{ t('Portal Mitra', 'Partner Portal') }}</div><a href="https://extranet.miruum.id" class="font-semibold mt-1 block text-brand-700">extranet.miruum.id</a></div>
      </div>
      <p class="text-center text-ink-faint text-xs mt-8">© {{ year }} PT. Muara Mandita Indonesia · in technology partnership with PT. Zen Multimedia Indonesia</p>
    </section>
  </div>
</template>

<script setup lang="ts">
const { t } = useLang()
const year = 2026

const services = computed(() => [
  { ic: '🏨', t: t('Hotel Reservation', 'Hotel Reservation'), d: t('Pesan akomodasi mudah, harga terbaik, bayar aman.', 'Easy accommodation booking, best prices, secure payment.') },
  { ic: '🔗', t: 'Channel Manager', d: t('Distribusi satu inventaris ke banyak OTA — anti-overbooking.', 'Host-to-host distribution to many OTAs — overbooking-proof.') },
  { ic: '📱', t: t('Aplikasi & Web', 'App & Web'), d: t('Cari, pesan, bayar, e-voucher, dan loyalti dalam genggaman.', 'Search, book, pay, e-voucher, and loyalty in one app.') },
  { ic: '🛎️', t: 'Extranet & PMS', d: t('Kelola kamar, harga, kalender, check-in/out, dan housekeeping.', 'Manage rooms, rates, calendar, check-in/out, and housekeeping.') },
  { ic: '🏢', t: t('Corporate & Government', 'Corporate & Government'), d: t('Kelola perjalanan dinas dengan tagihan & laporan terpusat.', 'Manage business travel with centralized billing & reports.') },
  { ic: '🔒', t: t('Aman & Tepercaya', 'Safe & Trusted'), d: t('Pembayaran terenkripsi, anti-fraud, dan kepatuhan UU PDP.', 'Encrypted payments, anti-fraud, and data-privacy compliance.') },
])
const propertyTypes = computed(() => ['Hotel', 'Villa', t('Apartemen', 'Apartment'), 'Homestay', 'Guest House', 'Hostel', 'Resort'])
const forGuests = computed(() => [
  t('Harga terbaik otomatis dari semua sumber.', 'Best price automatically across all sources.'),
  t('Pembayaran beragam & aman — VA, e-wallet, QRIS.', 'Diverse, secure payments — VA, e-wallet, QRIS.'),
  t('E-voucher instan & ulasan terverifikasi.', 'Instant e-voucher & verified reviews.'),
  t('Loyalti, voucher, dan Live Chat CS 24/7.', 'Loyalty, vouchers, and 24/7 live chat support.'),
])
const forPartners = computed(() => [
  t('Gratis mendaftar — komisi hanya saat ada pesanan.', 'Free to join — commission only on bookings.'),
  t('Extranet lengkap + Channel Manager anti-overbooking.', 'Full Extranet + overbooking-proof Channel Manager.'),
  t('Pembayaran tepat waktu, aman ke rekening.', 'On-time, secure payouts to your account.'),
  t('Analitik & Miruum Intelligent untuk optimasi harga.', 'Analytics & Miruum Intelligent for rate optimization.'),
])

useHead({ title: () => t('Tentang Kami — Miruum', 'About Us — Miruum') })
</script>
