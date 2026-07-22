// Lightweight bilingual helper, mirroring the mobile app's `tr(id, en)`.
//
// The active language lives in a cookie so SSR already renders the right
// language (no flash), and in a shared useState so every component reacts.
// Because `t()` reads `lang.value` during render, Vue re-renders any component
// that uses it the moment the language changes — no manual refresh needed.
export type MiruumLang = 'id' | 'en'

export const useLang = () => {
  const cookie = useCookie<MiruumLang>('miruum_lang', {
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 365,
    default: () => 'id',
  })
  const lang = useState<MiruumLang>('miruum_lang', () => cookie.value || 'id')
  const isEn = computed(() => lang.value === 'en')

  function setLang(v: MiruumLang) {
    lang.value = v
    cookie.value = v
  }

  /** t('teks Indonesia', 'English text') — same contract as the app's tr(). */
  const t = (id: string, en: string) => (lang.value === 'en' ? en : id)

  return { lang, isEn, setLang, t }
}
