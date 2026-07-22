<template>
  <div v-if="hotel" class="pb-10">
    <!-- Gallery -->
    <section class="container-site pt-5">
      <div class="grid gap-2 sm:grid-cols-4 sm:grid-rows-2 rounded-xl2 overflow-hidden h-[300px] sm:h-[380px]">
        <div class="sm:col-span-2 sm:row-span-2 bg-line">
          <img :src="img(gallery[0], 1600)" :alt="hotel.name" fetchpriority="high" class="w-full h-full object-cover" />
        </div>
        <div v-for="(g,i) in gallery.slice(1,5)" :key="i" class="hidden sm:block bg-line">
          <img :src="img(g, 800)" :alt="hotel.name" loading="lazy" decoding="async" class="w-full h-full object-cover" />
        </div>
      </div>
    </section>

    <div class="container-site grid lg:grid-cols-[1fr_320px] gap-8 mt-6">
      <div class="min-w-0">
        <!-- Header -->
        <div class="flex items-start gap-3 flex-wrap">
          <div>
            <div class="flex items-center gap-2 mb-1">
              <span class="pill bg-brand-50 text-brand-700">{{ propType }}</span>
              <StarRating :value="hotel.starRating" />
            </div>
            <h1 class="text-2xl sm:text-3xl font-bold">{{ hotel.name }}</h1>
            <p class="text-ink-muted text-sm flex items-center gap-1 mt-1">
              <svg viewBox="0 0 24 24" class="w-4 h-4 fill-none stroke-current" stroke-width="2"><path d="M12 21s-7-5.2-7-11a7 7 0 1 1 14 0c0 5.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>
              {{ hotel.address }}
            </p>
          </div>
          <div class="ml-auto"><RatingBadge :rating="hotel.rating" :count="hotel.reviewCount" /></div>
        </div>

        <!-- Description -->
        <div v-if="hotel.description" class="card p-5 mt-5">
          <h2 class="font-bold text-lg mb-2">{{ t('Tentang Properti', 'About This Property') }}</h2>
          <p class="text-[15px] text-ink-muted leading-relaxed whitespace-pre-line">{{ hotel.description }}</p>
        </div>

        <!-- Facilities -->
        <div v-if="facilities.length" class="card p-5 mt-5">
          <h2 class="font-bold text-lg mb-3">{{ t('Fasilitas', 'Facilities') }}</h2>
          <div class="flex flex-wrap gap-2">
            <span v-for="f in facilities" :key="f.id || f.name" class="pill bg-paper text-ink-muted !text-[13px] !px-3 !py-1.5 border border-line">{{ f.name || f }}</span>
          </div>
        </div>

        <!-- Rooms -->
        <div id="rooms" class="mt-7">
          <div class="flex items-center justify-between mb-3 gap-3 flex-wrap">
            <h2 class="font-bold text-xl">{{ t('Pilih Kamar', 'Choose a Room') }}</h2>
            <div class="flex items-end gap-2 text-sm">
              <div><label class="label !mb-0.5">{{ t('Check-in', 'Check-in') }}</label><input v-model="checkIn" type="date" :min="todayStr" class="input !py-2 !text-sm" /></div>
              <div><label class="label !mb-0.5">{{ t('Check-out', 'Check-out') }}</label><input v-model="checkOut" type="date" :min="checkIn" class="input !py-2 !text-sm" /></div>
              <div class="w-20"><label class="label !mb-0.5">{{ t('Tamu', 'Guests') }}</label><select v-model.number="guests" class="input !py-2 !text-sm !px-2"><option v-for="n in 8" :key="n" :value="n">{{ n }}</option></select></div>
              <button type="button" @click="calOpen = true" class="btn-ghost btn-sm whitespace-nowrap">
                <svg viewBox="0 0 24 24" class="w-4 h-4 fill-none stroke-current" stroke-width="2"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>
                {{ t('Lihat Kalender Harga', 'View Price Calendar') }}
              </button>
            </div>
          </div>

          <div class="space-y-4">
            <div v-for="room in hotel.rooms" :key="room.id" class="card p-4 sm:flex gap-4">
              <div class="sm:w-40 shrink-0 mb-3 sm:mb-0">
                <div class="rounded-xl bg-brand-50 text-brand-700 p-3 h-full flex flex-col justify-center">
                  <div class="font-bold text-[15px] leading-tight">{{ room.name }}</div>
                  <div class="text-[12.5px] text-ink-muted mt-1">{{ room.bedInfo }}</div>
                  <div class="text-[12.5px] text-ink-muted">{{ t('Maks', 'Max') }} {{ room.capacity }} {{ t('tamu', 'guests') }}</div>
                </div>
              </div>
              <div class="flex-1 min-w-0">
                <div class="flex flex-wrap gap-1.5 mb-2">
                  <span v-if="room.breakfast" class="pill bg-leaf-soft text-leaf-dark">{{ t('Sarapan', 'Breakfast') }}</span>
                  <span v-if="room.freeWifi" class="pill bg-paper text-ink-muted border border-line">{{ t('WiFi Gratis', 'Free WiFi') }}</span>
                  <span v-if="room.freeCancellation" class="pill bg-leaf-soft text-leaf-dark">{{ t('Batal Gratis', 'Free Cancellation') }}</span>
                  <span v-else-if="room.refundable" class="pill bg-paper text-ink-muted border border-line">{{ t('Refundable', 'Refundable') }}</span>
                  <span v-else class="pill bg-red-50 text-red-600">{{ t('Non-refundable', 'Non-refundable') }}</span>
                </div>
                <!-- Rate plans -->
                <div class="divide-y divide-line">
                  <div v-for="plan in ratePlansOf(room)" :key="plan.id || 'base'" class="flex items-center justify-between gap-3 py-2.5">
                    <div class="min-w-0">
                      <div class="font-semibold text-[14px] truncate">{{ plan.name || t('Harga Standar', 'Standard Rate') }}</div>
                      <div class="text-[12px] text-ink-faint">{{ boardBasis(plan.boardBasis) }}<span v-if="plan.freeCancellation"> · {{ t('Batal gratis', 'Free cancellation') }}</span></div>
                    </div>
                    <div class="text-right shrink-0">
                      <div v-if="room.originalPrice && room.originalPrice > room.price" class="text-[12px] text-ink-faint line-through">{{ rupiah(room.originalPrice) }}</div>
                      <div class="text-brand-700 font-extrabold text-[16px]">{{ rupiah(planPrice(room, plan)) }}</div>
                      <div class="text-[11px] text-ink-faint mb-1">{{ t('/malam', '/night') }}</div>
                      <button @click="pick(room, plan)" class="btn-brand btn-sm">{{ t('Pilih', 'Select') }}</button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Reviews -->
        <div v-if="hotel.reviews?.length" class="mt-8">
          <h2 class="font-bold text-xl mb-3">{{ t('Ulasan Tamu', 'Guest Reviews') }} ({{ hotel.reviewCount }})</h2>
          <div class="grid sm:grid-cols-2 gap-4">
            <div v-for="rv in hotel.reviews.slice(0,6)" :key="rv.id" class="card p-4">
              <div class="flex items-center gap-2 mb-1">
                <span class="rounded-lg bg-leaf px-2 py-0.5 text-white text-[12px] font-bold">{{ Number(rv.rating).toFixed(1) }}</span>
                <span class="font-semibold text-[14px]">{{ rv.userName || rv.user?.name || t('Tamu', 'Guest') }}</span>
              </div>
              <p class="text-[14px] text-ink-muted leading-relaxed">{{ rv.comment || rv.body }}</p>
              <div v-if="rv.reply" class="mt-2 pl-3 border-l-2 border-brand-200 text-[13px] text-ink-muted"><b class="text-brand-700">{{ t('Balasan hotel:', 'Hotel reply:') }}</b> {{ rv.reply }}</div>
            </div>
          </div>
        </div>

        <!-- Nearby -->
        <div v-if="hotel.nearby?.length" class="card p-5 mt-8">
          <h2 class="font-bold text-lg mb-3">{{ t('Yang Ada di Sekitar', "What's Nearby") }}</h2>
          <div class="grid sm:grid-cols-2 gap-x-6 gap-y-2">
            <div v-for="n in hotel.nearby" :key="n.id" class="flex items-center justify-between text-[14px] py-1 border-b border-line/60">
              <span class="text-ink-muted">{{ n.name }}</span>
              <span class="font-semibold">{{ n.distanceKm }} km</span>
            </div>
          </div>
        </div>

        <!-- Map -->
        <div v-if="hotel.lat && hotel.lng" class="card overflow-hidden mt-8">
          <iframe :src="mapUrl" class="w-full h-64 border-0" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>
        </div>

        <!-- Tanya Jawab -->
        <div class="card p-5 mt-8">
          <h2 class="font-bold text-lg mb-3">{{ t('Tanya Jawab', 'Questions & Answers') }}</h2>
          <div v-if="questions.length" class="space-y-3 mb-4">
            <div v-for="q in questions" :key="q.id" class="border-b border-line/60 pb-3">
              <div class="font-semibold text-[14px]">{{ t('T:', 'Q:') }} {{ q.body || q.question }}</div>
              <div v-if="q.answer" class="text-[14px] text-ink-muted mt-1">{{ t('J:', 'A:') }} {{ q.answer }}</div>
              <div v-else class="text-[13px] text-ink-faint mt-1 italic">{{ t('Belum dijawab hotel.', 'Not answered by the hotel yet.') }}</div>
            </div>
          </div>
          <p v-else class="text-ink-muted text-sm mb-3">{{ t('Belum ada pertanyaan. Jadilah yang pertama bertanya.', 'No questions yet. Be the first to ask.') }}</p>
          <div v-if="isLoggedIn" class="flex gap-2">
            <input v-model="qText" class="input !py-2.5 !text-sm" :placeholder="t('Ajukan pertanyaan…', 'Ask a question…')" />
            <button @click="ask" :disabled="qBusy" class="btn-brand btn-sm">{{ t('Kirim', 'Send') }}</button>
          </div>
          <NuxtLink v-else :to="`/login?redirect=/hotel/${hotel.id}`" class="text-brand-600 text-sm font-semibold">{{ t('Masuk untuk bertanya', 'Sign in to ask') }}</NuxtLink>
        </div>

        <!-- Chat dengan Hotel -->
        <div class="card p-5 mt-4">
          <h2 class="font-bold text-lg mb-1">{{ t('Chat dengan Hotel', 'Chat with the Hotel') }}</h2>
          <p class="text-[13px] text-ink-muted mb-3">{{ t('Tanya langsung ke pihak hotel. Demi keamanan, kontak/transaksi di luar sistem otomatis disaring.', 'Ask the hotel directly. For your safety, off-platform contacts and transactions are filtered automatically.') }}</p>
          <template v-if="isLoggedIn">
            <div v-if="hotelMsgs.length" class="space-y-2 mb-3 max-h-56 overflow-y-auto">
              <div v-for="(m,i) in hotelMsgs" :key="i" class="flex" :class="m.fromGuest || m.sender==='GUEST' ? 'justify-end' : 'justify-start'">
                <div class="max-w-[80%] rounded-2xl px-3 py-2 text-[14px]" :class="(m.fromGuest || m.sender==='GUEST') ? 'bg-brand text-white' : 'bg-paper border border-line'">{{ m.body }}</div>
              </div>
            </div>
            <div class="flex gap-2">
              <input v-model="hcText" class="input !py-2.5 !text-sm" :placeholder="t('Tulis pesan ke hotel…', 'Write a message to the hotel…')" />
              <button @click="sendHotel" :disabled="hcBusy" class="btn-brand btn-sm">{{ t('Kirim', 'Send') }}</button>
            </div>
          </template>
          <NuxtLink v-else :to="`/login?redirect=/hotel/${hotel.id}`" class="text-brand-600 text-sm font-semibold">{{ t('Masuk untuk chat', 'Sign in to chat') }}</NuxtLink>
        </div>
      </div>

      <!-- Sticky booking aside -->
      <aside class="lg:sticky lg:top-20 h-fit">
        <div class="card p-5">
          <div class="text-sm text-ink-muted">{{ t('Mulai dari', 'Starting from') }}</div>
          <div class="text-3xl font-extrabold text-brand-700">{{ rupiah(hotel.priceFrom) }}<span class="text-sm font-normal text-ink-faint">{{ t('/malam', '/night') }}</span></div>
          <div class="mt-3 text-[14px] space-y-1.5 text-ink-muted">
            <div class="flex justify-between"><span>{{ t('Check-in', 'Check-in') }}</span><b class="text-ink">{{ hotel.checkInInfo }}</b></div>
            <div class="flex justify-between"><span>{{ t('Check-out', 'Check-out') }}</span><b class="text-ink">{{ hotel.checkOutInfo }}</b></div>
          </div>
          <a href="#rooms" class="btn-brand w-full mt-4">{{ t('Lihat Kamar', 'View Rooms') }}</a>
          <div class="flex gap-2 mt-2">
            <button @click="favToggle(hotel.id)" class="btn-ghost btn-sm flex-1" :class="{ '!text-red-600 !border-red-200': isFav(hotel.id) }">{{ isFav(hotel.id) ? t('♥ Favorit', '♥ Saved') : t('♡ Simpan', '♡ Save') }}</button>
            <button @click="cmpToggle(hotel)" class="btn-ghost btn-sm flex-1" :class="{ 'chip-on': cmpHas(hotel.id) }">{{ cmpHas(hotel.id) ? t('✓ Banding', '✓ Compare') : t('+ Banding', '+ Compare') }}</button>
          </div>
          <button @click="openSaveToTrip" class="btn-ghost btn-sm w-full mt-2">🧳 {{ t('Simpan ke Trip', 'Save to Trip') }}</button>
          <button @click="togglePriceAlert" class="btn-ghost btn-sm w-full mt-2" :class="{ 'chip-on': watching }">{{ watching ? t('🔔 Memantau harga turun', '🔔 Watching for price drops') : t('Pantau Harga Turun', 'Watch for Price Drops') }}</button>
          <p v-if="tripMsg" class="text-[13px] mt-2" :class="tripOk ? 'text-leaf-dark' : 'text-red-600'">{{ tripMsg }}</p>
        </div>
      </aside>
    </div>

    <!-- Similar -->
    <RailSection v-if="similar.length" :title="t('Properti Serupa', 'Similar Properties')" more="/search">
      <HotelCard v-for="h in similar" :key="h.id" :hotel="h" class="min-w-[240px] w-[240px]" />
    </RailSection>

    <!-- Simpan ke Trip -->
    <div v-if="tripSheet" class="fixed inset-0 z-50 grid place-items-end sm:place-items-center bg-ink/40" @click.self="tripSheet = false">
      <div class="bg-white w-full sm:max-w-sm rounded-t-xl2 sm:rounded-xl2 shadow-pop p-5 max-h-[80vh] overflow-y-auto">
        <h3 class="font-bold text-lg mb-3">{{ t('Simpan ke Trip', 'Save to Trip') }}</h3>

        <template v-if="!tripCreating">
          <div v-if="myTrips.length" class="divide-y divide-line mb-2">
            <button v-for="trip in myTrips" :key="trip.id" @click="saveToTrip(trip)" :disabled="!!tripBusy"
              class="w-full flex items-center gap-2 py-3 text-left">
              <span class="text-brand">🧳</span>
              <span class="font-semibold text-[14px] flex-1 truncate">{{ trip.name }}</span>
              <span class="text-[12px] text-ink-faint">{{ (trip.items || []).length }} {{ t('item', 'items') }}</span>
              <span class="text-brand text-lg leading-none">+</span>
            </button>
          </div>
          <p v-else class="text-[13px] text-ink-muted mb-2">{{ t('Belum ada trip. Buat trip pertamamu.', 'No trips yet. Create your first one.') }}</p>
          <button @click="tripCreating = true; tripName = ''" class="btn-ghost btn-sm w-full">+ {{ t('Buat trip baru', 'Create a new trip') }}</button>
        </template>

        <template v-else>
          <label class="label">{{ t('Nama trip', 'Trip name') }}</label>
          <input v-model="tripName" class="input" :placeholder="t('Contoh: Liburan Bali', 'Example: Bali Holiday')" @keyup.enter="createAndSave" />
          <div class="flex justify-end gap-2 mt-4">
            <button @click="tripCreating = false" class="btn-ghost btn-sm">{{ t('Batal', 'Cancel') }}</button>
            <button @click="createAndSave" :disabled="!!tripBusy" class="btn-brand btn-sm">{{ tripBusy ? '…' : t('Buat', 'Create') }}</button>
          </div>
        </template>

        <button @click="tripSheet = false" class="btn-ghost btn-sm w-full mt-3">{{ t('Tutup', 'Close') }}</button>
      </div>
    </div>

    <!-- Kalender Harga -->
    <PriceCalendar
      v-if="calOpen"
      :hotel-id="hotel.id"
      :initial-check-in="checkIn"
      :initial-check-out="checkOut"
      @close="calOpen = false"
      @apply="applyCalendar" />
  </div>

  <div v-else class="container-site py-24 text-center text-ink-muted">{{ t('Hotel tidak ditemukan.', 'Hotel not found.') }}</div>
