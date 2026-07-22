export const rupiah = (v: number | string | null | undefined): string => {
  const n = Number(v || 0)
  return 'Rp ' + Math.round(n).toLocaleString('id-ID')
}

/// Active language, read defensively so these helpers can also run outside a
/// component render without throwing. Set by `useLang()` (see composables).
const currentLang = (): 'id' | 'en' => {
  try {
    return useState<'id' | 'en'>('miruum_lang').value === 'en' ? 'en' : 'id'
  } catch {
    return 'id'
  }
}
const pick = <T>(id: T, en: T): T => (currentLang() === 'en' ? en : id)

export const rupiahShort = (v: number | null | undefined): string => {
  const n = Number(v || 0)
  if (n >= 1_000_000) return 'Rp ' + (n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1) + pick('jt', 'M')
  if (n >= 1000) return 'Rp ' + Math.round(n / 1000) + pick('rb', 'k')
  return 'Rp ' + n
}

const ID_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']
const EN_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const ID_DAYS = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab']
const EN_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export const fmtDate = (d: string | Date | null | undefined, withDay = false): string => {
  if (!d) return '-'
  const x = new Date(d)
  if (isNaN(+x)) return '-'
  const months = pick(ID_MONTHS, EN_MONTHS)
  const days = pick(ID_DAYS, EN_DAYS)
  const base = `${x.getDate()} ${months[x.getMonth()]} ${x.getFullYear()}`
  return withDay ? `${days[x.getDay()]}, ${base}` : base
}

export const isoDate = (d: Date): string => {
  const x = new Date(d)
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
}

export const nightsBetween = (a: string, b: string): number => {
  const d1 = new Date(a), d2 = new Date(b)
  return Math.max(1, Math.round((+d2 - +d1) / 86400000))
}

// Rating comes on a 0–10 scale from the API.
export const ratingLabel = (r: number): string => {
  if (r >= 9) return pick('Istimewa', 'Exceptional')
  if (r >= 8) return pick('Sangat Bagus', 'Very Good')
  if (r >= 7) return pick('Bagus', 'Good')
  if (r >= 6) return pick('Memuaskan', 'Pleasant')
  return pick('Cukup', 'Fair')
}

const PROPERTY_TYPES_ID: Record<string, string> = {
  HOTEL: 'Hotel', VILLA: 'Vila', APARTMENT: 'Apartemen', HOMESTAY: 'Homestay',
  GUESTHOUSE: 'Guest House', HOSTEL: 'Hostel', RESORT: 'Resort',
}
const PROPERTY_TYPES_EN: Record<string, string> = {
  HOTEL: 'Hotel', VILLA: 'Villa', APARTMENT: 'Apartment', HOMESTAY: 'Homestay',
  GUESTHOUSE: 'Guest House', HOSTEL: 'Hostel', RESORT: 'Resort',
}
/** Property-type labels for the active language (call it — it stays reactive). */
export const propertyTypeLabels = (): Record<string, string> => pick(PROPERTY_TYPES_ID, PROPERTY_TYPES_EN)
export const propertyTypeLabel = (k?: string | null): string => propertyTypeLabels()[k || 'HOTEL'] || 'Hotel'

const BOARD_BASIS_ID: Record<string, string> = {
  ROOM_ONLY: 'Tanpa Sarapan', BREAKFAST: 'Termasuk Sarapan', HALF_BOARD: 'Half Board',
  FULL_BOARD: 'Full Board', ALL_INCLUSIVE: 'All Inclusive',
}
const BOARD_BASIS_EN_MAP: Record<string, string> = {
  ROOM_ONLY: 'Room Only', BREAKFAST: 'Breakfast Included', HALF_BOARD: 'Half Board',
  FULL_BOARD: 'Full Board', ALL_INCLUSIVE: 'All Inclusive',
}
export const boardBasisLabel = (k?: string | null): string =>
  pick(BOARD_BASIS_ID, BOARD_BASIS_EN_MAP)[k || 'ROOM_ONLY'] || pick('Tanpa Sarapan', 'Room Only')

/**
 * Normalise an image URL for crisp rendering.
 * Unsplash serves whatever `w`/`q` you ask for, and the seeded URLs are often
 * tiny/low quality — rewrite them to the width we actually render at, q=80.
 * Any other host is returned untouched. Never returns undefined (SSR-safe).
 */
export const img = (url?: string | null, w = 800): string => {
  if (!url || typeof url !== 'string') return ''
  try {
    const u = new URL(url)
    if (!/(^|\.)unsplash\.com$/.test(u.hostname)) return url
    u.searchParams.set('w', String(w))
    u.searchParams.set('q', '80')
    if (!u.searchParams.has('auto')) u.searchParams.set('auto', 'format')
    if (!u.searchParams.has('fit')) u.searchParams.set('fit', 'crop')
    return u.toString()
  } catch {
    return url
  }
}

// Kept for existing callers (Indonesian map). Prefer propertyTypes()/boardBasisLabel().
export const PROPERTY_TYPES = PROPERTY_TYPES_ID
export const BOARD_BASIS = BOARD_BASIS_ID
