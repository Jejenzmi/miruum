<template>
  <div>
    <!-- Hero -->
    <section class="relative">
      <div class="absolute inset-0 bg-gradient-to-br from-brand-700 to-brand"></div>
      <div class="absolute inset-0 opacity-20 bg-[url('https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?auto=format&fit=crop&w=1600&q=60')] bg-cover bg-center"></div>
      <div class="relative container-site py-16 sm:py-24 text-white">
        <div class="max-w-2xl">
          <span class="pill bg-white/15 text-white mb-4">Miruum untuk Mitra</span>
          <h1 class="text-3xl sm:text-5xl font-display font-bold leading-tight">{{ content.mitraHeadline }}</h1>
          <p class="mt-4 text-white/90 text-lg">{{ content.mitraSub }}</p>
          <div class="flex flex-wrap gap-3 mt-6">
            <a href="https://extranet.miruum.id/register" class="btn bg-white text-brand-700 hover:bg-white/90 px-6 py-3.5 font-bold shadow-pop">Daftarkan Properti Anda →</a>
            <a href="https://extranet.miruum.id/extranet/login" class="btn border border-white/40 text-white hover:bg-white/10 px-6 py-3.5 font-semibold">Sudah Mitra? Masuk</a>
          </div>
        </div>
      </div>
    </section>

    <!-- Stats -->
    <section class="container-site -mt-10 relative z-10">
      <div class="card p-6 grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
        <div v-for="s in stats" :key="s.label">
          <div class="text-2xl sm:text-3xl font-extrabold text-brand">{{ s.value }}</div>
          <div class="text-[13px] text-ink-muted">{{ s.label }}</div>
        </div>
      </div>
    </section>

    <!-- Benefits -->
    <section class="container-site mt-16">
      <h2 class="text-3xl font-display font-bold text-center">Kenapa bergabung dengan Miruum?</h2>
      <p class="text-ink-muted text-center mt-2 max-w-xl mx-auto">Semua yang Anda butuhkan untuk mengelola & menumbuhkan okupansi, dalam satu platform.</p>
      <div class="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 mt-8">
        <div v-for="b in benefits" :key="b.t" class="card p-6">
          <div class="w-12 h-12 rounded-xl bg-brand-50 text-brand grid place-items-center mb-3" v-html="b.icon"></div>
          <h3 class="font-bold text-[16px]">{{ b.t }}</h3>
          <p class="text-[14px] text-ink-muted mt-1 leading-relaxed">{{ b.d }}</p>
        </div>
      </div>
    </section>

    <!-- How it works -->
    <section class="bg-white border-y border-line mt-16">
      <div class="container-site py-14">
        <h2 class="text-3xl font-display font-bold text-center mb-10">Mulai hanya dalam 4 langkah</h2>
        <div class="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <div v-for="(s,i) in steps" :key="i" class="text-center">
            <div class="w-12 h-12 rounded-full bg-brand text-white grid place-items-center font-bold text-lg mx-auto mb-3">{{ i+1 }}</div>
            <h3 class="font-bold text-[16px]">{{ s.t }}</h3>
            <p class="text-[14px] text-ink-muted mt-1">{{ s.d }}</p>
          </div>
        </div>
      </div>
    </section>

    <!-- Commission / pricing -->
    <section class="container-site mt-16">
      <div class="grid lg:grid-cols-2 gap-8 items-center">
        <div>
          <h2 class="text-3xl font-display font-bold">Transparan & tanpa biaya di muka</h2>
          <p class="text-ink-muted mt-3 leading-relaxed">Mendaftar dan mengelola properti di Extranet Miruum <b>100% gratis</b>. Anda hanya membayar <b>komisi</b> saat mendapatkan pesanan — tanpa biaya langganan, tanpa biaya tersembunyi.</p>
          <ul class="mt-4 space-y-2">
            <li v-for="c in commission" :key="c" class="flex items-start gap-2 text-[15px] text-ink">
              <svg viewBox="0 0 24 24" class="w-5 h-5 fill-none stroke-leaf-dark shrink-0 mt-0.5" stroke-width="2.2"><path d="M20 6 9 17l-5-5"/></svg>{{ c }}
            </li>
          </ul>
          <a href="https://extranet.miruum.id/register" class="btn-brand mt-6">Mulai Sekarang — Gratis</a>
        </div>
        <div class="card p-8 bg-gradient-to-br from-brand-50 to-white">
          <div class="text-sm text-ink-muted">Contoh perhitungan</div>
          <div class="text-4xl font-extrabold text-brand mt-1">Rp 500.000<span class="text-base font-normal text-ink-faint">/malam</span></div>
          <div class="mt-4 space-y-2 text-[15px]">
            <div class="flex justify-between"><span class="text-ink-muted">Harga kamar Anda</span><b>Rp 500.000</b></div>
            <div class="flex justify-between"><span class="text-ink-muted">Komisi Miruum</span><b class="text-red-500">− Rp 60.000</b></div>
            <hr class="border-line" />
            <div class="flex justify-between text-[16px]"><span class="font-semibold">Anda terima</span><b class="text-leaf-dark">Rp 440.000</b></div>
          </div>
          <p class="text-[12px] text-ink-faint mt-3">*Ilustrasi. Komisi final mengikuti perjanjian kanal. Dana dibayarkan aman via transfer bank.</p>
        </div>
      </div>
    </section>

    <!-- Testimonials -->
    <section class="container-site mt-16">
      <h2 class="text-3xl font-display font-bold text-center mb-8">Dipercaya para mitra</h2>
      <div class="grid gap-5 sm:grid-cols-3">
        <div v-for="t in testimonials" :key="t.name" class="card p-6">
          <div class="text-brand text-lg mb-2">★★★★★</div>
          <p class="text-[15px] text-ink leading-relaxed">“{{ t.quote }}”</p>
          <div class="mt-4 flex items-center gap-3">
            <div class="w-10 h-10 rounded-full bg-brand-100 text-brand-700 grid place-items-center font-bold">{{ t.name.charAt(0) }}</div>
            <div><div class="font-bold text-[14px]">{{ t.name }}</div><div class="text-[12px] text-ink-faint">{{ t.role }}</div></div>
          </div>
        </div>
      </div>
    </section>

    <!-- FAQ -->
    <section class="container-site mt-16 max-w-3xl">
      <h2 class="text-3xl font-display font-bold text-center mb-8">Pertanyaan Umum</h2>
      <div class="space-y-3">
        <div v-for="(f,i) in faqs" :key="i" class="card overflow-hidden">
          <button @click="openFaq = openFaq === i ? -1 : i" class="w-full flex items-center justify-between p-4 text-left font-semibold">
            {{ f.q }}
            <span class="text-ink-faint text-xl transition-transform" :class="{ 'rotate-45': openFaq === i }">+</span>
          </button>
          <div v-if="openFaq === i" class="px-4 pb-4 text-[15px] text-ink-muted leading-relaxed">{{ f.a }}</div>
        </div>
      </div>
    </section>

    <!-- Final CTA -->
    <section class="container-site my-16">
      <div class="rounded-xl2 bg-gradient-to-r from-brand-600 to-brand text-white p-10 text-center">
        <h2 class="text-2xl sm:text-3xl font-display font-bold">Siap menerima tamu pertama Anda?</h2>
        <p class="mt-2 text-white/90 max-w-xl mx-auto">Daftarkan properti Anda hari ini — gratis, cepat, dan tanpa komitmen.</p>
        <a href="https://extranet.miruum.id/register" class="btn bg-white text-brand-700 hover:bg-white/90 px-7 py-3.5 mt-5 font-bold shadow-pop">Daftarkan Properti Anda →</a>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
