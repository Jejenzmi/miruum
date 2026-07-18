<template>
  <div v-if="hotel" class="pb-10">
    <!-- Gallery -->
    <section class="container-site pt-5">
      <div class="grid gap-2 sm:grid-cols-4 sm:grid-rows-2 rounded-xl2 overflow-hidden h-[300px] sm:h-[380px]">
        <div class="sm:col-span-2 sm:row-span-2 bg-line">
          <img :src="gallery[0]" :alt="hotel.name" class="w-full h-full object-cover" />
        </div>
        <div v-for="(g,i) in gallery.slice(1,5)" :key="i" class="hidden sm:block bg-line">
          <img :src="g" :alt="hotel.name" class="w-full h-full object-cover" />
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
          <h2 class="font-bold text-lg mb-2">Tentang Properti</h2>
          <p class="text-[15px] text-ink-muted leading-relaxed whitespace-pre-line">{{ hotel.description }}</p>
        </div>

        <!-- Facilities -->
        <div v-if="facilities.length" class="card p-5 mt-5">
          <h2 class="font-bold text-lg mb-3">Fasilitas</h2>
          <div class="flex flex-wrap gap-2">
            <span v-for="f in facilities" :key="f.id || f.name" class="pill bg-paper text-ink-muted !text-[13px] !px-3 !py-1.5 border border-line">{{ f.name || f }}</span>
          </div>
        </div>

        <!-- Rooms -->
        <div id="rooms" class="mt-7">
          <div class="flex items-center justify-between mb-3 gap-3 flex-wrap">
            <h2 class="font-bold text-xl">Pilih Kamar</h2>
            <div class="flex items-end gap-2 text-sm">
              <div><label class="label !mb-0.5">Check-in</label><input v-model="checkIn" type="date" :min="todayStr" class="input !py-2 !text-sm" /></div>
              <div><label class="label !mb-0.5">Check-out</label><input v-model="checkOut" type="date" :min="checkIn" class="input !py-2 !text-sm" /></div>
              <div class="w-20"><label class="label !mb-0.5">Tamu</label><select v-model.number="guests" class="input !py-2 !text-sm !px-2"><option v-for="n in 8" :key="n" :value="n">{{ n }}</option></select></div>
            </div>
          </div>

          <div class="space-y-4">
            <div v-for="room in hotel.rooms" :key="room.id" class="card p-4 sm:flex gap-4">
              <div class="sm:w-40 shrink-0 mb-3 sm:mb-0">
                <div class="rounded-xl bg-brand-50 text-brand-700 p-3 h-full flex flex-col justify-center">
                  <div class="font-bold text-[15px] leading-tight">{{ room.name }}</div>
                  <div class="text-[12.5px] text-ink-muted mt-1">{{ room.bedInfo }}</div>
                  <div class="text-[12.5px] text-ink-muted">Maks {{ room.capacity }} tamu</div>
                </div>
              </div>
              <div class="flex-1 min-w-0">
                <div class="flex flex-wrap gap-1.5 mb-2">
                  <span v-if="room.breakfast" class="pill bg-leaf-soft text-leaf-dark">Sarapan</span>
                  <span v-if="room.freeWifi" class="pill bg-paper text-ink-muted border border-line">WiFi Gratis</span>
                  <span v-if="room.freeCancellation" class="pill bg-leaf-soft text-leaf-dark">Batal Gratis</span>
                  <span v-else-if="room.refundable" class="pill bg-paper text-ink-muted border border-line">Refundable</span>
                  <span v-else class="pill bg-red-50 text-red-600">Non-refundable</span>
                </div>
                <!-- Rate plans -->
                <div class="divide-y divide-line">
                  <div v-for="plan in ratePlansOf(room)" :key="plan.id || 'base'" class="flex items-center justify-between gap-3 py-2.5">
                    <div class="min-w-0">
                      <div class="font-semibold text-[14px] truncate">{{ plan.name || 'Harga Standar' }}</div>
                      <div class="text-[12px] text-ink-faint">{{ boardBasis(plan.boardBasis) }}<span v-if="plan.freeCancellation"> · Batal gratis</span></div>
                    </div>
                    <div class="text-right shrink-0">
                      <div v-if="room.originalPrice && room.originalPrice > room.price" class="text-[12px] text-ink-faint line-through">{{ rupiah(room.originalPrice) }}</div>
                      <div class="text-brand-700 font-extrabold text-[16px]">{{ rupiah(planPrice(room, plan)) }}</div>
                      <div class="text-[11px] text-ink-faint mb-1">/malam</div>
                      <button @click="pick(room, plan)" class="btn-brand btn-sm">Pilih</button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Reviews -->
        <div v-if="hotel.reviews?.length" class="mt-8">
          <h2 class="font-bold text-xl mb-3">Ulasan Tamu ({{ hotel.reviewCount }})</h2>
          <div class="grid sm:grid-cols-2 gap-4">
            <div v-for="rv in hotel.reviews.slice(0,6)" :key="rv.id" class="card p-4">
              <div class="flex items-center gap-2 mb-1">
                <span class="rounded-lg bg-leaf px-2 py-0.5 text-white text-[12px] font-bold">{{ Number(rv.rating).toFixed(1) }}</span>
                <span class="font-semibold text-[14px]">{{ rv.userName || rv.user?.name || 'Tamu' }}</span>
              </div>
              <p class="text-[14px] text-ink-muted leading-relaxed">{{ rv.comment || rv.body }}</p>
              <div v-if="rv.reply" class="mt-2 pl-3 border-l-2 border-brand-200 text-[13px] text-ink-muted"><b class="text-brand-700">Balasan hotel:</b> {{ rv.reply }}</div>
            </div>
          </div>
        </div>

        <!-- Nearby -->
        <div v-if="hotel.nearby?.length" class="card p-5 mt-8">
          <h2 class="font-bold text-lg mb-3">Yang Ada di Sekitar</h2>
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
      </div>

      <!-- Sticky booking aside -->
      <aside class="lg:sticky lg:top-20 h-fit">
        <div class="card p-5">
          <div class="text-sm text-ink-muted">Mulai dari</div>
          <div class="text-3xl font-extrabold text-brand-700">{{ rupiah(hotel.priceFrom) }}<span class="text-sm font-normal text-ink-faint">/malam</span></div>
          <div class="mt-3 text-[14px] space-y-1.5 text-ink-muted">
            <div class="flex justify-between"><span>Check-in</span><b class="text-ink">{{ hotel.checkInInfo }}</b></div>
            <div class="flex justify-between"><span>Check-out</span><b class="text-ink">{{ hotel.checkOutInfo }}</b></div>
          </div>
          <a href="#rooms" class="btn-brand w-full mt-4">Lihat Kamar</a>
        </div>
      </aside>
    </div>

    <!-- Similar -->
    <RailSection v-if="similar.length" title="Properti Serupa" more="/search">
      <HotelCard v-for="h in similar" :key="h.id" :hotel="h" class="min-w-[240px] w-[240px]" />
    </RailSection>
  </div>

  <div v-else class="container-site py-24 text-center text-ink-muted">Hotel tidak ditemukan.</div>
</template>

<script setup lang="ts">
const route = useRoute()
const { $api } = useNuxtApp()
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
const propType = computed(() => PROPERTY_TYPES[hotel.value?.propertyType] || 'Hotel')

const todayStr = isoDate(new Date())
const checkIn = ref((route.query.checkIn as string) || todayStr)
const checkOut = ref((route.query.checkOut as string) || isoDate(new Date(Date.now() + 86400000)))
const guests = ref(Number(route.query.guests) || 2)

function ratePlansOf(room: any) {
  const plans = (room.ratePlans || []).filter((p: any) => p.active !== false)
  return plans.length ? plans : [{ id: null, name: 'Harga Standar', boardBasis: room.breakfast ? 'BREAKFAST' : 'ROOM_ONLY', priceDelta: 0, freeCancellation: room.freeCancellation }]
}
const planPrice = (room: any, plan: any) => Number(room.price) + Number(plan?.priceDelta || 0)
const boardBasis = (b: string) => BOARD_BASIS[b] || 'Tanpa Sarapan'

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

useHead(() => ({ title: hotel.value ? `${hotel.value.name}, ${hotel.value.city} · Miruum` : 'Miruum' }))
</script>
