<template>
  <div>
    <!-- Mini hero -->
    <section class="relative overflow-hidden">
      <div class="absolute inset-0">
        <img :src="heroImg" alt="" class="w-full h-full object-cover" />
        <div class="absolute inset-0 bg-gradient-to-r from-navy-900/90 to-navy/40"></div>
      </div>
      <div class="container-site relative py-14 sm:py-16">
        <p class="text-brand-200 font-semibold tracking-widest uppercase text-[12px] mb-2">MICE · {{ t('Rapat, Gala & Pernikahan', 'Meetings, Galas & Weddings') }}</p>
        <h1 class="text-white text-3xl sm:text-4xl font-display font-bold max-w-2xl">{{ t('Venue & Meeting', 'Venues & Meetings') }}</h1>
        <p class="text-white/85 mt-2 max-w-xl text-[15px]">{{ t('Ruang meeting, ballroom & venue pernikahan di hotel pilihan — pesan instan atau ajukan penawaran.', 'Meeting rooms, ballrooms & wedding venues — instant book or request a quote.') }}</p>
      </div>
    </section>

    <div class="container-site py-8">
      <!-- Type filter -->
      <div class="flex gap-2.5 overflow-x-auto no-scrollbar pb-1 mb-6">
        <button v-for="f in typeFilters" :key="f.key" @click="activeType = f.key"
                class="chip whitespace-nowrap !py-2.5 !px-4 transition-colors"
                :class="activeType === f.key ? '!bg-brand !text-white !border-brand' : 'hover:!border-brand hover:!text-brand-700'">
          {{ f.label }} <span v-if="f.count" class="opacity-70">({{ f.count }})</span>
        </button>
      </div>

      <div v-if="filtered.length" class="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <NuxtLink v-for="v in filtered" :key="v.id" :to="`/venues/${v.id}`"
                  class="group card overflow-hidden hover:shadow-cardhover hover:-translate-y-1 transition-all">
          <div class="relative aspect-[16/10] bg-line overflow-hidden">
            <img :src="v.imageUrl || v.hotel?.imageUrl" :alt="v.name" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
            <div class="absolute top-3 left-3 flex gap-1.5">
              <span class="pill bg-white/95 text-navy font-bold">{{ typeLabel(v.type) }}</span>
              <span class="pill font-bold" :class="v.bookingMode==='INSTANT' ? 'bg-teal text-white' : 'bg-brand text-white'">{{ v.bookingMode==='INSTANT' ? t('Instant','Instant') : t('Inquiry','Inquiry') }}</span>
            </div>
          </div>
          <div class="p-5">
            <h3 class="font-bold text-[16px] leading-snug group-hover:text-brand-600 line-clamp-1">{{ v.name }}</h3>
            <p class="text-[13px] text-ink-faint mt-0.5 line-clamp-1">{{ v.hotel?.name }} · {{ v.hotel?.city }}</p>
            <div class="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-[12.5px] text-ink-muted">
              <span v-if="v.capTheatre" class="inline-flex items-center gap-1">👥 {{ t('s/d','up to') }} {{ maxCap(v) }} {{ t('org','pax') }}</span>
              <span v-if="v.area" class="inline-flex items-center gap-1">📐 {{ v.area }} m²</span>
              <span v-if="v.packages?.length" class="inline-flex items-center gap-1">🎁 {{ v.packages.length }} {{ t('paket','packages') }}</span>
            </div>
            <div class="flex items-end justify-between mt-4 pt-3 border-t border-line">
              <div><span class="text-brand-700 font-extrabold text-[17px]">{{ rupiah(v.basePrice) }}</span><span class="text-[11px] text-ink-faint">{{ basisLabel(v.priceBasis) }}</span></div>
              <span class="text-brand-600 font-semibold text-[13px] group-hover:underline">{{ t('Lihat', 'View') }} →</span>
            </div>
          </div>
        </NuxtLink>
      </div>
      <div v-else class="card p-16 text-center text-ink-muted">{{ t('Belum ada venue untuk kategori ini.', 'No venues in this category yet.') }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
const { t } = useLang()
const { $api } = useNuxtApp()
const { data } = await useAsyncData('venues', () => $api('/venues').catch(() => ({ venues: [] })))
const venues = computed<any[]>(() => (data.value as any)?.venues || [])

const typeLabel = (x: string) => ({ MEETING_ROOM: 'Meeting Room', BALLROOM: 'Ballroom', FUNCTION_HALL: 'Function Hall', OUTDOOR: 'Outdoor' } as any)[x] || x
const basisLabel = (x: string) => ({ HOUR: t('/jam', '/hour'), HALFDAY: '/half-day', FULLDAY: '/full-day', PERPAX: t('/org', '/pax') } as any)[x] || ''
const maxCap = (v: any) => Math.max(v.capTheatre || 0, v.capClassroom || 0, v.capRound || 0, v.capStanding || 0)

const activeType = ref('ALL')
const TYPES = ['MEETING_ROOM', 'BALLROOM', 'FUNCTION_HALL', 'OUTDOOR']
const typeFilters = computed(() => [
  { key: 'ALL', label: t('Semua', 'All'), count: venues.value.length },
  ...TYPES.map((k) => ({ key: k, label: typeLabel(k), count: venues.value.filter((v) => v.type === k).length })).filter((f) => f.count > 0),
])
const filtered = computed(() => activeType.value === 'ALL' ? venues.value : venues.value.filter((v) => v.type === activeType.value))
const heroImg = computed(() => venues.value.find((v) => v.imageUrl)?.imageUrl || venues.value[0]?.hotel?.imageUrl || 'https://images.unsplash.com/photo-1519167758481-83f550bb49b3?auto=format&fit=crop&w=1600&q=70')

useHead({ title: () => t('Venue & Meeting · Miruum', 'Venues & Meetings · Miruum') })
</script>
