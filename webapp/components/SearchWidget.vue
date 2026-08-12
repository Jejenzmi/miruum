<template>
  <div class="bg-white rounded-2xl shadow-pop p-4 sm:p-5">
    <!-- Product tabs -->
    <div class="flex gap-1 overflow-x-auto no-scrollbar mb-4">
      <button class="flex items-center gap-2 px-4 py-2.5 rounded-full font-semibold text-[14px] whitespace-nowrap bg-brand text-white">
        <svg viewBox="0 0 24 24" class="w-4 h-4 fill-none stroke-current" stroke-width="2"><path d="M3 21h18M5 21V5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v16M15 9h3a1 1 0 0 1 1 1v11"/></svg>
        {{ t('Hotel', 'Hotels') }}
      </button>
      <NuxtLink v-if="modules.hotelPackage !== false" to="/packages" class="flex items-center gap-2 px-4 py-2.5 rounded-full font-semibold text-[14px] whitespace-nowrap text-ink-muted hover:bg-paper">
        <svg viewBox="0 0 24 24" class="w-4 h-4 fill-none stroke-current" stroke-width="2"><path d="M21 8v13H3V8M1 3h22v5H1zM10 21V3M14 21V3"/></svg>
        {{ t('Paket', 'Packages') }}
      </NuxtLink>
      <NuxtLink v-if="modules.tour" to="/tours" class="flex items-center gap-2 px-4 py-2.5 rounded-full font-semibold text-[14px] whitespace-nowrap text-ink-muted hover:bg-paper">
        <svg viewBox="0 0 24 24" class="w-4 h-4 fill-none stroke-current" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18"/></svg>
        {{ t('Tour', 'Tours') }}
      </NuxtLink>
      <NuxtLink v-if="modules.venue" to="/venues" class="flex items-center gap-2 px-4 py-2.5 rounded-full font-semibold text-[14px] whitespace-nowrap text-ink-muted hover:bg-paper">
        <svg viewBox="0 0 24 24" class="w-4 h-4 fill-none stroke-current" stroke-width="2"><path d="M3 21h18M6 21V8l6-4 6 4v13M9 12h.01M15 12h.01M9 16h.01M15 16h.01"/></svg>
        {{ t('Venue', 'Venues') }}
      </NuxtLink>
      <NuxtLink v-if="modules.shuttle" to="/shuttle" class="flex items-center gap-2 px-4 py-2.5 rounded-full font-semibold text-[14px] whitespace-nowrap text-ink-muted hover:bg-paper">
        <svg viewBox="0 0 24 24" class="w-4 h-4 fill-none stroke-current" stroke-width="2"><path d="M5 17h14M6 17l-1-6 2-4h10l2 4-1 6M8 17v2M16 17v2"/></svg>
        {{ t('Transfer Bandara', 'Airport Transfer') }}
      </NuxtLink>
    </div>

    <!-- Search fields -->
    <form @submit.prevent="go" class="grid gap-2.5 lg:grid-cols-[2fr_1.2fr_1.2fr_auto] items-stretch">
      <!-- Destination (structured area autocomplete + free text fallback) -->
      <AreaSearchInput
        v-model="q"
        :label="t('Kota / Hotel', 'City / Hotel')"
        :placeholder="t('Mau menginap di mana?', 'Where do you want to stay?')"
        @select="onAreaSelect"
        @clear="region = null"
      />

      <!-- Dates -->
      <div class="grid grid-cols-2 gap-2.5">
        <label class="border border-line rounded-xl px-3 py-3 focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/15">
          <div class="text-[11px] text-ink-faint font-semibold">{{ t('Check-in', 'Check-in') }}</div>
          <input v-model="checkIn" type="date" :min="todayStr" class="w-full outline-none text-[14px] font-semibold bg-transparent" />
        </label>
        <label class="border border-line rounded-xl px-3 py-3 focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/15">
          <div class="text-[11px] text-ink-faint font-semibold">{{ t('Check-out', 'Check-out') }}</div>
          <input v-model="checkOut" type="date" :min="checkIn || todayStr" class="w-full outline-none text-[14px] font-semibold bg-transparent" />
        </label>
      </div>

      <!-- Guests & rooms -->
      <div class="relative">
        <button type="button" @click="gOpen = !gOpen" class="w-full h-full text-left border border-line rounded-xl px-3.5 py-3 hover:border-brand">
          <div class="text-[11px] text-ink-faint font-semibold">{{ t('Tamu & Kamar', 'Guests & Rooms') }}</div>
          <div class="text-[14px] font-semibold">{{ guests }} {{ t('tamu', 'guests') }} · {{ rooms }} {{ t('kamar', 'rooms') }}</div>
        </button>
        <div v-if="gOpen" class="absolute z-20 mt-2 right-0 w-64 card shadow-pop p-4 space-y-3">
          <div class="flex items-center justify-between">
            <span class="text-[14px] font-medium">{{ t('Tamu', 'Guests') }}</span>
            <div class="flex items-center gap-3">
              <button type="button" @click="guests = Math.max(1, guests-1)" class="w-8 h-8 rounded-full border border-line grid place-items-center hover:border-brand">−</button>
              <span class="w-5 text-center font-semibold">{{ guests }}</span>
              <button type="button" @click="guests = Math.min(16, guests+1)" class="w-8 h-8 rounded-full border border-line grid place-items-center hover:border-brand">+</button>
            </div>
          </div>
          <div class="flex items-center justify-between">
            <span class="text-[14px] font-medium">{{ t('Kamar', 'Rooms') }}</span>
            <div class="flex items-center gap-3">
              <button type="button" @click="rooms = Math.max(1, rooms-1)" class="w-8 h-8 rounded-full border border-line grid place-items-center hover:border-brand">−</button>
              <span class="w-5 text-center font-semibold">{{ rooms }}</span>
              <button type="button" @click="rooms = Math.min(8, rooms+1)" class="w-8 h-8 rounded-full border border-line grid place-items-center hover:border-brand">+</button>
            </div>
          </div>
          <button type="button" @click="gOpen = false" class="btn-brand btn-sm w-full">{{ t('Selesai', 'Done') }}</button>
        </div>
      </div>

      <button type="submit" class="btn-brand h-full lg:w-14 lg:!px-0 text-[16px]">
        <svg viewBox="0 0 24 24" class="w-6 h-6 fill-none stroke-current" stroke-width="2.4"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
        <span class="lg:hidden">{{ t('Cari Hotel', 'Search Hotels') }}</span>
      </button>
    </form>

    <!-- Search by current location (same as the app's "near me") -->
    <div class="mt-2.5 flex justify-center">
      <button type="button" @click="nearMe" :disabled="locating"
              class="text-[13px] font-semibold text-brand hover:underline flex items-center gap-1.5 disabled:opacity-60">
        <svg viewBox="0 0 24 24" class="w-4 h-4 fill-none stroke-current" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>
        {{ locating ? t('Mencari lokasi…', 'Locating…') : t('Cari di sekitar lokasi saya', 'Search near my location') }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
// Same structural shape AreaSearchInput emits with `select`.
type AreaRegion = { id: string; name: string; level?: string; path?: string; hotels?: number }

const { t } = useLang()
const { $api } = useNuxtApp()
const route = useRoute()
const todayStr = isoDate(new Date())
// Module flags — hide product tabs for modules the admin turned off.
const { data: _cfg } = await useAsyncData('appcfg', () => $api('/app/config').catch(() => ({ modules: {} })))
const modules = computed<any>(() => (_cfg.value as any)?.modules || {})

// A destination is either a *structured area* (regionId, picked from the
// autocomplete) or plain free text — free text keeps behaving exactly as before.
const regionFromRoute = (): AreaRegion | null =>
  route.query.regionId
    ? { id: String(route.query.regionId), name: String(route.query.regionName || '') }
    : null

const region = ref<AreaRegion | null>(regionFromRoute())
const q = ref(region.value ? titleCaseArea(region.value.name) : (route.query.q as string) || '')
const checkIn = ref((route.query.checkIn as string) || todayStr)
const checkOut = ref((route.query.checkOut as string) || isoDate(new Date(Date.now() + 86400000)))
const guests = ref(Number(route.query.guests) || 2)
const rooms = ref(Number(route.query.rooms) || 1)
const gOpen = ref(false)

// Keep the widget in sync when the page changes the query itself (e.g. the
// search page removing the active area chip).
watch(
  () => [route.query.regionId, route.query.regionName, route.query.q],
  () => {
    const r = regionFromRoute()
    region.value = r
    q.value = r ? titleCaseArea(r.name) : (route.query.q as string) || ''
  },
)

function onAreaSelect(r: AreaRegion) {
  region.value = r
  q.value = titleCaseArea(r.name)
  go()
}

const locating = ref(false)
function nearMe() {
  if (!import.meta.client || !navigator.geolocation) return
  locating.value = true
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      locating.value = false
      navigateTo({ path: '/search', query: {
        lat: pos.coords.latitude, lng: pos.coords.longitude, near: 1,
        checkIn: checkIn.value, checkOut: checkOut.value, guests: guests.value, rooms: rooms.value,
      } })
    },
    () => { locating.value = false },
    { enableHighAccuracy: true, timeout: 8000 },
  )
}

function go() {
  if (checkOut.value <= checkIn.value) checkOut.value = isoDate(new Date(new Date(checkIn.value).getTime() + 86400000))
  const query: Record<string, any> = {
    checkIn: checkIn.value,
    checkOut: checkOut.value,
    guests: guests.value,
    rooms: rooms.value,
  }
  if (region.value?.id) {
    query.regionId = region.value.id
    query.regionName = region.value.name || undefined
  } else if (q.value) {
    query.q = q.value
  }
  navigateTo({ path: '/search', query })
}
</script>
