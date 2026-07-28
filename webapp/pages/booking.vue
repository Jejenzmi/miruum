<template>
  <div class="container-site py-6 max-w-5xl">
    <h1 class="text-2xl font-bold mb-5">{{ t('Rincian Pesanan', 'Booking Details') }}</h1>

    <div v-if="!isLoggedIn" class="card p-8 text-center">
      <p class="text-lg font-semibold mb-1">{{ t('Masuk untuk melanjutkan pemesanan', 'Sign in to continue booking') }}</p>
      <p class="text-ink-muted text-sm mb-4">{{ t('Kamu perlu masuk agar pesanan tersimpan di akunmu.', 'You need to sign in so your booking is saved to your account.') }}</p>
      <NuxtLink :to="`/login?redirect=${encodeURIComponent(fullPath)}`" class="btn-brand">{{ t('Masuk / Daftar', 'Sign In / Register') }}</NuxtLink>
    </div>

    <div v-else-if="hotel && room" class="grid lg:grid-cols-[1fr_360px] gap-6">
      <!-- Form -->
      <div class="space-y-5">
        <div class="card p-5">
          <h2 class="font-bold text-lg mb-3">{{ t('Data Pemesan', 'Booker Details') }}</h2>
          <div class="grid sm:grid-cols-2 gap-3">
            <div><label class="label">{{ t('Nama Lengkap', 'Full Name') }}</label><input id="bk-name" v-model="form.bookerName" class="input" :placeholder="t('Sesuai identitas', 'As on your ID')" required /></div>
            <div><label class="label">{{ t('Nomor HP', 'Phone Number') }}</label><input id="bk-phone" v-model="form.bookerPhone" class="input" placeholder="08xxxx" inputmode="tel" required /></div>
            <div class="sm:col-span-2"><label class="label">{{ t('Email', 'Email') }}</label><input id="bk-email" v-model="form.bookerEmail" type="email" class="input" :placeholder="t('email@contoh.com', 'email@example.com')" required /></div>
          </div>
        </div>

        <!-- Pesan untuk siapa (sama seperti aplikasi) -->
        <div class="card p-5">
          <h2 class="font-bold text-lg mb-3">{{ t('Pesanan Ini Untuk', 'This Booking Is For') }}</h2>
          <div class="grid grid-cols-2 gap-2.5">
            <button type="button" @click="form.forSelf = true"
              class="flex items-center justify-center gap-2 py-3 rounded-xl border font-semibold text-[14px]"
              :class="form.forSelf ? 'border-brand bg-brand-50 text-brand-700' : 'border-line text-ink-muted'">
              {{ t('Saya Sendiri', 'Myself') }}
            </button>
            <button type="button" @click="form.forSelf = false"
              class="flex items-center justify-center gap-2 py-3 rounded-xl border font-semibold text-[14px]"
              :class="!form.forSelf ? 'border-brand bg-brand-50 text-brand-700' : 'border-line text-ink-muted'">
              {{ t('Orang Lain', 'Someone Else') }}
            </button>
          </div>

          <div v-if="!form.forSelf" class="mt-4 space-y-3">
            <div v-if="savedGuests.length" class="flex flex-wrap gap-2">
              <button v-for="g in savedGuests" :key="g.id || g.name" type="button" @click="form.guestName = g.name"
                class="pill border"
                :class="form.guestName === g.name ? 'border-brand bg-brand-50 text-brand-700' : 'border-line text-ink-muted'">
                {{ g.name }}
              </button>
            </div>
            <div>
              <label class="label">{{ t('Nama Tamu yang Menginap', "Staying Guest's Name") }}</label>
              <input id="bk-guest" v-model="form.guestName" class="input" :placeholder="t('Sesuai identitas tamu', 'As on the guest ID')" />
            </div>
            <label class="flex items-center gap-2 cursor-pointer text-[13px] text-ink-muted">
              <input type="checkbox" v-model="form.saveGuest" class="accent-brand w-4 h-4" />
              {{ t('Simpan tamu ini untuk pemesanan berikutnya', 'Save this guest for future bookings') }}
            </label>
          </div>
        </div>

        <!-- Nama tamu per kamar (muncul bila > 1 kamar, sama seperti aplikasi) -->
        <div v-if="rooms > 1" class="card p-5">
          <h2 class="font-bold text-lg mb-1">{{ t('Tamu per Kamar', 'Guests per Room') }}</h2>
          <p class="text-[13px] text-ink-muted mb-3">{{ t('Isi nama tamu untuk tiap kamar (opsional).', 'Enter the guest name for each room (optional).') }}</p>
          <div class="space-y-4">
            <div v-for="(rg, i) in form.roomGuests" :key="i" class="border border-line rounded-xl p-3">
              <div class="font-semibold text-[13px] mb-2">{{ t('Kamar', 'Room') }} {{ i + 1 }}</div>
              <input v-model="rg.name" class="input mb-2" :placeholder="t(`Nama tamu kamar ${i + 1}`, `Guest name for room ${i + 1}`)" />
              <input v-model="rg.request" class="input" :placeholder="t('Permintaan khusus (mis. lantai tinggi)', 'Special request (e.g. high floor)')" />
            </div>
          </div>
        </div>

        <!-- Permintaan khusus (sama seperti aplikasi) -->
        <div class="card p-5">
          <h2 class="font-bold text-lg mb-1">{{ t('Permintaan Khusus', 'Special Request') }}</h2>
          <p class="text-[13px] text-ink-muted mb-3">{{ t('Kami teruskan ke hotel (tergantung ketersediaan).', 'We will forward it to the hotel (subject to availability).') }}</p>
          <textarea v-model="form.specialRequest" rows="3" class="input"
            :placeholder="t('mis. kamar lantai tinggi, twin bed, check-in lebih awal', 'e.g. high floor room, twin bed, early check-in')"></textarea>
        </div>

        <div class="card p-5">
          <label class="flex items-center justify-between cursor-pointer">
            <div><div class="font-semibold">{{ t('Bayar di Hotel', 'Pay at Hotel') }}</div><div class="text-[13px] text-ink-muted">{{ t('Reservasi terkonfirmasi, bayar saat check-in.', 'Reservation confirmed, pay at check-in.') }}</div></div>
            <input type="checkbox" v-model="form.payAtHotel" class="accent-brand w-5 h-5" />
          </label>
        </div>

        <div class="card p-5 space-y-3">
          <h2 class="font-bold text-lg">{{ t('Promo & Poin', 'Promo & Points') }}</h2>
          <div>
            <label class="label">{{ t('Kode Promo (opsional)', 'Promo Code (optional)') }}</label>
            <div class="flex gap-2">
              <input v-model="form.promoCode" class="input uppercase flex-1" :placeholder="t('mis. MIRUUM30', 'e.g. MIRUUM30')"
                     @keyup.enter="applyPromo" @input="resetPromo" />
              <button type="button" class="btn-brand btn-sm shrink-0 px-5"
                      :disabled="checkingPromo || !form.promoCode.trim()" @click="applyPromo">
                {{ checkingPromo ? t('Mengecek…', 'Checking…') : (appliedPromo ? t('Terapkan', 'Apply') : t('Cek', 'Check')) }}
              </button>
            </div>
            <p v-if="appliedPromo" class="text-[12.5px] font-semibold text-emerald-600 mt-2">
              ✓ {{ appliedPromo }} {{ t('diterapkan — hemat', 'applied — you save') }} {{ rupiah(discount) }}
            </p>
            <p v-else-if="promoErr" class="text-[12.5px] font-semibold text-red-600 mt-2">{{ promoErr }}</p>
          </div>
          <label v-if="(user?.loyaltyPoints || 0) > 0" class="flex items-center justify-between cursor-pointer pt-1">
            <div><div class="font-semibold">{{ t('Gunakan Poin Miruum', 'Use Miruum Points') }}</div><div class="text-[13px] text-ink-muted">{{ user?.loyaltyPoints }} {{ t('poin tersedia', 'points available') }}</div></div>
            <input type="checkbox" v-model="form.usePoints" class="accent-brand w-5 h-5" />
          </label>
        </div>
      </div>

      <!-- Summary -->
      <aside class="lg:sticky lg:top-20 h-fit">
        <div class="card overflow-hidden">
          <img :src="hotel.imageUrl" class="w-full h-32 object-cover" :alt="hotel.name" />
          <div class="p-5">
            <div class="font-bold">{{ hotel.name }}</div>
            <div class="text-[13px] text-ink-faint mb-3">{{ hotel.city }}</div>
            <div class="text-[14px] space-y-1.5">
              <div class="flex justify-between"><span class="text-ink-muted">{{ t('Kamar', 'Room') }}</span><b>{{ rooms }}× {{ room.name }}</b></div>
              <div class="flex justify-between"><span class="text-ink-muted">{{ t('Check-in', 'Check-in') }}</span><b>{{ fmtDate(checkIn, true) }}</b></div>
              <div class="flex justify-between"><span class="text-ink-muted">{{ t('Check-out', 'Check-out') }}</span><b>{{ fmtDate(checkOut, true) }}</b></div>
              <div class="flex justify-between"><span class="text-ink-muted">{{ t('Durasi', 'Duration') }}</span><b>{{ nights }} {{ t('malam', nights > 1 ? 'nights' : 'night') }} · {{ guests }} {{ t('tamu', guests > 1 ? 'guests' : 'guest') }}</b></div>
            </div>
            <hr class="my-3 border-line" />
            <div class="text-[14px] space-y-1.5">
              <div class="flex justify-between"><span class="text-ink-muted">{{ t('Harga kamar', 'Room price') }}</span><span>{{ rupiah(subtotal) }}</span></div>
              <div class="flex justify-between"><span class="text-ink-muted">{{ t('Pajak & layanan', 'Tax & service') }} ({{ taxPct }}%)</span><span>{{ rupiah(tax) }}</span></div>
              <div v-if="memberDiscount > 0" class="flex justify-between text-emerald-600 font-semibold">
                <span>{{ t('Diskon member & program', 'Member & program discount') }}</span>
                <span>- {{ rupiah(memberDiscount) }}</span>
              </div>
              <div v-if="discount > 0" class="flex justify-between text-emerald-600 font-semibold">
                <span>{{ t('Diskon promo', 'Promo discount') }}{{ appliedPromo ? ` (${appliedPromo})` : '' }}</span>
                <span>- {{ rupiah(discount) }}</span>
              </div>
            </div>
            <hr class="my-3 border-line" />
            <div class="flex justify-between items-center">
              <span class="font-semibold">{{ t('Total', 'Total') }}</span>
              <span class="text-xl font-extrabold text-brand-700">{{ rupiah(total) }}</span>
            </div>
            <!-- Jaminan singkat sebelum tombol pesan -->
            <ul class="mt-4 space-y-1.5 text-[12.5px] text-ink-muted">
              <li class="flex items-center gap-2">
                <svg viewBox="0 0 24 24" class="w-4 h-4 fill-none stroke-leaf-dark shrink-0" stroke-width="2.5"><path d="M20 6 9 17l-5-5" /></svg>
                {{ sc('trustInstant', 'Konfirmasi instan', 'Instant confirmation') }}
              </li>
              <li class="flex items-center gap-2">
                <svg viewBox="0 0 24 24" class="w-4 h-4 fill-none stroke-leaf-dark shrink-0" stroke-width="2.5"><path d="M20 6 9 17l-5-5" /></svg>
                {{ sc('trustSecure', 'Pembayaran aman', 'Secure payment') }}
              </li>
              <li v-if="freeCancellation" class="flex items-center gap-2">
                <svg viewBox="0 0 24 24" class="w-4 h-4 fill-none stroke-leaf-dark shrink-0" stroke-width="2.5"><path d="M20 6 9 17l-5-5" /></svg>
                {{ t('Batal gratis', 'Free cancellation') }}
              </li>
            </ul>
            <button @click="submit" :disabled="loading" class="btn-brand w-full mt-3">
              {{ loading ? t('Memproses…', 'Processing…') : (form.payAtHotel ? t('Konfirmasi Reservasi', 'Confirm Reservation') : t('Pesan Sekarang', 'Book Now')) }}
            </button>
            <p v-if="err" class="text-red-600 text-[13px] mt-2 text-center">{{ err }}</p>
          </div>
        </div>
      </aside>
    </div>

    <div v-else class="card p-12 text-center text-ink-muted">{{ t('Memuat data pesanan…', 'Loading booking details…') }}</div>
  </div>