const content = await useSiteContent()
const openFaq = ref(0)
const BENEFIT_ICONS = [
  '<svg viewBox=\'0 0 24 24\' class=\'w-6 h-6 fill-none stroke-current\' stroke-width=\'2\'><circle cx=\'12\' cy=\'12\' r=\'9\'/><path d=\'M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18\'/></svg>',
  '<svg viewBox=\'0 0 24 24\' class=\'w-6 h-6 fill-none stroke-current\' stroke-width=\'2\'><rect x=\'3\' y=\'3\' width=\'7\' height=\'7\' rx=\'1.5\'/><rect x=\'14\' y=\'3\' width=\'7\' height=\'7\' rx=\'1.5\'/><rect x=\'14\' y=\'14\' width=\'7\' height=\'7\' rx=\'1.5\'/><rect x=\'3\' y=\'14\' width=\'7\' height=\'7\' rx=\'1.5\'/></svg>',
  '<svg viewBox=\'0 0 24 24\' class=\'w-6 h-6 fill-none stroke-current\' stroke-width=\'2\'><path d=\'M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5\'/></svg>',
  '<svg viewBox=\'0 0 24 24\' class=\'w-6 h-6 fill-none stroke-current\' stroke-width=\'2\'><path d=\'M12 3l8 3v6c0 5-8 9-8 9s-8-4-8-9V6z\'/></svg>',
  '<svg viewBox=\'0 0 24 24\' class=\'w-6 h-6 fill-none stroke-current\' stroke-width=\'2\'><path d=\'M3 17l6-6 4 4 8-8M21 7v6M21 7h-6\'/></svg>',
  '<svg viewBox=\'0 0 24 24\' class=\'w-6 h-6 fill-none stroke-current\' stroke-width=\'2\'><path d=\'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z\'/></svg>',
]
const stats = computed(() => content.value.stats || [])
const benefits = computed(() => (content.value.benefits || []).map((b: any, i: number) => ({ ...b, icon: BENEFIT_ICONS[i % BENEFIT_ICONS.length] })))
const steps = computed(() => content.value.steps || [])
const commission = computed(() => content.value.commission || [])
const testimonials = computed(() => content.value.testimonials || [])
const faqs = computed(() => content.value.faqs || [])
useHead({ title: 'Daftarkan Properti Anda — Miruum untuk Mitra' })
</script>
