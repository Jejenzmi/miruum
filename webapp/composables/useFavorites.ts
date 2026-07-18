// Wishlist / favorites — mirrors the mobile "Favorit" feature.
export const useFavorites = () => {
  const { $api } = useNuxtApp()
  const { isLoggedIn } = useAuth()
  const ids = useState<string[]>('fav_ids', () => [])
  const loaded = useState<boolean>('fav_loaded', () => false)

  async function load(force = false) {
    if (!isLoggedIn.value) { ids.value = []; return }
    if (loaded.value && !force) return
    try {
      const res: any = await $api('/favorites')
      ids.value = (res.hotels || []).map((h: any) => h.id)
      loaded.value = true
    } catch { /* ignore */ }
  }

  const isFav = (id: string) => ids.value.includes(id)

  async function toggle(id: string) {
    if (!isLoggedIn.value) { navigateTo('/login?redirect=' + encodeURIComponent(useRoute().fullPath)); return }
    const on = isFav(id)
    // optimistic
    ids.value = on ? ids.value.filter((x) => x !== id) : [...ids.value, id]
    try { await $api(`/favorites/${id}`, { method: on ? 'DELETE' : 'POST', body: on ? undefined : {} }) }
    catch { ids.value = on ? [...ids.value, id] : ids.value.filter((x) => x !== id) }
  }

  return { ids, isFav, toggle, load }
}
