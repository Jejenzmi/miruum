<template>
  <div class="container-site py-10 max-w-3xl">
    <h1 class="text-3xl font-display font-bold mb-5">{{ content?.title || title }}</h1>
    <div class="card p-6 sm:p-8 prose-content">
      <p class="whitespace-pre-line text-[15px] text-ink-muted leading-relaxed">{{ content?.body || t('Konten belum tersedia.', 'Content is not available yet.') }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
const { t } = useLang()
const route = useRoute()
const { $api } = useNuxtApp()
const slug = route.params.slug as string
const title = computed(() => {
  const titles: Record<string, string> = {
    terms: t('Syarat & Ketentuan', 'Terms & Conditions'),
    privacy: t('Kebijakan Privasi', 'Privacy Policy'),
    about: t('Tentang Miruum', 'About Miruum'),
  }
  return titles[slug] || t('Informasi', 'Information')
})

const { data } = await useAsyncData(`content-${slug}`, () => $api(`/content/${slug}`).catch(() => null))
const content = computed<any>(() => (data.value as any)?.content || data.value || null)
useHead(() => ({ title: `${content.value?.title || title.value} · Miruum` }))
</script>
