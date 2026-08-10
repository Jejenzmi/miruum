<template>
  <footer class="mt-20 bg-navy-800 text-white">
    <div class="container-site py-14 grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
      <div>
        <img src="/logo.png" alt="Miruum" class="h-8 w-auto mb-3 brightness-0 invert" />
        <p class="text-sm text-white/60 leading-relaxed">{{ t('Pesan hotel, paket menginap, tour, venue & transfer bandara dengan harga terbaik.', 'Book hotels, stay packages, tours, venues & airport transfers at the best prices.') }}</p>
        <div v-if="socials.length" class="flex gap-2.5 mt-5">
          <a v-for="s in socials" :key="s.label" :href="s.url" target="_blank" rel="noopener"
             class="w-9 h-9 rounded-full bg-white/10 hover:bg-brand grid place-items-center transition-colors" :aria-label="s.label" v-html="s.icon"></a>
        </div>
      </div>
      <div>
        <h4 class="text-sm font-bold mb-4 text-white/90">{{ t('Jelajahi', 'Explore') }}</h4>
        <ul class="space-y-2.5 text-sm text-white/60">
          <li><NuxtLink to="/search" class="hover:text-brand-200">{{ t('Cari Hotel', 'Search Hotels') }}</NuxtLink></li>
          <li><NuxtLink to="/packages" class="hover:text-brand-200">{{ t('Paket Hotel', 'Hotel Packages') }}</NuxtLink></li>
          <li><NuxtLink to="/venues" class="hover:text-brand-200">{{ t('Venue & Meeting', 'Venues & Meetings') }}</NuxtLink></li>
          <li><NuxtLink to="/tours" class="hover:text-brand-200">{{ t('Tour & Aktivitas', 'Tours & Activities') }}</NuxtLink></li>
          <li><NuxtLink to="/articles" class="hover:text-brand-200">{{ t('Artikel & Inspirasi', 'Articles & Inspiration') }}</NuxtLink></li>
        </ul>
      </div>
      <div>
        <h4 class="text-sm font-bold mb-4 text-white/90">{{ t('Bantuan', 'Support') }}</h4>
        <ul class="space-y-2.5 text-sm text-white/60">
          <li><NuxtLink to="/tentang-kami" class="hover:text-brand-200">{{ t('Tentang Kami', 'About Us') }}</NuxtLink></li>
          <li><NuxtLink to="/content/terms" class="hover:text-brand-200">{{ t('Syarat & Ketentuan', 'Terms & Conditions') }}</NuxtLink></li>
          <li><NuxtLink to="/content/privacy" class="hover:text-brand-200">{{ t('Kebijakan Privasi', 'Privacy Policy') }}</NuxtLink></li>
          <li><a href="mailto:support@miruum.id" class="hover:text-brand-200">support@miruum.id</a></li>
        </ul>
      </div>
      <div>
        <h4 class="text-sm font-bold mb-4 text-white/90">{{ t('Untuk Bisnis', 'For Business') }}</h4>
        <ul class="space-y-2.5 text-sm text-white/60 mb-5">
          <li><NuxtLink to="/mitra" class="hover:text-brand-200">{{ t('Daftarkan Properti (Mitra)', 'List Your Property') }}</NuxtLink></li>
          <li><a href="https://corporate.miruum.id/corporate/register" class="hover:text-brand-200">Corporate & Government</a></li>
        </ul>
        <a :href="sc('appStoreUrl', 'https://play.google.com/store/apps/details?id=id.gokar.miruum')"
           target="_blank" rel="noopener" class="btn-brand btn-sm inline-flex items-center gap-2">
          <svg viewBox="0 0 24 24" class="w-4 h-4 fill-current" aria-hidden="true"><path d="M3.6 2.3 13 12 3.6 21.7a1.6 1.6 0 0 1-.6-1.3V3.6c0-.5.2-1 .6-1.3zM14.4 13.4l2.5 2.5-9.6 5.5zM14.4 10.6 7.3 2.6l9.6 5.5zM18.3 9.1l2.6 1.5c.8.5.8 1.9 0 2.4l-2.6 1.5-2.9-2.7z"/></svg>
          {{ sc('appStoreLabel', 'Unduh di Google Play', 'Get it on Google Play') }}
        </a>
      </div>
    </div>

    <!-- Payment methods + service guarantees -->
    <div class="border-t border-white/10">
      <div class="container-site py-8 grid gap-8 md:grid-cols-[1fr_auto] md:items-start">
        <div>
          <h4 class="text-sm font-bold mb-3 text-white/90">{{ sc('paymentMethodsTitle', 'Metode Pembayaran', 'Payment Methods') }}</h4>
          <div class="flex flex-wrap gap-2">
            <span v-for="p in payBadges" :key="p"
                  class="inline-flex items-center rounded-lg bg-white/10 px-3 py-1.5 text-[12px] font-bold text-white/75 tracking-wide">{{ p }}</span>
          </div>
        </div>
        <ul class="space-y-2.5 text-[13px] text-white/70 md:min-w-[260px]">
          <li class="flex items-center gap-2.5"><span class="w-7 h-7 rounded-full bg-teal/20 text-teal grid place-items-center shrink-0"><svg viewBox="0 0 24 24" class="w-4 h-4 fill-none stroke-current" stroke-width="2"><rect x="4" y="10.5" width="16" height="10" rx="2" /><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" /></svg></span>{{ sc('trustSecure', 'Pembayaran aman & terenkripsi', 'Secure encrypted payment') }}</li>
          <li class="flex items-center gap-2.5"><span class="w-7 h-7 rounded-full bg-brand/20 text-brand-200 grid place-items-center shrink-0"><svg viewBox="0 0 24 24" class="w-4 h-4 fill-none stroke-current" stroke-width="2"><path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" stroke-linejoin="round" /></svg></span>{{ sc('trustInstant', 'Konfirmasi instan', 'Instant confirmation') }}</li>
          <li class="flex items-center gap-2.5"><span class="w-7 h-7 rounded-full bg-brand/20 text-brand-200 grid place-items-center shrink-0"><svg viewBox="0 0 24 24" class="w-4 h-4 fill-none stroke-current" stroke-width="2"><path d="M4 14v-2a8 8 0 0 1 16 0v2" /><rect x="2.5" y="14" width="4" height="6" rx="1.5" /><rect x="17.5" y="14" width="4" height="6" rx="1.5" /></svg></span>{{ sc('trustSupport', 'Dukungan 24/7', '24/7 support') }}</li>
        </ul>
      </div>
    </div>

    <div class="border-t border-white/10 py-5 text-center text-[13px] text-white/45">
      © {{ new Date().getFullYear() }} Miruum · miruum.id — {{ t('sah tanpa tanda tangan basah.', 'valid without a wet signature.') }}
    </div>
  </footer>
