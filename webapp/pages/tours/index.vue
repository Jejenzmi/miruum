<template>
  <div class="container-site py-8">
    <h1 class="text-3xl font-display font-bold mb-1">{{ t('Tour & Aktivitas', 'Tours & Activities') }}</h1>
    <p class="text-ink-muted mb-6">{{ t('Jelajahi pengalaman terbaik di destinasi favoritmu.', 'Explore the best experiences in your favorite destinations.') }}</p>
    <div v-if="tours.length" class="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      <NuxtLink v-for="tour in tours" :key="tour.id" :to="`/tours/${tour.id}`" class="group card overflow-hidden hover:shadow-cardhover hover:-translate-y-0.5 transition-all">
        <div class="aspect-[4/3] bg-line overflow-hidden"><img :src="tour.imageUrl" :alt="tour.title" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" /></div>
        <div class="p-4">
          <span class="pill bg-brand-50 text-brand-700 mb-1">{{ tour.category }}</span>
          <h3 class="font-bold text-[15px] leading-snug line-clamp-2 min-h-[42px] group-hover:text-brand-600">{{ tour.title }}</h3>
          <p class="text-[12.5px] text-ink-faint mt-1">{{ tour.city }} · {{ tour.durationHours }} {{ t('jam', 'hours') }}</p>
          <div class="mt-2 flex items-end justify-between">
            <RatingBadge :rating="ratingOutOf10(tour.rating)" :show-label="false" />
            <div class="text-brand-700 font-extrabold text-[16px]">{{ rupiah(tour.price) }}<span class="text-[11px] font-normal text-ink-faint">{{ t('/org', '/person') }}</span></div>
          </div>
        </div>
      </NuxtLink>
    </div>
    <div v-else class="card p-12 text-center text-ink-muted">{{ t('Belum ada tour tersedia saat ini.', 'No tours available right now.') }}</div>
  </div>
</template>

<script setup lang="ts">
const { t } = useLang()
const { $api } = useNuxtApp()
const { data } = await useAsyncData('tours', () => $api('/tours').catch(() => ({ tours: [] })))
const tours = computed<any[]>(() => (data.value as any)?.tours || (data.value as any) || [])
// Tour rating is 0–5; RatingBadge expects 0–10.
const ratingOutOf10 = (r: number) => Number(r || 0) * 2
useHead({ title: () => t('Tour & Aktivitas · Miruum', 'Tours & Activities · Miruum') })
</script>
