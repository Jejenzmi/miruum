<template>
  <div class="flex gap-2 overflow-x-auto no-scrollbar mb-6 border-b border-line">
    <NuxtLink v-for="t in tabs" :key="t.to" :to="t.to"
      class="px-4 py-2.5 text-[15px] font-semibold whitespace-nowrap border-b-2 -mb-px"
      :class="active === t.key ? 'border-brand text-brand-700' : 'border-transparent text-ink-muted hover:text-ink'">
      {{ t.label }}
    </NuxtLink>
  </div>
</template>

<script setup lang="ts">
defineProps<{ active: string }>()
const tabs = [
  { key: 'profile', to: '/account', label: 'Profil' },
  { key: 'bookings', to: '/account/bookings', label: 'Pesanan' },
  { key: 'favorites', to: '/account/favorites', label: 'Favorit' },
  { key: 'vouchers', to: '/account/vouchers', label: 'Voucher' },
  { key: 'loyalty', to: '/account/loyalty', label: 'Poin' },
  { key: 'security', to: '/account/security', label: 'Keamanan' },
]
</script>
