<template>
  <div class="container-site py-6 max-w-3xl">
    <h1 class="text-2xl font-bold mb-1">Pembayaran</h1>
    <p v-if="booking" class="text-ink-muted text-sm mb-5">Pesanan <b>{{ booking.code }}</b> · Total <b class="text-brand-700">{{ rupiah(booking.totalPrice) }}</b></p>

    <div v-if="booking && (booking.status==='PAID' || booking.status==='COMPLETED')" class="card p-8 text-center">
      <div class="w-14 h-14 rounded-full bg-leaf-soft text-leaf-dark grid place-items-center mx-auto mb-3">
        <svg viewBox="0 0 24 24" class="w-7 h-7 fill-none stroke-current" stroke-width="2.5"><path d="M20 6 9 17l-5-5"/></svg>
      </div>
      <h2 class="text-xl font-bold">Pembayaran Berhasil</h2>
      <p class="text-ink-muted text-sm mt-1 mb-4">Pesananmu dikonfirmasi. E-voucher tersedia di Pesanan Saya.</p>
      <NuxtLink :to="`/account/bookings?ok=${booking.code}`" class="btn-brand">Lihat Pesanan</NuxtLink>
    </div>

    <template v-else-if="booking">
      <!-- Choose method -->
      <div v-if="!payment" class="space-y-5">
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
          <div class="text-[13px] text-ink-muted">Nomor Virtual Account</div>
          <div class="text-2xl font-mono font-bold tracking-wide my-1">{{ payment.vaNumber }}</div>
          <button @click="copy(payment.vaNumber)" class="btn-ghost btn-sm">{{ copied ? 'Tersalin ✓' : 'Salin Nomor' }}</button>
        </div>
        <div v-else-if="payment.qrString" class="text-center">
          <img :src="qrImg(payment.qrString)" alt="QRIS" class="mx-auto w-52 h-52 rounded-xl border border-line" />
          <p class="text-[13px] text-ink-muted mt-2">Pindai dengan aplikasi e-wallet / m-banking (QRIS).</p>
        </div>
        <div v-else-if="payment.payUrl" class="text-center">
          <a :href="payment.payUrl" target="_blank" class="btn-brand">Buka Aplikasi Pembayaran</a>
        </div>

        <p class="text-center text-[13px] text-ink-faint mt-4">Selesaikan pembayaran sebelum kedaluwarsa. Status diperbarui otomatis.</p>

        <div class="mt-5 border-t border-line pt-4 text-center">
          <p class="text-[13px] text-ink-muted mb-2">Mode demo — simulasikan pembayaran berhasil:</p>
          <button @click="settle" :disabled="settling" class="btn-brand">{{ settling ? 'Memproses…' : 'Saya Sudah Bayar (Simulasi)' }}</button>
        </div>
      </div>
    </template>

    <div v-else class="card p-12 text-center text-ink-muted">Pesanan tidak ditemukan.</div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ middleware: 'auth' })
const route = useRoute()
const { $api } = useNuxtApp()
const id = route.params.id as string

const { data: bkData, refresh } = await useAsyncData(`pay-${id}`, () => $api(`/bookings/${id}`).catch(() => ({ booking: null })))
const { data: mData } = await useAsyncData('pay-methods', () => $api('/payment-methods').catch(() => ({ methods: [] })))
const booking = computed<any>(() => (bkData.value as any)?.booking || null)
const methods = computed<any[]>(() => (mData.value as any)?.methods || [])

const payment = ref<any>(null)
const paying = ref(false)
const settling = ref(false)
const err = ref('')
const copied = ref(false)

async function pay(method: string) {
  paying.value = true; err.value = ''
  try {
    const res: any = await $api(`/bookings/${id}/pay`, { method: 'POST', body: { method } })
    payment.value = res.payment
    startPolling()
  } catch (e: any) { err.value = e?.data?.error || 'Gagal membuat pembayaran.' }
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
  catch (e: any) { err.value = e?.data?.error || 'Gagal.' }
  finally { settling.value = false }
}
async function done() { stopPolling(); await refresh() }
onBeforeUnmount(stopPolling)

function copy(t: string) { navigator.clipboard?.writeText(t); copied.value = true; setTimeout(() => copied.value = false, 1500) }
const qrImg = (s: string) => `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(s)}`

useHead({ title: 'Pembayaran · Miruum' })
</script>
