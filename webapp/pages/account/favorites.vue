<template>
  <div class="container-site py-6 max-w-5xl">
    <h1 class="text-2xl font-bold mb-5">{{ t('Akun Saya', 'My Account') }}</h1>
    <AccountTabs active="favorites" />
    <div v-if="hotels.length" class="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      <HotelCard v-for="h in hotels" :key="h.id" :hotel="h" />
    </div>
    <div v-else class="card p-12 text-center text-ink-muted">
      <p class="text-lg font-semibold mb-1">{{ t('Belum ada favorit', 'No favorites yet') }}</p>
      <p class="text-sm mb-3">{{ t('Ketuk ikon ♥ pada hotel untuk menyimpannya di sini.', 'Tap the ♥ icon on a hotel to save it here.') }}</p>
      <NuxtLink to="/search" class="btn-brand btn-sm">{{ t('Cari Hotel', 'Find Hotels') }}</NuxtLink>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ middleware: 'auth' })
const { t } = useLang()
const { $api } = useNuxtApp()
const { data } = await useAsyncData('favorites-page', () => $api('/favorites').catch(() => ({ hotels: [] })))
const hotels = computed<any[]>(() => (data.value as any)?.hotels || [])
useHead({ title: () => t('Favorit · Miruum', 'Favorites · Miruum') })
</script>
