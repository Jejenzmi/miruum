<template>
  <div v-if="venue" class="pb-10">
    <!-- Gallery -->
    <section class="container-site pt-5">
      <NuxtLink to="/venues" class="text-sm text-ink-muted hover:text-brand inline-block mb-3">← {{ t('Semua Venue', 'All Venues') }}</NuxtLink>
      <div v-if="gallery.length > 1" class="grid gap-2 sm:grid-cols-4 sm:grid-rows-2 rounded-xl2 overflow-hidden h-[280px] sm:h-[380px]">
        <div class="sm:col-span-2 sm:row-span-2 bg-line"><img :src="gallery[0]" :alt="venue.name" class="w-full h-full object-cover" /></div>
        <div v-for="(g,i) in gallery.slice(1,5)" :key="i" class="hidden sm:block bg-line"><img :src="g" :alt="venue.name" loading="lazy" class="w-full h-full object-cover" /></div>
      </div>
      <div v-else class="rounded-xl2 overflow-hidden h-[280px] sm:h-[360px] bg-line"><img :src="gallery[0]" :alt="venue.name" class="w-full h-full object-cover" /></div>
    </section>

    <div class="container-site grid lg:grid-cols-[1fr_360px] gap-8 mt-6">
      <div class="min-w-0">
        <!-- Header -->
        <div class="flex items-center gap-2 mb-2">
          <span class="pill bg-brand-50 text-brand-700 font-bold">{{ typeLabel(venue.type) }}</span>
          <span class="pill font-bold" :class="venue.bookingMode==='INSTANT' ? 'bg-teal-soft text-teal-dark' : 'bg-amber-50 text-amber-700'">{{ venue.bookingMode==='INSTANT' ? t('Instant Book','Instant Book') : t('Inquiry / Penawaran','Inquiry / Quote') }}</span>
          <StarRating v-if="venue.hotel?.starRating" :value="venue.hotel.starRating" />
        </div>
        <h1 class="text-2xl sm:text-3xl font-display font-bold">{{ venue.name }}</h1>
        <p class="text-ink-muted text-sm flex items-center gap-1 mt-1">
          <svg viewBox="0 0 24 24" class="w-4 h-4 fill-none stroke-current" stroke-width="2"><path d="M12 21s-7-5.2-7-11a7 7 0 1 1 14 0c0 5.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>
          {{ venue.hotel?.name }} · {{ venue.hotel?.address || venue.hotel?.city }}
        </p>

        <!-- Capacity setups -->
        <div class="card p-5 mt-5">
          <h2 class="font-display font-bold text-lg mb-3">{{ t('Kapasitas & Ruang', 'Capacity & Space') }}</h2>
          <div class="grid grid-cols-3 sm:grid-cols-5 gap-3">
            <div v-for="c in caps" :key="c.label" class="text-center bg-bg rounded-xl py-3">
              <div class="text-xl font-bold text-navy">{{ c.value || '-' }}</div>
              <div class="text-[11px] text-ink-faint mt-0.5">{{ c.label }}</div>
            </div>
          </div>
        </div>

        <!-- Description -->
        <div v-if="venue.description" class="card p-5 mt-5">
          <h2 class="font-display font-bold text-lg mb-2">{{ t('Tentang Venue', 'About This Venue') }}</h2>
          <p class="text-[15px] text-ink-muted leading-relaxed whitespace-pre-line">{{ venue.description }}</p>
        </div>

        <!-- Packages -->
        <div v-if="venue.packages?.length" class="card p-5 mt-5">
          <h2 class="font-display font-bold text-lg mb-3">{{ t('Paket Acara', 'Event Packages') }}</h2>
          <div v-for="p in venue.packages" :key="p.id" class="py-3.5 border-b border-line last:border-0 flex justify-between items-start gap-3">
            <div>
              <div class="font-semibold">{{ p.name }}</div>
              <div v-if="p.inclusions?.length" class="flex flex-wrap gap-1.5 mt-1.5">
                <span v-for="inc in p.inclusions" :key="inc" class="pill bg-paper text-ink-muted !text-[12px] border border-line">{{ inc }}</span>
              </div>
            </div>
            <div class="text-brand-700 font-extrabold whitespace-nowrap text-[15px]">{{ rupiah(p.price) }}<span class="text-[11px] font-normal text-ink-faint">{{ p.perPax ? t('/org','/pax') : '' }}</span></div>
          </div>
        </div>
      </div>

      <!-- Booking / inquiry (sticky) -->
      <aside class="lg:sticky lg:top-24 h-fit">
        <div class="card p-5 border-t-4 border-brand">
          <div v-if="done" class="text-center py-6">
            <div class="text-4xl mb-2">{{ venue.bookingMode==='INSTANT' ? '✅' : '📩' }}</div>
            <p class="font-bold text-lg">{{ venue.bookingMode==='INSTANT' ? t('Booking Terkonfirmasi','Booking Confirmed') : t('Permintaan Terkirim','Inquiry Sent') }}</p>
            <p class="text-ink-muted text-sm mt-1">{{ venue.bookingMode==='INSTANT' ? t('Tim hotel akan menghubungi untuk detail & pembayaran.','The hotel will contact you for details & payment.') : t('Tim hotel akan mengirim penawaran secepatnya.','The hotel will send you a quotation shortly.') }}</p>
            <button class="btn-ghost btn-sm mt-4" @click="done=false">{{ t('Kirim lagi','Submit again') }}</button>
          </div>
          <form v-else @submit.prevent="submit">
            <div class="flex items-end justify-between mb-3">
              <div>
                <div class="text-[12px] text-ink-faint">{{ venue.bookingMode==='INSTANT' ? t('Mulai dari','From') : t('Estimasi','Estimate') }}</div>
                <div class="text-2xl font-display font-extrabold text-brand-700">{{ rupiah(estimate) }}<span class="text-[12px] font-normal text-ink-faint">{{ basisLabel(venue.priceBasis) }}</span></div>
              </div>
            </div>
            <label class="label">{{ t('Tanggal Acara','Event Date') }}</label>
            <input v-model="form.eventDate" type="date" :min="todayStr" class="input" required />
            <label class="label mt-2">{{ t('Sesi','Session') }}</label>
            <select v-model="form.slot" class="input">
              <option value="FULLDAY">{{ t('Sehari Penuh','Full-day') }}</option>
              <option value="MORNING">{{ t('Pagi','Morning') }}</option>
              <option value="AFTERNOON">{{ t('Siang','Afternoon') }}</option>
              <option value="EVENING">{{ t('Malam','Evening') }}</option>
            </select>
            <p v-if="venue.bookingMode==='INSTANT' && form.eventDate && avail !== null" class="mt-2 text-[13px] font-semibold" :class="avail ? 'text-leaf-dark' : 'text-red-600'">
              {{ avail ? '✓ ' + t('Tersedia untuk sesi ini','Available for this session') : '✕ ' + t('Sudah dipesan untuk sesi ini','Already booked for this session') }}
            </p>
            <div v-if="venue.packages?.length">
              <label class="label mt-2">{{ t('Paket (opsional)','Package (optional)') }}</label>
              <select v-model="form.packageId" class="input">
                <option value="">{{ t('Tanpa paket','No package') }}</option>
                <option v-for="p in venue.packages" :key="p.id" :value="p.id">{{ p.name }} — {{ rupiah(p.price) }}{{ p.perPax ? '/org' : '' }}</option>
              </select>
            </div>
            <div class="grid grid-cols-2 gap-2 mt-2">
              <div><label class="label">{{ t('Jumlah Tamu','Guests') }}</label><input v-model.number="form.pax" type="number" min="0" class="input" /></div>
              <div><label class="label">{{ t('Jenis Acara','Event Type') }}</label><input v-model="form.eventType" class="input" :placeholder="t('mis. Wedding','e.g. Wedding')" /></div>
            </div>
            <hr class="my-3 border-line" />
            <label class="label">{{ t('Nama','Name') }}</label><input v-model="form.customerName" class="input" required />
            <div class="grid grid-cols-2 gap-2 mt-2">
              <div><label class="label">{{ t('No. HP','Phone') }}</label><input v-model="form.customerPhone" class="input" /></div>
              <div><label class="label">Email</label><input v-model="form.customerEmail" type="email" class="input" /></div>
            </div>
            <textarea v-model="form.notes" rows="2" class="input mt-2" :placeholder="t('Catatan kebutuhan acara…','Event requirements…')"></textarea>
            <button class="btn-brand w-full mt-3" :disabled="loading || (venue.bookingMode==='INSTANT' && avail === false)">{{ loading ? '…' : (venue.bookingMode==='INSTANT' ? t('Pesan Sekarang','Book Now') : t('Kirim Permintaan','Send Inquiry')) }}</button>
            <p v-if="err" class="text-red-600 text-[13px] mt-2 text-center">{{ err }}</p>
            <p class="text-[12px] text-ink-faint text-center mt-3">{{ venue.bookingMode==='INSTANT' ? t('Konfirmasi instan · bayar di hotel','Instant confirmation · pay at hotel') : t('Tanpa biaya untuk mengajukan penawaran','No cost to request a quote') }}</p>
          </form>
        </div>
      </aside>
    </div>
  </div>
  <div v-else class="container-site py-24 text-center text-ink-muted">{{ t('Memuat…','Loading…') }}</div>
