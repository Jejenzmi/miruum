<template>
  <footer class="mt-20 border-t border-line bg-white">
    <div class="container-site py-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
      <div>
        <img src="/logo.png" alt="Miruum" class="h-8 w-auto mb-3" />
        <p class="text-sm text-ink-muted leading-relaxed">Pesan hotel, paket menginap, tour & transfer bandara dengan harga terbaik.</p>
      </div>
      <div>
        <h4 class="text-sm font-bold mb-3">Jelajahi</h4>
        <ul class="space-y-2 text-sm text-ink-muted">
          <li><NuxtLink to="/search" class="hover:text-brand-600">Cari Hotel</NuxtLink></li>
          <li><NuxtLink to="/packages" class="hover:text-brand-600">Paket Hotel</NuxtLink></li>
          <li><NuxtLink to="/tours" class="hover:text-brand-600">Tour & Aktivitas</NuxtLink></li>
          <li><NuxtLink to="/shuttle" class="hover:text-brand-600">Transfer Bandara</NuxtLink></li>
        </ul>
      </div>
      <div>
        <h4 class="text-sm font-bold mb-3">Bantuan</h4>
        <ul class="space-y-2 text-sm text-ink-muted">
          <li><NuxtLink to="/content/about" class="hover:text-brand-600">Tentang Miruum</NuxtLink></li>
          <li><NuxtLink to="/content/terms" class="hover:text-brand-600">Syarat & Ketentuan</NuxtLink></li>
          <li><NuxtLink to="/content/privacy" class="hover:text-brand-600">Kebijakan Privasi</NuxtLink></li>
          <li><a href="mailto:support@miruum.id" class="hover:text-brand-600">support@miruum.id</a></li>
        </ul>
      </div>
      <div>
        <h4 class="text-sm font-bold mb-3">Aplikasi Mobile</h4>
        <p class="text-sm text-ink-muted mb-3">Unduh aplikasi Miruum untuk Android.</p>
        <a href="/ota.apk" class="btn-brand btn-sm">Unduh APK</a>
      </div>
    </div>
    <div class="border-t border-line py-5 text-center text-[13px] text-ink-faint">
      © {{ new Date().getFullYear() }} Miruum · miruum.id — sah tanpa tanda tangan basah.
    </div>
  </footer>
</template>
