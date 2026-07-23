<template>
  <div class="container-site py-6">
    <SearchWidget class="mb-6" />

    <div class="grid lg:grid-cols-[260px_1fr] gap-6">
      <!-- Filters -->
      <aside class="space-y-5">
        <div class="card p-4">
          <h3 class="font-bold mb-3">{{ t('Urutkan', 'Sort by') }}</h3>
          <select v-model="sort" class="input">
            <option value="popular">{{ t('Paling Populer', 'Most Popular') }}</option>
            <option value="price_asc">{{ t('Harga Termurah', 'Lowest Price') }}</option>
            <option value="price_desc">{{ t('Harga Tertinggi', 'Highest Price') }}</option>
            <option value="rating">{{ t('Rating Tertinggi', 'Highest Rating') }}</option>
          </select>
        </div>
        <div class="card p-4">
          <h3 class="font-bold mb-3">{{ t('Tipe Properti', 'Property Type') }}</h3>
          <div class="flex flex-wrap gap-2">
            <span v-for="(label,key) in propertyTypes" :key="key" @click="propType = propType===key ? '' : key"
                  class="chip" :class="{ 'chip-on': propType===key }">{{ label }}</span>
          </div>
        </div>
        <div class="card p-4">
          <h3 class="font-bold mb-3">{{ t('Bintang', 'Star Rating') }}</h3>
          <div class="flex gap-2">
            <span v-for="s in [5,4,3,2]" :key="s" @click="star = star===s ? 0 : s"
                  class="chip" :class="{ 'chip-on': star===s }">{{ s }}★</span>
          </div>
        </div>
        <div class="card p-4">
          <h3 class="font-bold mb-3">{{ t('Fasilitas & Kebijakan', 'Facilities & Policies') }}</h3>
          <label class="flex items-center gap-2 py-1.5 text-[15px] cursor-pointer"><input type="checkbox" v-model="breakfast" class="accent-brand w-4 h-4" /> {{ t('Termasuk sarapan', 'Breakfast included') }}</label>
          <label class="flex items-center gap-2 py-1.5 text-[15px] cursor-pointer"><input type="checkbox" v-model="freeCancellation" class="accent-brand w-4 h-4" /> {{ t('Bisa refund / batal gratis', 'Refundable / free cancellation') }}</label>
          <label class="flex items-center gap-2 py-1.5 text-[15px] cursor-pointer"><input type="checkbox" v-model="refundable" class="accent-brand w-4 h-4" /> {{ t('Refundable', 'Refundable') }}</label>
        </div>
        <div v-if="facilities.length" class="card p-4">
          <h3 class="font-bold mb-3">{{ t('Fasilitas', 'Facilities') }}</h3>
          <div class="max-h-64 overflow-y-auto pr-1">
            <label v-for="f in facilities" :key="f.id" class="flex items-center gap-2 py-1.5 text-[15px] cursor-pointer">
              <input type="checkbox" :value="f.id" v-model="facilityIds" class="accent-brand w-4 h-4" />
              {{ f.name }}
            </label>
          </div>
        </div>
      </aside>

      <!-- Results -->
      <div>
        <div class="mb-4">
          <div class="flex items-center justify-between">
            <h1 class="text-xl font-bold">
              {{ heading }}
              <span class="text-ink-faint font-normal text-base">· {{ hotels.length }} {{ t('properti', 'properties') }}</span>
            </h1>
          </div>

          <!-- Active structured area -->
          <div v-if="regionId" class="flex flex-wrap items-center gap-2 mt-2">
            <span class="chip chip-on !cursor-default">
              <svg viewBox="0 0 24 24" class="w-3.5 h-3.5 fill-none stroke-current" stroke-width="2"><path d="M12 21s-7-5.2-7-11a7 7 0 1 1 14 0c0 5.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>
              {{ t('Area', 'Area') }}: {{ areaLabel }}
              <button type="button" :aria-label="t('Hapus filter area', 'Remove area filter')"
                      class="ml-0.5 w-4 h-4 grid place-items-center rounded-full hover:bg-brand/20" @click="clearRegion">
                <svg viewBox="0 0 24 24" class="w-3 h-3 fill-none stroke-current" stroke-width="3"><path d="M6 6l12 12M18 6L6 18"/></svg>
              </button>
            </span>
          </div>
        </div>

        <div v-if="pending" class="grid sm:grid-cols-2 xl:grid-cols-3 gap-5">
          <div v-for="n in 6" :key="n" class="card overflow-hidden"><div class="skeleton aspect-[4/3] !rounded-none"></div><div class="p-4 space-y-2"><div class="skeleton h-4 w-2/3"></div><div class="skeleton h-3 w-1/2"></div></div></div>
        </div>

        <div v-else-if="hotels.length" class="grid sm:grid-cols-2 xl:grid-cols-3 gap-5">
          <HotelCard v-for="h in hotels" :key="h.id" :hotel="h" />
        </div>

        <div v-else class="card p-12 text-center text-ink-muted">
          <p class="text-lg font-semibold mb-1">{{ t('Tidak ada properti ditemukan', 'No properties found') }}</p>
          <p class="text-sm">{{ t('Coba ubah kata kunci atau filter pencarian.', 'Try changing your keywords or search filters.') }}</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const route = useRoute()