</template>

<script setup lang="ts">
const route = useRoute()
const { $api } = useNuxtApp()
const { isLoggedIn, user } = useAuth()
const { t } = useLang()
// Baris jaminan dikelola dari Back Office (fallback = teks di template).
const { sc } = await useSiteCopy()
const fullPath = route.fullPath

const hotelId = route.query.hotel as string
const roomId = route.query.room as string
const planId = (route.query.plan as string) || null
const checkIn = (route.query.checkIn as string) || isoDate(new Date())
const checkOut = (route.query.checkOut as string) || isoDate(new Date(Date.now() + 86400000))
const guests = Number(route.query.guests) || 2
const rooms = Number(route.query.rooms) || 1
const nights = nightsBetween(checkIn, checkOut)

const { data } = await useAsyncData(`bk-${hotelId}`, () => $api(`/hotels/${hotelId}`).catch(() => ({ hotel: null })))
const { data: cfg } = await useAsyncData('bk-cfg', () => $api('/app/config').catch(() => ({ taxPct: 11 })))
const hotel = computed<any>(() => (data.value as any)?.hotel || null)
const room = computed<any>(() => (hotel.value?.rooms || []).find((r: any) => r.id === roomId) || null)
const plan = computed<any>(() => (room.value?.ratePlans || []).find((p: any) => p.id === planId) || null)
const taxPct = computed(() => Number((cfg.value as any)?.taxPct || 11))

