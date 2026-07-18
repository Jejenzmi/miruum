<template>
  <div>
    <!-- Hero -->
    <section class="relative">
      <div class="absolute inset-0 bg-gradient-to-br from-brand-600 to-brand-500"></div>
      <div class="absolute inset-0 opacity-20 bg-[url('https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1600&q=60')] bg-cover bg-center"></div>
      <div class="relative container-site pt-14 pb-28 text-white">
        <h1 class="text-3xl sm:text-5xl font-display font-bold max-w-2xl leading-tight">Temukan tempat menginap terbaikmu</h1>
        <p class="mt-3 text-white/90 text-lg max-w-xl">Ribuan hotel, villa & paket menginap dengan harga terbaik — pesan mudah, bayar aman.</p>
      </div>
    </section>
    <div class="container-site -mt-20 relative z-10">
      <SearchBar />
    </div>

    <!-- Property types -->
    <section class="container-site mt-10">
      <div class="flex gap-3 overflow-x-auto no-scrollbar pb-1">
        <NuxtLink v-for="t in propTypes" :key="t.key" :to="`/search?propertyType=${t.key}`"
                  class="chip whitespace-nowrap !py-2.5 !px-4">{{ t.label }}</NuxtLink>
      </div>
    </section>

    <!-- Banners -->
    <section v-if="banners.length" class="container-site mt-8">
      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div v-for="b in banners.slice(0,3)" :key="b.id" class="relative rounded-xl2 overflow-hidden h-40 group">
          <img :src="b.imageUrl" :alt="b.title" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
          <div class="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent"></div>
          <div class="absolute bottom-0 p-4 text-white">
            <span v-if="b.badge" class="pill bg-brand text-white mb-1">{{ b.badge }}</span>
            <div class="font-bold text-lg leading-tight">{{ b.title }}</div>
            <div class="text-sm text-white/85">{{ b.subtitle }}</div>
          </div>
        </div>
      </div>
    </section>

    <RailSection v-if="recentlyViewed.length" title="Baru Dilihat" subtitle="Lanjutkan dari tempat kamu berhenti">
      <HotelCard v-for="h in recentlyViewed" :key="h.id" :hotel="h" class="min-w-[240px] w-[240px] sm:min-w-[260px] sm:w-[260px]" />
    </RailSection>

    <RailSection title="Rekomendasi untukmu" subtitle="Hotel pilihan dengan ulasan terbaik" more="/search">
      <HotelCard v-for="h in recommended" :key="h.id" :hotel="h" class="min-w-[240px] w-[240px] sm:min-w-[260px] sm:w-[260px]" />
    </RailSection>

    <RailSection v-if="promo.length" title="Promo & Harga Turun" subtitle="Penawaran terbatas — pesan sekarang" more="/search">
      <HotelCard v-for="h in promo" :key="h.id" :hotel="h" class="min-w-[240px] w-[240px] sm:min-w-[260px] sm:w-[260px]" />
    </RailSection>

    <!-- Packages -->
    <section v-if="packages.length" class="container-site mt-12">
      <div class="flex items-end justify-between mb-4">
        <div>
          <h2 class="text-2xl font-bold">Paket Menginap</h2>
          <p class="text-ink-muted text-sm">Bundel hemat: kamar + sarapan + benefit</p>
        </div>
        <NuxtLink to="/packages" class="text-brand-600 font-semibold text-sm hover:underline">Lihat semua →</NuxtLink>
      </div>
      <div class="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <PackageCard v-for="p in packages.slice(0,4)" :key="p.id" :pkg="p" />
      </div>
    </section>

    <!-- Trust strip -->
    <section class="container-site mt-16 grid gap-4 sm:grid-cols-3">
      <div v-for="f in features" :key="f.t" class="card p-5 flex items-start gap-3">
        <span class="w-10 h-10 rounded-xl bg-brand-50 text-brand-600 grid place-items-center shrink-0" v-html="f.icon"></span>
        <div>
          <div class="font-bold text-[15px]">{{ f.t }}</div>
          <div class="text-sm text-ink-muted">{{ f.d }}</div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
const { $api } = useNuxtApp()
const [{ data: rec }, { data: pro }, { data: ban }, { data: pkg }] = await Promise.all([
  useAsyncData('rec', () => $api('/hotels/recommended').catch(() => ({ hotels: [] }))),
  useAsyncData('promo', () => $api('/hotels/promo').catch(() => ({ hotels: [] }))),
  useAsyncData('ban', () => $api('/banners').catch(() => ({ banners: [] }))),
  useAsyncData('pkg', () => $api('/packages').catch(() => ({ packages: [] }))),
])
const arr = (d: any, k: string) => (d?.[k] || d || []) as any[]
const recommended = computed(() => arr(rec.value, 'hotels').slice(0, 10))
const promo = computed(() => arr(pro.value, 'hotels').slice(0, 10))

const { data: rv } = await useAsyncData('recent', () => $api('/recently-viewed').catch(() => ({ hotels: [] })))
const recentlyViewed = computed(() => arr(rv.value, 'hotels').slice(0, 10))
const banners = computed(() => arr(ban.value, 'banners'))
const packages = computed(() => arr(pkg.value, 'packages'))

const propTypes = Object.entries(PROPERTY_TYPES).map(([key, label]) => ({ key, label }))
const features = [
  { t: 'Harga Terbaik', d: 'Bandingkan & dapatkan harga termurah otomatis.', icon: '<svg viewBox=\'0 0 24 24\' class=\'w-5 h-5 fill-none stroke-current\' stroke-width=\'2\'><path d=\'M20 12V7H5a2 2 0 010-4h14v4M3 5v14a2 2 0 002 2h16v-5M18 12a2 2 0 000 4h4v-4z\'/></svg>' },
  { t: 'Pembayaran Aman', d: 'VA bank, e-wallet & QRIS — terenkripsi.', icon: '<svg viewBox=\'0 0 24 24\' class=\'w-5 h-5 fill-none stroke-current\' stroke-width=\'2\'><path d=\'M12 3l8 3v6c0 5-8 9-8 9s-8-4-8-9V6z\'/></svg>' },
  { t: 'Bantuan 24/7', d: 'Tim CS siap membantu kapan saja.', icon: '<svg viewBox=\'0 0 24 24\' class=\'w-5 h-5 fill-none stroke-current\' stroke-width=\'2\'><path d=\'M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z\'/></svg>' },
]
</script>