</template>

<script setup lang="ts">
const route = useRoute()
const { t } = useLang()
const { $api } = useNuxtApp()
const { user } = useAuth()
const { data } = await useAsyncData(`venue-${route.params.id}`, () => $api(`/venues/${route.params.id}`).catch(() => ({ venue: null })))
const venue = computed<any>(() => (data.value as any)?.venue || null)
const typeLabel = (x: string) => ({ MEETING_ROOM: 'Meeting Room', BALLROOM: 'Ballroom', FUNCTION_HALL: 'Function Hall', OUTDOOR: 'Outdoor' } as any)[x] || x
const basisLabel = (x: string) => ({ HOUR: t('/jam', '/hour'), HALFDAY: '/half-day', FULLDAY: '/full-day', PERPAX: t('/org', '/pax') } as any)[x] || ''

const gallery = computed<string[]>(() => {
  const g = venue.value?.gallery?.length ? venue.value.gallery : [venue.value?.imageUrl, venue.value?.hotel?.imageUrl]
  return (g || []).filter(Boolean)
})
const caps = computed(() => [
  { label: t('Luas','Area') + ' (m²)', value: venue.value?.area },
  { label: 'Theatre', value: venue.value?.capTheatre },
  { label: 'Classroom', value: venue.value?.capClassroom },
  { label: 'Round Table', value: venue.value?.capRound },
  { label: 'Standing', value: venue.value?.capStanding },
])
const todayStr = new Date().toISOString().slice(0, 10)

