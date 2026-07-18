<template>
  <div v-if="pkg" class="container-site py-6 max-w-5xl">
    <div class="grid lg:grid-cols-[1fr_360px] gap-8">
      <div>
        <div class="rounded-xl2 overflow-hidden aspect-video bg-line mb-5">
          <img :src="pkg.imageUrl" :alt="pkg.title" class="w-full h-full object-cover" />
        </div>
        <div class="flex items-center gap-2 mb-2">
          <StarRating :value="pkg.starRating" />
          <RatingBadge :rating="pkg.rating" :count="pkg.reviewCount" />
        </div>
        <h1 class="text-2xl font-bold">{{ pkg.title }}</h1>
        <p class="text-ink-muted text-sm mt-1">{{ pkg.city }} · {{ pkg.nights }} malam / {{ pkg.days }} hari · {{ pkg.guests }} tamu · {{ boardBasis }}</p>

        <div v-if="pkg.inclusions?.length" class="card p-5 mt-5">
          <h2 class="font-bold text-lg mb-3">Termasuk dalam Paket</h2>
          <ul class="space-y-2">
            <li v-for="(inc,i) in pkg.inclusions" :key="i" class="flex items-start gap-2 text-[15px] text-ink-muted">
              <svg viewBox="0 0 24 24" class="w-5 h-5 fill-none stroke-leaf-dark shrink-0 mt-0.5" stroke-width="2"><path d="M20 6 9 17l-5-5"/></svg>
              {{ inc }}
            </li>
          </ul>
        </div>
      </div>

      <aside class="lg:sticky lg:top-20 h-fit">
        <div class="card p-5">
          <div v-if="pkg.originalPrice > pkg.price" class="text-[13px] text-ink-faint line-through">{{ rupiah(pkg.originalPrice) }}</div>
          <div class="text-3xl font-extrabold text-brand-700">{{ rupiah(pkg.price) }}<span class="text-sm font-normal text-ink-faint">/paket</span></div>

          <div v-if="isLoggedIn" class="mt-4 space-y-3">
            <div><label class="label">Tanggal Mulai</label><input v-model="checkIn" type="date" :min="todayStr" class="input" /></div>
            <div><label class="label">Nama Pemesan</label><input v-model="f.name" class="input" /></div>
            <div><label class="label">Nomor HP</label><input v-model="f.phone" class="input" /></div>
            <div><label class="label">Email</label><input v-model="f.email" type="email" class="input" /></div>
            <button @click="book" :disabled="loading" class="btn-brand w-full">{{ loading ? 'Memproses…' : 'Pesan Paket' }}</button>
            <p v-if="err" class="text-red-600 text-[13px] text-center">{{ err }}</p>
          </div>
          <NuxtLink v-else :to="`/login?redirect=/packages/${pkg.id}`" class="btn-brand w-full mt-4">Masuk untuk Memesan</NuxtLink>
        </div>
      </aside>
    </div>
  </div>
  <div v-else class="container-site py-24 text-center text-ink-muted">Paket tidak ditemukan.</div>
</template>

<script setup lang="ts">
const route = useRoute()
const { $api } = useNuxtApp()
const { isLoggedIn, user } = useAuth()
const id = route.params.id as string
const todayStr = isoDate(new Date())

const { data } = await useAsyncData(`pkg-${id}`, () => $api(`/packages/${id}`).catch(() => ({ package: null })))
const pkg = computed<any>(() => (data.value as any)?.package || (data.value as any) || null)
const boardBasis = computed(() => BOARD_BASIS[pkg.value?.boardBasis] || 'Termasuk Sarapan')

const checkIn = ref(isoDate(new Date(Date.now() + 86400000)))
const f = reactive({ name: '', email: '', phone: '' })
watchEffect(() => { if (user.value) { f.name ||= user.value.name; f.email ||= user.value.email; f.phone ||= user.value.phone || '' } })

const loading = ref(false); const err = ref('')
async function book() {
  err.value = ''
  if (!f.name.trim() || !f.email.includes('@') || f.phone.trim().length < 6) { err.value = 'Lengkapi data pemesan.'; return }
  loading.value = true
  try {
    const res: any = await $api('/bookings', { method: 'POST', body: {
      packageId: id, checkIn: new Date(checkIn.value).toISOString(),
      guests: pkg.value.guests || 2, rooms: 1, forSelf: true,
      bookerName: f.name.trim(), bookerEmail: f.email.trim(), bookerPhone: f.phone.trim(),
    } })
    await navigateTo(`/payment/${res.booking.id}`)
  } catch (e: any) { err.value = e?.data?.error || 'Gagal memesan paket.' }
  finally { loading.value = false }
}
useHead(() => ({ title: pkg.value ? `${pkg.value.title} · Miruum` : 'Paket · Miruum' }))
</script>