</template>

<script setup lang="ts">
const route = useRoute()
const { $api } = useNuxtApp()
const { t } = useLang()
const { isLoggedIn } = useAuth()
const { isFav, toggle: favToggle, load: loadFav } = useFavorites()
const { has: cmpHas, toggle: cmpToggle } = useCompare()

const id = route.params.id as string

const { data } = await useAsyncData(`hotel-${id}`, () => $api(`/hotels/${id}`).catch(() => ({ hotel: null })))
const hotel = computed<any>(() => (data.value as any)?.hotel || null)

const { data: sim } = await useAsyncData(`sim-${id}`, () => $api(`/hotels/${id}/similar`).catch(() => ({ hotels: [] })))
const similar = computed<any[]>(() => ((sim.value as any)?.hotels || []).slice(0, 10))

const gallery = computed(() => {
  const photos = (hotel.value?.photos || []).map((p: any) => p.url || p)
  const all = [hotel.value?.imageUrl, ...photos].filter(Boolean)
  return all.length ? all : [hotel.value?.imageUrl]
})
const facilities = computed(() => (hotel.value?.facilities || []).map((f: any) => f.facility || f))
const propType = computed(() => propertyTypeLabel(hotel.value?.propertyType))

const todayStr = isoDate(new Date())
const checkIn = ref((route.query.checkIn as string) || todayStr)
const checkOut = ref((route.query.checkOut as string) || isoDate(new Date(Date.now() + 86400000)))
const guests = ref(Number(route.query.guests) || 2)

