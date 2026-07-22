<template>
  <div>
    <!-- Hero slider -->
    <HeroSlider :banners="banners" :fallback="{ title: resolveL(content.homeHeadline), subtitle: resolveL(content.homeSub) }" />
    <div class="container-site -mt-24 relative z-10">
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
      <h2 class="text-2xl font-bold mb-4">{{ sc('destinationsTitle', 'Destinasi Populer', 'Popular Destinations') }}</h2>
      <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        <NuxtLink v-for="c in cities" :key="c.name" :to="`/search?q=${encodeURIComponent(c.name)}`"
                  class="group relative rounded-xl overflow-hidden aspect-[4/5]">
          <img :src="c.img" :alt="c.name" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
          <div class="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent"></div>
          <div class="absolute bottom-0 p-3 text-white">
            <div class="font-bold text-[15px]">{{ c.name }}</div>
            <div class="text-[11px] text-white/80">{{ c.count }} {{ t('properti', 'properties') }}</div>
            <div v-if="c.priceFrom" class="text-[11px] font-semibold text-white mt-0.5">
              {{ t('mulai dari', 'from') }} {{ rupiah(c.priceFrom) }}
            </div>
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

    <RailSection v-if="recentlyViewed.length" :title="t('Baru Dilihat', 'Recently Viewed')" :subtitle="t('Lanjutkan dari tempat kamu berhenti', 'Pick up where you left off')">
      <HotelCard v-for="h in recentlyViewed" :key="h.id" :hotel="h" class="min-w-[240px] w-[240px] sm:min-w-[260px] sm:w-[260px]" />
    </RailSection>

    <RailSection :title="t('Rekomendasi untukmu', 'Recommended for you')" :subtitle="t('Hotel pilihan dengan ulasan terbaik', 'Handpicked hotels with the best reviews')" more="/search">
      <HotelCard v-for="h in recommended" :key="h.id" :hotel="h" class="min-w-[240px] w-[240px] sm:min-w-[260px] sm:w-[260px]" />
    </RailSection>

    <RailSection v-if="promo.length" :title="t('Promo & Harga Turun', 'Deals & Price Drops')" :subtitle="t('Penawaran terbatas — pesan sekarang', 'Limited-time offers — book now')" more="/search">
      <HotelCard v-for="h in promo" :key="h.id" :hotel="h" class="min-w-[240px] w-[240px] sm:min-w-[260px] sm:w-[260px]" />
    </RailSection>

    <!-- Program rails: Promo & Kampanye (sama seperti aplikasi) -->
    <section v-for="rail in programRails" :key="rail.type" class="container-site mt-12">
      <div class="flex items-center gap-2 mb-1">
        <span class="pill" :class="rail.type === 'CAMPAIGN' ? 'bg-sky-50 text-sky-700' : 'bg-brand-50 text-brand-700'">
          {{ rail.type === 'CAMPAIGN' ? t('KAMPANYE', 'CAMPAIGN') : t('PROMO', 'DEALS') }}
        </span>
        <h2 class="text-2xl font-bold">{{ rail.title }}</h2>
      </div>
      <div v-for="p in rail.programs" :key="p.id" class="mt-4">
        <div class="flex items-center gap-2">
          <h3 class="font-bold text-[15px]">{{ p.title }}</h3>
          <span v-if="p.discountPct > 0" class="pill bg-red-500 text-white">-{{ p.discountPct }}%</span>
        </div>
        <p v-if="p.description" class="text-ink-muted text-sm line-clamp-2 mt-0.5">{{ p.description }}</p>
        <div class="flex gap-4 overflow-x-auto no-scrollbar pt-3 pb-2 -mx-4 px-4 sm:mx-0 sm:px-0">
          <HotelCard v-for="h in p.hotels" :key="h.id" :hotel="h"
                     class="min-w-[240px] w-[240px] sm:min-w-[260px] sm:w-[260px]" />
        </div>
      </div>
    </section>

    <!-- Packages -->
    <section v-if="packages.length" class="container-site mt-12">
      <div class="flex items-end justify-between mb-4">
        <div>
          <h2 class="text-2xl font-bold">{{ t('Paket Menginap', 'Stay Packages') }}</h2>
          <p class="text-ink-muted text-sm">{{ t('Bundel hemat: kamar + sarapan + benefit', 'Value bundles: room + breakfast + perks') }}</p>
        </div>
        <NuxtLink to="/packages" class="text-brand-600 font-semibold text-sm hover:underline">{{ t('Lihat semua', 'See all') }} →</NuxtLink>
      </div>
      <div class="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <PackageCard v-for="p in packages.slice(0,4)" :key="p.id" :pkg="p" />
      </div>
    </section>

    <!-- Articles -->
    <section v-if="articles.length" class="container-site mt-12">
      <div class="flex items-end justify-between mb-4">
        <div>
          <h2 class="text-2xl font-bold">{{ t('Artikel & Inspirasi', 'Articles & Inspiration') }}</h2>
          <p class="text-ink-muted text-sm">{{ t('Tips & panduan untuk perjalananmu', 'Tips & guides for your travels') }}</p>
        </div>
        <NuxtLink to="/articles" class="text-brand-600 font-semibold text-sm hover:underline shrink-0">{{ t('Lihat semua', 'See all') }} →</NuxtLink>
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

    <!-- Social proof: real aggregate numbers + genuine guest reviews -->
    <section v-if="statTiles.length || topReviews.length" class="container-site mt-14">
      <h2 class="text-2xl font-bold">{{ sc('socialTitle', 'Apa kata tamu kami', 'What our guests say') }}</h2>
      <p class="text-ink-muted text-sm mt-0.5">
        {{ sc('socialSub', 'Angka dan ulasan di bawah diambil langsung dari data Miruum.', 'The numbers and reviews below come straight from Miruum data.') }}
      </p>

      <div class="grid grid-cols-2 lg:grid-cols-5 gap-4 mt-5">
        <div v-for="s in statTiles" :key="s.label" class="card p-4">
          <div class="text-2xl font-bold text-brand-700">{{ s.value }}</div>
          <div class="text-[13px] text-ink-muted mt-0.5">{{ s.label }}</div>
        </div>
      </div>

      <div v-if="topReviews.length" class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mt-5">
        <figure v-for="r in topReviews" :key="r.id" class="card p-5 flex flex-col">
          <div class="flex items-center gap-2">
            <span class="pill bg-brand-50 text-brand-700 font-bold">{{ r.rating }}/10</span>
            <span class="text-[13px] text-ink-muted">{{ ratingLabel(Number(r.rating) || 0) }}</span>
          </div>
          <blockquote class="text-[14px] text-ink mt-3 line-clamp-3 flex-1">{{ r.body }}</blockquote>
          <figcaption class="mt-3 pt-3 border-t border-line">
            <div class="font-semibold text-[13px]">{{ r.authorName || t('Tamu Miruum', 'Miruum guest') }}</div>
            <div class="text-[12px] text-ink-faint">
              {{ r.hotel?.name || '' }}<template v-if="r.hotel?.city"> · {{ r.hotel.city }}</template>
            </div>
            <div v-if="r.createdAt" class="text-[12px] text-ink-faint">{{ fmtDate(r.createdAt) }}</div>
          </figcaption>
        </figure>
      </div>
    </section>

    <!-- Business CTAs: property partners + corporate/government -->
    <section class="container-site mt-14 grid gap-5 lg:grid-cols-2">
      <div class="rounded-xl2 overflow-hidden relative bg-gradient-to-br from-brand-700 to-brand text-white p-8 min-h-[220px] flex flex-col">
        <div class="absolute inset-0 opacity-20 bg-[url('https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?auto=format&fit=crop&w=1200&q=60')] bg-cover bg-center"></div>
        <div class="relative flex flex-col flex-1">
          <span class="pill bg-white/20 text-white w-fit mb-2">{{ t('Untuk Mitra Properti', 'For Property Partners') }}</span>
          <h2 class="text-2xl font-display font-bold">{{ resolveL(content.ctaPropertyTitle) }}</h2>
          <p class="mt-2 text-white/90 text-[15px] flex-1">{{ resolveL(content.ctaPropertyText) }}</p>
          <NuxtLink to="/mitra" class="btn bg-white text-brand-700 hover:bg-white/90 px-5 py-2.5 mt-4 font-bold w-fit">{{ t('Pelajari & Daftar', 'Learn More & Register') }} →</NuxtLink>
        </div>
      </div>

      <div class="rounded-xl2 overflow-hidden relative bg-gradient-to-br from-slate-800 to-slate-600 text-white p-8 min-h-[220px] flex flex-col">
        <div class="absolute inset-0 opacity-20 bg-[url('https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=1200&q=60')] bg-cover bg-center"></div>
        <div class="relative flex flex-col flex-1">
          <span class="pill bg-white/20 text-white w-fit mb-2">Corporate & Government</span>
          <h2 class="text-2xl font-display font-bold">{{ resolveL(content.ctaCorpTitle) }}</h2>
          <p class="mt-2 text-white/90 text-[15px] flex-1">{{ resolveL(content.ctaCorpText) }}</p>
          <a href="https://corporate.miruum.id/corporate/register" class="btn bg-white text-slate-800 hover:bg-white/90 px-5 py-2.5 mt-4 font-bold w-fit">{{ t('Ajukan Akun', 'Request an Account') }} →</a>
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
const { t } = useLang()
const [{ data: rec }, { data: pro }, { data: ban }, { data: pkg }] = await Promise.all([
  useAsyncData('rec', () => $api('/hotels/recommended').catch(() => ({ hotels: [] }))),
  useAsyncData('promo', () => $api('/hotels/promo').catch(() => ({ hotels: [] }))),
  useAsyncData('ban', () => $api('/banners').catch(() => ({ banners: [] }))),
  useAsyncData('pkg', () => $api('/packages').catch(() => ({ packages: [] }))),
])
const arr = (d: any, k: string) => (d?.[k] || d || []) as any[]
const recommended = computed(() => arr(rec.value, 'hotels').slice(0, 10))
const promo = computed(() => arr(pro.value, 'hotels').slice(0, 10))

