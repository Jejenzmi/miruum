<template>
  <div class="container-site py-12 max-w-md">
    <div class="card p-7">
      <img src="/logo.png" alt="Miruum" class="h-9 w-auto mb-4" />
      <h1 class="text-2xl font-bold mb-5">{{ t('Masuk', 'Sign In') }}</h1>
      <form @submit.prevent="submit" class="space-y-4">
        <div><label class="label">{{ t('Email', 'Email') }}</label><input v-model="email" type="email" class="input" :placeholder="t('email@contoh.com', 'email@example.com')" required /></div>
        <div>
          <label class="label">{{ t('Kata Sandi', 'Password') }}</label>
          <input v-model="password" :type="show ? 'text' : 'password'" class="input" placeholder="••••••••" required />
          <button type="button" @click="show = !show" class="text-[13px] text-brand-600 mt-1">{{ show ? t('Sembunyikan sandi', 'Hide password') : t('Tampilkan sandi', 'Show password') }}</button>
        </div>
        <p v-if="err" class="text-red-600 text-[13px]">{{ err }}</p>
        <button :disabled="loading" class="btn-brand w-full">{{ loading ? t('Memproses…', 'Processing…') : t('Masuk', 'Sign In') }}</button>
      </form>
      <ClientOnly><GoogleButton /></ClientOnly>
      <div class="flex items-center justify-between mt-4 text-[14px]">
        <NuxtLink to="/forgot" class="text-brand-600 hover:underline">{{ t('Lupa sandi?', 'Forgot password?') }}</NuxtLink>
        <NuxtLink to="/register" class="text-ink-muted">{{ t('Belum punya akun?', "Don't have an account?") }} <b class="text-brand-600">{{ t('Daftar', 'Sign Up') }}</b></NuxtLink>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const route = useRoute()
const { t } = useLang()
const { login } = useAuth()
const email = ref(''); const password = ref(''); const show = ref(false)
const loading = ref(false); const err = ref('')

async function submit() {
  loading.value = true; err.value = ''
  try {
    await login(email.value.trim(), password.value)
    await navigateTo((route.query.redirect as string) || '/')
  } catch (e: any) {
    err.value = e?.data?.error || t('Email atau sandi salah.', 'Incorrect email or password.')
  } finally { loading.value = false }
}
useHead({ title: () => t('Masuk · Miruum', 'Sign In · Miruum') })
</script>