// ── Kalender harga ──
const calOpen = ref(false)
function applyCalendar(r: { checkIn: string; checkOut: string }) {
  checkIn.value = r.checkIn
  checkOut.value = r.checkOut
  calOpen.value = false
}

function ratePlansOf(room: any) {
  const plans = (room.ratePlans || []).filter((p: any) => p.active !== false)
  // `t()` is evaluated here during render, so it follows the active language.
  return plans.length ? plans : [{ id: null, name: t('Harga Standar', 'Standard Rate'), boardBasis: room.breakfast ? 'BREAKFAST' : 'ROOM_ONLY', priceDelta: 0, freeCancellation: room.freeCancellation }]
}
const planPrice = (room: any, plan: any) => Number(room.price) + Number(plan?.priceDelta || 0)
const boardBasis = (b: string) => boardBasisLabel(b)

function pick(room: any, plan: any) {
  if (checkOut.value <= checkIn.value) checkOut.value = isoDate(new Date(new Date(checkIn.value).getTime() + 86400000))
  navigateTo({ path: '/booking', query: {
    hotel: hotel.value.id, room: room.id, plan: plan?.id || undefined,
    checkIn: checkIn.value, checkOut: checkOut.value, guests: guests.value, rooms: 1,
  } })
}

const mapUrl = computed(() => {
  const la = hotel.value.lat, lo = hotel.value.lng
  const d = 0.01
  return `https://www.openstreetmap.org/export/embed.html?bbox=${lo - d}%2C${la - d}%2C${lo + d}%2C${la + d}&layer=mapnik&marker=${la}%2C${lo}`
})

