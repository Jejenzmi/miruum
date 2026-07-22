<template>
  <!-- Overlay -->
  <div class="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink/40 p-0 sm:p-4" @click.self="$emit('close')">
    <div class="card w-full sm:max-w-[520px] max-h-[92vh] flex flex-col overflow-hidden rounded-b-none sm:rounded-xl2">
      <!-- Header -->
      <div class="flex items-center justify-between gap-3 px-5 py-4 border-b border-line">
        <h3 class="font-bold text-lg">{{ t('Pilih Tanggal Menginap', 'Select Stay Dates') }}</h3>
        <button type="button" @click="$emit('close')" class="w-8 h-8 rounded-full grid place-items-center text-ink-faint hover:bg-paper" :aria-label="t('Tutup', 'Close')">✕</button>
      </div>

      <div class="flex-1 overflow-y-auto px-4 sm:px-5 py-4">
        <!-- Cheapest hint -->
        <div v-if="!loading && minPrice" class="flex items-center gap-2 rounded-xl border border-leaf/30 bg-leaf-soft px-3 py-2.5 mb-4">
          <svg viewBox="0 0 24 24" class="w-4 h-4 shrink-0 fill-none stroke-leaf-dark" stroke-width="2"><path d="M3 7l7 7 4-4 7 7"/><path d="M21 17v-5h-5"/></svg>
          <p class="text-[12.5px] flex-1 min-w-0">
            <template v-if="isEn">From <b class="text-leaf-dark">{{ rupiah(minPrice) }}</b>/night in this range</template>
            <template v-else>Termurah <b class="text-leaf-dark">{{ rupiah(minPrice) }}</b>/malam pada rentang ini</template>
          </p>
          <button type="button" @click="pickCheapest" class="text-[12.5px] font-bold text-brand-700 shrink-0 hover:underline">{{ t('Saya fleksibel', 'I am flexible') }}</button>
        </div>

        <!-- Month nav -->
        <div class="flex items-center justify-between mb-3">
          <button type="button" @click="shiftMonth(-1)" :disabled="!canGoPrev"
                  class="w-9 h-9 rounded-full border border-line grid place-items-center hover:border-brand disabled:opacity-40 disabled:pointer-events-none" :aria-label="t('Bulan sebelumnya', 'Previous month')">‹</button>
          <div class="font-bold text-[15px]">{{ monthLabel }}</div>
          <button type="button" @click="shiftMonth(1)"
                  class="w-9 h-9 rounded-full border border-line grid place-items-center hover:border-brand" :aria-label="t('Bulan berikutnya', 'Next month')">›</button>
        </div>

        <!-- Weekday header -->
        <div class="grid grid-cols-7 mb-1">
          <div v-for="(d, i) in weekdays" :key="i" class="text-center text-[11px] font-semibold text-ink-faint py-1">{{ d }}</div>
        </div>

        <!-- Grid -->
        <div v-if="loading" class="grid grid-cols-7 gap-1">
          <div v-for="n in 35" :key="n" class="skeleton h-12"></div>
        </div>
        <div v-else class="grid grid-cols-7 gap-1">
          <div v-for="n in leadBlanks" :key="'b' + n"></div>
          <button
            v-for="cell in cells" :key="cell.key" type="button"
            :disabled="cell.disabled" @click="tap(cell.key)"
            class="h-12 rounded-lg flex flex-col items-center justify-center leading-tight transition disabled:cursor-not-allowed"
            :class="cellClass(cell)">
            <span class="text-[13px]" :class="[cell.selected ? 'font-extrabold' : 'font-semibold', cell.soldOut ? 'line-through' : '']">{{ cell.day }}</span>
            <span v-if="cell.price && !cell.soldOut" class="text-[9px]"
                  :class="cell.selected ? 'text-white/80' : cell.cheapest ? 'text-leaf-dark font-extrabold' : 'text-ink-faint'">
              {{ Math.round(cell.price / 1000) }}{{ t('rb', 'k') }}
            </span>
          </button>
        </div>

        <p v-if="!loading && !Object.keys(days).length" class="text-center text-[13px] text-ink-faint mt-4">
          {{ t('Kalender harga belum tersedia untuk properti ini.', 'The price calendar is not available for this property yet.') }}
        </p>
      </div>

      <!-- Footer -->
      <div class="flex items-center gap-3 px-5 py-4 border-t border-line bg-white">
        <p class="flex-1 text-[13px] font-semibold">{{ footerText }}</p>
        <button type="button" @click="apply" :disabled="!checkIn || !checkOut" class="btn-brand btn-sm min-w-[120px] justify-center">{{ t('Terapkan', 'Apply') }}</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  hotelId: string
  initialCheckIn?: string | null
  initialCheckOut?: string | null
}>()
const emit = defineEmits<{
  (e: 'apply', v: { checkIn: string; checkOut: string }): void
  (e: 'close'): void
}>()

const { $api } = useNuxtApp()
const { t, isEn } = useLang()

