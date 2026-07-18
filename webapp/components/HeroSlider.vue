<template>
  <section class="relative h-[360px] sm:h-[440px] overflow-hidden">
    <!-- Slides -->
    <div v-for="(s,i) in slides" :key="i"
         class="absolute inset-0 transition-opacity duration-700"
         :class="i === cur ? 'opacity-100' : 'opacity-0 pointer-events-none'">
      <img :src="s.image" :alt="s.title" class="w-full h-full object-cover" />
      <div class="absolute inset-0 bg-gradient-to-br from-brand-700/90 via-brand-600/70 to-brand/50"></div>
    </div>

    <!-- Content -->
    <div class="relative container-site h-full flex flex-col justify-start pt-12 sm:pt-16 text-white">
      <div class="max-w-2xl">
        <span v-if="active.badge" class="pill bg-white/20 text-white mb-3">{{ active.badge }}</span>
        <h1 class="text-2xl sm:text-4xl lg:text-5xl font-display font-bold leading-tight drop-shadow-sm">{{ active.title }}</h1>
        <p class="mt-3 text-white/90 text-base sm:text-lg max-w-xl">{{ active.subtitle }}</p>
      </div>
    </div>

    <!-- Dots -->
    <div class="absolute bottom-28 sm:bottom-32 left-0 right-0 flex justify-center gap-2 z-10">
      <button v-for="(s,i) in slides" :key="i" @click="go(i)" :aria-label="`Slide ${i+1}`"
              class="h-2 rounded-full transition-all" :class="i === cur ? 'w-6 bg-white' : 'w-2 bg-white/50 hover:bg-white/80'"></button>
    </div>

    <!-- Arrows -->
    <button @click="go((cur - 1 + slides.length) % slides.length)" aria-label="Sebelumnya"
            class="hidden sm:grid place-items-center absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/20 hover:bg-white/30 text-white backdrop-blur">
      <svg viewBox="0 0 24 24" class="w-5 h-5 fill-none stroke-current" stroke-width="2.2"><path d="m15 18-6-6 6-6"/></svg>
    </button>
    <button @click="go((cur + 1) % slides.length)" aria-label="Berikutnya"
            class="hidden sm:grid place-items-center absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/20 hover:bg-white/30 text-white backdrop-blur">
      <svg viewBox="0 0 24 24" class="w-5 h-5 fill-none stroke-current" stroke-width="2.2"><path d="m9 18 6-6-6-6"/></svg>
    </button>
  </section>
</template>

<script setup lang="ts">
const props = defineProps<{ banners?: any[] }>()

const DEFAULTS = [
  { title: 'Dari hotel mewah sampai budget, semua ada di Miruum', subtitle: 'Harga terbaik dijamin — pesan mudah, bayar aman.', image: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1600&q=60', badge: '' },
  { title: 'Paket menginap hemat + sarapan & benefit', subtitle: 'Bundel spesial biar liburanmu makin worth it.', image: 'https://images.unsplash.com/photo-1571896349842-33c89424de2d?auto=format&fit=crop&w=1600&q=60', badge: 'Paket Hotel' },
  { title: 'Jelajahi tour & transfer bandara', subtitle: 'Lengkapi perjalananmu, semua dari satu aplikasi.', image: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1600&q=60', badge: 'Aktivitas' },
]

// Prefer admin-managed banners as slides when there are enough of them.
const slides = computed(() => {
  const b = (props.banners || []).filter((x) => x.imageUrl)
  if (b.length >= 2) return b.map((x) => ({ title: x.title, subtitle: x.subtitle || '', image: x.imageUrl, badge: x.badge || '' }))
  return DEFAULTS
})

const cur = ref(0)
const active = computed(() => slides.value[cur.value] || slides.value[0])
let timer: any = null
function go(i: number) { cur.value = i; restart() }
function restart() { if (timer) clearInterval(timer); timer = setInterval(() => { cur.value = (cur.value + 1) % slides.value.length }, 5000) }
onMounted(restart)
onBeforeUnmount(() => timer && clearInterval(timer))
</script>
