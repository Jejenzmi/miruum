// $api = an $fetch instance that talks to the SAME backend the mobile app uses.
// On the server it hits the backend container directly; on the client it hits
// the same-origin /api path (proxied by nginx). Auth token rides in a cookie.
export default defineNuxtPlugin(() => {
  const config = useRuntimeConfig()
  const token = useCookie<string | null>('miruum_token', { sameSite: 'lax', maxAge: 60 * 60 * 24 * 30 })
  const market = useCookie<string | null>('miruum_market', { sameSite: 'lax', maxAge: 60 * 60 * 24 * 365 })
  // On SSR, forward the real client IP so nationality (market) pricing can default
  // from the browser's country instead of the Nuxt container's private IP.
  const fwd = import.meta.server ? useRequestHeaders(['x-forwarded-for', 'x-real-ip']) : {}

  const api = $fetch.create({
    baseURL: import.meta.server ? config.apiInternal : config.public.apiBase,
    onRequest({ options }) {
      const h = new Headers(options.headers as any)
      if (token.value) h.set('Authorization', `Bearer ${token.value}`)
      // Explicit guest-market choice (Domestik/Asing) rides on every request.
      if (market.value) h.set('X-Market', market.value)
      if (import.meta.server) {
        const xff = (fwd as any)['x-forwarded-for'] || (fwd as any)['x-real-ip']
        if (xff) h.set('x-forwarded-for', xff)
      }
      options.headers = h
    },
  })

  return { provide: { api } }
})
