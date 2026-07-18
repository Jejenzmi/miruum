<template>
  <NuxtLink :to="`/packages/${pkg.id}`" class="group card overflow-hidden hover:shadow-cardhover hover:-translate-y-0.5 transition-all">
    <div class="relative aspect-[4/3] overflow-hidden bg-line">
      <img :src="pkg.imageUrl" :alt="pkg.title" loading="lazy" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
      <span v-if="pkg.discountPct" class="absolute top-3 left-3 pill bg-brand text-white shadow">-{{ pkg.discountPct }}%</span>
      <span v-if="pkg.badge" class="absolute top-3 right-3 pill bg-leaf text-white shadow">{{ pkg.badge }}</span>
    </div>
    <div class="p-4">
      <div class="flex items-center gap-2 mb-1">
        <StarRating :value="pkg.starRating" />
        <RatingBadge :rating="pkg.rating" :show-label="false" />
      </div>
      <h3 class="font-bold text-[15px] leading-snug line-clamp-2 group-hover:text-brand-600 min-h-[42px]">{{ pkg.title }}</h3>
      <p class="text-[12.5px] text-ink-faint mt-1">{{ pkg.nights }} malam · {{ pkg.guests }} tamu · {{ boardBasis }}</p>
      <div class="mt-2 flex items-end justify-between">
        <div>
          <div v-if="pkg.originalPrice > pkg.price" class="text-[12px] text-ink-faint line-through">{{ rupiah(pkg.originalPrice) }}</div>
          <div class="text-brand-700 font-extrabold text-[17px]">{{ rupiah(pkg.price) }}</div>
        </div>
        <span class="text-[12px] text-ink-faint self-end">/paket</span>
      </div>
    </div>
  </NuxtLink>
</template>

<script setup lang="ts">
const props = defineProps<{ pkg: any }>()
const boardBasis = computed(() => BOARD_BASIS[props.pkg.boardBasis] || 'Termasuk Sarapan')
</script>
