<template>
  <footer class="mt-20 border-t border-line bg-white">
    <div class="container-site py-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
      <div>
        <img src="/logo.png" alt="Miruum" class="h-8 w-auto mb-3" />
        <p class="text-sm text-ink-muted leading-relaxed">{{ t('Pesan hotel, paket menginap, tour & transfer bandara dengan harga terbaik.', 'Book hotels, stay packages, tours & airport transfers at the best prices.') }}</p>
      </div>
      <div>
        <h4 class="text-sm font-bold mb-3">{{ t('Jelajahi', 'Explore') }}</h4>
        <ul class="space-y-2 text-sm text-ink-muted">
          <li><NuxtLink to="/search" class="hover:text-brand-600">{{ t('Cari Hotel', 'Search Hotels') }}</NuxtLink></li>
          <li><NuxtLink to="/packages" class="hover:text-brand-600">{{ t('Paket Hotel', 'Hotel Packages') }}</NuxtLink></li>
          <li><NuxtLink to="/tours" class="hover:text-brand-600">{{ t('Tour & Aktivitas', 'Tours & Activities') }}</NuxtLink></li>
          <li><NuxtLink to="/shuttle" class="hover:text-brand-600">{{ t('Transfer Bandara', 'Airport Transfer') }}</NuxtLink></li>
          <li><NuxtLink to="/articles" class="hover:text-brand-600">{{ t('Artikel & Inspirasi', 'Articles & Inspiration') }}</NuxtLink></li>
        </ul>
      </div>
      <div>
        <h4 class="text-sm font-bold mb-3">{{ t('Bantuan', 'Help') }}</h4>
        <ul class="space-y-2 text-sm text-ink-muted">
          <li><NuxtLink to="/content/about" class="hover:text-brand-600">{{ t('Tentang Miruum', 'About Miruum') }}</NuxtLink></li>
          <li><NuxtLink to="/content/terms" class="hover:text-brand-600">{{ t('Syarat & Ketentuan', 'Terms & Conditions') }}</NuxtLink></li>
          <li><NuxtLink to="/content/privacy" class="hover:text-brand-600">{{ t('Kebijakan Privasi', 'Privacy Policy') }}</NuxtLink></li>
          <li><a href="mailto:support@miruum.id" class="hover:text-brand-600">support@miruum.id</a></li>
        </ul>
      </div>
      <div>
        <h4 class="text-sm font-bold mb-3">{{ t('Untuk Bisnis', 'For Business') }}</h4>
        <ul class="space-y-2 text-sm text-ink-muted mb-4">
          <li><NuxtLink to="/mitra" class="hover:text-brand-600">{{ t('Daftarkan Properti (Mitra)', 'List Your Property (Partner)') }}</NuxtLink></li>
          <li><a href="https://corporate.miruum.id/corporate/register" class="hover:text-brand-600">Corporate & Government</a></li>
        </ul>
        <h4 class="text-sm font-bold mb-2">{{ t('Aplikasi Mobile', 'Mobile App') }}</h4>
        <a href="/ota.apk" class="btn-brand btn-sm">{{ t('Unduh APK Android', 'Download Android APK') }}</a>
      </div>
    </div>
    <div class="border-t border-line py-5 text-center text-[13px] text-ink-faint">
      © {{ new Date().getFullYear() }} Miruum · miruum.id — {{ t('sah tanpa tanda tangan basah.', 'valid without a wet signature.') }}
    </div>
  </footer>
</template>

<script setup lang="ts">
const { t } = useLang()
</script>
