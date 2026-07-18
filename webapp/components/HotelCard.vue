<template>
  <NuxtLink :to="`/hotel/${hotel.id}`" class="group card overflow-hidden hover:shadow-cardhover hover:-translate-y-0.5 transition-all flex flex-col">
    <div class="relative aspect-[4/3] overflow-hidden bg-line">
      <img :src="hotel.imageUrl" :alt="hotel.name" loading="lazy"
           class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
      <span v-if="hotel.isPromo" class="absolute top-3 left-3 pill bg-brand text-white shadow">
        {{ hotel.promoLabel || 'Promo' }}
      </span>
      <span v-if="hotel.priceBefore && hotel.priceBefore > hotel.priceFrom"
            class="absolute top-3 right-12 pill bg-leaf text-white shadow">Harga turun</span>
      <button @click.prevent.stop="toggle(hotel.id)" :aria-label="fav ? 'Hapus favorit' : 'Tambah favorit'"
              class="absolute top-2.5 right-2.5 w-9 h-9 rounded-full bg-white/90 backdrop-blur grid place-items-center shadow hover:scale-110 transition">
        <svg viewBox="0 0 24 24" class="w-5 h-5 transition-colors" :class="fav ? 'fill-red-500 stroke-red-500' : 'fill-none stroke-ink-muted'" stroke-width="2">
          <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 1 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z"/>
        </svg>
      </button>
    </div>
    <div class="p-4 flex flex-col flex-1">
      <div class="flex items-center gap-2 mb-1">
        <span class="pill bg-brand-50 text-brand-700">{{ propType }}</span>
        <StarRating :value="hotel.starRating" />
      </div>
      <h3 class="font-bold text-[15px] leading-snug line-clamp-1 group-hover:text-brand-600">{{ hotel.name }}</h3>
      <p class="text-[13px] text-ink-faint flex items-center gap-1 mt-0.5 mb-2 line-clamp-1">
        <svg viewBox="0 0 24 24" class="w-3.5 h-3.5 fill-none stroke-current" stroke-width="2"><path d="M12 21s-7-5.2-7-11a7 7 0 1 1 14 0c0 5.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>
        {{ hotel.city }}
      </p>
      <div class="mt-auto flex items-end justify-between pt-2">
        <RatingBadge :rating="hotel.rating" :count="hotel.reviewCount" :show-label="false" />
        <div class="text-right">
          <div v-if="hotel.priceBefore && hotel.priceBefore > hotel.priceFrom" class="text-[12px] text-ink-faint line-through">{{ rupiah(hotel.priceBefore) }}</div>
          <div class="text-brand-700 font-extrabold text-[17px] leading-none">{{ rupiah(hotel.priceFrom) }}</div>
          <div class="text-[11px] text-ink-faint">/malam</div>
        </div>
      </div>
    </div>
  </NuxtLink>
</template>

<script setup lang="ts">
const props = defineProps<{ hotel: any }>()
const propType = computed(() => PROPERTY_TYPES[props.hotel.propertyType] || 'Hotel')
const { isFav, toggle, load } = useFavorites()
onMounted(load)
const fav = computed(() => isFav(props.hotel.id))
</script>
