<template>
  <div class="container-site py-6 max-w-5xl">
    <h1 class="text-2xl font-extrabold mb-1">{{ t('Hotel Partner', 'Partner Hotels') }}</h1>
    <p class="text-ink-muted text-sm mb-5">{{ t('Cari hotel dari jaringan supplier partner kami (live). Bayar aman ke Miruum, konfirmasi otomatis ke hotel.', 'Search hotels from our partner supplier network (live). Pay securely to Miruum, confirmed automatically at the hotel.') }}</p>

    <!-- Search form -->
    <div class="card p-4 mb-5">
      <div class="grid sm:grid-cols-2 lg:grid-cols-5 gap-3">
        <div class="lg:col-span-2">
          <label class="lbl">{{ t('Kota / Kode Destinasi', 'City / Destination code') }}</label>
          <input v-model="form.destination" class="inp" :placeholder="t('mis. BCN, PMI (kode Hotelbeds)', 'e.g. BCN, PMI (Hotelbeds code)')" />
        </div>
        <div><label class="lbl">{{ t('Check-in', 'Check-in') }}</label><input v-model="form.checkIn" type="date" class="inp" /></div>
        <div><label class="lbl">{{ t('Check-out', 'Check-out') }}</label><input v-model="form.checkOut" type="date" class="inp" /></div>
        <div class="grid grid-cols-2 gap-2">
          <div><label class="lbl">{{ t('Dewasa', 'Adults') }}</label><input v-model.number="form.adults" type="number" min="1" class="inp" /></div>
          <div><label class="lbl">{{ t('Kamar', 'Rooms') }}</label><input v-model.number="form.rooms" type="number" min="1" class="inp" /></div>
        </div>
      </div>
      <div class="flex items-center gap-3 mt-3">
        <button @click="search" :disabled="loading" class="btn-brand">{{ loading ? t('Mencari…', 'Searching…') : t('Cari Hotel Partner', 'Search Partner Hotels') }}</button>
        <button @click="nearMe" :disabled="loading" class="btn-ghost btn-sm">📍 {{ t('Di sekitar saya', 'Near me') }}</button>
      </div>
    </div>

    <div v-if="err" class="notice-bad mb-4">{{ err }}</div>
    <div v-if="searched && notConfigured" class="card p-5 text-center text-ink-muted">
      {{ t('Belum ada sumber supplier partner yang aktif. (Aktifkan Channex/Hotelbeds di Back Office.)', 'No partner supplier source is active yet. (Enable Channex/Hotelbeds in Back Office.)') }}
    </div>
    <div v-else-if="searched && !results.length && !loading" class="card p-5 text-center text-ink-muted">
      {{ t('Tidak ada hotel ditemukan untuk pencarian ini.', 'No hotels found for this search.') }}
    </div>

    <!-- Results -->
    <div class="space-y-4">
      <div v-for="h in results" :key="h.supplierHotelCode" class="card p-4">
        <div class="flex items-start justify-between gap-3">
          <div>
            <div class="font-bold text-lg">{{ h.name }}</div>
            <div class="text-ink-muted text-sm">{{ [h.categoryName, h.zoneName, h.destinationName].filter(Boolean).join(' · ') }}</div>
          </div>
          <div class="text-right shrink-0">
            <div class="text-xs text-ink-muted">{{ t('mulai', 'from') }}</div>
            <div class="font-extrabold text-brand">Rp {{ fmt(h.minRateIdr ?? h.minRate) }}</div>
            <div v-if="h.currency !== 'IDR'" class="text-[10px] text-ink-faint">{{ h.currency }} {{ fmt(h.minRate) }}</div>
          </div>
        </div>
        <div class="mt-3 divide-y divide-line border-t border-line">
          <div v-for="(r, i) in h.rooms" :key="i" class="flex items-center justify-between gap-3 py-2.5">
            <div class="min-w-0">
              <div class="font-semibold text-sm truncate">{{ r.name }}</div>
              <div class="text-xs text-ink-muted">{{ r.boardName }} · <span :class="r.refundable ? 'text-green-600' : 'text-ink-faint'">{{ r.refundable ? t('Bisa refund', 'Refundable') : t('Non-refundable', 'Non-refundable') }}</span></div>
            </div>
            <div class="flex items-center gap-3 shrink-0">
              <div class="text-right">
                <div class="font-bold text-sm">Rp {{ fmt(r.netIdr ?? r.net) }}</div>
                <div v-if="h.currency !== 'IDR'" class="text-[10px] text-ink-faint">{{ h.currency }} {{ fmt(r.net) }}</div>
              </div>
              <button @click="pick(h, r)" class="btn-brand btn-sm">{{ t('Pesan', 'Book') }}</button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Guest details modal -->
    <div v-if="sel" class="fixed inset-0 bg-black/50 grid place-items-center z-50 p-4" @click.self="sel = null">
      <div class="card p-5 w-full max-w-md">
        <h2 class="font-bold text-lg mb-1">{{ t('Data Tamu', 'Guest Details') }}</h2>
        <p class="text-ink-muted text-sm mb-3">{{ sel.h.name }} — {{ sel.r.name }} · <b>Rp {{ fmt(sel.r.netIdr ?? sel.r.net) }}</b><span v-if="sel.h.currency !== 'IDR'" class="text-ink-faint"> ({{ sel.h.currency }} {{ fmt(sel.r.net) }})</span></p>
        <div class="grid grid-cols-2 gap-3">
          <div><label class="lbl">{{ t('Nama Depan', 'First name') }}</label><input v-model="holder.name" class="inp" /></div>
          <div><label class="lbl">{{ t('Nama Belakang', 'Surname') }}</label><input v-model="holder.surname" class="inp" /></div>
        </div>
        <div class="mt-2"><label class="lbl">Email</label><input v-model="holder.email" type="email" class="inp" /></div>
        <div class="mt-2"><label class="lbl">{{ t('Telepon', 'Phone') }}</label><input v-model="holder.phone" class="inp" /></div>
        <p v-if="mErr" class="notice-bad mt-3">{{ mErr }}</p>
        <div class="flex gap-2 mt-4">
          <button @click="sel = null" class="btn-ghost flex-1">{{ t('Batal', 'Cancel') }}</button>
          <button @click="reserve" :disabled="booking" class="btn-brand flex-1">{{ booking ? t('Memproses…', 'Processing…') : t('Lanjut Bayar', 'Continue to Pay') }}</button>
        </div>
        <p class="text-[11px] text-ink-faint mt-3">{{ t('Anda membayar ke Miruum. Reservasi dikonfirmasi ke hotel setelah pembayaran berhasil.', 'You pay Miruum. The reservation is confirmed at the hotel after successful payment.') }}</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const { t } = useLang()
