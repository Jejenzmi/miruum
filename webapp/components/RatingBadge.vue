<template>
  <div v-if="rating > 0" class="inline-flex items-center gap-2">
    <span class="rounded-lg bg-leaf px-2 py-1 text-white text-[13px] font-bold">{{ rating.toFixed(1) }}</span>
    <span v-if="showLabel" class="text-[13px]">
      <span class="font-semibold text-ink">{{ ratingLabel(rating) }}</span>
      <span v-if="count" class="text-ink-faint"> · {{ count }} {{ t('ulasan', 'reviews') }}</span>
    </span>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{ rating: number; count?: number; showLabel?: boolean }>()
const { t } = useLang()
const rating = computed(() => Number(props.rating || 0))
const count = computed(() => props.count || 0)
const showLabel = computed(() => props.showLabel !== false)
</script>