// Program (PROMO / CAMPAIGN) rails — mirrors the app's _ProgramRail.
const [{ data: progPromo }, { data: progCampaign }] = await Promise.all([
  useAsyncData('prog-promo', () => $api('/programs', { query: { type: 'PROMO' } }).catch(() => ({ programs: [] }))),
  useAsyncData('prog-campaign', () => $api('/programs', { query: { type: 'CAMPAIGN' } }).catch(() => ({ programs: [] }))),
])
const withHotels = (d: any) => arr(d, 'programs').filter((p: any) => (p.hotels || []).length > 0)
const programRails = computed(() => [
  { type: 'PROMO', title: t('Promo Spesial', 'Special Deals'), programs: withHotels(progPromo.value) },
  { type: 'CAMPAIGN', title: t('Kampanye', 'Campaigns'), programs: withHotels(progCampaign.value) },
].filter((r) => r.programs.length > 0))

const { data: rv } = await useAsyncData('recent', () => $api('/recently-viewed').catch(() => ({ hotels: [] })))
const recentlyViewed = computed(() => arr(rv.value, 'hotels').slice(0, 10))

const { data: art } = await useAsyncData('home-articles', () => $api('/articles').catch(() => ({ articles: [] })))
const articles = computed(() => arr(art.value, 'articles').slice(0, 6))
const banners = computed(() => arr(ban.value, 'banners'))
const packages = computed(() => arr(pkg.value, 'packages'))

