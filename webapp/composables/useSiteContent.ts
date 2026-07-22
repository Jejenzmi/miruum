// Admin-managed marketing copy for the customer web (Back Office → Konten Web).
// Falls back to server defaults; never hardcoded in the page.
//
// Values coming back from `/api/site-content` are EITHER a plain string (legacy)
// or a bilingual object `{ id, en }`. `pickLang()` normalises both shapes so the
// page always renders a plain string in the active language.
import type { MiruumLang } from './useLang'

/** Bilingual value as stored by the Back Office. */
export type LocalizedText = string | { id?: string | null; en?: string | null } | null | undefined

const str = (v: any) => (typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim())

/**
 * Pure resolver: `{ id, en }` → the string for `lang` (falling back to the other
 * language when that side is blank); plain string → itself; anything else → ''.
 */
export const pickLang = (value: LocalizedText, lang: MiruumLang): string => {
  if (value == null) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'object') {
    const id = str((value as any).id)
    const en = str((value as any).en)
    return lang === 'en' ? en || id : id || en
  }
  return str(value)
}

/** Raw site-content object (legacy shape — existing callers keep working). */
export const useSiteContent = async () => {
  const { $api } = useNuxtApp()
  const { data } = await useAsyncData('site-content', () => $api('/site-content').catch(() => ({ content: {} })))
  return computed<any>(() => (data.value as any)?.content || {})
}

/**
 * Language-aware access to the admin-managed copy.
 *
 *   const { content, sc, resolveL } = await useSiteCopy()
 *   sc('trustStrip', 'Konfirmasi instan…', 'Instant confirmation…')
 *   resolveL(feature.t)                       // nested values inside arrays
 *
 * `sc()` and `resolveL()` read `lang.value`, so switching the language
 * re-renders every component that calls them from a template or computed.
 */
export const useSiteCopy = async () => {
  // NOTE: every Nuxt composable must be called BEFORE the first `await` —
  // after an await the Nuxt instance context is gone and useState/useCookie
  // throw "[nuxt] instance unavailable" (which 500s SSR).
  const { lang } = useLang()
  const content = await useSiteContent()

  /** Resolve any nested bilingual value (e.g. `features[].t`). */
  const resolveL = (value: LocalizedText): string => pickLang(value, lang.value)

  /**
   * Resolve a top-level site-content key, falling back to the hardcoded
   * literal when the key is missing or blank on both sides.
   */
  const sc = (key: string, fallbackId: string, fallbackEn?: string): string => {
    const resolved = resolveL((content.value || {})[key])
    if (resolved) return resolved
    return lang.value === 'en' ? (fallbackEn ?? fallbackId) : fallbackId
  }

  return { content, sc, resolveL }
}