// "Batal gratis" hanya ditampilkan bila datanya memang begitu: rate plan yang
// dipilih menang atas kebijakan kamar; tanpa data → jangan diklaim.
const freeCancellation = computed(() => {
  if (planId && plan.value) return plan.value.freeCancellation === true
  return room.value?.freeCancellation === true
})

// Authoritative price from the backend — SAME math the booking will charge
// (weekend surcharge per the availability calendar, rate-plan delta, tax). Client
// math (room.price × nights) ignored the weekend surcharge, so the quoted total was
// lower than what got charged. Fall back to client math only if the quote fails.
const quoteQs = computed(() => {
  const p = new URLSearchParams({ roomId, checkIn, checkOut, rooms: String(rooms) })
  if (planId) p.set('ratePlanId', planId)
  return p.toString()
})
const { data: quoteData } = await useAsyncData(`bk-quote-${hotelId}`,
  () => $api(`/bookings/quote?${quoteQs.value}`).catch(() => null))
const unit = computed(() => (room.value ? Number(room.value.price) + Number(plan.value?.priceDelta || 0) : 0))
const subtotal = computed(() => {
  const q = quoteData.value as any
  return q && Number.isFinite(q.roomPrice) ? Number(q.roomPrice) : unit.value * nights * rooms
})
const tax = computed(() => {
  const q = quoteData.value as any
  return q && Number.isFinite(q.taxFee) ? Number(q.taxFee) : Math.round(subtotal.value * taxPct.value / 100)
})
// Member (tier) + program discount already baked into the authoritative quote —
// surface it so the summary reflects what's actually charged, not a higher figure.
const memberDiscount = computed(() => {
  const q = quoteData.value as any
  return q && Number.isFinite(q.discount) ? Number(q.discount) : 0
})

