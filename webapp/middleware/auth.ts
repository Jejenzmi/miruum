export default defineNuxtRouteMiddleware((to) => {
  const token = useCookie('miruum_token')
  if (!token.value) {
    return navigateTo(`/login?redirect=${encodeURIComponent(to.fullPath)}`)
  }
})
