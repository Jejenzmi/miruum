<template>
  <div>
    <!-- ── Hero ── -->
    <section class="relative overflow-hidden">
      <div class="absolute inset-0">
        <img v-for="(img, i) in heroImages" :key="img" :src="img" alt=""
             class="absolute inset-0 w-full h-full object-cover transition-opacity duration-1000 ease-in-out"
             :class="i === heroIdx ? 'opacity-100' : 'opacity-0'" />
        <div class="absolute inset-0 bg-gradient-to-r from-navy-900/90 via-navy-800/75 to-navy/25"></div>
      </div>
      <div class="container-site relative py-16 sm:py-24">
        <p class="text-brand-200 font-semibold tracking-widest uppercase text-[13px] mb-3">{{ sc('heroEyebrow', 'Jelajahi. Impikan. Temukan.', 'Explore. Dream. Discover.') }}</p>
        <h1 class="text-white text-4xl sm:text-5xl font-display font-bold leading-[1.08] max-w-2xl">{{ resolveL(content.homeHeadline) || t('Perjalananmu, Semangat Kami', 'Your Journey, Our Passion') }}</h1>
        <p class="text-white/85 mt-4 max-w-xl text-[15px] leading-relaxed">{{ resolveL(content.homeSub) || t('Hotel & pengalaman pilihan yang dikurasi khusus untukmu.', 'Handpicked hotels and experiences crafted just for you.') }}</p>
        <div class="flex flex-wrap gap-3 mt-7">
          <NuxtLink to="/search" class="btn-brand !px-6 !py-3 font-bold inline-flex items-center gap-2">{{ t('Jelajahi Hotel', 'Explore Hotels') }} <span>→</span></NuxtLink>
          <NuxtLink v-if="packages.length" to="/packages" class="btn !px-6 !py-3 font-bold bg-white/10 text-white border border-white/25 hover:bg-white/20">{{ t('Lihat Paket', 'View Packages') }}</NuxtLink>
        </div>
        <div v-if="heroImages.length > 1" class="flex gap-2 mt-8">
          <button v-for="(img, i) in heroImages" :key="i" @click="heroIdx = i" :aria-label="`Slide ${i + 1}`"
                  class="h-1.5 rounded-full transition-all" :class="i === heroIdx ? 'w-7 bg-brand' : 'w-2.5 bg-white/40 hover:bg-white/70'"></button>
        </div>
      </div>
    </section>
    <div class="container-site -mt-10 relative z-10">
      <SearchWidget />
    </div>

    <!-- Quick property types -->
    <section class="container-site mt-6">
      <div class="flex gap-2.5 overflow-x-auto no-scrollbar pb-1">
        <NuxtLink v-for="pt in propTypes" :key="pt.key" :to="`/search?propertyType=${pt.key}`"
                  class="chip whitespace-nowrap !py-2.5 !px-4 hover:!border-brand hover:!text-brand-700">{{ pt.label }}</NuxtLink>
      </div>
    </section>

    <!-- ── Top Destinations ── -->
    <section v-if="cities.length" class="container-site mt-12">
      <div class="flex items-end justify-between mb-5">
        <h2 class="text-2xl sm:text-3xl font-display font-bold">{{ sc('destinationsTitle', 'Destinasi Populer', 'Top Destinations') }}</h2>
        <NuxtLink to="/search" class="text-brand-600 font-semibold text-sm hover:underline shrink-0">{{ t('Lihat semua', 'View all') }} →</NuxtLink>
      </div>
      <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <NuxtLink v-for="c in cities" :key="c.name" :to="`/search?q=${encodeURIComponent(c.name)}`"
                  class="group relative rounded-2xl overflow-hidden aspect-[3/4] shadow-card hover:shadow-cardhover transition-all">
          <img :src="c.img" :alt="c.name" class="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" />
          <div class="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent"></div>
          <div class="absolute bottom-0 p-4 text-white w-full">
            <div class="font-bold text-[16px]">{{ c.name }}</div>
            <div v-if="c.priceFrom" class="text-[12px] text-white/90 mt-0.5">{{ t('Mulai', 'From') }} <b class="text-brand-200">{{ rupiah(c.priceFrom) }}</b></div>
            <div v-else class="text-[11px] text-white/75">{{ c.count }} {{ t('properti', 'properties') }}</div>
          </div>
        </NuxtLink>
      </div>
    </section>

    <!-- ── Why Miruum (navy block) ── -->
    <section v-if="features.length" class="container-site mt-14">
      <div class="rounded-3xl bg-navy text-white overflow-hidden grid lg:grid-cols-[1.1fr_0.9fr]">
        <div class="p-8 sm:p-10">
          <h2 class="text-2xl sm:text-3xl font-display font-bold">{{ t('Kenapa pesan di Miruum?', 'Why book with Miruum?') }}</h2>
          <p class="text-white/70 mt-2 text-[15px]">{{ t('Kami buat setiap perjalanan mulus, nyaman, dan berkesan.', 'We make every journey smooth, comfortable & memorable.') }}</p>
          <div class="grid sm:grid-cols-2 gap-5 mt-7">
            <div v-for="f in features" :key="f.t" class="flex items-start gap-3">
              <span class="w-10 h-10 rounded-xl bg-white/12 text-brand-200 grid place-items-center shrink-0" v-html="f.icon"></span>
              <div>
                <div class="font-bold text-[15px]">{{ f.t }}</div>
                <div class="text-[13px] text-white/65 leading-snug">{{ f.d }}</div>
              </div>
            </div>
          </div>
        </div>
        <div class="relative min-h-[240px] hidden lg:block">
          <img src="https://images.unsplash.com/photo-1488646953014-85cb44e25828?auto=format&fit=crop&w=900&q=70" alt="" class="absolute inset-0 w-full h-full object-cover" />
          <div class="absolute inset-0 bg-gradient-to-l from-transparent to-navy/60"></div>
        </div>
      </div>
    </section>

    <RailSection v-if="recentlyViewed.length" :title="t('Baru Dilihat', 'Recently Viewed')" :subtitle="t('Lanjutkan dari tempat kamu berhenti', 'Pick up where you left off')">
      <HotelCard v-for="h in recentlyViewed" :key="h.id" :hotel="h" class="min-w-[240px] w-[240px] sm:min-w-[260px] sm:w-[260px]" />
    </RailSection>

    <RailSection :title="t('Rekomendasi untukmu', 'Recommended for you')" :subtitle="t('Hotel pilihan dengan ulasan terbaik', 'Handpicked hotels with the best reviews')" more="/search">
      <HotelCard v-for="h in recommended" :key="h.id" :hotel="h" class="min-w-[240px] w-[240px] sm:min-w-[260px] sm:w-[260px]" />
    </RailSection>

    <!-- ── Promo banner (dark) ── -->
    <section v-if="banners.length || promoPct" class="container-site mt-12">
      <div class="relative rounded-3xl overflow-hidden min-h-[220px] flex items-center">
        <img :src="promoImg" alt="" class="absolute inset-0 w-full h-full object-cover" />
        <div class="absolute inset-0 bg-gradient-to-r from-navy-900/90 to-navy/30"></div>
        <div class="relative p-8 sm:p-10 text-white max-w-lg">
          <h2 class="text-2xl sm:text-3xl font-display font-bold leading-tight">{{ t('Waktunya Petualangan Baru', "It's Time For a New Adventure") }}</h2>
          <p class="text-white/85 mt-2">{{ promoPct ? t(`Hemat hingga ${promoPct}% dengan pesan lebih awal.`, `Save up to ${promoPct}% when you book early.`) : t('Penawaran terbatas — pesan sekarang & hemat lebih.', 'Limited-time offers — book now and save more.') }}</p>
          <NuxtLink to="/search" class="btn-brand !px-6 !py-3 font-bold mt-5 inline-flex">{{ t('Pesan Sekarang', 'Book Now') }} →</NuxtLink>
        </div>
        <div v-if="promoPct" class="hidden sm:grid place-items-center absolute right-8 top-1/2 -translate-y-1/2 w-24 h-24 rounded-full bg-brand text-white text-center shadow-pop">
          <div><div class="text-[11px] font-semibold -mb-1">{{ t('s/d', 'Up to') }}</div><div class="text-2xl font-extrabold">{{ promoPct }}%</div><div class="text-[10px] -mt-1">OFF</div></div>
        </div>
      </div>
    </section>

    <!-- ── Popular Packages ── -->
    <section v-if="packages.length" class="container-site mt-14">
      <div class="flex items-end justify-between mb-5">
        <div>
          <h2 class="text-2xl sm:text-3xl font-display font-bold">{{ t('Paket Populer', 'Popular Packages') }}</h2>
          <p class="text-ink-muted text-sm mt-0.5">{{ t('Bundel hemat: kamar + sarapan + benefit', 'Value bundles: room + breakfast + perks') }}</p>
        </div>
        <NuxtLink to="/packages" class="text-brand-600 font-semibold text-sm hover:underline shrink-0">{{ t('Lihat semua', 'View all') }} →</NuxtLink>
      </div>
      <div class="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <PackageCard v-for="p in packages.slice(0,4)" :key="p.id" :pkg="p" />
      </div>
    </section>

    <!-- Program rails: Promo & Campaign -->
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
          <HotelCard v-for="h in p.hotels" :key="h.id" :hotel="h" class="min-w-[240px] w-[240px] sm:min-w-[260px] sm:w-[260px]" />
        </div>
      </div>
    </section>

    <!-- ── Testimonials ── -->
    <section v-if="topReviews.length" class="container-site mt-16">
      <h2 class="text-2xl sm:text-3xl font-display font-bold text-center">{{ sc('socialTitle', 'Apa Kata Tamu Kami', 'What Our Guests Say') }}</h2>
      <p class="text-ink-muted text-sm text-center mt-1">{{ t('Ulasan asli langsung dari data Miruum.', 'Genuine reviews straight from Miruum data.') }}</p>
      <div class="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 mt-8">
        <figure v-for="r in topReviews.slice(0,3)" :key="r.id" class="card p-6 flex flex-col">
          <div class="flex gap-0.5 text-brand-500 mb-3">
            <svg v-for="n in 5" :key="n" viewBox="0 0 24 24" class="w-4 h-4" :class="n <= stars(r.rating) ? 'fill-current' : 'fill-line'"><path d="M12 2l3 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.9 21l1.2-6.8-5-4.9 6.9-1z"/></svg>
          </div>
          <blockquote class="text-[14.5px] text-ink leading-relaxed flex-1 line-clamp-4">“{{ r.body }}”</blockquote>
          <figcaption class="mt-4 pt-4 border-t border-line flex items-center gap-3">
            <span class="w-10 h-10 rounded-full bg-navy text-white grid place-items-center font-bold text-sm shrink-0">{{ initials(r.authorName) }}</span>
            <div>
              <div class="font-semibold text-[13.5px]">{{ r.authorName || t('Tamu Miruum', 'Miruum guest') }}</div>
              <div class="text-[12px] text-ink-faint">{{ r.hotel?.name }}<template v-if="r.hotel?.city"> · {{ r.hotel.city }}</template></div>
            </div>
          </figcaption>
        </figure>
      </div>
    </section>

    <!-- ── Feature strip (gradient) ── -->
    <section class="container-site mt-14">
      <div class="rounded-3xl bg-gradient-to-r from-navy via-navy-700 to-teal text-white p-8 grid sm:grid-cols-2 gap-6">
        <div class="flex items-center gap-4">
          <span class="w-12 h-12 rounded-2xl bg-white/15 grid place-items-center shrink-0">
            <svg viewBox="0 0 24 24" class="w-6 h-6 fill-none stroke-current" stroke-width="2"><path d="M3 5h18v14H3zM3 9h18M8 3v4M16 3v4"/></svg>
          </span>
          <div><div class="font-bold text-lg">{{ t('Pembayaran Fleksibel', 'Flexible Booking') }}</div><div class="text-white/75 text-[13.5px]">{{ t('Pesan sekarang, bayar nanti dengan mudah.', 'Book now, pay later with ease.') }}</div></div>
        </div>
        <div class="flex items-center gap-4">
          <span class="w-12 h-12 rounded-2xl bg-white/15 grid place-items-center shrink-0">
            <svg viewBox="0 0 24 24" class="w-6 h-6 fill-none stroke-current" stroke-width="2"><path d="M4 6h16M4 12h16M4 18h10"/></svg>
          </span>
          <div><div class="font-bold text-lg">{{ t('Sesuai Kebutuhanmu', 'Customizable Trips') }}</div><div class="text-white/75 text-[13.5px]">{{ t('Hotel, paket, hingga venue — atur sesukamu.', 'Hotels, packages & venues — your way.') }}</div></div>
        </div>
      </div>
    </section>

    <!-- ── Travel Tips & Guides ── -->
    <section v-if="articles.length" class="container-site mt-14">
      <div class="flex items-end justify-between mb-5">
        <h2 class="text-2xl sm:text-3xl font-display font-bold">{{ t('Tips & Panduan Perjalanan', 'Travel Tips & Guides') }}</h2>
        <NuxtLink to="/articles" class="text-brand-600 font-semibold text-sm hover:underline shrink-0">{{ t('Lihat semua', 'View all') }} →</NuxtLink>
      </div>
      <div class="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        <NuxtLink v-for="a in articles.slice(0,3)" :key="a.id" :to="`/articles/${a.slug}`" class="group card overflow-hidden hover:shadow-cardhover hover:-translate-y-1 transition-all">
          <div class="aspect-[16/10] bg-line overflow-hidden"><img :src="a.coverImage" :alt="a.title" loading="lazy" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" /></div>
          <div class="p-5">
            <span class="pill bg-brand-50 text-brand-700 mb-2">{{ a.category }}</span>
            <h3 class="font-bold text-[15.5px] leading-snug line-clamp-2 group-hover:text-brand-600">{{ a.title }}</h3>
            <p class="text-[13px] text-ink-muted line-clamp-2 mt-1">{{ a.excerpt }}</p>
            <p v-if="a.publishedAt || a.createdAt" class="text-[12px] text-ink-faint mt-2">{{ fmtDate(a.publishedAt || a.createdAt) }}</p>
          </div>
        </NuxtLink>
      </div>
    </section>

    <!-- ── Newsletter (orange) ── -->
    <section class="container-site mt-16">
      <div class="rounded-3xl bg-gradient-to-r from-brand-500 to-brand-600 text-white p-8 sm:p-10 grid lg:grid-cols-[1.3fr_1fr] gap-6 items-center overflow-hidden relative">
        <div>
          <h2 class="text-2xl sm:text-3xl font-display font-bold">{{ t('Dapatkan Penawaran Eksklusif', 'Get Exclusive Travel Deals') }}</h2>
          <p class="text-white/90 mt-2 text-[15px]">{{ t('Berlangganan & jadi yang pertama tahu promo spesial.', 'Subscribe and be first to know about special offers.') }}</p>
        </div>
        <form v-if="!nlOk" @submit.prevent="subscribe" class="flex gap-2 bg-white rounded-full p-1.5 shadow-pop">
          <input v-model="nlEmail" type="email" :placeholder="t('Masukkan email kamu', 'Enter your email')" class="flex-1 bg-transparent px-4 text-ink outline-none text-[14px]" />
          <button :disabled="nlLoading" class="rounded-full bg-navy text-white px-6 py-2.5 font-bold text-sm hover:bg-navy-700 shrink-0">{{ nlLoading ? '…' : t('Langganan', 'Subscribe') }}</button>
        </form>
        <div v-else class="bg-white/15 rounded-2xl p-4 text-center font-semibold">✓ {{ t('Terima kasih! Kamu sudah berlangganan.', 'Thanks! You are subscribed.') }}</div>
        <p v-if="nlErr" class="text-white text-[13px] lg:col-start-2">{{ nlErr }}</p>
      </div>
    </section>

    <!-- ── Stats bar (real data) ── -->
    <section v-if="statTiles.length" class="container-site mt-6">
      <div class="rounded-3xl bg-navy-800 text-white px-8 py-8 grid grid-cols-2 sm:grid-cols-4 gap-6">
        <div v-for="s in statTiles.slice(0,4)" :key="s.label" class="text-center">
          <div class="text-3xl font-display font-extrabold text-brand-200">{{ s.value }}</div>
          <div class="text-[13px] text-white/70 mt-1 capitalize">{{ s.label }}</div>
        </div>
      </div>
    </section>

    <!-- ── Business CTAs + help ── -->
    <section class="container-site mt-14 grid gap-5 lg:grid-cols-2">
      <div class="rounded-3xl overflow-hidden relative bg-gradient-to-br from-brand-700 to-brand text-white p-8 min-h-[210px] flex flex-col">
        <span class="pill bg-white/20 text-white w-fit mb-2">{{ t('Untuk Mitra Properti', 'For Property Partners') }}</span>
        <h2 class="text-2xl font-display font-bold">{{ resolveL(content.ctaPropertyTitle) }}</h2>
        <p class="mt-2 text-white/90 text-[15px] flex-1">{{ resolveL(content.ctaPropertyText) }}</p>
        <NuxtLink to="/mitra" class="btn bg-white text-brand-700 hover:bg-white/90 px-5 py-2.5 mt-4 font-bold w-fit">{{ t('Pelajari & Daftar', 'Learn More & Register') }} →</NuxtLink>
      </div>
      <div class="rounded-3xl overflow-hidden relative bg-gradient-to-br from-navy to-navy-700 text-white p-8 min-h-[210px] flex flex-col">
        <span class="pill bg-white/20 text-white w-fit mb-2">Corporate & Government</span>
        <h2 class="text-2xl font-display font-bold">{{ resolveL(content.ctaCorpTitle) }}</h2>
        <p class="mt-2 text-white/90 text-[15px] flex-1">{{ resolveL(content.ctaCorpText) }}</p>
        <a href="https://corporate.miruum.id/corporate/register" class="btn bg-white text-navy hover:bg-white/90 px-5 py-2.5 mt-4 font-bold w-fit">{{ t('Ajukan Akun', 'Request an Account') }} →</a>
      </div>
    </section>

    <!-- Need help -->
    <section class="container-site mt-6 mb-4">
      <div class="rounded-3xl bg-teal text-white px-8 py-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div class="font-bold text-lg">{{ t('Butuh bantuan merencanakan perjalanan?', 'Need help planning your trip?') }}</div>
          <div class="text-white/85 text-[14px]">{{ t('Tim kami siap membantu kapan saja.', 'Our team is ready to assist you anytime.') }}</div>
        </div>
        <NuxtLink to="/content/kontak" class="btn bg-white text-teal-dark hover:bg-white/90 px-6 py-2.5 font-bold">{{ t('Hubungi Kami', 'Contact Us') }}</NuxtLink>
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

