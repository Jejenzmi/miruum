<template>
  <div class="container-site py-6 max-w-3xl">
    <NuxtLink to="/account/bookings" class="text-brand-600 text-sm font-semibold">← Pesanan Saya</NuxtLink>
    <div v-if="b" class="mt-3">
      <div class="card p-5">
        <div class="flex items-center justify-between">
          <span class="pill" :class="statusClass(b.status)">{{ statusLabel(b.status) }}</span>
          <span class="font-mono text-[13px] text-ink-faint">{{ b.code }}</span>
        </div>
        <h1 class="text-2xl font-bold mt-2">{{ b.hotel?.name || b.packageTitle }}</h1>
        <div class="text-[14px] text-ink-muted mt-3 space-y-1.5">
          <div class="flex justify-between"><span>Kamar</span><b class="text-ink">{{ b.rooms }}× {{ b.room?.name || '-' }}</b></div>
          <div class="flex justify-between"><span>Check-in</span><b class="text-ink">{{ fmtDate(b.checkIn, true) }}</b></div>
          <div class="flex justify-between"><span>Check-out</span><b class="text-ink">{{ fmtDate(b.checkOut, true) }}</b></div>
          <div class="flex justify-between"><span>Tamu</span><b class="text-ink">{{ b.guests }} · {{ b.nights }} malam</b></div>
          <div class="flex justify-between"><span>Total</span><b class="text-brand-700">{{ rupiah(b.totalPrice) }}</b></div>
        </div>
        <div class="flex flex-wrap gap-2 mt-4">
          <a v-if="isPaid" :href="`/api/vouchers/${b.code}`" target="_blank" class="btn-ghost btn-sm">E-Voucher</a>
          <a v-if="isPaid" :href="`/api/invoices/${b.code}`" target="_blank" class="btn-ghost btn-sm">Invoice</a>
          <NuxtLink v-if="b.status==='PENDING'" :to="`/payment/${b.id}`" class="btn-brand btn-sm">Bayar Sekarang</NuxtLink>
        </div>
      </div>

      <!-- Digital check-in -->
      <div v-if="isPaid && !b.onlineCheckedIn" class="card p-5 mt-4">
        <h2 class="font-bold text-lg mb-1">Check-in Online</h2>
        <p class="text-[13px] text-ink-muted mb-3">Lakukan check-in lebih awal & dapatkan kode akses kamar.</p>
        <button @click="doCheckin" :disabled="busy==='ci'" class="btn-brand btn-sm">{{ busy==='ci' ? '…' : 'Check-in Online' }}</button>
      </div>
      <div v-else-if="b.onlineCheckedIn && (b.keyCode || keyCode)" class="card p-5 mt-4 text-center bg-leaf-soft border-leaf/30">
        <div class="text-[13px] text-leaf-dark">Kode Akses Kamar</div>
        <div class="text-3xl font-mono font-bold text-leaf-dark my-1">{{ b.keyCode || keyCode }}</div>
        <div class="text-[12px] text-ink-muted">Tunjukkan saat check-in di resepsionis.</div>
      </div>

      <!-- Reschedule (PENDING only) -->
      <div v-if="b.status==='PENDING'" class="card p-5 mt-4">
        <h2 class="font-bold text-lg mb-2">Ubah Tanggal</h2>
        <div class="flex items-end gap-2 flex-wrap">
          <div><label class="label">Check-in</label><input v-model="rs.ci" type="date" :min="todayStr" class="input !py-2 !text-sm" /></div>
          <div><label class="label">Check-out</label><input v-model="rs.co" type="date" :min="rs.ci" class="input !py-2 !text-sm" /></div>
          <button @click="quoteRe" class="btn-ghost btn-sm">Cek Selisih</button>
          <button v-if="rs.quote?.allowed" @click="applyRe" :disabled="busy==='rs'" class="btn-brand btn-sm">Terapkan</button>
        </div>
        <p v-if="rs.quote" class="text-[13px] mt-2" :class="rs.quote.allowed ? 'text-ink-muted' : 'text-red-600'">
          <template v-if="rs.quote.allowed">Total baru {{ rupiah(rs.quote.newTotal) }} · selisih {{ rupiah(rs.quote.diff) }}</template>
          <template v-else>{{ rs.quote.reason || 'Tidak bisa reschedule.' }}</template>
        </p>
      </div>

      <!-- Cancel / refund -->
      <div v-if="canCancel" class="card p-5 mt-4">
        <h2 class="font-bold text-lg mb-2">Batalkan Pesanan</h2>
        <button @click="quoteRefund" class="btn-ghost btn-sm">Cek Estimasi Refund</button>
        <div v-if="refund" class="mt-3 text-[14px]">
          <p class="text-ink-muted">{{ refund.note }}</p>
          <div v-if="refund.cancellable" class="mt-2">
            <div v-if="refund.refundAmount > 0" class="grid sm:grid-cols-3 gap-2 mb-2">
              <input v-model="bank.bankName" class="input !py-2 !text-sm" placeholder="Bank" />
              <input v-model="bank.bankAccount" class="input !py-2 !text-sm" placeholder="No. Rekening" />
              <input v-model="bank.accountHolder" class="input !py-2 !text-sm" placeholder="Atas Nama" />
            </div>
            <button @click="doCancel" :disabled="busy==='cx'" class="btn-brand btn-sm !bg-red-600 hover:!bg-red-700">
              {{ busy==='cx' ? '…' : (refund.refundAmount > 0 ? `Batalkan & Refund ${rupiah(refund.refundAmount)}` : 'Batalkan Pesanan') }}
            </button>
          </div>
        </div>
      </div>

      <!-- Write review (after checkout) -->
      <div v-if="isPaid && past" class="card p-5 mt-4">
        <h2 class="font-bold text-lg mb-2">Beri Ulasan</h2>
        <div class="flex items-center gap-1 mb-2">
          <button v-for="n in 10" :key="n" @click="rev.rating = n" class="w-6 h-6 rounded" :class="n <= rev.rating ? 'bg-leaf text-white' : 'bg-line text-ink-faint'">{{ n }}</button>
        </div>
        <textarea v-model="rev.body" rows="3" class="input" placeholder="Bagaimana pengalaman menginapmu?"></textarea>
        <button @click="submitReview" :disabled="busy==='rv'" class="btn-brand btn-sm mt-2">{{ busy==='rv' ? '…' : (rev.done ? 'Terkirim ✓' : 'Kirim Ulasan') }}</button>
      </div>
    </div>
    <div v-else class="card p-12 text-center text-ink-muted mt-4">Pesanan tidak ditemukan.</div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ middleware: 'auth' })
