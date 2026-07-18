// Auth state shared across SSR + client. Token is a cookie (so SSR is signed-in
// too); user profile is fetched from /auth/me.
export interface MiruumUser {
  id: string; name: string; email: string; phone?: string;
  photoUrl?: string; avatarUrl?: string; loyaltyPoints?: number; role?: string;
}

export const useAuth = () => {
  const { $api } = useNuxtApp()
  const token = useCookie<string | null>('miruum_token', { sameSite: 'lax', maxAge: 60 * 60 * 24 * 30 })
  const user = useState<MiruumUser | null>('auth_user', () => null)
  const isLoggedIn = computed(() => !!token.value)

  async function fetchMe() {
    if (!token.value) { user.value = null; return null }
    try {
      const res: any = await $api('/auth/me')
      user.value = res.user || res
      return user.value
    } catch { token.value = null; user.value = null; return null }
  }

  async function login(email: string, password: string) {
    const res: any = await $api('/auth/login', { method: 'POST', body: { email, password } })
    token.value = res.token
    user.value = res.user
    return res
  }

  async function register(payload: { name: string; email: string; password: string; phone?: string }) {
    const res: any = await $api('/auth/register', { method: 'POST', body: payload })
    token.value = res.token
    user.value = res.user
    return res
  }

  async function loginWithGoogle(idToken: string) {
    const res: any = await $api('/auth/google', { method: 'POST', body: { idToken } })
    token.value = res.token
    user.value = res.user
    return res
  }

  async function logout() {
    try { await $api('/auth/logout', { method: 'POST', body: {} }) } catch {}
    token.value = null
    user.value = null
    await navigateTo('/')
  }

  return { token, user, isLoggedIn, fetchMe, login, register, loginWithGoogle, logout }
}
