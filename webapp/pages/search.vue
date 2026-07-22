<template>
  <div class="container-site py-6">
    <SearchWidget class="mb-6" />

    <div class="grid lg:grid-cols-[260px_1fr] gap-6">
      <!-- Filters -->
      <aside class="space-y-5">
        <div class="card p-4">
          <h3 class="font-bold mb-3">Urutkan</h3>
          <select v-model="sort" class="input">
            <option value="popular">Paling Populer</option>
            <option value="price_asc">Harga Termurah</option>
            <option value="price_desc">Harga Tertinggi</option>
            <option value="rating">Rating Tertinggi</option>
          </select>
        </div>
        <div class="card p-4">
          <h3 class="font-bold mb-3">Tipe Properti</h3>
          <div class="flex flex-wrap gap-2">
            <span v-for="(label,key) in propertyTypes" :key="key" @click="propType = propType===key ? '' : key"
                  class="chip" :class="{ 'chip-on': propType===key }">{{ label }}</span>
          </div>
        </div>
        <div class="card p-4">
          <h3 class="font-bold mb-3">Bintang</h3>
          <div class="flex gap-2">
            <span v-for="s in [5,4,3,2]" :key="s" @click="star = star===s ? 0 : s"
                  class="chip" :class="{ 'chip-on': star===s }">{{ s }}★</span>
          </div>
        </div>
        <div class="card p-4">
          <h3 class="font-bold mb-3">Fasilitas & Kebijakan</h3>
          <label class="flex items-center gap-2 py-1.5 text-[15px] cursor-pointer"><input type="checkbox" v-model="breakfast" class="accent-brand w-4 h-4" /> Termasuk sarapan</label>
          <label class="flex items-center gap-2 py-1.5 text-[15px] cursor-pointer"><input type="checkbox" v-model="freeCancellation" class="accent-brand w-4 h-4" /> Bisa refund / batal gratis</label>
          <label class="flex items-center gap-2 py-1.5 text-[15px] cursor-pointer"><input type="checkbox" v-model="refundable" class="accent-brand w-4 h-4" /> Refundable</label>
        </div>
        <div v-if="facilities.length" class="card p-4">
          <h3 class="font-bold mb-3">Fasilitas</h3>
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
        <div class="flex items-center justify-between mb-4">
          <h1 class="text-xl font-bold">
            {{ q ? `Hasil untuk “${q}”` : 'Semua Properti' }}
            <span class="text-ink-faint font-normal text-base">· {{ hotels.length }} properti</span>
          </h1>
        </div>

        <div v-if="pending" class="grid sm:grid-cols-2 xl:grid-cols-3 gap-5">
          <div v-for="n in 6" :key="n" class="card overflow-hidden"><div class="skeleton aspect-[4/3] !rounded-none"></div><div class="p-4 space-y-2"><div class="skeleton h-4 w-2/3"></div><div class="skeleton h-3 w-1/2"></div></div></div>
        </div>

        <div v-else-if="hotels.length" class="grid sm:grid-cols-2 xl:grid-cols-3 gap-5">
          <HotelCard v-for="h in hotels" :key="h.id" :hotel="h" />
        </div>

        <div v-else class="card p-12 text-center text-ink-muted">
          <p class="text-lg font-semibold mb-1">Tidak ada properti ditemukan</p>
          <p class="text-sm">Coba ubah kata kunci atau filter pencarian.</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const route = useRoute()
const { $api } = useNuxtApp()
const propertyTypes = PROPERTY_TYPES

const q = computed(() => (route.query.q as string) || '')
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

useHead({ title: () => (q.value ? `${q.value} — Cari Hotel · Miruum` : 'Cari Hotel · Miruum') })
</script>
