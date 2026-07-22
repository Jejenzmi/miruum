<template>
  <div class="container-site py-12 max-w-md">
    <div class="card p-7">
      <h1 class="text-2xl font-bold mb-2">{{ t('Lupa Kata Sandi', 'Forgot Password') }}</h1>
      <p class="text-ink-muted text-sm mb-5">{{ t('Reset kata sandimu dengan mudah — masukkan email akunmu, lalu isi kode yang kami kirim.', 'Reset your password easily — enter your account email, then fill in the code we send you.') }}</p>

      <form @submit.prevent="sent ? reset() : sendCode()" class="space-y-4">
        <div>
          <label class="label">{{ t('Email terdaftar', 'Registered email') }}</label>
          <input v-model="email" type="email" class="input" :placeholder="t('email@contoh.com', 'email@example.com')" :disabled="sent && loading" required />
        </div>

        <template v-if="sent">
          <div>
            <label class="label">{{ t('Kode reset dari email', 'Reset code from email') }}</label>
            <input v-model="code" inputmode="numeric" autocomplete="one-time-code" class="input" :placeholder="t('Kode dari email', 'Code from email')" required />
          </div>
          <div>
            <label class="label">{{ t('Kata sandi baru', 'New password') }}</label>
            <input v-model="password" :type="show ? 'text' : 'password'" class="input" :placeholder="t('Min. 6 karakter', 'Min. 6 characters')" required />
            <button type="button" @click="show = !show" class="text-[13px] text-brand-600 mt-1">{{ show ? t('Sembunyikan sandi', 'Hide password') : t('Tampilkan sandi', 'Show password') }}</button>
          </div>
        </template>

        <p v-if="err" class="text-red-600 text-[13px]">{{ err }}</p>

        <button :disabled="loading" class="btn-brand w-full">
          {{ loading ? t('Memproses…', 'Processing…') : (sent ? t('Reset Kata Sandi', 'Reset Password') : t('Kirim Kode', 'Send Code')) }}
        </button>
      </form>

      <button v-if="sent && !loading" type="button" @click="sendCode" class="btn-ghost btn-sm w-full mt-3">{{ t('Kirim ulang kode', 'Resend code') }}</button>

      <p v-if="msg" class="text-leaf-dark text-[14px] mt-4 text-center">{{ msg }}</p>
      <p class="text-center mt-4 text-[14px]"><NuxtLink to="/login" class="text-brand-600">{{ t('← Kembali masuk', '← Back to sign in') }}</NuxtLink></p>
    </div>
  </div>
</template>

<script setup lang="ts">
const { $api } = useNuxtApp()
const { t } = useLang()

const email = ref('')
const code = ref('')
const password = ref('')
const show = ref(false)
const sent = ref(false)
const loading = ref(false)
const msg = ref('')
const err = ref('')

// Step 1 — request a reset code by email.
async function sendCode() {
  if (!email.value.includes('@')) { err.value = t('Masukkan email yang valid', 'Enter a valid email'); return }
  loading.value = true; msg.value = ''; err.value = ''
  await $api('/auth/forgot', { method: 'POST', body: { email: email.value.trim() } })
    .then(() => { sent.value = true; msg.value = t('Kode reset telah dikirim ke email Anda.', 'A reset code has been sent to your email.') })
    .catch((e: any) => { err.value = e?.data?.error || t('Gagal mengirim kode. Coba lagi.', 'Failed to send the code. Please try again.') })
    .finally(() => { loading.value = false })
}

// Step 2 — verify the code and set the new password.
async function reset() {
  if (code.value.trim().length < 4 || password.value.length < 6) {
    err.value = t('Kode 4 digit & kata sandi baru min. 6 karakter', '4-digit code & new password of at least 6 characters')
    return
  }
  loading.value = true; msg.value = ''; err.value = ''
  await $api('/auth/reset', {
    method: 'POST',
    body: { email: email.value.trim(), code: code.value.trim(), password: password.value },
  })
    .then(() => {
      msg.value = t('Kata sandi berhasil diubah, silakan masuk', 'Password changed successfully, please sign in')
      // Let the success message land before moving on.
      if (import.meta.client) setTimeout(() => navigateTo('/login'), 1200)
      else navigateTo('/login')
    })
    .catch((e: any) => { err.value = e?.data?.error || t('Kode reset salah atau kedaluwarsa', 'The reset code is wrong or has expired') })
    .finally(() => { loading.value = false })
}

useHead({ title: () => t('Lupa Sandi · Miruum', 'Forgot Password · Miruum') })
</script>
