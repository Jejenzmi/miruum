<template>
  <div class="container-site py-8">
    <h1 class="text-3xl font-display font-bold mb-1">Paket Menginap</h1>
    <p class="text-ink-muted mb-6">Bundel hemat: kamar + sarapan + benefit dalam satu harga.</p>
    <div v-if="packages.length" class="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      <PackageCard v-for="p in packages" :key="p.id" :pkg="p" />
    </div>
    <div v-else class="card p-12 text-center text-ink-muted">Belum ada paket tersedia.</div>
  </div>
</template>

<script setup lang="ts">
const { $api } = useNuxtApp()
const { data } = await useAsyncData('packages', () => $api('/packages').catch(() => ({ packages: [] })))
const packages = computed<any[]>(() => (data.value as any)?.packages || (data.value as any) || [])
useHead({ title: 'Paket Menginap · Miruum' })
</script>
