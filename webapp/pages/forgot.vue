<template>
  <div class="container-site py-12 max-w-md">
    <div class="card p-7">
      <h1 class="text-2xl font-bold mb-2">Lupa Kata Sandi</h1>
      <p class="text-ink-muted text-sm mb-5">Masukkan email akunmu — kami kirim kode/tautan untuk atur ulang sandi.</p>
      <form @submit.prevent="submit" class="space-y-4">
        <div><label class="label">Email</label><input v-model="email" type="email" class="input" required /></div>
        <button :disabled="loading" class="btn-brand w-full">{{ loading ? 'Mengirim…' : 'Kirim' }}</button>
      </form>
      <p v-if="msg" class="text-leaf-dark text-[14px] mt-4 text-center">{{ msg }}</p>
      <p v-if="err" class="text-red-600 text-[14px] mt-4 text-center">{{ err }}</p>
      <p class="text-center mt-4 text-[14px]"><NuxtLink to="/login" class="text-brand-600">← Kembali masuk</NuxtLink></p>
    </div>
  </div>
</template>

<script setup lang="ts">
const { $api } = useNuxtApp()
const email = ref(''); const loading = ref(false); const msg = ref(''); const err = ref('')
async function submit() {
  loading.value = true; msg.value = ''; err.value = ''
  try { await $api('/auth/forgot', { method: 'POST', body: { email: email.value.trim() } }); msg.value = 'Jika email terdaftar, instruksi reset telah dikirim ke email kamu.' }
  catch (e: any) { err.value = e?.data?.error || 'Gagal mengirim.' }
  finally { loading.value = false }
}
useHead({ title: 'Lupa Sandi · Miruum' })
</script>
