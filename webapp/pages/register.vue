<template>
  <div class="container-site py-12 max-w-md">
    <div class="card p-7">
      <div class="flex items-center gap-2 mb-5">
        <span class="w-10 h-10 rounded-xl bg-brand grid place-items-center text-white font-display font-bold text-lg">M</span>
        <h1 class="text-2xl font-bold">Daftar</h1>
      </div>
      <form @submit.prevent="submit" class="space-y-4">
        <div><label class="label">Nama Lengkap</label><input v-model="f.name" class="input" required /></div>
        <div><label class="label">Email</label><input v-model="f.email" type="email" class="input" required /></div>
        <div><label class="label">Nomor HP</label><input v-model="f.phone" class="input" placeholder="08xxxx" /></div>
        <div><label class="label">Kata Sandi</label><input v-model="f.password" type="password" class="input" placeholder="Min. 6 karakter" required /></div>
        <p v-if="err" class="text-red-600 text-[13px]">{{ err }}</p>
        <button :disabled="loading" class="btn-brand w-full">{{ loading ? 'Memproses…' : 'Buat Akun' }}</button>
      </form>
      <p class="text-center mt-4 text-[14px] text-ink-muted">Sudah punya akun? <NuxtLink to="/login" class="text-brand-600 font-semibold">Masuk</NuxtLink></p>
    </div>
  </div>
</template>

<script setup lang="ts">
const route = useRoute()
const { register } = useAuth()
const f = reactive({ name: '', email: '', phone: '', password: '' })
const loading = ref(false); const err = ref('')

async function submit() {
  loading.value = true; err.value = ''
  try {
    await register({ name: f.name.trim(), email: f.email.trim(), password: f.password, phone: f.phone.trim() || undefined })
    await navigateTo((route.query.redirect as string) || '/')
  } catch (e: any) {
    err.value = e?.data?.error || 'Gagal mendaftar. Email mungkin sudah terpakai.'
  } finally { loading.value = false }
}
useHead({ title: 'Daftar · Miruum' })
</script>
