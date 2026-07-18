<template>
  <div class="container-site py-10 max-w-3xl">
    <h1 class="text-3xl font-display font-bold mb-5">{{ content?.title || title }}</h1>
    <div class="card p-6 sm:p-8 prose-content">
      <p class="whitespace-pre-line text-[15px] text-ink-muted leading-relaxed">{{ content?.body || 'Konten belum tersedia.' }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
const route = useRoute()
const { $api } = useNuxtApp()
const slug = route.params.slug as string
const titles: Record<string, string> = { terms: 'Syarat & Ketentuan', privacy: 'Kebijakan Privasi', about: 'Tentang Miruum' }
const title = titles[slug] || 'Informasi'

const { data } = await useAsyncData(`content-${slug}`, () => $api(`/content/${slug}`).catch(() => null))
const content = computed<any>(() => (data.value as any)?.content || data.value || null)
useHead(() => ({ title: `${content.value?.title || title} · Miruum` }))
</script>