const { content, sc, resolveL } = await useSiteCopy()
const propTypes = computed(() => Object.entries(propertyTypeLabels()).map(([key, label]) => ({ key, label })))

const HERO_FALLBACK = 'https://images.unsplash.com/photo-1501785888041-af3ef285b470?auto=format&fit=crop&w=1600&q=70'
// Hero background = rotating slider of REAL hotel photos (+ admin banners).
const heroImages = computed(() => {
  const imgs = [
    ...banners.value.map((b: any) => b.imageUrl),
    ...recommended.value.map((h: any) => h.imageUrl),
    ...promo.value.map((h: any) => h.imageUrl),
  ].filter(Boolean)
  const uniq = [...new Set(imgs)].slice(0, 5)
  return uniq.length ? uniq : [HERO_FALLBACK]
})
const heroIdx = ref(0)
let heroTimer: any = null
onMounted(() => { heroTimer = setInterval(() => { heroIdx.value = (heroIdx.value + 1) % heroImages.value.length }, 5000) })
onBeforeUnmount(() => { if (heroTimer) clearInterval(heroTimer) })
const promoImg = computed(() => banners.value[1]?.imageUrl || banners.value[0]?.imageUrl || 'https://images.unsplash.com/photo-1519681393784-d120267933ba?auto=format&fit=crop&w=1600&q=70')
// Only show a % if a real program/promo advertises one.
const promoPct = computed(() => {
  const pcts = programRails.value.flatMap((r) => r.programs.map((p: any) => Number(p.discountPct) || 0))
  return pcts.length ? Math.max(...pcts) : 0
})