// ── Favorites / compare ── (composables hoisted above the awaits)

// ── Simpan ke Trip (wishlists) ──
const tripSheet = ref(false)
const tripCreating = ref(false)
const tripName = ref('')
const tripBusy = ref(false)
const tripMsg = ref('')
const tripOk = ref(true)
const myTrips = ref<any[]>([])

function tripItem() {
  return {
    kind: 'HOTEL',
    refId: id,
    title: hotel.value?.name || '',
    imageUrl: hotel.value?.imageUrl || gallery.value?.[0] || null,
    subtitle: hotel.value?.city || hotel.value?.address || '',
    price: Number(hotel.value?.priceFrom) || 0,
  }
}

async function openSaveToTrip() {
  if (!isLoggedIn.value) return navigateTo(`/login?redirect=/hotel/${id}`)
  tripMsg.value = ''
  tripCreating.value = false
  tripSheet.value = true
  const r: any = await $api('/wishlists').catch(() => ({ wishlists: [] }))
  myTrips.value = r?.wishlists || []
}

// Param renamed from `t` so it does not shadow the `t()` translator.
async function saveToTrip(t2: any) {
  tripBusy.value = true
  try {
    await $api(`/wishlists/${t2.id}/items`, { method: 'POST', body: tripItem() })
    tripOk.value = true; tripMsg.value = t(`Disimpan ke "${t2.name}".`, `Saved to "${t2.name}".`)
    tripSheet.value = false
  } catch {
    tripOk.value = false; tripMsg.value = t('Gagal menyimpan. Coba lagi.', 'Failed to save. Please try again.')
  } finally { tripBusy.value = false }
}

