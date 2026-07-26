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
          <HotelCard v-for="h in hotels" :key="h.id" :hotel="h" :external="h._ext" @book="onBook" />
        </div>

        <div v-else class="card p-12 text-center text-ink-muted">
          <p class="text-lg font-semibold mb-1">{{ t('Tidak ada properti ditemukan', 'No properties found') }}</p>
          <p class="text-sm">{{ t('Coba ubah kata kunci atau filter pencarian.', 'Try changing your keywords or search filters.') }}</p>
        </div>
      </div>
    </div>

    <!-- Booking flow for live-inventory properties (no separate detail page) -->
    <div v-if="sel" class="fixed inset-0 bg-black/50 grid place-items-center z-50 p-4" @click.self="sel = null">
      <div class="card p-5 w-full max-w-md max-h-[88vh] overflow-y-auto">
        <h2 class="font-bold text-lg">{{ sel.name }}</h2>
        <p class="text-ink-muted text-sm mb-3">{{ [sel.categoryName, sel.destinationName].filter(Boolean).join(' · ') }}</p>
        <!-- room/rate picker -->
        <div v-if="!rate" class="divide-y divide-line border-t border-line">
          <div v-for="(r,i) in sel.rooms" :key="i" class="flex items-center justify-between gap-3 py-2.5">
            <div class="min-w-0">
              <div class="font-semibold text-sm truncate">{{ r.name }}</div>
              <div class="text-xs text-ink-muted">{{ r.boardName }} · {{ r.refundable ? t('Bisa refund', 'Refundable') : t('Non-refundable', 'Non-refundable') }}</div>
            </div>
            <div class="text-right shrink-0">
              <div class="font-bold text-sm">{{ rupiah(r.netIdr ?? r.net) }}</div>
              <button @click="rate = r" class="btn-brand btn-sm mt-1">{{ t('Pilih', 'Select') }}</button>
            </div>
          </div>
        </div>
        <!-- guest form -->
        <div v-else>
          <p class="text-sm mb-3">{{ rate.name }} · <b>{{ rupiah(rate.netIdr ?? rate.net) }}</b></p>
          <div class="grid grid-cols-2 gap-3">
            <div><label class="lbl2">{{ t('Nama Depan','First name') }}</label><input v-model="holder.name" class="inp2" /></div>
            <div><label class="lbl2">{{ t('Nama Belakang','Surname') }}</label><input v-model="holder.surname" class="inp2" /></div>
          </div>
          <div class="mt-2"><label class="lbl2">Email</label><input v-model="holder.email" type="email" class="inp2" /></div>
          <div class="mt-2"><label class="lbl2">{{ t('Telepon','Phone') }}</label><input v-model="holder.phone" class="inp2" /></div>
          <p v-if="mErr" class="text-red-600 text-sm mt-2">{{ mErr }}</p>
          <div class="flex gap-2 mt-4">
            <button @click="rate = null" class="btn-ghost flex-1">{{ t('Kembali','Back') }}</button>
            <button @click="reserve" :disabled="booking" class="btn-brand flex-1">{{ booking ? t('Memproses…','Processing…') : t('Lanjut Bayar','Continue to Pay') }}</button>
          </div>
        </div>
        <button @click="sel = null" class="mt-4 text-sm text-ink-faint w-full">{{ t('Tutup','Close') }}</button>
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
  if (route.query.lat && route.query.lng) return t('Hotel di sekitar Anda', 'Hotels near you')
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

const lat = computed(() => route.query.lat ? Number(route.query.lat) : null)
const lng = computed(() => route.query.lng ? Number(route.query.lng) : null)
const isNear = computed(() => lat.value != null && lng.value != null)

