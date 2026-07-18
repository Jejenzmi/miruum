<template>
  <div class="inline-flex items-center gap-0.5 text-brand">
    <svg v-for="n in count" :key="n" viewBox="0 0 24 24" class="w-3.5 h-3.5 fill-current">
      <path d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z" />
    </svg>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{ value: number }>()
const count = computed(() => Math.max(0, Math.min(5, Math.round(props.value || 0))))
</script>