const form = reactive({ eventDate: '', slot: 'FULLDAY', packageId: '', pax: 0, eventType: '', customerName: '', customerPhone: '', customerEmail: '', notes: '' })
watchEffect(() => { if (user.value) { form.customerName ||= user.value.name || ''; form.customerPhone ||= user.value.phone || ''; form.customerEmail ||= user.value.email || '' } })

const estimate = computed(() => {
  if (!venue.value) return 0
  const p = (venue.value.packages || []).find((x: any) => x.id === form.packageId)
  if (p) return p.perPax ? p.price * Math.max(1, form.pax || 1) : p.price
  return venue.value.basePrice
})

// Live availability check for instant-book venues.
const avail = ref<null | boolean>(null)
async function checkAvail() {
  avail.value = null
  if (venue.value?.bookingMode !== 'INSTANT' || !form.eventDate) return
  try { const r: any = await $api(`/venues/${route.params.id}/availability`, { method: 'POST', body: { eventDate: form.eventDate, slot: form.slot } }); avail.value = !!r.available } catch { avail.value = null }
}
watch(() => [form.eventDate, form.slot], checkAvail)

const loading = ref(false), err = ref(''), done = ref(false)
async function submit() {
  err.value = ''
  if (!form.eventDate) { err.value = t('Pilih tanggal acara.', 'Pick an event date.'); return }
  if (!form.customerName.trim()) { err.value = t('Isi nama.', 'Enter your name.'); return }
  loading.value = true
  try {
    await $api(`/venues/${route.params.id}/book`, { method: 'POST', body: { ...form, packageId: form.packageId || undefined } })
    done.value = true
  } catch (e: any) {
    err.value = e?.data?.error || t('Gagal mengirim. Coba lagi.', 'Failed to submit. Try again.')
  } finally { loading.value = false }
}
useHead(() => ({ title: (venue.value?.name ? venue.value.name + ' · ' : '') + 'Venue · Miruum' }))
</script>
