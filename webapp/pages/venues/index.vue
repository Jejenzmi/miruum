<template>
  <div class="container-site py-8">
    <h1 class="text-3xl font-display font-bold mb-1">{{ t('Venue & Meeting', 'Venues & Meetings') }}</h1>
    <p class="text-ink-muted mb-6">{{ t('Ruang meeting, ballroom & venue pernikahan di hotel pilihan.', 'Meeting rooms, ballrooms & wedding venues at selected hotels.') }}</p>
    <div v-if="venues.length" class="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      <NuxtLink v-for="v in venues" :key="v.id" :to="`/venues/${v.id}`" class="group card overflow-hidden hover:shadow-cardhover hover:-translate-y-0.5 transition-all">
        <div class="aspect-[4/3] bg-line overflow-hidden">
          <img :src="v.imageUrl || v.hotel?.imageUrl" :alt="v.name" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
        </div>
        <div class="p-4">
          <div class="flex gap-1.5 mb-1">
            <span class="pill bg-brand-50 text-brand-700">{{ typeLabel(v.type) }}</span>
            <span class="pill" :class="v.bookingMode==='INSTANT' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'">{{ v.bookingMode==='INSTANT' ? t('Instant','Instant') : t('Inquiry','Inquiry') }}</span>
          </div>
          <h3 class="font-bold text-[15px] leading-snug line-clamp-2 min-h-[42px] group-hover:text-brand-600">{{ v.name }}</h3>
          <p class="text-[12.5px] text-ink-faint mt-1">{{ v.hotel?.name }} · {{ v.hotel?.city }}</p>
          <p class="text-[12px] text-ink-faint mt-0.5">{{ t('Kapasitas s/d','Up to') }} {{ maxCap(v) }} {{ t('org','pax') }}</p>
          <div class="mt-2 text-brand-700 font-extrabold text-[16px]">{{ rupiah(v.basePrice) }}<span class="text-[11px] font-normal text-ink-faint">{{ basisLabel(v.priceBasis) }}</span></div>
        </div>
      </NuxtLink>
    </div>
    <div v-else class="card p-12 text-center text-ink-muted">{{ t('Belum ada venue tersedia saat ini.', 'No venues available right now.') }}</div>
  </div>
</template>

<script setup lang="ts">
const { t } = useLang()
const { $api } = useNuxtApp()
const { data } = await useAsyncData('venues', () => $api('/venues').catch(() => ({ venues: [] })))
const venues = computed<any[]>(() => (data.value as any)?.venues || [])
const typeLabel = (x: string) => ({ MEETING_ROOM: t('Meeting Room', 'Meeting Room'), BALLROOM: 'Ballroom', FUNCTION_HALL: 'Function Hall', OUTDOOR: 'Outdoor' } as any)[x] || x
const basisLabel = (x: string) => ({ HOUR: t('/jam', '/hour'), HALFDAY: '/half-day', FULLDAY: '/full-day', PERPAX: t('/org', '/pax') } as any)[x] || ''
const maxCap = (v: any) => Math.max(v.capTheatre || 0, v.capClassroom || 0, v.capRound || 0, v.capStanding || 0)
useHead({ title: () => t('Venue & Meeting · Miruum', 'Venues & Meetings · Miruum') })
</script>
