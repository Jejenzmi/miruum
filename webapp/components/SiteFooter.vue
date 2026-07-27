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
          <li><NuxtLink to="/tentang-kami" class="hover:text-brand-600">{{ t('Tentang Kami', 'About Us') }}</NuxtLink></li>
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
        <a :href="sc('appStoreUrl', 'https://play.google.com/store/apps/details?id=id.gokar.miruum')"
           target="_blank" rel="noopener" class="btn-brand btn-sm inline-flex items-center gap-2">
          <svg viewBox="0 0 24 24" class="w-4 h-4 fill-current" aria-hidden="true"><path d="M3.6 2.3 13 12 3.6 21.7a1.6 1.6 0 0 1-.6-1.3V3.6c0-.5.2-1 .6-1.3zM14.4 13.4l2.5 2.5-9.6 5.5zM14.4 10.6 7.3 2.6l9.6 5.5zM18.3 9.1l2.6 1.5c.8.5.8 1.9 0 2.4l-2.6 1.5-2.9-2.7z"/></svg>
          {{ sc('appStoreLabel', 'Unduh di Google Play', 'Get it on Google Play') }}
        </a>
      </div>
    </div>
    <!-- Blok kepercayaan: metode pembayaran + jaminan layanan -->
    <div class="border-t border-line bg-paper/60">
      <div class="container-site py-8 grid gap-8 md:grid-cols-[1fr_auto] md:items-start">
        <div>
          <h4 class="text-sm font-bold mb-3">{{ sc('paymentMethodsTitle', 'Metode Pembayaran', 'Payment Methods') }}</h4>
          <div class="flex flex-wrap gap-2">
            <span v-for="p in payBadges" :key="p"
                  class="inline-flex items-center rounded-lg border border-line bg-white px-3 py-1.5 text-[12px] font-bold text-ink-muted tracking-wide">
              {{ p }}
            </span>
          </div>
        </div>

        <ul class="space-y-2.5 text-[13px] text-ink-muted md:min-w-[260px]">
          <li class="flex items-center gap-2.5">
            <span class="w-7 h-7 rounded-full bg-leaf-soft text-leaf-dark grid place-items-center shrink-0">
              <svg viewBox="0 0 24 24" class="w-4 h-4 fill-none stroke-current" stroke-width="2">
                <rect x="4" y="10.5" width="16" height="10" rx="2" /><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" />
              </svg>
            </span>
            {{ sc('trustSecure', 'Pembayaran aman & terenkripsi', 'Secure encrypted payment') }}
          </li>
          <li class="flex items-center gap-2.5">
            <span class="w-7 h-7 rounded-full bg-brand-50 text-brand-700 grid place-items-center shrink-0">
              <svg viewBox="0 0 24 24" class="w-4 h-4 fill-none stroke-current" stroke-width="2">
                <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" stroke-linejoin="round" />
              </svg>
            </span>
            {{ sc('trustInstant', 'Konfirmasi instan', 'Instant confirmation') }}
          </li>
          <li class="flex items-center gap-2.5">
            <span class="w-7 h-7 rounded-full bg-brand-50 text-brand-700 grid place-items-center shrink-0">
              <svg viewBox="0 0 24 24" class="w-4 h-4 fill-none stroke-current" stroke-width="2">
                <path d="M4 14v-2a8 8 0 0 1 16 0v2" /><rect x="2.5" y="14" width="4" height="6" rx="1.5" />
                <rect x="17.5" y="14" width="4" height="6" rx="1.5" /><path d="M19.5 20v.5a2.5 2.5 0 0 1-2.5 2.5h-3" />
              </svg>
            </span>
            {{ sc('trustSupport', 'Dukungan 24/7', '24/7 support') }}
          </li>
        </ul>
      </div>
    </div>

    <div class="border-t border-line py-5 text-center text-[13px] text-ink-faint">
      © {{ new Date().getFullYear() }} Miruum · miruum.id — {{ t('sah tanpa tanda tangan basah.', 'valid without a wet signature.') }}
    </div>
  </footer>
</template>

<script setup lang="ts">
const { t } = useLang()
const { $api } = useNuxtApp()
// Judul metode pembayaran + tiga jaminan dikelola dari Back Office.
const { sc } = await useSiteCopy()

// Badge metode pembayaran diambil dari katalog gateway yang sebenarnya.
// Teks saja (bukan logo) — CSP memblokir aset remote & kami tidak memiliki file merek.
const FALLBACK_METHODS = ['BCA', 'BNI', 'Mandiri', 'BRI', 'Permata', 'QRIS', 'GoPay', 'OVO', 'DANA', 'ShopeePay']

const { data: pmData } = await useAsyncData('footer-payment-methods',
  () => $api('/payment-methods').catch(() => ({ methods: [] })))

/** "BCA Virtual Account" → "BCA"; "QRIS (semua e-wallet…)" → "QRIS". */
const shortLabel = (name: string) =>
  String(name || '')
    .replace(/\s*\([^)]*\)/g, '')
    .replace(/\s*virtual account\s*/i, ' ')
    .trim()

const payBadges = computed<string[]>(() => {
  const groups = ((pmData.value as any)?.methods || []) as any[]
  const list = groups.flatMap((g: any) => (g?.items || []).map((m: any) => shortLabel(m?.name)))
  const uniq = [...new Set(list.filter(Boolean))]
  return uniq.length ? uniq : FALLBACK_METHODS
})
</script>
