<template>
  <div class="container-site py-6 max-w-4xl">
    <h1 class="text-2xl font-bold mb-5">Akun Saya</h1>
    <AccountTabs active="vouchers" />

    <h2 class="font-bold text-lg mb-3">Voucher Saya</h2>
    <div v-if="mine.length" class="grid sm:grid-cols-2 gap-3 mb-8">
      <div v-for="v in mine" :key="v.id" class="card p-4 flex items-center gap-3 border-brand/25">
        <div class="w-12 h-12 rounded-xl bg-brand-50 text-brand-700 grid place-items-center font-extrabold">{{ v.discountPct }}%</div>
        <div class="min-w-0"><div class="font-bold text-[14px] truncate">{{ v.title }}</div><div class="text-[12px] text-ink-faint">Kode: {{ v.code }}</div></div>
        <svg viewBox="0 0 24 24" class="w-6 h-6 fill-leaf stroke-white ml-auto"><circle cx="12" cy="12" r="10"/><path d="m8 12 3 3 5-6" fill="none" stroke-width="2"/></svg>
      </div>
    </div>
    <p v-else class="text-ink-muted text-sm mb-8">Belum ada voucher. Ambil voucher yang tersedia di bawah.</p>

    <h2 class="font-bold text-lg mb-3">Voucher Tersedia</h2>
    <div v-if="claimable.length" class="grid sm:grid-cols-2 gap-3">
      <div v-for="v in claimable" :key="v.id" class="card p-4 flex items-center gap-3">
        <div class="w-12 h-12 rounded-xl bg-brand-50 text-brand-700 grid place-items-center font-extrabold">{{ v.discountPct }}%</div>
        <div class="min-w-0 flex-1"><div class="font-bold text-[14px] truncate">{{ v.title }}</div><div class="text-[12px] text-ink-faint">Kode: {{ v.code }}</div></div>
        <button @click="claim(v.id)" :disabled="busy===v.id" class="btn-brand btn-sm">{{ busy===v.id ? '…' : 'Ambil' }}</button>
      </div>
    </div>
    <p v-else class="text-ink-muted text-sm">Belum ada voucher baru untuk diambil.</p>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ middleware: 'auth' })
const { $api } = useNuxtApp()
const { data, refresh } = await useAsyncData('vouchers', () => $api('/my-vouchers').catch(() => ({ mine: [], claimable: [] })))
const mine = computed<any[]>(() => (data.value as any)?.mine || [])
const claimable = computed<any[]>(() => (data.value as any)?.claimable || [])
const busy = ref<string | null>(null)
async function claim(id: string) {
  busy.value = id
  try { await $api(`/promos/${id}/claim`, { method: 'POST', body: {} }); await refresh() } catch {}
  finally { busy.value = null }
}
useHead({ title: 'Voucher Saya · Miruum' })
</script>
