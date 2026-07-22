<template>
  <div class="flex gap-2 overflow-x-auto no-scrollbar mb-6 border-b border-line">
    <NuxtLink v-for="tab in tabs" :key="tab.to" :to="tab.to"
      class="px-4 py-2.5 text-[15px] font-semibold whitespace-nowrap border-b-2 -mb-px"
      :class="active === tab.key ? 'border-brand text-brand-700' : 'border-transparent text-ink-muted hover:text-ink'">
      {{ tab.label }}
    </NuxtLink>
  </div>
</template>

<script setup lang="ts">
defineProps<{ active: string }>()
const { t } = useLang()
const tabs = computed(() => [
  { key: 'profile', to: '/account', label: t('Profil', 'Profile') },
  { key: 'bookings', to: '/account/bookings', label: t('Pesanan', 'Bookings') },
  { key: 'favorites', to: '/account/favorites', label: t('Favorit', 'Favorites') },
  { key: 'trips', to: '/account/trips', label: t('Trips', 'Trips') },
  { key: 'vouchers', to: '/account/vouchers', label: t('Voucher', 'Vouchers') },
  { key: 'loyalty', to: '/account/loyalty', label: t('Poin', 'Points') },
  { key: 'security', to: '/account/security', label: t('Keamanan', 'Security') },
])
</script>
