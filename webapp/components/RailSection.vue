<template>
  <section class="container-site mt-12">
    <div class="flex items-end justify-between mb-4">
      <div>
        <h2 class="text-2xl font-bold">{{ title }}</h2>
        <p v-if="subtitle" class="text-ink-muted text-sm">{{ subtitle }}</p>
      </div>
      <NuxtLink v-if="more" :to="more" class="text-brand-600 font-semibold text-sm hover:underline shrink-0">Lihat semua →</NuxtLink>
    </div>
    <div class="flex gap-4 overflow-x-auto no-scrollbar pb-2 -mx-4 px-4 sm:mx-0 sm:px-0">
      <slot />
    </div>
  </section>
</template>

<script setup lang="ts">
defineProps<{ title: string; subtitle?: string; more?: string }>()
</script>
