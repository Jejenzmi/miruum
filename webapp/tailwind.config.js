/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './components/**/*.{vue,js,ts}',
    './layouts/**/*.vue',
    './pages/**/*.vue',
    './app.vue',
    './plugins/**/*.{js,ts}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#F59331',
          50: '#FEF6EE', 100: '#FDE9D4', 200: '#FACFA6',
          500: '#F59331', 600: '#E07C17', 700: '#B8610F',
        },
        ink: { DEFAULT: '#1F2430', muted: '#5B6472', faint: '#8A93A3' },
        leaf: { DEFAULT: '#2FA84F', dark: '#1E7E38', soft: '#E8F6ED' },
        // Traveloka-style hero blue (used for hero/product tabs)
        sky: { DEFAULT: '#0770E3', 600: '#0555C4', 700: '#0442A0', 50: '#EAF3FE', 100: '#D3E6FD' },
        paper: '#F5F7FA',
        line: '#E7EAF0',
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
        display: ['Fraunces', 'Georgia', 'serif'],
      },
      boxShadow: {
        card: '0 2px 14px rgba(31,36,48,0.06)',
        cardhover: '0 10px 30px rgba(31,36,48,0.12)',
        pop: '0 12px 40px rgba(31,36,48,0.16)',
      },
      borderRadius: { xl2: '1.25rem' },
      maxWidth: { site: '1200px' },
    },
  },
  plugins: [],
}