const { data: dest } = await useAsyncData('destinations', () => $api('/destinations').catch(() => ({ destinations: [] })))
const cities = computed(() =>
  (Array.isArray((dest.value as any)?.destinations) ? (dest.value as any).destinations : [])
    .filter((d: any) => d?.name).slice(0, 5)
    .map((d: any) => ({ name: d.name as string, img: d.imageUrl || '', count: Number(d.count) || 0, priceFrom: Number(d.priceFrom) || 0 })))

const { data: statData } = await useAsyncData('site-stats', () => $api('/site-stats').catch(() => null))
const stats = computed(() => (statData.value && typeof statData.value === 'object' ? (statData.value as any) : null))
const topReviews = computed(() => (Array.isArray(stats.value?.topReviews) ? stats.value.topReviews : []).filter((r: any) => r?.body).slice(0, 3))
const statTiles = computed(() => {
  const s = stats.value; if (!s) return [] as { value: string; label: string }[]
  const tiles: { value: string; label: string }[] = []
  if (s.hotels) tiles.push({ value: `${s.hotels}+`, label: t('properti', 'properties') })
  if (s.cities) tiles.push({ value: `${s.cities}+`, label: t('kota', 'cities') })
  if (s.reviews) tiles.push({ value: `${s.reviews}+`, label: t('ulasan tamu', 'guest reviews') })
  if (s.bookings) tiles.push({ value: `${s.bookings}+`, label: t('pesanan dibayar', 'paid bookings') })
  if (s.avgRating) tiles.push({ value: `${s.avgRating}/10`, label: t('rata-rata penilaian', 'average rating') })
  return tiles
})

