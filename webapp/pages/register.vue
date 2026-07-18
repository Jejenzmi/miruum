<template>
  <div class="container-site py-12 max-w-md">
    <div class="card p-7">
      <img src="/logo.png" alt="Miruum" class="h-9 w-auto mb-4" />
      <h1 class="text-2xl font-bold mb-5">Daftar</h1>
      <form @submit.prevent="submit" class="space-y-4">
        <div><label class="label">Nama Lengkap</label><input v-model="f.name" class="input" required /></div>
        <div><label class="label">Email</label><input v-model="f.email" type="email" class="input" required /></div>
        <div><label class="label">Nomor HP</label><input v-model="f.phone" class="input" placeholder="08xxxx" /></div>
        <div><label class="label">Kata Sandi</label><input v-model="f.password" type="password" class="input" placeholder="Min. 6 karakter" required /></div>
        <p v-if="err" class="text-red-600 text-[13px]">{{ err }}</p>
        <button :disabled="loading" class="btn-brand w-full">{{ loading ? 'Memproses…' : 'Buat Akun' }}</button>
      </form>
      <ClientOnly><GoogleButton /></ClientOnly>
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
