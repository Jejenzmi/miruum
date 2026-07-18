// Admin-managed marketing copy for the customer web (Back Office → Konten Web).
// Falls back to server defaults; never hardcoded in the page.
export const useSiteContent = async () => {
  const { $api } = useNuxtApp()
  const { data } = await useAsyncData('site-content', () => $api('/site-content').catch(() => ({ content: {} })))
  return computed<any>(() => (data.value as any)?.content || {})
}
