<template>
  <div class="container-site py-6 max-w-5xl" v-if="venue">
    <NuxtLink to="/venues" class="text-sm text-ink-muted hover:text-brand">← {{ t('Semua Venue', 'All Venues') }}</NuxtLink>
    <div class="grid lg:grid-cols-[1fr_380px] gap-6 mt-3">
      <!-- Detail -->
      <div>
        <div class="card overflow-hidden mb-4">
          <img :src="venue.imageUrl || venue.hotel?.imageUrl" class="w-full h-64 object-cover" :alt="venue.name" />
          <div class="p-5">
            <div class="flex gap-2 mb-2">
              <span class="pill bg-brand-50 text-brand-700">{{ typeLabel(venue.type) }}</span>
              <span class="pill" :class="venue.bookingMode==='INSTANT' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'">{{ venue.bookingMode==='INSTANT' ? t('Instant Book','Instant Book') : t('Inquiry / Penawaran','Inquiry / Quote') }}</span>
            </div>
            <h1 class="text-2xl font-display font-bold">{{ venue.name }}</h1>
            <p class="text-ink-muted text-sm mt-1">{{ venue.hotel?.name }} · {{ venue.hotel?.city }}</p>
            <p v-if="venue.description" class="text-[14px] mt-3 leading-relaxed">{{ venue.description }}</p>
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
              <div class="text-center bg-bg rounded-xl py-3"><div class="text-[11px] text-ink-faint">{{ t('Luas','Area') }}</div><div class="font-bold">{{ venue.area || '-' }} m²</div></div>
              <div class="text-center bg-bg rounded-xl py-3"><div class="text-[11px] text-ink-faint">Theatre</div><div class="font-bold">{{ venue.capTheatre || '-' }}</div></div>
              <div class="text-center bg-bg rounded-xl py-3"><div class="text-[11px] text-ink-faint">Classroom</div><div class="font-bold">{{ venue.capClassroom || '-' }}</div></div>
              <div class="text-center bg-bg rounded-xl py-3"><div class="text-[11px] text-ink-faint">Round Table</div><div class="font-bold">{{ venue.capRound || '-' }}</div></div>
            </div>
          </div>
        </div>
        <div v-if="venue.packages?.length" class="card p-5">
          <h2 class="font-bold text-lg mb-3">{{ t('Paket', 'Packages') }}</h2>
          <div v-for="p in venue.packages" :key="p.id" class="py-3 border-b border-line last:border-0">
            <div class="flex justify-between items-start gap-3">
              <div>
                <div class="font-semibold">{{ p.name }}</div>
                <p v-if="p.inclusions?.length" class="text-[12.5px] text-ink-muted mt-0.5">{{ p.inclusions.join(' · ') }}</p>
              </div>
              <div class="text-brand-700 font-extrabold whitespace-nowrap">{{ rupiah(p.price) }}<span class="text-[11px] font-normal text-ink-faint">{{ p.perPax ? t('/org','/pax') : '' }}</span></div>
            </div>
          </div>
        </div>
      </div>

      <!-- Booking / inquiry -->
      <aside class="lg:sticky lg:top-20 h-fit">
        <div class="card p-5">
          <div v-if="done" class="text-center py-6">
            <div class="text-4xl mb-2">{{ venue.bookingMode==='INSTANT' ? '✅' : '📩' }}</div>
            <p class="font-bold text-lg">{{ venue.bookingMode==='INSTANT' ? t('Booking Terkonfirmasi','Booking Confirmed') : t('Permintaan Terkirim','Inquiry Sent') }}</p>
            <p class="text-ink-muted text-sm mt-1">{{ venue.bookingMode==='INSTANT' ? t('Tim hotel akan menghubungi untuk detail & pembayaran.','The hotel will contact you for details & payment.') : t('Tim hotel akan mengirim penawaran secepatnya.','The hotel will send you a quotation shortly.') }}</p>
            <button class="btn-ghost btn-sm mt-4" @click="done=false">{{ t('Kirim lagi','Submit again') }}</button>
          </div>
          <form v-else @submit.prevent="submit">
            <h2 class="font-bold text-lg mb-1">{{ venue.bookingMode==='INSTANT' ? t('Pesan Venue','Book Venue') : t('Ajukan Permintaan','Request a Quote') }}</h2>
            <p class="text-[13px] text-ink-muted mb-3">{{ venue.bookingMode==='INSTANT' ? rupiah(estimate) : t('Harga menyesuaikan kebutuhan acara.','Price tailored to your event.') }}</p>
            <label class="label">{{ t('Tanggal Acara','Event Date') }}</label>
            <input v-model="form.eventDate" type="date" class="input" required />
            <label class="label mt-2">{{ t('Sesi','Session') }}</label>
            <select v-model="form.slot" class="input">
              <option value="FULLDAY">{{ t('Sehari Penuh','Full-day') }}</option>
              <option value="MORNING">{{ t('Pagi','Morning') }}</option>
              <option value="AFTERNOON">{{ t('Siang','Afternoon') }}</option>
              <option value="EVENING">{{ t('Malam','Evening') }}</option>
            </select>
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
            <button class="btn-brand w-full mt-3" :disabled="loading">{{ loading ? '…' : (venue.bookingMode==='INSTANT' ? t('Pesan Sekarang','Book Now') : t('Kirim Permintaan','Send Inquiry')) }}</button>
            <p v-if="err" class="text-red-600 text-[13px] mt-2 text-center">{{ err }}</p>
          </form>
        </div>
      </aside>
    </div>
  </div>
  <div v-else class="container-site py-16 text-center text-ink-muted">{{ t('Memuat…','Loading…') }}</div>
</template>

<script setup lang="ts">
const route = useRoute()
const { t } = useLang()
const { $api } = useNuxtApp()
const { user } = useAuth()
const { data } = await useAsyncData(`venue-${route.params.id}`, () => $api(`/venues/${route.params.id}`).catch(() => ({ venue: null })))
const venue = computed<any>(() => (data.value as any)?.venue || null)
const typeLabel = (x: string) => ({ MEETING_ROOM: 'Meeting Room', BALLROOM: 'Ballroom', FUNCTION_HALL: 'Function Hall', OUTDOOR: 'Outdoor' } as any)[x] || x

const form = reactive({ eventDate: '', slot: 'FULLDAY', packageId: '', pax: 0, eventType: '', customerName: '', customerPhone: '', customerEmail: '', notes: '' })
watchEffect(() => { if (user.value) { form.customerName ||= user.value.name || ''; form.customerPhone ||= user.value.phone || ''; form.customerEmail ||= user.value.email || '' } })

const estimate = computed(() => {
  if (!venue.value) return 0
  const p = (venue.value.packages || []).find((x: any) => x.id === form.packageId)
  if (p) return p.perPax ? p.price * Math.max(1, form.pax || 1) : p.price
  return venue.value.basePrice
})

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
