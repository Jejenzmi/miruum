<template>
  <component :is="external ? 'div' : 'NuxtLink'" :to="external ? undefined : `/hotel/${hotel.id}`"
             @click="external ? $emit('book', hotel) : undefined"
             :class="['group card overflow-hidden hover:shadow-cardhover hover:-translate-y-0.5 transition-all flex flex-col', external ? 'cursor-pointer' : '']">
    <div class="relative aspect-[4/3] overflow-hidden bg-line">
      <img :src="img(hotel.imageUrl, 800)" :alt="hotel.name" loading="lazy" decoding="async"
           class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
      <span v-if="hotel.isPromo" class="absolute top-3 left-3 pill bg-brand text-white shadow">
        {{ hotel.promoLabel || 'Promo' }}
      </span>
      <button v-if="!external" @click.prevent.stop="toggle(hotel.id)" :aria-label="fav ? t('Hapus favorit', 'Remove from favorites') : t('Tambah favorit', 'Add to favorites')"
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
      <p class="text-[13px] text-ink-faint flex items-center gap-1 mt-0.5 line-clamp-1">
        <svg viewBox="0 0 24 24" class="w-3.5 h-3.5 shrink-0 fill-none stroke-current" stroke-width="2"><path d="M12 21s-7-5.2-7-11a7 7 0 1 1 14 0c0 5.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>
        <span class="truncate">{{ location }}</span>
      </p>

      <!-- Facility chips (max 3) -->
      <div v-if="chips.length" class="flex flex-wrap gap-1 mt-2">
        <span v-for="c in chips" :key="c"
              class="rounded-full bg-paper text-ink-muted border border-line px-2 py-0.5 text-[11px] leading-4 max-w-[110px] truncate">{{ c }}</span>
      </div>

      <div class="mt-auto flex items-end justify-between gap-2 pt-2.5">
        <!-- Rating -->
        <div class="min-w-0">
          <div v-if="rating > 0" class="flex items-center gap-1.5">
            <span class="rounded-lg bg-leaf px-2 py-1 text-white text-[13px] font-bold">{{ rating.toFixed(1) }}</span>
            <span class="text-[12px] text-ink-faint truncate">{{ reviewText }}</span>
          </div>
          <span v-else class="pill bg-brand-50 text-brand-700">{{ t('Baru', 'New') }}</span>
        </div>

        <!-- Price -->
        <div class="text-right shrink-0">
          <div v-if="discount > 0" class="flex items-center justify-end gap-1.5 leading-none mb-0.5">
            <span class="rounded bg-red-50 text-red-600 font-bold text-[11px] px-1.5 py-0.5">-{{ discount }}%</span>
            <span class="text-[12px] text-ink-faint line-through">{{ rupiah(hotel.priceBefore) }}</span>
          </div>
          <div class="text-brand-700 font-extrabold text-[17px] leading-none">{{ rupiah(hotel.priceFrom) }}</div>
          <div class="text-[11px] text-ink-faint">{{ t('/malam', '/night') }}</div>
        </div>
      </div>
    </div>
  </component>
</template>

<script setup lang="ts">
const props = defineProps<{ hotel: any; external?: boolean }>()
defineEmits(['book'])
const { t } = useLang()
const propType = computed(() => propertyTypeLabel(props.hotel?.propertyType))
const { isFav, toggle, load } = useFavorites()
onMounted(load)
const fav = computed(() => isFav(props.hotel?.id))

const rating = computed(() => Number(props.hotel?.rating || 0))
const reviewCount = computed(() => Number(props.hotel?.reviewCount || 0))
const reviewText = computed(() =>
  reviewCount.value > 0
    ? `${reviewCount.value} ${t('ulasan', reviewCount.value === 1 ? 'review' : 'reviews')}`
    : t('Baru', 'New'),
)

// Percentage off, rounded down — only when there is a genuine price drop.
const discount = computed(() => {
  const before = Number(props.hotel?.priceBefore || 0)
  const now = Number(props.hotel?.priceFrom || 0)
  if (!before || !now || before <= now) return 0
  return Math.floor(((before - now) / before) * 100)
})

// "Sleman · Yogyakarta" — first address segment (when it adds information) + city.
const location = computed(() => {
  const city = String(props.hotel?.city || '').trim()
  const area = String(props.hotel?.address || '').split(',')[0]?.trim() || ''
  if (!area || !city) return area || city
  if (area.toLowerCase() === city.toLowerCase() || area.length > 28) return city
  return `${area} · ${city}`
})

const chips = computed<string[]>(() => {
  const list = Array.isArray(props.hotel?.facilities) ? props.hotel.facilities : []
  return list
    .map((f: any) => f?.facility?.name || f?.name || '')
    .filter((n: string) => !!n)
    .slice(0, 3)
})
</script>