const route = useRoute()
const { $api } = useNuxtApp()
const id = route.params.id as string
const todayStr = isoDate(new Date())

const { data, refresh } = await useAsyncData(`bk-detail-${id}`, () => $api(`/bookings/${id}`).catch(() => ({ booking: null })))
const b = computed<any>(() => (data.value as any)?.booking || null)
const isPaid = computed(() => b.value && ['PAID', 'COMPLETED'].includes(b.value.status))
const past = computed(() => b.value && new Date(b.value.checkOut) < new Date())
const canCancel = computed(() => b.value && ['PAID', 'PENDING'].includes(b.value.status) && !past.value)

const busy = ref('')
const keyCode = ref('')
async function doCheckin() { busy.value = 'ci'; try { const r: any = await $api(`/bookings/${id}/digital-checkin`, { method: 'POST', body: {} }); keyCode.value = r.keyCode || ''; await refresh() } catch {} finally { busy.value = '' } }

const rs = reactive<any>({ ci: '', co: '', quote: null })
async function quoteRe() {
  if (!rs.ci || !rs.co) return
  try { rs.quote = await $api(`/bookings/${id}/reschedule-quote`, { query: { checkIn: rs.ci, checkOut: rs.co } }) } catch (e: any) { rs.quote = { allowed: false, reason: e?.data?.error } }
}
async function applyRe() { busy.value = 'rs'; try { await $api(`/bookings/${id}/reschedule`, { method: 'POST', body: { checkIn: rs.ci, checkOut: rs.co } }); rs.quote = null; await refresh() } catch {} finally { busy.value = '' } }

const refund = ref<any>(null)
const bank = reactive({ bankName: '', bankAccount: '', accountHolder: '' })
async function quoteRefund() { try { refund.value = await $api(`/bookings/${id}/refund-quote`) } catch (e: any) { refund.value = { cancellable: false, note: e?.data?.error } } }
async function doCancel() {
  busy.value = 'cx'
  try { await $api(`/bookings/${id}/cancel`, { method: 'POST', body: refund.value?.refundAmount > 0 ? { ...bank } : {} }); refund.value = null; await refresh() } catch {} finally { busy.value = '' }
}

const rev = reactive({ rating: 9, body: '', done: false })
async function submitReview() {
  busy.value = 'rv'
  try { await $api(`/hotels/${b.value.hotel?.id || b.value.hotelId}/reviews`, { method: 'POST', body: { rating: rev.rating, body: rev.body.trim() } }); rev.done = true } catch {} finally { busy.value = '' }
}

const statusLabel = (s: string) => ({ PENDING: 'Menunggu Bayar', PAID: 'Terbayar', COMPLETED: 'Selesai', CANCELLED: 'Dibatalkan', REFUNDED: 'Refund' } as any)[s] || s
const statusClass = (s: string) => ({ PENDING: 'bg-brand-50 text-brand-700', PAID: 'bg-leaf-soft text-leaf-dark', COMPLETED: 'bg-blue-50 text-blue-600', CANCELLED: 'bg-red-50 text-red-600', REFUNDED: 'bg-paper text-ink-muted' } as any)[s] || 'bg-paper text-ink-muted'
useHead({ title: 'Detail Pesanan · Miruum' })
</script>