const query = computed(() => {
  const p: Record<string, any> = { sort: sort.value }
  // Current-location search (same as the app): DIRECT hotels sorted by distance.
  if (isNear.value) { p.lat = lat.value; p.lng = lng.value; p.radius = 150 }
  if (q.value) p.query = q.value // backend text-search param is `query` (not `q`)
  if (regionId.value) p.regionId = regionId.value
  if (propType.value) p.propertyType = propType.value
  if (star.value) p.star = star.value // backend min-star param is `star` (not `minStar`)
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
const directHotels = computed<any[]>(() => ((data.value as any)?.hotels || (data.value as any) || []))

// Live external-supply inventory, blended into the same results (no source shown).
// Dates come from the query (SearchWidget) or sensible defaults so bedbank — which
// requires a stay — can be queried.
const pad = (n: number) => String(n).padStart(2, '0')
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const checkIn = computed(() => (route.query.checkIn as string) || iso(new Date(Date.now() + 86400000)))
const checkOut = computed(() => (route.query.checkOut as string) || iso(new Date(Date.now() + 2 * 86400000)))
const adults = computed(() => Number(route.query.guests) || 2)
const roomsQ = computed(() => Number(route.query.rooms) || 1)

// External (partner) inventory — by current location if a near-me search, else
// by destination text. Same source & behavior as the app, so results match.
const { data: extData } = await useAsyncData(
  'search-supply',
  () => {
    const base: any = { checkIn: checkIn.value, checkOut: checkOut.value, adults: adults.value, rooms: roomsQ.value }
    if (isNear.value) return $api('/supply/search', { method: 'POST', body: { ...base, lat: lat.value, lng: lng.value } }).catch(() => ({ external: [] }))
    if (q.value || regionName.value) return $api('/supply/search', { method: 'POST', body: { ...base, destination: q.value || regionName.value } }).catch(() => ({ external: [] }))
    return Promise.resolve({ external: [] })
  },
  { watch: [q, regionName, checkIn, checkOut, lat, lng] },
)
// Map external hotels to the same card shape (unlabeled); keep raw for booking.
const externalHotels = computed<any[]>(() => ((extData.value as any)?.external || []).map((h: any) => ({
  id: `x-${h.supplierHotelCode}`, name: h.name, city: h.destinationName || h.zoneName || '',
  address: h.zoneName || '', imageUrl: '', starRating: starOf(h.categoryName), rating: 0, reviewCount: 0,
  priceFrom: h.minRateIdr ?? h.minRate, propertyType: 'HOTEL', facilities: [],
  _ext: true, _raw: h,
})))
function starOf(cat?: string): number { const m = /([1-5])/.exec(cat || ''); return m ? Number(m[1]) : 3 }

// Merged list — external appended so filters/sort on DIRECT still behave; both
// render through the identical HotelCard with no source hint.
const hotels = computed<any[]>(() => [...directHotels.value, ...externalHotels.value])

// ── Booking flow for external (live) properties ──
const sel = ref<any>(null)
const rate = ref<any>(null)
const holder = reactive({ name: '', surname: '', email: '', phone: '' })
const booking = ref(false)
const mErr = ref('')
const { isLoggedIn } = useAuth()
function onBook(h: any) {
  if (!isLoggedIn.value) { navigateTo(`/login?next=${encodeURIComponent(route.fullPath)}`); return }
  sel.value = h._raw; rate.value = null; mErr.value = ''
}
async function reserve() {
  mErr.value = ''
  if (!holder.name || !holder.surname) { mErr.value = t('Isi nama depan & belakang.', 'Enter first & surname.'); return }
  booking.value = true
  try {
    const paxes = Array.from({ length: adults.value }, (_, i) => ({ type: 'AD', name: i === 0 ? holder.name : 'Guest', surname: i === 0 ? holder.surname : String(i + 1) }))
    const r: any = await $api('/supply/book', {
      method: 'POST',
      body: {
        source: sel.value.source, rateKey: rate.value.rateKey,
        hotelName: sel.value.name, supplierHotelCode: sel.value.supplierHotelCode, city: sel.value.destinationName || '',
        checkIn: checkIn.value, checkOut: checkOut.value, holder: { ...holder }, paxes,
        guests: adults.value, rooms: roomsQ.value,
      },
    })
    if (r?.booking?.id) await navigateTo(`/payment/${r.booking.id}`)
    else mErr.value = t('Gagal membuat pesanan.', 'Failed to create booking.')
  } catch (e: any) { mErr.value = e?.data?.error || t('Reservasi gagal (rate mungkin kedaluwarsa).', 'Reservation failed (rate may have expired).') }
  finally { booking.value = false }
}

useHead({
  title: () => {
    const where = regionId.value ? areaLabel.value : q.value
    return where ? `${where} — ${t('Cari Hotel', 'Search Hotels')} · Miruum` : `${t('Cari Hotel', 'Search Hotels')} · Miruum`
  },
})
</script>

<style scoped>
.lbl2 { @apply block text-xs font-semibold text-ink-muted mb-1; }
.inp2 { @apply w-full border border-line rounded-lg px-3 py-2 text-sm; }
</style>