// Promo validation preview (same flow as the app's Rincian Pesanan screen).
const appliedPromo = ref<string | null>(null)
const discount = ref(0)
const checkingPromo = ref(false)
const promoErr = ref('')

const total = computed(() => Math.max(0, subtotal.value + tax.value - memberDiscount.value - discount.value))

const form = reactive({
  bookerName: '', bookerEmail: '', bookerPhone: '',
  payAtHotel: false, promoCode: '', usePoints: false,
  // Parity with the mobile app's Rincian Pesanan step:
  forSelf: true, guestName: '', saveGuest: true, specialRequest: '',
  roomGuests: Array.from({ length: rooms }, () => ({ name: '', request: '' })),
})

// Saved guests (same list the app offers when booking for someone else).
const { data: sgData } = await useAsyncData('bk-saved-guests',
  () => $api('/saved-guests').catch(() => ({ guests: [] })))
const savedGuests = computed<any[]>(() => (sgData.value as any)?.guests || [])
watchEffect(() => {
  if (user.value) {
    form.bookerName ||= user.value.name || ''
    form.bookerEmail ||= user.value.email || ''
    form.bookerPhone ||= user.value.phone || ''
  }
})

function resetPromo() {
  if (appliedPromo.value || promoErr.value) { appliedPromo.value = null; discount.value = 0; promoErr.value = '' }
}

