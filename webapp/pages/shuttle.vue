<template>
  <div class="container-site py-8 max-w-3xl">
    <h1 class="text-3xl font-display font-bold mb-1">{{ t('Transfer Bandara', 'Airport Transfer') }}</h1>
    <p class="text-ink-muted mb-6">{{ t('Antar-jemput dari & ke Bandara Soekarno-Hatta — nyaman & tepat waktu.', 'Pick-up and drop-off to and from Soekarno-Hatta Airport — comfortable and on time.') }}</p>

    <div class="card p-6">
      <div class="grid sm:grid-cols-2 gap-3">
        <div>
          <label class="label">{{ t('Arah', 'Direction') }}</label>
          <select v-model="direction" class="input">
            <option value="from">{{ t('Dari Bandara Soekarno-Hatta', 'From Soekarno-Hatta Airport') }}</option>
            <option value="to">{{ t('Menuju Bandara Soekarno-Hatta', 'To Soekarno-Hatta Airport') }}</option>
          </select>
        </div>
        <div>
          <label class="label">{{ direction === 'from' ? t('Tujuan', 'Destination') : t('Titik Jemput', 'Pick-up Point') }}</label>
          <input v-model="place" class="input" :placeholder="t('mis. Hotel FM7, Jl. …', 'e.g. Hotel FM7, Jl. …')" />
        </div>
      </div>

      <label class="label mt-4">{{ t('Pilih Kendaraan', 'Choose a Vehicle') }}</label>
      <div v-if="vehicles.length" class="grid sm:grid-cols-3 gap-3">
        <button v-for="v in vehicles" :key="v.id" @click="sel = v.id" type="button"
          class="border rounded-xl p-4 text-left transition" :class="sel === v.id ? 'border-brand bg-brand-50' : 'border-line hover:border-brand'">
          <div class="font-bold text-[15px]">{{ v.name }}</div>
          <div class="text-[12px] text-ink-muted">{{ t('Maks', 'Max') }} {{ v.capacity }} {{ t('penumpang', 'passengers') }}</div>
          <div class="text-brand-700 font-extrabold mt-1">{{ rupiah(v.minFare || v.baseFare) }}<span class="text-[11px] font-normal text-ink-faint"> {{ t('mulai', 'onwards') }}</span></div>
        </button>
      </div>
      <p v-else class="text-ink-muted text-sm">{{ t('Layanan transfer bandara belum tersedia saat ini.', 'Airport transfer service is not available right now.') }}</p>

      <div v-if="isLoggedIn && vehicles.length" class="mt-5">
        <button @click="request" :disabled="!sel || loading" class="btn-brand w-full">{{ loading ? t('Memproses…', 'Processing…') : t('Pesan Transfer', 'Book Transfer') }}</button>
        <p v-if="err" class="text-red-600 text-[13px] mt-2 text-center">{{ err }}</p>
        <p v-if="doneCode" class="text-leaf-dark text-[14px] mt-2 text-center">{{ t('Transfer dipesan! Kode:', 'Transfer booked! Code:') }} {{ doneCode }}</p>
      </div>
      <NuxtLink v-else-if="vehicles.length" to="/login?redirect=/shuttle" class="btn-brand w-full mt-5">{{ t('Masuk untuk Memesan', 'Sign in to Book') }}</NuxtLink>
    </div>
  </div>
</template>

<script setup lang="ts">
const { t } = useLang()
const { $api } = useNuxtApp()
const { isLoggedIn } = useAuth()
const { data } = await useAsyncData('vehicles', () => $api('/shuttle/vehicle-types').catch(() => ({ vehicleTypes: [] })))
const vehicles = computed<any[]>(() => (data.value as any)?.vehicleTypes || (data.value as any) || [])

// Soekarno-Hatta International Airport
const AIRPORT = { lat: -6.1256, lng: 106.6558, label: 'Bandara Soekarno-Hatta (CGK)' }
const direction = ref('from')
const place = ref('')
const sel = ref<string | null>(null)
const loading = ref(false); const err = ref(''); const doneCode = ref('')

async function request() {
  if (!sel.value) return
  err.value = ''; loading.value = true
  const other = { lat: AIRPORT.lat + 0.05, lng: AIRPORT.lng + 0.05, label: place.value.trim() || t('Lokasi tujuan', 'Destination location') }
  const origin = direction.value === 'from' ? AIRPORT : other
  const dest = direction.value === 'from' ? other : AIRPORT
  try {
    const res: any = await $api('/shuttle/request', { method: 'POST', body: {
      vehicleTypeId: sel.value, originLabel: origin.label, originLat: origin.lat, originLng: origin.lng,
      destLabel: dest.label, destLat: dest.lat, destLng: dest.lng, paymentMethod: 'CASH',
    } })
    doneCode.value = res.ride?.code || 'OK'
  } catch (e: any) { err.value = e?.data?.error || t('Gagal memesan transfer.', 'Failed to book the transfer.') }
  finally { loading.value = false }
}
useHead({ title: () => t('Transfer Bandara · Miruum', 'Airport Transfer · Miruum') })
</script>
