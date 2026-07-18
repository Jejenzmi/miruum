<template>
  <div class="container-site py-6 max-w-4xl">
    <h1 class="text-2xl font-bold mb-5">Akun Saya</h1>
    <AccountTabs active="profile" />

    <div class="grid sm:grid-cols-[220px_1fr] gap-6">
      <div class="card p-5 text-center h-fit">
        <div class="w-20 h-20 rounded-full bg-brand-100 text-brand-700 grid place-items-center text-2xl font-bold mx-auto overflow-hidden">
          <img v-if="avatar" :src="avatar" class="w-full h-full object-cover" alt="" />
          <span v-else>{{ (user?.name || 'U').charAt(0).toUpperCase() }}</span>
        </div>
        <div class="font-bold mt-3">{{ user?.name }}</div>
        <div class="text-[13px] text-ink-faint">{{ user?.email }}</div>
        <button @click="logout" class="btn-ghost btn-sm w-full mt-4 !text-red-600 !border-red-200 hover:!bg-red-50">Keluar</button>
      </div>

      <div class="card p-5">
        <h2 class="font-bold text-lg mb-3">Data Pribadi</h2>
        <div class="grid sm:grid-cols-2 gap-3">
          <div><label class="label">Nama</label><input v-model="f.name" class="input" /></div>
          <div><label class="label">Nomor HP</label><input v-model="f.phone" class="input" /></div>
          <div class="sm:col-span-2"><label class="label">Email</label><input :value="user?.email" class="input bg-paper" disabled /></div>
        </div>
        <button @click="save" :disabled="saving" class="btn-brand mt-4">{{ saving ? 'Menyimpan…' : 'Simpan Perubahan' }}</button>
        <p v-if="msg" class="text-leaf-dark text-[14px] mt-2">{{ msg }}</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ middleware: 'auth' })
const { $api } = useNuxtApp()
const { user, logout, fetchMe } = useAuth()
const avatar = computed(() => user.value?.photoUrl || user.value?.avatarUrl || '')
const f = reactive({ name: user.value?.name || '', phone: user.value?.phone || '' })
watchEffect(() => { if (user.value) { f.name ||= user.value.name; f.phone ||= user.value.phone || '' } })

const saving = ref(false); const msg = ref('')
async function save() {
  saving.value = true; msg.value = ''
  try { await $api('/auth/me', { method: 'PUT', body: { name: f.name.trim(), phone: f.phone.trim() } }); await fetchMe(); msg.value = 'Tersimpan.' }
  catch { msg.value = 'Gagal menyimpan.' }
  finally { saving.value = false }
}
useHead({ title: 'Akun Saya · Miruum' })
</script>
