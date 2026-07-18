export default defineNuxtConfig({
  compatibilityDate: '2025-01-01',
  ssr: true,
  modules: ['@nuxtjs/tailwindcss'],
  css: ['~/assets/css/main.css'],
  runtimeConfig: {
    // Server-side: call the backend container directly (fast, no TLS hop).
    apiInternal: process.env.API_INTERNAL || 'http://backend:5013/api',
    public: {
      // Client-side: same-origin, proxied by nginx to the backend.
      apiBase: process.env.API_PUBLIC || '/api',
      siteUrl: process.env.SITE_URL || 'https://miruum.id',
      googleClientId: process.env.GOOGLE_CLIENT_ID || '987023196687-0dj97fungsqi4ai98mqcs92nqboghlqg.apps.googleusercontent.com',
    },
  },
  app: {
    head: {
      htmlAttrs: { lang: 'id' },
      title: 'Miruum — Booking Hotel, Paket & Aktivitas',
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'description', content: 'Miruum — pesan hotel, paket menginap, tour & transfer bandara dengan harga terbaik. Aman, cepat, tanpa ribet.' },
        { name: 'theme-color', content: '#F59331' },
        { property: 'og:title', content: 'Miruum — Booking Hotel & Aktivitas' },
        { property: 'og:type', content: 'website' },
      ],
      link: [
        { rel: 'icon', type: 'image/png', href: '/favicon.png' },
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
        { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap' },
      ],
    },
    pageTransition: { name: 'page', mode: 'out-in' },
  },
})