const { $api } = useNuxtApp()
const { t } = useLang()
const propertyTypes = computed(() => propertyTypeLabels())

const q = computed(() => (route.query.q as string) || '')
// Structured area search (see AreaSearchInput / SearchWidget). `regionId`
// matches hierarchically on the backend: a province also covers its kecamatan.
const regionId = computed(() => (route.query.regionId as string) || '')
const regionName = computed(() => (route.query.regionName as string) || '')
const areaLabel = computed(() => titleCaseArea(regionName.value) || t('Area terpilih', 'Selected area'))
const heading = computed(() => {
  if (regionId.value) {
    const base = `${t('Properti di', 'Properties in')} ${areaLabel.value}`
    return q.value ? `${base} · “${q.value}”` : base
  }
  return q.value ? `${t('Hasil untuk', 'Results for')} “${q.value}”` : t('Semua Properti', 'All Properties')
})

function clearRegion() {
  const { regionId: _r, regionName: _n, ...rest } = route.query
  navigateTo({ path: '/search', query: rest })
}

const sort = ref((route.query.sort as string) || 'popular')
const propType = ref((route.query.propertyType as string) || '')
const star = ref(0)
const breakfast = ref(false)
const freeCancellation = ref(false)
const refundable = ref(false)
const facilityIds = ref<string[]>([])

// Hotel facilities list (same source the app's filter screen uses).
const { data: facData } = await useAsyncData('facilities', () => $api('/facilities').catch(() => ({ facilities: [] })))
const facilities = computed<any[]>(() => (facData.value as any)?.facilities || [])

const query = computed(() => {
  const p: Record<string, any> = { sort: sort.value }
  if (q.value) p.q = q.value
  if (regionId.value) p.regionId = regionId.value
  if (propType.value) p.propertyType = propType.value
  if (star.value) p.minStar = star.value
  if (breakfast.value) p.breakfast = 1
  if (freeCancellation.value) p.freeCancellation = 1
  if (refundable.value) p.refundable = 1
  // The backend (and the app's FilterResult.toQuery) expects a comma-joined `facilities` param.
  if (facilityIds.value.length) p.facilities = facilityIds.value.join(',')
  return p
})

const { data, pending } = await useAsyncData(
  'search',
  () => $api('/hotels', { query: query.value }).catch(() => ({ hotels: [] })),
  { watch: [query] },
)
const hotels = computed<any[]>(() => ((data.value as any)?.hotels || (data.value as any) || []))

useHead({
  title: () => {
    const where = regionId.value ? areaLabel.value : q.value
    return where ? `${where} — ${t('Cari Hotel', 'Search Hotels')} · Miruum` : `${t('Cari Hotel', 'Search Hotels')} · Miruum`
  },
})
</script>
