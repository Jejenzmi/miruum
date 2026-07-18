// Compare hotels — mirrors the mobile "Bandingkan" feature. Stored client-side.
export const useCompare = () => {
  const items = useState<any[]>('compare_items', () => [])
  const has = (id: string) => items.value.some((h) => h.id === id)
  function toggle(hotel: any) {
    if (has(hotel.id)) items.value = items.value.filter((h) => h.id !== hotel.id)
    else if (items.value.length < 4) items.value = [...items.value, hotel]
  }
  function remove(id: string) { items.value = items.value.filter((h) => h.id !== id) }
  function clear() { items.value = [] }
  return { items, has, toggle, remove, clear }
}
