// Loads admin-managed translation overrides once (SSR) into a shared useState,
// so useLang().t() can substitute terms by source phrase without a per-render
// fetch. Overrides map: { "<source ID phrase>": { id, en } }.
export default defineNuxtPlugin(async (nuxtApp) => {
  const overrides = useState<Record<string, { id: string; en: string }>>('miruum_i18n', () => ({}))
  // Only fetch on the server render; the payload ships to the client via Nuxt
  // state hydration, so no extra client request is needed.
  if (import.meta.server && Object.keys(overrides.value).length === 0) {
    try {
      const api = nuxtApp.$api as typeof $fetch
      const r = await api<{ overrides: Record<string, { id: string; en: string }> }>('/i18n')
      overrides.value = r?.overrides || {}
    } catch (_) {
      overrides.value = {}
    }
  }
})