// Copy dari Back Office; `sc`/`resolveL` menangani nilai lama (string) maupun
// baru ({ id, en }) dan ikut berubah saat bahasa diganti.
const { content, sc, resolveL } = await useSiteCopy()
const propTypes = computed(() => Object.entries(propertyTypeLabels()).map(([key, label]) => ({ key, label })))

// Popular destinations — real per-city counts and "from" prices from the API.
const { data: dest } = await useAsyncData('destinations', () =>
  $api('/destinations').catch(() => ({ destinations: [] })))
const cities = computed(() =>
  (Array.isArray((dest.value as any)?.destinations) ? (dest.value as any).destinations : [])
    .filter((d: any) => d?.name)
    .slice(0, 6)
    .map((d: any) => ({
      name: d.name as string,
      img: d.imageUrl || '',
      count: Number(d.count) || 0,
      priceFrom: Number(d.priceFrom) || 0,
    })))

// Social proof — aggregates + genuine reviews. Only real numbers, never padded.
const { data: statData } = await useAsyncData('site-stats', () =>
  $api('/site-stats').catch(() => null))
const stats = computed(() => (statData.value && typeof statData.value === 'object' ? (statData.value as any) : null))
const topReviews = computed(() => {
  const list = stats.value?.topReviews
  return (Array.isArray(list) ? list : []).filter((r: any) => r?.body).slice(0, 4)
})
const statTiles = computed(() => {
  const s = stats.value
  if (!s) return []
  const tiles: { value: string; label: string }[] = []
  if (s.hotels) tiles.push({ value: String(s.hotels), label: t('properti', 'properties') })
  if (s.cities) tiles.push({ value: String(s.cities), label: t('kota', 'cities') })
  if (s.reviews) tiles.push({ value: String(s.reviews), label: t('ulasan tamu', 'guest reviews') })
  if (s.avgRating) tiles.push({ value: `${s.avgRating}/10`, label: t('rata-rata penilaian', 'average rating') })
  if (s.bookings) tiles.push({ value: String(s.bookings), label: t('pesanan dibayar', 'paid bookings') })
  return tiles
})
const FEATURE_ICONS = [
  '<svg viewBox=\'0 0 24 24\' class=\'w-5 h-5 fill-none stroke-current\' stroke-width=\'2\'><path d=\'M20 12V7H5a2 2 0 010-4h14v4M3 5v14a2 2 0 002 2h16v-5M18 12a2 2 0 000 4h4v-4z\'/></svg>',
  '<svg viewBox=\'0 0 24 24\' class=\'w-5 h-5 fill-none stroke-current\' stroke-width=\'2\'><path d=\'M12 3l8 3v6c0 5-8 9-8 9s-8-4-8-9V6z\'/></svg>',
  '<svg viewBox=\'0 0 24 24\' class=\'w-5 h-5 fill-none stroke-current\' stroke-width=\'2\'><path d=\'M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z\'/></svg>',
]
const features = computed(() => (content.value.features || []).map((f: any, i: number) => ({
  ...f,
  t: resolveL(f?.t),
  d: resolveL(f?.d),
  icon: FEATURE_ICONS[i % FEATURE_ICONS.length],
})))
</script>