const WEEKDAYS_ID = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab']
const WEEKDAYS_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS_ID = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']
const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
// Computed so switching language re-renders the calendar labels.
const weekdays = computed(() => (isEn.value ? WEEKDAYS_EN : WEEKDAYS_ID))
const months = computed(() => (isEn.value ? MONTHS_EN : MONTHS_ID))
const MONTHS_AHEAD = 3

const now = new Date()
const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
const todayKey = isoDate(today)

const days = ref<Record<string, { price: number; available: boolean }>>({})
const loading = ref(true)
const minPrice = ref<number | null>(null)
const cheapestKey = ref<string | null>(null)

const checkIn = ref<string | null>(props.initialCheckIn || null)
const checkOut = ref<string | null>(props.initialCheckOut || null)

// Visible month cursor
const cursor = ref(new Date(today.getFullYear(), today.getMonth(), 1))

const parseKey = (k: string) => {
  const p = k.split('-')
  return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]))
}
const addDays = (k: string, n: number) => isoDate(new Date(parseKey(k).getTime() + n * 86400000))

onMounted(async () => {
  const to = new Date(today.getFullYear(), today.getMonth() + MONTHS_AHEAD, today.getDate())
  const res: any = await $api(`/hotels/${props.hotelId}/availability`, {
    query: { from: todayKey, to: isoDate(to) },
  }).catch(() => ({ days: [] }))
  const map: Record<string, { price: number; available: boolean }> = {}
  for (const r of (res?.days || [])) {
    const key = String(r.date).slice(0, 10)
    map[key] = { price: Number(r.price || 0), available: r.available !== false }
  }
  days.value = map
  for (const [key, v] of Object.entries(map)) {
    if (!v.available || v.price <= 0 || key < todayKey) continue
    if (minPrice.value === null || v.price < minPrice.value) { minPrice.value = v.price; cheapestKey.value = key }
  }
  loading.value = false
})

const monthLabel = computed(() => `${months.value[cursor.value.getMonth()]} ${cursor.value.getFullYear()}`)
const canGoPrev = computed(() =>
  cursor.value.getFullYear() > today.getFullYear() ||
  (cursor.value.getFullYear() === today.getFullYear() && cursor.value.getMonth() > today.getMonth()))

function shiftMonth(n: number) {
  const c = cursor.value
  cursor.value = new Date(c.getFullYear(), c.getMonth() + n, 1)
}

const leadBlanks = computed(() => cursor.value.getDay()) // Sun = 0

const cells = computed(() => {
  const y = cursor.value.getFullYear(), m = cursor.value.getMonth()
  const total = new Date(y, m + 1, 0).getDate()
  const out: any[] = []
  for (let day = 1; day <= total; day++) {
    const key = isoDate(new Date(y, m, day))
    const info = days.value[key]
    const past = key < todayKey
    const soldOut = !!info && !info.available
    const disabled = past || soldOut
    const isStart = checkIn.value === key
    const isEnd = checkOut.value === key
    const inRange = !!checkIn.value && !!checkOut.value && key > checkIn.value && key < checkOut.value
    out.push({
      key, day, price: info?.price || 0, past, soldOut, disabled,
      selected: isStart || isEnd, inRange,
      cheapest: !disabled && cheapestKey.value === key,
    })
  }
  return out
})

function cellClass(c: any) {
  if (c.selected) return 'bg-brand text-white'
  if (c.inRange) return 'bg-brand-50 text-brand-700'
  if (c.disabled) return 'text-ink-faint/60'
  if (c.cheapest) return 'bg-leaf-soft border border-leaf/50 text-ink'
  return 'hover:bg-paper text-ink'
}

function tap(key: string) {
  const info = days.value[key]
  if (key < todayKey || (info && !info.available)) return
  if (!checkIn.value || checkOut.value || key < checkIn.value) {
    checkIn.value = key; checkOut.value = null
  } else if (key === checkIn.value) {
    checkOut.value = addDays(key, 1)
  } else {
    checkOut.value = key
  }
}

// "Saya fleksibel" — jump to & select the cheapest available night.
function pickCheapest() {
  if (!cheapestKey.value) return
  const d = parseKey(cheapestKey.value)
  cursor.value = new Date(d.getFullYear(), d.getMonth(), 1)
  checkIn.value = cheapestKey.value
  checkOut.value = addDays(cheapestKey.value, 1)
}

const footerText = computed(() => {
  if (!checkIn.value) return t('Pilih tanggal check-in', 'Select check-in date')
  if (!checkOut.value) return t('Pilih tanggal check-out', 'Select check-out date')
  const n = nightsBetween(checkIn.value, checkOut.value)
  return t(`${n} malam dipilih`, `${n} night${n > 1 ? 's' : ''} selected`)
})

function apply() {
  if (!checkIn.value || !checkOut.value) return
  emit('apply', { checkIn: checkIn.value, checkOut: checkOut.value })
}
</script>
