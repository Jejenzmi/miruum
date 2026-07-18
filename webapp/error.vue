<template>
  <div class="min-h-screen grid place-items-center bg-paper px-4">
    <div class="text-center">
      <div class="text-7xl font-display font-bold text-brand mb-2">{{ error?.statusCode || 500 }}</div>
      <h1 class="text-2xl font-bold mb-2">{{ error?.statusCode === 404 ? 'Halaman tidak ditemukan' : 'Terjadi kesalahan' }}</h1>
      <p class="text-ink-muted mb-6">{{ error?.statusCode === 404 ? 'Maaf, halaman yang kamu cari tidak ada.' : 'Coba muat ulang beberapa saat lagi.' }}</p>
      <button @click="handleError" class="btn-brand">Kembali ke Beranda</button>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{ error: any }>()
const handleError = () => clearError({ redirect: '/' })
</script>
