<template>
  <div class="container-site py-12 max-w-md">
    <div class="card p-7">
      <h1 class="text-2xl font-bold mb-2">Lupa Kata Sandi</h1>
      <p class="text-ink-muted text-sm mb-5">Reset kata sandimu dengan mudah — masukkan email akunmu, lalu isi kode yang kami kirim.</p>

      <form @submit.prevent="sent ? reset() : sendCode()" class="space-y-4">
        <div>
          <label class="label">Email terdaftar</label>
          <input v-model="email" type="email" class="input" placeholder="email@contoh.com" :disabled="sent && loading" required />
        </div>

        <template v-if="sent">
          <div>
            <label class="label">Kode reset dari email</label>
            <input v-model="code" inputmode="numeric" autocomplete="one-time-code" class="input" placeholder="Kode dari email" required />
          </div>
          <div>
            <label class="label">Kata sandi baru</label>
            <input v-model="password" :type="show ? 'text' : 'password'" class="input" placeholder="Min. 6 karakter" required />
            <button type="button" @click="show = !show" class="text-[13px] text-brand-600 mt-1">{{ show ? 'Sembunyikan' : 'Tampilkan' }} sandi</button>
          </div>
        </template>

        <p v-if="err" class="text-red-600 text-[13px]">{{ err }}</p>

        <button :disabled="loading" class="btn-brand w-full">
          {{ loading ? 'Memproses…' : (sent ? 'Reset Kata Sandi' : 'Kirim Kode') }}
        </button>
      </form>

      <button v-if="sent && !loading" type="button" @click="sendCode" class="btn-ghost btn-sm w-full mt-3">Kirim ulang kode</button>

      <p v-if="msg" class="text-leaf-dark text-[14px] mt-4 text-center">{{ msg }}</p>
      <p class="text-center mt-4 text-[14px]"><NuxtLink to="/login" class="text-brand-600">← Kembali masuk</NuxtLink></p>
    </div>
  </div>
</template>

<script setup lang="ts">
const { $api } = useNuxtApp()

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
  if (!email.value.includes('@')) { err.value = 'Masukkan email yang valid'; return }
  loading.value = true; msg.value = ''; err.value = ''
  await $api('/auth/forgot', { method: 'POST', body: { email: email.value.trim() } })
    .then(() => { sent.value = true; msg.value = 'Kode reset telah dikirim ke email Anda.' })
    .catch((e: any) => { err.value = e?.data?.error || 'Gagal mengirim kode. Coba lagi.' })
    .finally(() => { loading.value = false })
}

// Step 2 — verify the code and set the new password.
async function reset() {
  if (code.value.trim().length < 4 || password.value.length < 6) {
    err.value = 'Kode 4 digit & kata sandi baru min. 6 karakter'
    return
  }
  loading.value = true; msg.value = ''; err.value = ''
  await $api('/auth/reset', {
    method: 'POST',
    body: { email: email.value.trim(), code: code.value.trim(), password: password.value },
  })
    .then(() => {
      msg.value = 'Kata sandi berhasil diubah, silakan masuk'
      // Let the success message land before moving on.
      if (import.meta.client) setTimeout(() => navigateTo('/login'), 1200)
      else navigateTo('/login')
    })
    .catch((e: any) => { err.value = e?.data?.error || 'Kode reset salah atau kedaluwarsa' })
    .finally(() => { loading.value = false })
}

useHead({ title: 'Lupa Sandi · Miruum' })
</script>
