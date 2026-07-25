// Fetch nationality-pricing status once (SSR-first, so the header renders the
// selector without a flash). The backend resolves the IP-default market using
// the forwarded client IP (see plugins/api.ts). Runs after the api plugin.
export default defineNuxtPlugin(async (nuxtApp) => {
  const api = nuxtApp.$api as (typeof $fetch)
  const cookie = useCookie<string>('miruum_market', { sameSite: 'lax', maxAge: 60 * 60 * 24 * 365 })
  const enabled = useState<boolean>('market_enabled', () => false)
  const market = useState<'DOMESTIC' | 'FOREIGN'>('market_value', () => (cookie.value as any) || 'DOMESTIC')
  const markup = useState<number>('market_markup', () => 0)
  try {
    const r: any = await api('/market')
    enabled.value = !!r.enabled
    markup.value = Number(r.markup) || 0
    // No explicit choice yet → adopt the IP-resolved default.
    if (!cookie.value) market.value = (r.market === 'FOREIGN' ? 'FOREIGN' : 'DOMESTIC')
  } catch { /* market pricing off / backend unreachable → stay domestic */ }
})