const { $api } = useNuxtApp()
const { isLoggedIn } = useAuth()

const today = new Date().toISOString().slice(0, 10)
const form = reactive<any>({ destination: '', checkIn: '', checkOut: '', adults: 2, rooms: 1, lat: null, lng: null })
const loading = ref(false), searched = ref(false), notConfigured = ref(false)
const results = ref<any[]>([]), err = ref('')

const fmt = (n: number) => Number(n || 0).toLocaleString('id-ID')

async function search() {
  err.value = ''
  if (!form.checkIn || !form.checkOut) { err.value = t('Pilih tanggal menginap.', 'Pick your stay dates.'); return }
  loading.value = true; searched.value = true; notConfigured.value = false
  try {
    const body: any = { checkIn: form.checkIn, checkOut: form.checkOut, adults: form.adults, rooms: form.rooms }
    if (form.lat && form.lng) { body.lat = form.lat; body.lng = form.lng }
    else body.destination = form.destination
    const r: any = await $api('/supply/search', { method: 'POST', body })
    notConfigured.value = r.externalConfigured === false
    results.value = r.external || []
  } catch (e: any) { err.value = e?.data?.error || t('Pencarian gagal.', 'Search failed.') }
  finally { loading.value = false }
}
function nearMe() {
  if (!navigator.geolocation) return
  navigator.geolocation.getCurrentPosition((pos) => {
    form.lat = pos.coords.latitude; form.lng = pos.coords.longitude; search()
  })
}

const sel = ref<any>(null)
const holder = reactive({ name: '', surname: '', email: '', phone: '' })
const booking = ref(false), mErr = ref('')
function pick(h: any, r: any) {
  if (!isLoggedIn.value) { navigateTo('/login?next=/partner-hotels'); return }
  sel.value = { h, r }; mErr.value = ''
}
async function reserve() {
  mErr.value = ''
  if (!holder.name || !holder.surname) { mErr.value = t('Isi nama depan & belakang.', 'Enter first & surname.'); return }
  booking.value = true
  try {
    const paxes = Array.from({ length: form.adults }, (_, i) => ({ type: 'AD', name: i === 0 ? holder.name : 'Guest', surname: i === 0 ? holder.surname : String(i + 1) }))
    const r: any = await $api('/supply/book', {
      method: 'POST',
      body: {
        source: sel.value.h.source, rateKey: sel.value.r.rateKey,
        hotelName: sel.value.h.name, supplierHotelCode: sel.value.h.supplierHotelCode, city: sel.value.h.destinationName || '',
        checkIn: form.checkIn, checkOut: form.checkOut, holder: { ...holder }, paxes,
        guests: form.adults, rooms: form.rooms,
      },
    })
    if (r?.booking?.id) await navigateTo(`/payment/${r.booking.id}`)
    else mErr.value = t('Gagal membuat pesanan.', 'Failed to create booking.')
  } catch (e: any) { mErr.value = e?.data?.error || t('Reservasi gagal (rate mungkin kedaluwarsa).', 'Reservation failed (rate may have expired).') }
  finally { booking.value = false }
}

useHead({ title: 'Hotel Partner — Miruum' })
</script>

<style scoped>
.lbl { @apply block text-xs font-semibold text-ink-muted mb-1; }
.inp { @apply w-full border border-line rounded-lg px-3 py-2 text-sm; }
.notice-bad { @apply bg-red-50 text-red-700 text-sm rounded-lg px-3 py-2; }
</style>
