<template>
  <div v-if="pkg" class="container-site py-6 max-w-5xl">
    <div class="grid lg:grid-cols-[1fr_360px] gap-8">
      <div>
        <div class="rounded-xl2 overflow-hidden aspect-video bg-line mb-5">
          <img :src="pkg.imageUrl" :alt="pkg.title" class="w-full h-full object-cover" />
        </div>
        <div class="flex items-center gap-2 mb-2">
          <StarRating :value="pkg.starRating" />
          <RatingBadge :rating="pkg.rating" :count="pkg.reviewCount" />
        </div>
        <h1 class="text-2xl sm:text-3xl font-display font-bold">{{ pkg.title }}</h1>
        <p v-if="pkg.hotelName || pkg.hotel?.name" class="text-brand-700 font-semibold text-[14px] mt-1 flex items-center gap-1">
          <svg viewBox="0 0 24 24" class="w-4 h-4 fill-none stroke-current" stroke-width="2"><path d="M3 21h18M5 21V7l7-4 7 4v14M9 9h.01M9 13h.01M15 9h.01M15 13h.01"/></svg>
          {{ pkg.hotelName || pkg.hotel?.name }}
        </p>
        <div class="flex flex-wrap gap-2 mt-2.5">
          <span class="pill bg-navy/10 text-navy font-semibold">{{ pkg.nights }}N / {{ pkg.days }}D</span>
          <span class="pill bg-navy/10 text-navy font-semibold">{{ pkg.guests }} {{ t('tamu', 'guests') }}</span>
          <span class="pill bg-navy/10 text-navy font-semibold">{{ boardBasis }}</span>
          <span class="pill bg-brand-50 text-brand-700 font-semibold">📍 {{ pkg.city }}</span>
        </div>

        <div v-if="pkg.inclusions?.length" class="card p-5 mt-5">
          <h2 class="font-display font-bold text-lg mb-3">{{ t('Termasuk dalam Paket', 'Included in the Package') }}</h2>
          <ul class="space-y-2">
            <li v-for="(inc,i) in pkg.inclusions" :key="i" class="flex items-start gap-2 text-[15px] text-ink-muted">
              <svg viewBox="0 0 24 24" class="w-5 h-5 fill-none stroke-leaf-dark shrink-0 mt-0.5" stroke-width="2"><path d="M20 6 9 17l-5-5"/></svg>
              {{ inc }}
            </li>
          </ul>
        </div>
      </div>

      <aside class="lg:sticky lg:top-24 h-fit">
        <div class="card p-5 border-t-4 border-brand">
          <div v-if="pkg.originalPrice > pkg.price" class="flex items-center gap-2">
            <span class="text-[13px] text-ink-faint line-through">{{ rupiah(pkg.originalPrice) }}</span>
            <span class="pill bg-red-500 text-white font-bold">-{{ Math.round((1 - pkg.price / pkg.originalPrice) * 100) }}%</span>
          </div>
          <div class="text-3xl font-display font-extrabold text-brand-700">{{ rupiah(pkg.price) }}<span class="text-sm font-normal text-ink-faint">{{ t('/paket', '/package') }}</span></div>

          <div v-if="isLoggedIn" class="mt-4 space-y-3">
            <div><label class="label">{{ t('Tanggal Mulai', 'Start Date') }}</label><input v-model="checkIn" type="date" :min="todayStr" class="input" /></div>
            <div><label class="label">{{ t('Nama Pemesan', 'Booker Name') }}</label><input v-model="f.name" class="input" /></div>
            <div><label class="label">{{ t('Nomor HP', 'Phone Number') }}</label><input v-model="f.phone" class="input" /></div>
            <div><label class="label">{{ t('Email', 'Email') }}</label><input v-model="f.email" type="email" class="input" /></div>
            <button @click="book" :disabled="loading" class="btn-brand w-full">{{ loading ? t('Memproses…', 'Processing…') : t('Pesan Paket', 'Book Package') }}</button>
            <p v-if="err" class="text-red-600 text-[13px] text-center">{{ err }}</p>
          </div>
          <NuxtLink v-else :to="`/login?redirect=/packages/${pkg.id}`" class="btn-brand w-full mt-4">{{ t('Masuk untuk Memesan', 'Sign in to Book') }}</NuxtLink>
        </div>
      </aside>
    </div>
  </div>
  <div v-else class="container-site py-24 text-center text-ink-muted">{{ t('Paket tidak ditemukan.', 'Package not found.') }}</div>
</template>

<script setup lang="ts">
const { t } = useLang()
const route = useRoute()
const { $api } = useNuxtApp()
const { isLoggedIn, user } = useAuth()
const id = route.params.id as string
const todayStr = isoDate(new Date())

const { data } = await useAsyncData(`pkg-${id}`, () => $api(`/packages/${id}`).catch(() => ({ package: null })))
const pkg = computed<any>(() => (data.value as any)?.package || (data.value as any) || null)
const BOARD_BASIS_EN: Record<string, string> = {
  ROOM_ONLY: 'Room Only', BREAKFAST: 'Breakfast Included', HALF_BOARD: 'Half Board',
  FULL_BOARD: 'Full Board', ALL_INCLUSIVE: 'All Inclusive',
}
const boardBasis = computed(() => t(BOARD_BASIS[pkg.value?.boardBasis] || 'Termasuk Sarapan', BOARD_BASIS_EN[pkg.value?.boardBasis] || 'Breakfast Included'))

const checkIn = ref(isoDate(new Date(Date.now() + 86400000)))
const f = reactive({ name: '', email: '', phone: '' })
watchEffect(() => { if (user.value) { f.name ||= user.value.name; f.email ||= user.value.email; f.phone ||= user.value.phone || '' } })

const loading = ref(false); const err = ref('')
async function book() {
  err.value = ''
  if (!f.name.trim() || !f.email.includes('@') || f.phone.trim().length < 6) { err.value = t('Lengkapi data pemesan.', 'Please complete the booker details.'); return }
  loading.value = true
  try {
    const res: any = await $api('/bookings', { method: 'POST', body: {
      packageId: id, checkIn: new Date(checkIn.value).toISOString(),
      guests: pkg.value.guests || 2, rooms: 1, forSelf: true,
      bookerName: f.name.trim(), bookerEmail: f.email.trim(), bookerPhone: f.phone.trim(),
    } })
    await navigateTo(`/payment/${res.booking.id}`)
  } catch (e: any) { err.value = e?.data?.error || t('Gagal memesan paket.', 'Failed to book the package.') }
  finally { loading.value = false }
}
useHead(() => ({ title: pkg.value ? `${pkg.value.title} · Miruum` : t('Paket · Miruum', 'Package · Miruum') }))
</script>
