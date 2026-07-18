<template>
  <div class="container-site py-6 max-w-4xl">
    <h1 class="text-2xl font-bold mb-5">Akun Saya</h1>
    <AccountTabs active="bookings" />

    <div v-if="ok" class="card p-4 mb-5 bg-leaf-soft border-leaf/30 text-leaf-dark flex items-center gap-2">
      <svg viewBox="0 0 24 24" class="w-5 h-5 fill-none stroke-current" stroke-width="2.5"><path d="M20 6 9 17l-5-5"/></svg>
      Pesanan <b>{{ ok }}</b> berhasil. E-voucher siap diunduh di bawah.
    </div>

    <div v-if="bookings.length" class="space-y-4">
      <div v-for="b in bookings" :key="b.id" class="card p-4 sm:flex items-center gap-4">
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 mb-1">
            <span class="pill" :class="statusClass(b.status)">{{ statusLabel(b.status) }}</span>
            <span class="text-[12px] text-ink-faint font-mono">{{ b.code }}</span>
          </div>
          <div class="font-bold">{{ b.hotel?.name || b.hotelName || b.packageTitle || 'Pesanan' }}</div>
          <div class="text-[13px] text-ink-muted">{{ fmtDate(b.checkIn) }} — {{ fmtDate(b.checkOut) }} · {{ b.nights }} malam · {{ b.rooms }} kamar</div>
        </div>
        <div class="text-right mt-3 sm:mt-0 shrink-0">
          <div class="font-extrabold text-brand-700">{{ rupiah(b.totalPrice) }}</div>
          <div class="flex gap-2 mt-2 justify-end">
            <a v-if="isPaid(b.status)" :href="`/api/vouchers/${b.code}`" target="_blank" class="btn-ghost btn-sm">E-Voucher</a>
            <a v-if="isPaid(b.status)" :href="`/api/invoices/${b.code}`" target="_blank" class="btn-ghost btn-sm">Invoice</a>
            <NuxtLink v-else-if="b.status==='PENDING'" :to="`/payment/${b.id}`" class="btn-brand btn-sm">Bayar</NuxtLink>
          </div>
        </div>
      </div>
    </div>
    <div v-else class="card p-12 text-center text-ink-muted">
      <p class="text-lg font-semibold mb-1">Belum ada pesanan</p>
      <NuxtLink to="/search" class="btn-brand btn-sm mt-3">Cari Hotel</NuxtLink>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ middleware: 'auth' })
const route = useRoute()
const { $api } = useNuxtApp()
const ok = route.query.ok as string
const { data } = await useAsyncData('mybookings', () => $api('/bookings').catch(() => ({ bookings: [] })))
const bookings = computed<any[]>(() => (data.value as any)?.bookings || [])

const isPaid = (s: string) => ['PAID', 'COMPLETED'].includes(s)
const statusLabel = (s: string) => ({ PENDING: 'Menunggu Bayar', PAID: 'Terbayar', COMPLETED: 'Selesai', CANCELLED: 'Dibatalkan', REFUNDED: 'Refund' } as any)[s] || s
const statusClass = (s: string) => ({ PENDING: 'bg-brand-50 text-brand-700', PAID: 'bg-leaf-soft text-leaf-dark', COMPLETED: 'bg-blue-50 text-blue-600', CANCELLED: 'bg-red-50 text-red-600', REFUNDED: 'bg-paper text-ink-muted' } as any)[s] || 'bg-paper text-ink-muted'
useHead({ title: 'Pesanan Saya · Miruum' })
</script>
