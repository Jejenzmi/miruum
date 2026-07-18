// $api = an $fetch instance that talks to the SAME backend the mobile app uses.
// On the server it hits the backend container directly; on the client it hits
// the same-origin /api path (proxied by nginx). Auth token rides in a cookie.
export default defineNuxtPlugin(() => {
  const config = useRuntimeConfig()
  const token = useCookie<string | null>('miruum_token', { sameSite: 'lax', maxAge: 60 * 60 * 24 * 30 })

  const api = $fetch.create({
    baseURL: import.meta.server ? config.apiInternal : config.public.apiBase,
    onRequest({ options }) {
      if (token.value) {
        const h = new Headers(options.headers as any)
        h.set('Authorization', `Bearer ${token.value}`)
        options.headers = h
      }
    },
  })

  return { provide: { api } }
})
