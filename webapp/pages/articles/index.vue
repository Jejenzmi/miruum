<template>
  <div class="container-site py-8">
    <h1 class="text-3xl font-display font-bold mb-1">{{ t('Artikel & Inspirasi', 'Articles & Inspiration') }}</h1>
    <p class="text-ink-muted mb-6">{{ t('Tips perjalanan, panduan destinasi, dan inspirasi liburanmu berikutnya.', 'Travel tips, destination guides, and inspiration for your next holiday.') }}</p>

    <div v-if="articles.length" class="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      <NuxtLink v-for="a in articles" :key="a.id" :to="`/articles/${a.slug}`" class="group card overflow-hidden hover:shadow-cardhover hover:-translate-y-0.5 transition-all">
        <div class="aspect-[16/10] bg-line overflow-hidden">
          <img :src="a.coverImage" :alt="a.title" loading="lazy" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
        </div>
        <div class="p-4">
          <span class="pill bg-brand-50 text-brand-700 mb-2">{{ a.category }}</span>
          <h3 class="font-bold text-[16px] leading-snug line-clamp-2 group-hover:text-brand-600">{{ a.title }}</h3>
          <p class="text-[13.5px] text-ink-muted line-clamp-2 mt-1">{{ a.excerpt }}</p>
          <div class="text-[12px] text-ink-faint mt-2">{{ fmtDate(a.publishedAt) }}</div>
        </div>
      </NuxtLink>
    </div>
    <div v-else class="card p-12 text-center text-ink-muted">{{ t('Belum ada artikel.', 'No articles yet.') }}</div>
  </div>
</template>

<script setup lang="ts">
const { t } = useLang()
const { $api } = useNuxtApp()
const { data } = await useAsyncData('articles', () => $api('/articles').catch(() => ({ articles: [] })))
const articles = computed<any[]>(() => (data.value as any)?.articles || [])
useHead({ title: () => t('Artikel & Inspirasi · Miruum', 'Articles & Inspiration · Miruum') })
</script>
