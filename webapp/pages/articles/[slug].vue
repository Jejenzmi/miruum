<template>
  <article v-if="a" class="pb-10">
    <div class="relative h-[280px] sm:h-[400px] bg-line">
      <img :src="a.coverImage" :alt="a.title" class="w-full h-full object-cover" />
      <div class="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent"></div>
      <div class="absolute bottom-0 w-full">
        <div class="container-site pb-6 text-white">
          <span class="pill bg-brand text-white mb-2">{{ a.category }}</span>
          <h1 class="text-2xl sm:text-4xl font-display font-bold max-w-3xl leading-tight">{{ a.title }}</h1>
          <div class="text-white/80 text-[13px] mt-2">{{ fmtDate(a.publishedAt, true) }}</div>
        </div>
      </div>
    </div>

    <div class="container-site max-w-3xl mt-8">
      <p class="text-[17px] text-ink-muted font-medium leading-relaxed mb-6">{{ a.excerpt }}</p>
      <div class="text-[16px] text-ink leading-[1.8] whitespace-pre-line">{{ a.body }}</div>

      <div class="mt-10 card p-6 bg-brand-50 border-brand-100 flex flex-col sm:flex-row items-center gap-4">
        <div class="flex-1 text-center sm:text-left">
          <div class="font-bold text-lg">Siap liburan?</div>
          <div class="text-ink-muted text-sm">Temukan hotel terbaik dengan harga termurah di Miruum.</div>
        </div>
        <NuxtLink to="/search" class="btn-brand shrink-0">Cari Hotel</NuxtLink>
      </div>

      <NuxtLink to="/articles" class="inline-block mt-8 text-brand-600 font-semibold hover:underline">← Semua Artikel</NuxtLink>
    </div>
  </article>
  <div v-else class="container-site py-24 text-center text-ink-muted">Artikel tidak ditemukan.</div>
</template>

<script setup lang="ts">
const route = useRoute()
const { $api } = useNuxtApp()
const slug = route.params.slug as string
const { data } = await useAsyncData(`article-${slug}`, () => $api(`/articles/${slug}`).catch(() => null))
const a = computed<any>(() => (data.value as any)?.article || null)
useHead(() => ({
  title: a.value ? `${a.value.title} · Miruum` : 'Artikel · Miruum',
  meta: a.value ? [{ name: 'description', content: a.value.excerpt }, { property: 'og:image', content: a.value.coverImage }] : [],
}))
</script>