async function createAndSave() {
  const name = tripName.value.trim(); if (!name) return
  tripBusy.value = true
  try {
    const r: any = await $api('/wishlists', { method: 'POST', body: { name } })
    const w = r?.wishlist || r
    await $api(`/wishlists/${w.id}/items`, { method: 'POST', body: tripItem() })
    tripOk.value = true; tripMsg.value = t(`Disimpan ke "${name}".`, `Saved to "${name}".`)
    tripSheet.value = false; tripCreating.value = false
  } catch {
    tripOk.value = false; tripMsg.value = t('Gagal menyimpan. Coba lagi.', 'Failed to save. Please try again.')
  } finally { tripBusy.value = false }
}

// ── Price alert ──
const watching = ref(false)
async function togglePriceAlert() {
  if (!isLoggedIn.value) return navigateTo(`/login?redirect=/hotel/${id}`)
  try { const r: any = await $api(`/hotels/${id}/price-alert`, { method: 'POST', body: {} }); watching.value = !!r.watching } catch {}
}

// ── Q&A ──
const questions = ref<any[]>([])
const qText = ref(''); const qBusy = ref(false)
async function ask() {
  const body = qText.value.trim(); if (!body) return
  qBusy.value = true
  try { await $api(`/hotels/${id}/questions`, { method: 'POST', body: { body } }); qText.value = ''; const r: any = await $api(`/hotels/${id}/questions`); questions.value = r.questions || [] } catch {}
  finally { qBusy.value = false }
}

// ── Hotel chat ──
const hotelMsgs = ref<any[]>([])
const hcText = ref(''); const hcBusy = ref(false)
async function sendHotel() {
  const body = hcText.value.trim(); if (!body) return
  hcBusy.value = true
  try { const r: any = await $api(`/hotel-chat/${id}`, { method: 'POST', body: { body } }); hcText.value = ''; hotelMsgs.value = r.messages || r.thread?.messages || hotelMsgs.value } catch {}
  finally { hcBusy.value = false }
}

onMounted(async () => {
  try { $api(`/hotels/${id}/view`, { method: 'POST', body: {} }).catch(() => {}) } catch {}
  try { const r: any = await $api(`/hotels/${id}/questions`); questions.value = r.questions || [] } catch {}
  if (isLoggedIn.value) {
    loadFav()
    try { const pa: any = await $api('/price-alerts'); watching.value = (pa.hotelIds || []).includes(id) } catch {}
    try { const hc: any = await $api(`/hotel-chat/${id}`); hotelMsgs.value = hc.messages || hc.thread?.messages || [] } catch {}
  }
})

useHead(() => ({ title: hotel.value ? `${hotel.value.name}, ${hotel.value.city} · Miruum` : 'Miruum' }))
</script>
