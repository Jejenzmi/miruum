// Nationality (market) pricing — Domestik (WNI) vs Asing (WNA). Mirrors the
// mobile app. The chosen market lives in a cookie so SSR renders the matching
// prices; changing it reloads so the whole catalog re-prices from the backend.
// This is a PUBLIC marketing feature — it never touches B2B/corporate pricing.
export type Market = 'DOMESTIC' | 'FOREIGN'

export const useMarket = () => {
  const cookie = useCookie<Market | ''>('miruum_market', {
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 365,
    default: () => '',
  })
  const enabled = useState<boolean>('market_enabled', () => false)
  const market = useState<Market>('market_value', () => (cookie.value || 'DOMESTIC') as Market)
  const markup = useState<number>('market_markup', () => 0)

  function setMarket(v: Market) {
    cookie.value = v
    market.value = v
    if (import.meta.client) reloadNuxtApp({ force: true })
  }

  return { enabled, market, markup, setMarket }
}