const FEATURE_ICONS = [
  '<svg viewBox=\'0 0 24 24\' class=\'w-5 h-5 fill-none stroke-current\' stroke-width=\'2\'><path d=\'M20 12V7H5a2 2 0 010-4h14v4M3 5v14a2 2 0 002 2h16v-5M18 12a2 2 0 000 4h4v-4z\'/></svg>',
  '<svg viewBox=\'0 0 24 24\' class=\'w-5 h-5 fill-none stroke-current\' stroke-width=\'2\'><path d=\'M12 3l8 3v6c0 5-8 9-8 9s-8-4-8-9V6z\'/></svg>',
  '<svg viewBox=\'0 0 24 24\' class=\'w-5 h-5 fill-none stroke-current\' stroke-width=\'2\'><path d=\'M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z\'/></svg>',
  '<svg viewBox=\'0 0 24 24\' class=\'w-5 h-5 fill-none stroke-current\' stroke-width=\'2\'><path d=\'M12 1v22M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6\'/></svg>',
]
const features = computed(() => (content.value.features || []).map((f: any, i: number) => ({
  t: resolveL(f?.t), d: resolveL(f?.d), icon: FEATURE_ICONS[i % FEATURE_ICONS.length],
})).filter((f: any) => f.t))

const stars = (r: any) => Math.max(0, Math.min(5, Math.round((Number(r) || 0) / 2)))
const initials = (name?: string) => (name || 'MG').trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('')

// Newsletter signup (real endpoint).
const nlEmail = ref(''), nlOk = ref(false), nlErr = ref(''), nlLoading = ref(false)
async function subscribe() {
  nlErr.value = ''
  if (!nlEmail.value.includes('@')) { nlErr.value = t('Email tidak valid.', 'Invalid email.'); return }
  nlLoading.value = true
  try { await $api('/newsletter', { method: 'POST', body: { email: nlEmail.value.trim() } }); nlOk.value = true; nlEmail.value = '' }
  catch (e: any) { nlErr.value = e?.data?.error || t('Gagal berlangganan.', 'Failed to subscribe.') }
  finally { nlLoading.value = false }
}

useHead(() => ({ title: t('Miruum — Booking Hotel, Paket & Venue', 'Miruum — Hotels, Packages & Venues') }))
</script>
