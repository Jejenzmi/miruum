<template>
  <div class="container-site py-6 max-w-4xl">
    <h1 class="text-2xl font-bold mb-5">{{ t('Akun Saya', 'My Account') }}</h1>
    <AccountTabs active="bookings" />

    <div v-if="ok" class="card p-4 mb-5 bg-leaf-soft border-leaf/30 text-leaf-dark flex items-center gap-2">
      <svg viewBox="0 0 24 24" class="w-5 h-5 fill-none stroke-current" stroke-width="2.5"><path d="M20 6 9 17l-5-5"/></svg>
      <span>{{ t('Pesanan', 'Booking') }} <b>{{ ok }}</b> {{ t('berhasil. E-voucher siap diunduh di bawah.', 'was successful. The e-voucher is ready to download below.') }}</span>
    </div>

    <div v-if="bookings.length" class="space-y-4">
      <div v-for="b in bookings" :key="b.id" class="card p-4 sm:flex items-center gap-4">
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 mb-1">
            <span class="pill" :class="statusClass(b.status)">{{ statusLabel(b.status) }}</span>
            <span class="text-[12px] text-ink-faint font-mono">{{ b.code }}</span>
          </div>
          <div class="font-bold">{{ b.hotel?.name || b.hotelName || b.packageTitle || t('Pesanan', 'Booking') }}</div>
          <div class="text-[13px] text-ink-muted">{{ fmtDate(b.checkIn) }} — {{ fmtDate(b.checkOut) }} · {{ b.nights }} {{ t('malam', b.nights > 1 ? 'nights' : 'night') }} · {{ b.rooms }} {{ t('kamar', b.rooms > 1 ? 'rooms' : 'room') }}</div>
        </div>
        <div class="text-right mt-3 sm:mt-0 shrink-0">
          <div class="font-extrabold text-brand-700">{{ rupiah(b.totalPrice) }}</div>
          <div class="flex gap-2 mt-2 justify-end">
            <NuxtLink :to="`/account/bookings/${b.id}`" class="btn-ghost btn-sm">{{ t('Detail / Kelola', 'Details / Manage') }}</NuxtLink>
            <NuxtLink v-if="b.status==='PENDING'" :to="`/payment/${b.id}`" class="btn-brand btn-sm">{{ t('Bayar', 'Pay') }}</NuxtLink>
          </div>
        </div>
      </div>
    </div>
    <div v-else class="card p-12 text-center text-ink-muted">
      <p class="text-lg font-semibold mb-1">{{ t('Belum ada pesanan', 'No bookings yet') }}</p>
      <NuxtLink to="/search" class="btn-brand btn-sm mt-3">{{ t('Cari Hotel', 'Search Hotels') }}</NuxtLink>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ middleware: 'auth' })
const route = useRoute()
const { $api } = useNuxtApp()
const { t } = useLang()
const ok = route.query.ok as string
const { data } = await useAsyncData('mybookings', () => $api('/bookings').catch(() => ({ bookings: [] })))
const bookings = computed<any[]>(() => (data.value as any)?.bookings || [])

const isPaid = (s: string) => ['PAID', 'COMPLETED'].includes(s)
const statusLabel = (s: string) => ({
  PENDING: t('Menunggu Bayar', 'Awaiting Payment'),
  PAID: t('Terbayar', 'Paid'),
  COMPLETED: t('Selesai', 'Completed'),
  CANCELLED: t('Dibatalkan', 'Cancelled'),
  REFUNDED: t('Refund', 'Refunded'),
} as any)[s] || s
const statusClass = (s: string) => ({ PENDING: 'bg-brand-50 text-brand-700', PAID: 'bg-leaf-soft text-leaf-dark', COMPLETED: 'bg-blue-50 text-blue-600', CANCELLED: 'bg-red-50 text-red-600', REFUNDED: 'bg-paper text-ink-muted' } as any)[s] || 'bg-paper text-ink-muted'
useHead(() => ({ title: t('Pesanan Saya · Miruum', 'My Bookings · Miruum') }))
</script>
