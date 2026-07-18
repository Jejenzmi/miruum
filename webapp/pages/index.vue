<template>
  <div>
    <!-- Hero (Traveloka-style) -->
    <section class="relative">
      <div class="absolute inset-0 bg-gradient-to-b from-sky to-sky-600"></div>
      <div class="absolute inset-0 opacity-25 bg-[url('https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1600&q=60')] bg-cover bg-center"></div>
      <div class="relative container-site pt-10 sm:pt-14 pb-36 text-white text-center">
        <h1 class="text-2xl sm:text-4xl font-display font-bold max-w-2xl mx-auto leading-tight">Dari hotel mewah sampai budget, semua ada di Miruum</h1>
        <p class="mt-2.5 text-white/90 text-base sm:text-lg">Harga terbaik dijamin — pesan mudah, bayar aman.</p>
      </div>
    </section>
    <div class="container-site -mt-28 relative z-10">
      <SearchWidget />
    </div>

    <!-- Property types -->
    <section class="container-site mt-8">
      <div class="flex gap-3 overflow-x-auto no-scrollbar pb-1">
        <NuxtLink v-for="t in propTypes" :key="t.key" :to="`/search?propertyType=${t.key}`"
                  class="chip whitespace-nowrap !py-2.5 !px-4">{{ t.label }}</NuxtLink>
      </div>
    </section>

    <!-- Popular destinations -->
    <section v-if="cities.length" class="container-site mt-10">
      <h2 class="text-2xl font-bold mb-4">Destinasi Populer</h2>
      <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        <NuxtLink v-for="c in cities" :key="c.name" :to="`/search?q=${encodeURIComponent(c.name)}`"
                  class="group relative rounded-xl overflow-hidden aspect-[4/5]">
          <img :src="c.img" :alt="c.name" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
          <div class="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent"></div>
          <div class="absolute bottom-0 p-3 text-white">
            <div class="font-bold text-[15px]">{{ c.name }}</div>
            <div class="text-[11px] text-white/80">{{ c.count }} properti</div>
          </div>
        </NuxtLink>
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

    <!-- Articles -->
    <section v-if="articles.length" class="container-site mt-12">
      <div class="flex items-end justify-between mb-4">
        <div>
          <h2 class="text-2xl font-bold">Artikel & Inspirasi</h2>
          <p class="text-ink-muted text-sm">Tips & panduan untuk perjalananmu</p>
        </div>
        <NuxtLink to="/articles" class="text-brand-600 font-semibold text-sm hover:underline shrink-0">Lihat semua →</NuxtLink>
      </div>
      <div class="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        <NuxtLink v-for="a in articles.slice(0,3)" :key="a.id" :to="`/articles/${a.slug}`" class="group card overflow-hidden hover:shadow-cardhover hover:-translate-y-0.5 transition-all">
          <div class="aspect-[16/10] bg-line overflow-hidden"><img :src="a.coverImage" :alt="a.title" loading="lazy" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" /></div>
          <div class="p-4">
            <span class="pill bg-brand-50 text-brand-700 mb-2">{{ a.category }}</span>
            <h3 class="font-bold text-[15px] leading-snug line-clamp-2 group-hover:text-brand-600">{{ a.title }}</h3>
            <p class="text-[13px] text-ink-muted line-clamp-2 mt-1">{{ a.excerpt }}</p>
          </div>
        </NuxtLink>
      </div>
    </section>

    <!-- Property registration CTA -->
    <section class="container-site mt-14">
      <div class="rounded-xl2 overflow-hidden relative bg-gradient-to-r from-sky-700 to-sky text-white p-8 sm:p-12">
        <div class="absolute inset-0 opacity-20 bg-[url('https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?auto=format&fit=crop&w=1400&q=60')] bg-cover bg-center"></div>
        <div class="relative max-w-xl">
          <h2 class="text-2xl sm:text-3xl font-display font-bold">Punya hotel atau properti?</h2>
          <p class="mt-2 text-white/90">Daftarkan properti Anda ke Miruum — jangkau jutaan tamu di aplikasi & web, kelola harga, kamar, dan pesanan lewat Extranet. Gratis untuk memulai.</p>
          <a href="https://extranet.miruum.id/register" class="btn bg-white text-sky-700 hover:bg-white/90 px-6 py-3 mt-5 font-bold shadow">Daftarkan Properti Anda →</a>
        </div>
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

const { data: art } = await useAsyncData('home-articles', () => $api('/articles').catch(() => ({ articles: [] })))
const articles = computed(() => arr(art.value, 'articles').slice(0, 6))
const banners = computed(() => arr(ban.value, 'banners'))
const packages = computed(() => arr(pkg.value, 'packages'))

const propTypes = Object.entries(PROPERTY_TYPES).map(([key, label]) => ({ key, label }))

// Popular destinations derived from available hotels (city + a representative image).
const cities = computed(() => {
  const pool = [...recommended.value, ...promo.value]
  const map: Record<string, { name: string; img: string; count: number }> = {}
  for (const h of pool) {
    if (!h.city) continue
    if (!map[h.city]) map[h.city] = { name: h.city, img: h.imageUrl, count: 0 }
    map[h.city].count++
  }
  return Object.values(map).sort((a, b) => b.count - a.count).slice(0, 6)
})
const features = [
  { t: 'Harga Terbaik', d: 'Bandingkan & dapatkan harga termurah otomatis.', icon: '<svg viewBox=\'0 0 24 24\' class=\'w-5 h-5 fill-none stroke-current\' stroke-width=\'2\'><path d=\'M20 12V7H5a2 2 0 010-4h14v4M3 5v14a2 2 0 002 2h16v-5M18 12a2 2 0 000 4h4v-4z\'/></svg>' },
  { t: 'Pembayaran Aman', d: 'VA bank, e-wallet & QRIS — terenkripsi.', icon: '<svg viewBox=\'0 0 24 24\' class=\'w-5 h-5 fill-none stroke-current\' stroke-width=\'2\'><path d=\'M12 3l8 3v6c0 5-8 9-8 9s-8-4-8-9V6z\'/></svg>' },
  { t: 'Bantuan 24/7', d: 'Tim CS siap membantu kapan saja.', icon: '<svg viewBox=\'0 0 24 24\' class=\'w-5 h-5 fill-none stroke-current\' stroke-width=\'2\'><path d=\'M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z\'/></svg>' },
]
</script>