</template>

<script setup lang="ts">
const { t } = useLang()
const { $api } = useNuxtApp()
const { sc } = await useSiteCopy()

const FALLBACK_METHODS = ['BCA', 'BNI', 'Mandiri', 'BRI', 'Permata', 'QRIS', 'GoPay', 'OVO', 'DANA', 'ShopeePay']
const { data: pmData } = await useAsyncData('footer-payment-methods', () => $api('/payment-methods').catch(() => ({ methods: [] })))
const shortLabel = (name: string) => String(name || '').replace(/\s*\([^)]*\)/g, '').replace(/\s*virtual account\s*/i, ' ').trim()
const payBadges = computed<string[]>(() => {
  const groups = ((pmData.value as any)?.methods || []) as any[]
  const list = groups.flatMap((g: any) => (g?.items || []).map((m: any) => shortLabel(m?.name)))
  const uniq = [...new Set(list.filter(Boolean))]
  return uniq.length ? uniq : FALLBACK_METHODS
})

// Social links are admin-configurable (Back Office copy); shown only when set.
const IG = '<svg viewBox=\'0 0 24 24\' class=\'w-4 h-4 fill-current\'><path d=\'M12 2.2c3.2 0 3.6 0 4.9.1 1.2.1 1.8.3 2.2.4.6.2 1 .5 1.4.9.4.4.7.8.9 1.4.2.4.4 1 .4 2.2.1 1.3.1 1.7.1 4.9s0 3.6-.1 4.9c-.1 1.2-.3 1.8-.4 2.2-.2.6-.5 1-.9 1.4-.4.4-.8.7-1.4.9-.4.2-1 .4-2.2.4-1.3.1-1.7.1-4.9.1s-3.6 0-4.9-.1c-1.2-.1-1.8-.3-2.2-.4-.6-.2-1-.5-1.4-.9-.4-.4-.7-.8-.9-1.4-.2-.4-.4-1-.4-2.2C2.2 15.6 2.2 15.2 2.2 12s0-3.6.1-4.9c.1-1.2.3-1.8.4-2.2.2-.6.5-1 .9-1.4.4-.4.8-.7 1.4-.9.4-.2 1-.4 2.2-.4C8.4 2.2 8.8 2.2 12 2.2m0 1.9c-3.1 0-3.5 0-4.8.1-.9 0-1.4.2-1.7.3-.4.2-.7.4-1 .7-.3.3-.5.6-.7 1-.1.3-.3.8-.3 1.7-.1 1.3-.1 1.7-.1 4.8s0 3.5.1 4.8c0 .9.2 1.4.3 1.7.2.4.4.7.7 1 .3.3.6.5 1 .7.3.1.8.3 1.7.3 1.3.1 1.7.1 4.8.1s3.5 0 4.8-.1c.9 0 1.4-.2 1.7-.3.4-.2.7-.4 1-.7.3-.3.5-.6.7-1 .1-.3.3-.8.3-1.7.1-1.3.1-1.7.1-4.8s0-3.5-.1-4.8c0-.9-.2-1.4-.3-1.7-.2-.4-.4-.7-.7-1-.3-.3-.6-.5-1-.7-.3-.1-.8-.3-1.7-.3-1.3-.1-1.7-.1-4.8-.1m0 3.3a4.6 4.6 0 1 1 0 9.2 4.6 4.6 0 0 1 0-9.2m0 7.6a3 3 0 1 0 0-6 3 3 0 0 0 0 6m5.8-7.8a1.1 1.1 0 1 1-2.2 0 1.1 1.1 0 0 1 2.2 0\'/></svg>'
const FB = '<svg viewBox=\'0 0 24 24\' class=\'w-4 h-4 fill-current\'><path d=\'M22 12a10 10 0 1 0-11.6 9.9v-7H7.9V12h2.5V9.8c0-2.5 1.5-3.9 3.8-3.9 1.1 0 2.2.2 2.2.2v2.5h-1.3c-1.2 0-1.6.8-1.6 1.6V12h2.8l-.4 2.9h-2.4v7A10 10 0 0 0 22 12\'/></svg>'
const WA = '<svg viewBox=\'0 0 24 24\' class=\'w-4 h-4 fill-current\'><path d=\'M17.5 14.4c-.3-.1-1.7-.8-1.9-.9-.3-.1-.5-.1-.7.1-.2.3-.7.9-.9 1.1-.2.2-.3.2-.6.1-1.7-.9-2.9-1.6-4-3.5-.3-.5.3-.5.8-1.5.1-.2 0-.4 0-.5 0-.1-.7-1.6-.9-2.2-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.5s1.1 2.9 1.2 3.1c.1.2 2.1 3.3 5.2 4.6 1.9.8 2.7.9 3.6.8.6-.1 1.7-.7 1.9-1.4.2-.7.2-1.2.2-1.4-.1-.1-.3-.2-.6-.3M12 2a10 10 0 0 0-8.6 15l-1.4 5 5.1-1.3A10 10 0 1 0 12 2m0 18.3c-1.6 0-3.1-.4-4.5-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.3 8.3 0 1 1 12 20.3\'/></svg>'
const socials = computed(() => {
  const raw = [
    { label: 'Instagram', url: sc('socialInstagram', ''), icon: IG },
    { label: 'Facebook', url: sc('socialFacebook', ''), icon: FB },
    { label: 'WhatsApp', url: sc('socialWhatsapp', ''), icon: WA },
  ]
  return raw.filter((s) => s.url && s.url !== '#')
})
</script>
