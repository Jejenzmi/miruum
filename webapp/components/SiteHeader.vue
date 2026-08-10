<template>
  <header class="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-line">
    <div class="container-site flex items-center gap-4 h-16">
      <NuxtLink to="/" class="flex items-center shrink-0">
        <img src="/logo.png" alt="Miruum" class="h-8 sm:h-9 w-auto" />
      </NuxtLink>

      <nav class="hidden md:flex items-center gap-1 ml-2 text-[15px] font-semibold text-ink-muted">
        <NuxtLink to="/search" active-class="!text-brand-700 bg-brand-50" class="px-3 py-2 rounded-lg hover:text-brand hover:bg-brand-50 transition-colors">{{ t('Hotel', 'Hotels') }}</NuxtLink>
        <NuxtLink to="/packages" active-class="!text-brand-700 bg-brand-50" class="px-3 py-2 rounded-lg hover:text-brand hover:bg-brand-50 transition-colors">{{ t('Paket', 'Packages') }}</NuxtLink>
        <NuxtLink v-if="modules.tour" to="/tours" active-class="!text-brand-700 bg-brand-50" class="px-3 py-2 rounded-lg hover:text-brand hover:bg-brand-50 transition-colors">{{ t('Tour', 'Tours') }}</NuxtLink>
        <NuxtLink v-if="modules.shuttle" to="/shuttle" active-class="!text-brand-700 bg-brand-50" class="px-3 py-2 rounded-lg hover:text-brand hover:bg-brand-50 transition-colors">{{ t('Transfer Bandara', 'Airport Transfer') }}</NuxtLink>
        <NuxtLink v-if="modules.venue" to="/venues" active-class="!text-brand-700 bg-brand-50" class="px-3 py-2 rounded-lg hover:text-brand hover:bg-brand-50 transition-colors">{{ t('Venue & Meeting', 'Venues & Meetings') }}</NuxtLink>
        <NuxtLink to="/articles" active-class="!text-brand-700 bg-brand-50" class="px-3 py-2 rounded-lg hover:text-brand hover:bg-brand-50 transition-colors">{{ t('Artikel', 'Articles') }}</NuxtLink>
      </nav>

      <div class="flex-1"></div>

      <div class="flex items-center gap-2">
        <!-- Pemilih bahasa / Language switcher (sama seperti aplikasi) -->
        <!-- Nationality (market) pricing selector — only when enabled by admin -->
        <div v-if="marketEnabled" class="flex items-center rounded-full border border-line overflow-hidden text-[12px] font-bold shrink-0"
             :title="t('Harga tamu asing +' + marketMarkup + '%', 'Foreign-guest price +' + marketMarkup + '%')">
          <button @click="setMarket('DOMESTIC')" class="px-2.5 py-1.5 flex items-center gap-1"
                  :class="market === 'DOMESTIC' ? 'bg-brand text-white' : 'text-ink-muted hover:bg-brand-50'">🇮🇩 {{ t('Domestik', 'Local') }}</button>
          <button @click="setMarket('FOREIGN')" class="px-2.5 py-1.5 flex items-center gap-1"
                  :class="market === 'FOREIGN' ? 'bg-brand text-white' : 'text-ink-muted hover:bg-brand-50'">🌐 {{ t('Asing', 'Foreign') }}</button>
        </div>

        <div class="flex items-center rounded-full border border-line overflow-hidden text-[12px] font-bold shrink-0">
          <button @click="setLang('id')" class="px-2.5 py-1.5"
                  :class="!isEn ? 'bg-brand text-white' : 'text-ink-muted hover:bg-brand-50'">ID</button>
          <button @click="setLang('en')" class="px-2.5 py-1.5"
                  :class="isEn ? 'bg-brand text-white' : 'text-ink-muted hover:bg-brand-50'">EN</button>
        </div>

        <template v-if="isLoggedIn">
          <ClientOnly>
            <div class="relative">
              <button @click="notifOpen = !notifOpen" class="w-10 h-10 rounded-full grid place-items-center hover:bg-brand-50 relative">
                <svg viewBox="0 0 24 24" class="w-5 h-5 fill-none stroke-ink-muted" stroke-width="2"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a2 2 0 0 0 3.4 0"/></svg>
                <span v-if="unread" class="absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full bg-red-500 ring-2 ring-white"></span>
              </button>
              <div v-if="notifOpen" class="absolute right-0 mt-2 w-80 max-w-[90vw] card shadow-pop max-h-[70vh] overflow-y-auto">
                <div class="px-4 py-3 border-b border-line font-bold text-[15px]">{{ t('Notifikasi', 'Notifications') }}</div>
                <NuxtLink v-for="n in notifications" :key="n.id" :to="n.orderCode ? '/account/bookings' : '#'" @click="notifOpen = false"
                          class="block px-4 py-3 border-b border-line/60 hover:bg-brand-50">
                  <div class="font-semibold text-[14px]">{{ n.title }}</div>
                  <div class="text-[12.5px] text-ink-muted line-clamp-2">{{ n.body }}</div>
                  <div class="text-[11px] text-ink-faint mt-0.5">{{ fmtDate(n.createdAt) }}</div>
                </NuxtLink>
                <div v-if="!notifications.length" class="px-4 py-8 text-center text-ink-faint text-sm">{{ t('Belum ada notifikasi.', 'No notifications yet.') }}</div>
              </div>
            </div>
          </ClientOnly>
          <NuxtLink to="/account/bookings" class="hidden sm:inline-flex btn-ghost btn-sm">{{ t('Pesanan Saya', 'My Orders') }}</NuxtLink>
          <div class="relative" @mouseleave="open = false">
            <button @click="open = !open" class="flex items-center gap-2 rounded-full border border-line pl-1 pr-3 py-1 hover:border-brand">
              <span class="w-8 h-8 rounded-full bg-brand-100 text-brand-700 grid place-items-center font-bold text-sm overflow-hidden">
                <img v-if="avatar" :src="avatar" class="w-full h-full object-cover" alt="" />
                <span v-else>{{ (user?.name || 'U').charAt(0).toUpperCase() }}</span>
              </span>
              <span class="text-sm font-semibold text-ink hidden sm:block max-w-[100px] truncate">{{ user?.name }}</span>
            </button>
            <div v-if="open" class="absolute right-0 mt-2 w-52 card shadow-pop py-2 text-[15px]">
              <NuxtLink to="/account" class="block px-4 py-2 hover:bg-brand-50">{{ t('Profil', 'Profile') }}</NuxtLink>
              <NuxtLink to="/account/bookings" class="block px-4 py-2 hover:bg-brand-50">{{ t('Pesanan Saya', 'My Orders') }}</NuxtLink>
              <NuxtLink to="/account/favorites" class="block px-4 py-2 hover:bg-brand-50">{{ t('Favorit', 'Favorites') }}</NuxtLink>
              <NuxtLink to="/account/vouchers" class="block px-4 py-2 hover:bg-brand-50">{{ t('Voucher Saya', 'My Vouchers') }}</NuxtLink>
              <NuxtLink to="/account/loyalty" class="block px-4 py-2 hover:bg-brand-50">{{ t('Poin Miruum', 'Miruum Points') }}</NuxtLink>
              <NuxtLink to="/account/security" class="block px-4 py-2 hover:bg-brand-50">{{ t('Keamanan', 'Security') }}</NuxtLink>
              <NuxtLink to="/compare" class="block px-4 py-2 hover:bg-brand-50">{{ t('Bandingkan Hotel', 'Compare Hotels') }}</NuxtLink>
              <hr class="my-2 border-line" />
              <button @click="logout" class="block w-full text-left px-4 py-2 text-red-600 hover:bg-red-50">{{ t('Keluar', 'Log out') }}</button>
            </div>
          </div>
        </template>
        <template v-else>
          <NuxtLink to="/login" class="btn-ghost btn-sm">{{ t('Masuk', 'Sign in') }}</NuxtLink>
          <NuxtLink to="/register" class="btn-brand btn-sm hidden sm:inline-flex">{{ t('Daftar', 'Sign up') }}</NuxtLink>
        </template>
      </div>
    </div>

    <!-- Strip kepercayaan tipis — hanya di layar md ke atas agar nav tetap lega -->
    <div class="hidden md:block border-t border-line/70 bg-paper/50">
      <div class="container-site py-1.5 flex items-center gap-2 text-[12px] text-ink-faint">
        <svg viewBox="0 0 24 24" class="w-3.5 h-3.5 fill-none stroke-current shrink-0" stroke-width="2">
          <path d="M12 3 4.5 6v5.5c0 4.4 3.1 8.2 7.5 9.5 4.4-1.3 7.5-5.1 7.5-9.5V6L12 3Z" stroke-linejoin="round" />
        </svg>
        <span>{{ sc('trustStrip', 'Konfirmasi instan · Pembayaran aman · Batal gratis di properti terpilih', 'Instant confirmation · Secure payment · Free cancellation on selected properties') }}</span>
      </div>
    </div>
  </header>
</template>

<script setup lang="ts">
const { $api } = useNuxtApp()
const { isLoggedIn, user, logout } = useAuth()
const { t, isEn, setLang } = useLang()
// Nationality (market) pricing selector — Domestik/Asing.
const { enabled: marketEnabled, market, markup: marketMarkup, setMarket } = useMarket()
// Copy strip kepercayaan dikelola dari Back Office (fallback = teks di bawah).
const { sc } = await useSiteCopy()
const open = ref(false)
const notifOpen = ref(false)
const avatar = computed(() => user.value?.photoUrl || user.value?.avatarUrl || '')

// Notifications (client-side; requires auth)
const notifications = ref<any[]>([])
const unread = computed(() => notifications.value.some((n) => !n.read))
onMounted(async () => {
  if (!isLoggedIn.value) return
  try { const r: any = await $api('/notifications'); notifications.value = r.notifications || [] } catch {}
})

const { data: cfg } = await useAsyncData('appcfg', () => $api('/app/config').catch(() => ({ modules: {} })))
const modules = computed<any>(() => (cfg.value as any)?.modules || { tour: false, shuttle: false })
</script>
