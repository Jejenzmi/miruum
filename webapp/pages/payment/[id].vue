<template>
  <div class="container-site py-6 max-w-3xl">
    <h1 class="text-2xl font-bold mb-1">{{ t('Pembayaran', 'Payment') }}</h1>
    <p v-if="booking" class="text-ink-muted text-sm mb-5">{{ t('Pesanan', 'Booking') }} <b>{{ booking.code }}</b> · {{ t('Total', 'Total') }} <b class="text-brand-700">{{ rupiah(booking.totalPrice) }}</b></p>

    <div v-if="booking && (booking.status==='PAID' || booking.status==='COMPLETED')" class="card p-8 text-center">
      <div class="w-14 h-14 rounded-full bg-leaf-soft text-leaf-dark grid place-items-center mx-auto mb-3">
        <svg viewBox="0 0 24 24" class="w-7 h-7 fill-none stroke-current" stroke-width="2.5"><path d="M20 6 9 17l-5-5"/></svg>
      </div>
      <h2 class="text-xl font-bold">{{ t('Pembayaran Berhasil', 'Payment Successful') }}</h2>
      <p class="text-ink-muted text-sm mt-1 mb-4">{{ t('Pesananmu dikonfirmasi. E-voucher tersedia di Pesanan Saya.', 'Your booking is confirmed. The e-voucher is available in My Bookings.') }}</p>
      <NuxtLink :to="`/account/bookings?ok=${booking.code}`" class="btn-brand">{{ t('Lihat Pesanan', 'View Booking') }}</NuxtLink>
    </div>

    <template v-else-if="booking">
      <!-- Choose method -->
      <div v-if="!payment" class="space-y-5">
        <!-- Catatan keamanan pembayaran, tepat di atas pemilih metode -->
        <div class="flex items-start gap-3 rounded-xl border border-line bg-paper px-4 py-3">
          <span class="w-8 h-8 rounded-full bg-leaf-soft text-leaf-dark grid place-items-center shrink-0">
            <svg viewBox="0 0 24 24" class="w-4 h-4 fill-none stroke-current" stroke-width="2">
              <rect x="4" y="10.5" width="16" height="10" rx="2" /><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" />
            </svg>
          </span>
          <p class="text-[13px] text-ink-muted leading-relaxed">
            {{ sc('paySecureNote', 'Pembayaran diproses dengan aman. Data kartu/rekening tidak kami simpan.', 'Payments are processed securely. We do not store your card or bank account details.') }}
          </p>
        </div>

        <div v-for="grp in methods" :key="grp.group" class="card p-5">
          <h3 class="font-bold mb-3">{{ grp.group }}</h3>
          <div class="grid sm:grid-cols-2 gap-2">
            <button v-for="m in grp.items" :key="m.code" @click="pay(m.code)" :disabled="paying"
                    class="flex items-center justify-between border border-line rounded-xl px-4 py-3 text-left hover:border-brand hover:bg-brand-50 transition">
              <span class="font-semibold text-[14px]">{{ m.name }}</span>
              <svg viewBox="0 0 24 24" class="w-4 h-4 fill-none stroke-ink-faint" stroke-width="2"><path d="m9 18 6-6-6-6"/></svg>
            </button>
          </div>
        </div>
        <p v-if="err" class="text-red-600 text-sm text-center">{{ err }}</p>
      </div>

      <!-- Instructions -->
      <div v-else class="card p-6">
        <div class="text-center mb-4">
          <div class="text-sm text-ink-muted">{{ payment.methodLabel }}</div>
          <div class="text-2xl font-extrabold text-brand-700 mt-1">{{ rupiah(payment.amount) }}</div>
        </div>

        <div v-if="payment.vaNumber" class="bg-paper rounded-xl p-4 text-center">
          <div class="text-[13px] text-ink-muted">{{ t('Nomor Virtual Account', 'Virtual Account Number') }}</div>
          <div class="text-2xl font-mono font-bold tracking-wide my-1">{{ payment.vaNumber }}</div>
          <button @click="copy(payment.vaNumber)" class="btn-ghost btn-sm">{{ copied ? t('Tersalin ✓', 'Copied ✓') : t('Salin Nomor', 'Copy Number') }}</button>
        </div>
        <div v-else-if="payment.qrString" class="text-center">
          <img :src="qrImg(payment.qrString)" alt="QRIS" class="mx-auto w-52 h-52 rounded-xl border border-line" />
          <p class="text-[13px] text-ink-muted mt-2">{{ t('Pindai dengan aplikasi e-wallet / m-banking (QRIS).', 'Scan with your e-wallet / m-banking app (QRIS).') }}</p>
        </div>
        <div v-else-if="payment.payUrl" class="text-center">
          <a :href="payment.payUrl" target="_blank" class="btn-brand">{{ t('Buka Aplikasi Pembayaran', 'Open Payment App') }}</a>
        </div>

        <!-- Hitung mundur kedaluwarsa (sama seperti aplikasi) -->
        <div v-if="payment.expiresAt" class="mt-4 rounded-xl bg-brand-50 text-brand-700 py-3 text-center">
          <div class="text-[12px] font-semibold">{{ t('Selesaikan pembayaran dalam', 'Complete payment within') }}</div>
          <div class="text-2xl font-extrabold font-mono tracking-wider">{{ countdown }}</div>
        </div>
        <p class="text-center text-[13px] text-ink-faint mt-4">{{ t('Selesaikan pembayaran sebelum kedaluwarsa. Status diperbarui otomatis.', 'Complete the payment before it expires. The status updates automatically.') }}</p>

        <!-- Penenang: konfirmasi instan + pembayaran aman -->
        <div class="mt-3 flex flex-wrap items-center justify-center gap-x-5 gap-y-1.5 text-[12.5px] text-ink-muted">
          <span class="inline-flex items-center gap-1.5">
            <svg viewBox="0 0 24 24" class="w-4 h-4 fill-none stroke-leaf-dark" stroke-width="2.5"><path d="M20 6 9 17l-5-5" /></svg>
            {{ sc('payInstantNote', 'Konfirmasi instan setelah pembayaran terverifikasi.', 'Instant confirmation once your payment is verified.') }}
          </span>
          <span class="inline-flex items-center gap-1.5">
            <svg viewBox="0 0 24 24" class="w-4 h-4 fill-none stroke-leaf-dark" stroke-width="2">
              <rect x="4" y="10.5" width="16" height="10" rx="2" /><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" />
            </svg>
            {{ sc('trustSecure', 'Pembayaran aman & terenkripsi', 'Secure encrypted payment') }}
          </span>
        </div>

        <div class="mt-5 border-t border-line pt-4 text-center">
          <p class="text-[13px] text-ink-muted mb-2">{{ t('Mode demo — simulasikan pembayaran berhasil:', 'Demo mode — simulate a successful payment:') }}</p>
          <button @click="settle" :disabled="settling" class="btn-brand">{{ settling ? t('Memproses…', 'Processing…') : t('Saya Sudah Bayar (Simulasi)', "I've Paid (Simulation)") }}</button>
        </div>
      </div>
    </template>

    <div v-else class="card p-12 text-center text-ink-muted">{{ t('Pesanan tidak ditemukan.', 'Booking not found.') }}</div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ middleware: 'auth' })
