<template>
  <div>
    <div class="flex items-center gap-3 my-4">
      <div class="flex-1 h-px bg-line"></div>
      <span class="text-[12px] text-ink-faint">{{ t('atau', 'or') }}</span>
      <div class="flex-1 h-px bg-line"></div>
    </div>
    <div ref="btn" class="flex justify-center min-h-[44px]"></div>
    <p v-if="err" class="text-red-600 text-[13px] mt-2 text-center">{{ err }}</p>
  </div>
</template>

<script setup lang="ts">
const config = useRuntimeConfig()
const route = useRoute()
const { t } = useLang()
const { loginWithGoogle } = useAuth()
const btn = ref<HTMLElement | null>(null)
const err = ref('')

onMounted(() => {
  const cid = config.public.googleClientId
  if (!cid) return
  const init = () => {
    const g = (window as any).google
    if (!g?.accounts?.id) return
    g.accounts.id.initialize({ client_id: cid, callback: onCredential })
    g.accounts.id.renderButton(btn.value, { theme: 'outline', size: 'large', width: 320, text: 'continue_with', shape: 'pill', logo_alignment: 'center' })
  }
  if ((window as any).google?.accounts?.id) { init(); return }
  const s = document.createElement('script')
  s.src = 'https://accounts.google.com/gsi/client'
  s.async = true; s.defer = true
  s.onload = init
  document.head.appendChild(s)
})

async function onCredential(resp: any) {
  err.value = ''
  try {
    await loginWithGoogle(resp.credential)
    await navigateTo((route.query.redirect as string) || '/')
  } catch (e: any) {
    err.value = e?.data?.error || t('Login Google gagal.', 'Google sign-in failed.')
  }
}
</script>
