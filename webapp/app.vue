<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>

<script setup lang="ts">
// Hydrate auth on first load (SSR-aware).
const { fetchMe, token } = useAuth()
await useAsyncData('me', () => (token.value ? fetchMe() : Promise.resolve(null)))
</script>
