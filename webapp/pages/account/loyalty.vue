<template>
  <div class="container-site py-6 max-w-4xl">
    <h1 class="text-2xl font-bold mb-5">{{ t('Akun Saya', 'My Account') }}</h1>
    <AccountTabs active="loyalty" />

    <div class="rounded-xl2 p-6 text-white bg-gradient-to-br from-brand-600 to-brand-500 mb-6">
      <div class="text-white/80 text-sm">{{ t('Poin Miruum', 'Miruum Points') }}</div>
      <div class="text-4xl font-extrabold mt-1">{{ points.toLocaleString('id-ID') }}</div>
      <div class="text-white/80 text-[13px] mt-1">≈ {{ rupiah(points * redeemValue) }} {{ t('nilai tukar', 'redemption value') }}</div>
    </div>

    <h2 class="font-bold text-lg mb-3">{{ t('Riwayat Poin', 'Points History') }}</h2>
    <div v-if="txns.length" class="card divide-y divide-line">
      <div v-for="x in txns" :key="x.id" class="flex items-center justify-between p-4">
        <div><div class="font-semibold text-[14px]">{{ x.note || (x.amount > 0 ? t('Poin diperoleh', 'Points earned') : t('Poin ditukar', 'Points redeemed')) }}</div><div class="text-[12px] text-ink-faint">{{ fmtDate(x.createdAt) }}</div></div>
        <div class="font-bold" :class="x.amount > 0 ? 'text-leaf-dark' : 'text-red-600'">{{ x.amount > 0 ? '+' : '' }}{{ x.amount }}</div>
      </div>
    </div>
    <p v-else class="text-ink-muted text-sm">{{ t('Belum ada aktivitas poin. Poin diperoleh setiap kali menyelesaikan menginap.', 'No point activity yet. You earn points every time you complete a stay.') }}</p>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ middleware: 'auth' })
const { t } = useLang()
const { $api } = useNuxtApp()
const { data } = await useAsyncData('loyalty', () => $api('/loyalty').catch(() => ({ points: 0, transactions: [] })))
const d = computed<any>(() => data.value || {})
const points = computed(() => Number(d.value.points ?? d.value.loyaltyPoints ?? 0))
const txns = computed<any[]>(() => d.value.transactions || d.value.txns || [])
const redeemValue = computed(() => Number(d.value.redeemValue || 100))
useHead({ title: () => t('Poin Miruum · Miruum', 'Miruum Points · Miruum') })
</script>