async function applyPromo() {
  const code = form.promoCode.trim().toUpperCase()
  if (!code || checkingPromo.value) return
  checkingPromo.value = true
  promoErr.value = ''
  try {
    const r: any = await $api('/promos/validate', { method: 'POST', body: { code, amount: subtotal.value } })
    discount.value = Number(r?.discount || 0)
    appliedPromo.value = r?.code || code
  } catch (e: any) {
    appliedPromo.value = null
    discount.value = 0
    promoErr.value = e?.data?.error || t('Kode promo tidak valid.', 'Promo code is not valid.')
  } finally {
    checkingPromo.value = false
  }
}

const loading = ref(false)
const err = ref('')
async function submit() {
  err.value = ''
  const focusField = (id: string) => { if (typeof document !== 'undefined') { const el = document.getElementById(id) as HTMLElement | null; if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); try { el.focus() } catch (_) {} } } }
  if (!form.bookerName.trim()) { err.value = t('Isi Nama Lengkap.', 'Enter your full name.'); focusField('bk-name'); return }
  if (!form.bookerEmail.includes('@')) { err.value = t('Isi Email yang valid.', 'Enter a valid email.'); focusField('bk-email'); return }
  if (form.bookerPhone.trim().length < 6) { err.value = t('Isi Nomor HP (min. 6 digit).', 'Enter a phone number (min. 6 digits).'); focusField('bk-phone'); return }
  if (!form.forSelf && !form.guestName.trim()) {
    err.value = t('Isi nama tamu yang menginap.', "Please enter the staying guest's name."); focusField('bk-guest'); return
  }
  loading.value = true
  try {
    const body: any = {
      hotelId, roomId, checkIn: new Date(checkIn).toISOString(), checkOut: new Date(checkOut).toISOString(),
      guests, rooms,
      bookerName: (form.forSelf ? form.bookerName : form.guestName).trim(),
      bookerEmail: form.bookerEmail.trim(),
      bookerPhone: form.bookerPhone.trim(),
      forSelf: form.forSelf,
      specialRequest: form.specialRequest.trim(),
    }
    if (planId) body.ratePlanId = planId
    if (hotel.value?.channelId) body.channelId = hotel.value.channelId
    if (appliedPromo.value) body.promoCode = appliedPromo.value
    if (form.usePoints) body.usePoints = true
    if (form.payAtHotel) body.payAtHotel = true
    if (rooms > 1) {
      body.roomGuests = form.roomGuests.map((g) => ({ name: g.name.trim(), request: g.request.trim() }))
    }
    const res: any = await $api('/bookings', { method: 'POST', body })
    // Remember the guest for next time (fire-and-forget), like the app does.
    if (!form.forSelf && form.saveGuest && form.guestName.trim()) {
      $api('/saved-guests', { method: 'POST', body: { name: form.guestName.trim() } }).catch(() => {})
    }
    const bk = res.booking
    if (form.payAtHotel) await navigateTo(`/account/bookings?ok=${bk.code}`)
    else await navigateTo(`/payment/${bk.id}`)
  } catch (e: any) {
    err.value = e?.data?.error || t('Gagal membuat pesanan. Coba lagi.', 'Failed to create the booking. Please try again.')
  } finally { loading.value = false }
}

useHead(() => ({ title: t('Rincian Pesanan · Miruum', 'Booking Details · Miruum') }))
</script>
