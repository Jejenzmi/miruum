<template>
  <div class="container-site py-8">
    <h1 class="text-3xl font-display font-bold mb-1">{{ t('Paket Menginap', 'Stay Packages') }}</h1>
    <p class="text-ink-muted mb-6">{{ t('Bundel hemat: kamar + sarapan + benefit dalam satu harga.', 'Great-value bundles: room + breakfast + perks in one price.') }}</p>
    <div v-if="packages.length" class="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      <PackageCard v-for="p in packages" :key="p.id" :pkg="p" />
    </div>
    <div v-else class="card p-12 text-center text-ink-muted">{{ t('Belum ada paket tersedia.', 'No packages available yet.') }}</div>
  </div>
</template>

<script setup lang="ts">
const { t } = useLang()
const { $api } = useNuxtApp()
const { data } = await useAsyncData('packages', () => $api('/packages').catch(() => ({ packages: [] })))
const packages = computed<any[]>(() => (data.value as any)?.packages || (data.value as any) || [])
useHead({ title: () => t('Paket Menginap · Miruum', 'Stay Packages · Miruum') })
</script>
