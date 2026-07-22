<template>
  <div v-if="tour" class="container-site py-6 max-w-5xl">
    <div class="grid lg:grid-cols-[1fr_360px] gap-8">
      <div>
        <div class="rounded-xl2 overflow-hidden aspect-video bg-line mb-5"><img :src="tour.imageUrl" :alt="tour.title" class="w-full h-full object-cover" /></div>
        <span class="pill bg-brand-50 text-brand-700">{{ tour.category }}</span>
        <h1 class="text-2xl font-bold mt-2">{{ tour.title }}</h1>
        <p class="text-ink-muted text-sm mt-1">{{ tour.city }} · {{ tour.durationHours }} {{ t('jam', 'hours') }}</p>
        <div class="card p-5 mt-4">
          <h2 class="font-bold text-lg mb-2">{{ t('Deskripsi', 'Description') }}</h2>
          <p class="text-[15px] text-ink-muted leading-relaxed whitespace-pre-line">{{ tour.description }}</p>
        </div>
        <div v-if="tour.highlights?.length" class="card p-5 mt-4">
          <h2 class="font-bold text-lg mb-2">{{ t('Highlight', 'Highlights') }}</h2>
          <ul class="space-y-1.5"><li v-for="(h,i) in tour.highlights" :key="i" class="flex gap-2 text-[15px] text-ink-muted"><span class="text-brand">★</span>{{ h }}</li></ul>
        </div>
        <div v-if="tour.included?.length" class="card p-5 mt-4">
          <h2 class="font-bold text-lg mb-2">{{ t('Termasuk', 'What’s Included') }}</h2>
          <ul class="space-y-1.5"><li v-for="(inc,i) in tour.included" :key="i" class="flex gap-2 text-[15px] text-ink-muted"><span class="text-leaf-dark">✓</span>{{ inc }}</li></ul>
        </div>
      </div>

      <aside class="lg:sticky lg:top-20 h-fit">
        <div class="card p-5">
          <div class="text-3xl font-extrabold text-brand-700">{{ rupiah(tour.price) }}<span class="text-sm font-normal text-ink-faint">{{ t('/orang', '/person') }}</span></div>
          <div v-if="isLoggedIn && !doneCode" class="mt-4 space-y-3">
            <div><label class="label">{{ t('Tanggal', 'Date') }}</label><input v-model="date" type="date" :min="todayStr" class="input" /></div>
            <div><label class="label">{{ t('Jumlah Peserta', 'Number of Participants') }}</label><input v-model.number="pax" type="number" min="1" :max="tour.maxPax || 20" class="input" /></div>
            <div><label class="label">{{ t('Nama', 'Name') }}</label><input v-model="f.name" class="input" /></div>
            <div><label class="label">{{ t('Nomor HP', 'Phone Number') }}</label><input v-model="f.phone" class="input" /></div>
            <div><label class="label">{{ t('Metode Bayar', 'Payment Method') }}</label><select v-model="f.method" class="input"><option value="QRIS">QRIS</option><option value="VA_BCA">BCA VA</option><option value="EWALLET_GOPAY">GoPay</option></select></div>
            <div class="flex justify-between font-bold pt-1"><span>{{ t('Total', 'Total') }}</span><span class="text-brand-700">{{ rupiah(tour.price * pax) }}</span></div>
            <button @click="book" :disabled="loading" class="btn-brand w-full">{{ loading ? t('Memproses…', 'Processing…') : t('Pesan Tour', 'Book Tour') }}</button>
            <p v-if="err" class="text-red-600 text-[13px] text-center">{{ err }}</p>
          </div>
          <div v-else-if="doneCode" class="mt-4 text-center">
            <div class="w-12 h-12 rounded-full bg-leaf-soft text-leaf-dark grid place-items-center mx-auto mb-2"><svg viewBox="0 0 24 24" class="w-6 h-6 fill-none stroke-current" stroke-width="2.5"><path d="M20 6 9 17l-5-5"/></svg></div>
            <div class="font-bold">{{ t('Tour dipesan!', 'Tour booked!') }}</div>
            <div class="text-[13px] text-ink-muted">{{ t('Kode', 'Code') }}: {{ doneCode }}</div>
          </div>
          <NuxtLink v-else :to="`/login?redirect=/tours/${tour.id}`" class="btn-brand w-full mt-4">{{ t('Masuk untuk Memesan', 'Sign in to Book') }}</NuxtLink>
        </div>
      </aside>
    </div>
  </div>
  <div v-else class="container-site py-24 text-center text-ink-muted">{{ t('Tour tidak ditemukan.', 'Tour not found.') }}</div>
</template>

<script setup lang="ts">
const { t } = useLang()
const route = useRoute()
const { $api } = useNuxtApp()
const { isLoggedIn, user } = useAuth()
const id = route.params.id as string
const todayStr = isoDate(new Date())

const { data } = await useAsyncData(`tour-${id}`, () => $api(`/tours/${id}`).catch(() => ({ tour: null })))
const tour = computed<any>(() => (data.value as any)?.tour || (data.value as any) || null)

const date = ref(isoDate(new Date(Date.now() + 86400000)))
const pax = ref(2)
const f = reactive({ name: '', phone: '', method: 'QRIS' })
watchEffect(() => { if (user.value) { f.name ||= user.value.name; f.phone ||= user.value.phone || '' } })
const loading = ref(false); const err = ref(''); const doneCode = ref('')

async function book() {
  err.value = ''
  if (!f.name.trim() || f.phone.trim().length < 6) { err.value = t('Lengkapi nama & nomor HP.', 'Please fill in your name and phone number.'); return }
  loading.value = true
  try {
    const res: any = await $api(`/tours/${id}/book`, { method: 'POST', body: { date: date.value, pax: pax.value, bookerName: f.name.trim(), bookerPhone: f.phone.trim(), paymentMethod: f.method } })
    doneCode.value = res.booking?.code || 'OK'
  } catch (e: any) { err.value = e?.data?.error || t('Gagal memesan tour.', 'Failed to book the tour.') }
  finally { loading.value = false }
}
useHead(() => ({ title: tour.value ? `${tour.value.title} · Miruum` : t('Tour · Miruum', 'Tour · Miruum') }))
</script>
