export const rupiah = (v: number | string | null | undefined): string => {
  const n = Number(v || 0)
  return 'Rp ' + Math.round(n).toLocaleString('id-ID')
}

export const rupiahShort = (v: number | null | undefined): string => {
  const n = Number(v || 0)
  if (n >= 1_000_000) return 'Rp ' + (n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1) + 'jt'
  if (n >= 1000) return 'Rp ' + Math.round(n / 1000) + 'rb'
  return 'Rp ' + n
}

const ID_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']
const ID_DAYS = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab']

export const fmtDate = (d: string | Date | null | undefined, withDay = false): string => {
  if (!d) return '-'
  const x = new Date(d)
  if (isNaN(+x)) return '-'
  const base = `${x.getDate()} ${ID_MONTHS[x.getMonth()]} ${x.getFullYear()}`
  return withDay ? `${ID_DAYS[x.getDay()]}, ${base}` : base
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
  if (r >= 9) return 'Istimewa'
  if (r >= 8) return 'Sangat Bagus'
  if (r >= 7) return 'Bagus'
  if (r >= 6) return 'Memuaskan'
  return 'Cukup'
}

export const PROPERTY_TYPES: Record<string, string> = {
  HOTEL: 'Hotel', VILLA: 'Villa', APARTMENT: 'Apartemen', HOMESTAY: 'Homestay',
  GUESTHOUSE: 'Guest House', HOSTEL: 'Hostel', RESORT: 'Resort',
}

export const BOARD_BASIS: Record<string, string> = {
  ROOM_ONLY: 'Tanpa Sarapan', BREAKFAST: 'Termasuk Sarapan', HALF_BOARD: 'Half Board',
  FULL_BOARD: 'Full Board', ALL_INCLUSIVE: 'All Inclusive',
}