const route = useRoute()
const { $api } = useNuxtApp()
const { t } = useLang()
// Catatan keamanan & konfirmasi instan dikelola dari Back Office.
const { sc } = await useSiteCopy()
const id = route.params.id as string

const { data: bkData, refresh } = await useAsyncData(`pay-${id}`, () => $api(`/bookings/${id}`).catch(() => ({ booking: null })))
const { data: mData } = await useAsyncData('pay-methods', () => $api('/payment-methods').catch(() => ({ methods: [] })))
const booking = computed<any>(() => (bkData.value as any)?.booking || null)
const methods = computed<any[]>(() => (mData.value as any)?.methods || [])

const payment = ref<any>(null)
const paying = ref(false)
const settling = ref(false)

// Expiry countdown, mirroring the app's payment-instruction screen.
const now = ref(Date.now())
let ticker: any = null
onMounted(() => { ticker = setInterval(() => (now.value = Date.now()), 1000) })
onBeforeUnmount(() => { if (ticker) clearInterval(ticker) })
const countdown = computed(() => {
  const exp = payment.value?.expiresAt ? new Date(payment.value.expiresAt).getTime() : 0
  if (!exp) return ''
  const ms = Math.max(0, exp - now.value)
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  const s = Math.floor((ms % 60000) / 1000)
  const p = (n: number) => n.toString().padStart(2, '0')
  return h > 0 ? `${p(h)}:${p(m)}:${p(s)}` : `${p(m)}:${p(s)}`
})
const err = ref('')
const copied = ref(false)

async function pay(method: string) {
  paying.value = true; err.value = ''
  try {
    const res: any = await $api(`/bookings/${id}/pay`, { method: 'POST', body: { method } })
    payment.value = res.payment
    startPolling()
  } catch (e: any) { err.value = e?.data?.error || t('Gagal membuat pembayaran.', 'Failed to create the payment.') }
  finally { paying.value = false }
}

let poll: any = null
function startPolling() {
  stopPolling()
  poll = setInterval(async () => {
    try {
      const res: any = await $api(`/payments/${payment.value.id}`)
      if (res.payment?.status === 'PAID') { stopPolling(); await done() }
    } catch {}
  }, 4000)
}
function stopPolling() { if (poll) { clearInterval(poll); poll = null } }

async function settle() {
  settling.value = true
  try { await $api(`/payments/${payment.value.id}/settle`, { method: 'POST', body: {} }); await done() }
  catch (e: any) { err.value = e?.data?.error || t('Gagal.', 'Failed.') }
  finally { settling.value = false }
}
async function done() { stopPolling(); await refresh() }
onBeforeUnmount(stopPolling)

function copy(v: string) { navigator.clipboard?.writeText(v); copied.value = true; setTimeout(() => copied.value = false, 1500) }
const qrImg = (s: string) => `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(s)}`

useHead(() => ({ title: t('Pembayaran · Miruum', 'Payment · Miruum') }))
</script>
