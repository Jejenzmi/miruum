<template>
  <div class="container-site py-6 max-w-4xl">
    <h1 class="text-2xl font-bold mb-5">{{ t('Akun Saya', 'My Account') }}</h1>
    <AccountTabs active="vouchers" />

    <!-- Referral -->
    <div v-if="referral" class="rounded-xl2 p-5 text-white bg-gradient-to-br from-brand-600 to-brand-500 mb-8">
      <div class="flex items-center justify-between">
        <div class="font-bold text-lg">{{ t('Undang Teman', 'Invite Friends') }}</div>
        <div class="text-white/80 text-[13px]">{{ referral.invited || 0 }} {{ t('diundang', 'invited') }}</div>
      </div>
      <p class="text-white/85 text-[13px] mt-1">{{ t(`Bagikan kodemu — kamu & temanmu sama-sama dapat ${referral.bonusPoints || 100} poin.`, `Share your code — you and your friend each get ${referral.bonusPoints || 100} points.`) }}</p>
      <div class="flex items-center gap-2 mt-3">
        <div class="bg-white/20 rounded-xl px-4 py-2.5 font-bold text-lg tracking-widest">{{ referral.code }}</div>
        <button @click="copyCode" class="btn bg-white text-brand-700 btn-sm">{{ copied ? t('Tersalin ✓', 'Copied ✓') : t('Salin', 'Copy') }}</button>
      </div>
      <div class="flex gap-2 mt-3">
        <input v-model="applyCode" class="input !py-2 !text-sm !bg-white/15 !border-white/20 !text-white placeholder:!text-white/60 uppercase" :placeholder="t('Punya kode teman?', 'Have a friend’s code?')" />
        <button @click="doApply" class="btn bg-white/20 text-white btn-sm">{{ t('Pakai', 'Apply') }}</button>
      </div>
      <p v-if="applyMsg" class="text-white/90 text-[13px] mt-2">{{ applyMsg }}</p>
    </div>

    <h2 class="font-bold text-lg mb-3">{{ t('Voucher Saya', 'My Vouchers') }}</h2>
    <div v-if="mine.length" class="grid sm:grid-cols-2 gap-3 mb-8">
      <div v-for="v in mine" :key="v.id" class="card p-4 flex items-center gap-3 border-brand/25">
        <div class="w-12 h-12 rounded-xl bg-brand-50 text-brand-700 grid place-items-center font-extrabold">{{ v.discountPct }}%</div>
        <div class="min-w-0"><div class="font-bold text-[14px] truncate">{{ v.title }}</div><div class="text-[12px] text-ink-faint">{{ t('Kode', 'Code') }}: {{ v.code }}</div></div>
        <svg viewBox="0 0 24 24" class="w-6 h-6 fill-leaf stroke-white ml-auto"><circle cx="12" cy="12" r="10"/><path d="m8 12 3 3 5-6" fill="none" stroke-width="2"/></svg>
      </div>
    </div>
    <p v-else class="text-ink-muted text-sm mb-8">{{ t('Belum ada voucher. Ambil voucher yang tersedia di bawah.', 'No vouchers yet. Claim an available voucher below.') }}</p>

    <h2 class="font-bold text-lg mb-3">{{ t('Voucher Tersedia', 'Available Vouchers') }}</h2>
    <div v-if="claimable.length" class="grid sm:grid-cols-2 gap-3">
      <div v-for="v in claimable" :key="v.id" class="card p-4 flex items-center gap-3">
        <div class="w-12 h-12 rounded-xl bg-brand-50 text-brand-700 grid place-items-center font-extrabold">{{ v.discountPct }}%</div>
        <div class="min-w-0 flex-1"><div class="font-bold text-[14px] truncate">{{ v.title }}</div><div class="text-[12px] text-ink-faint">{{ t('Kode', 'Code') }}: {{ v.code }}</div></div>
        <button @click="claim(v.id)" :disabled="busy===v.id" class="btn-brand btn-sm">{{ busy===v.id ? '…' : t('Ambil', 'Claim') }}</button>
      </div>
    </div>
    <p v-else class="text-ink-muted text-sm">{{ t('Belum ada voucher baru untuk diambil.', 'No new vouchers to claim right now.') }}</p>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ middleware: 'auth' })
const { t } = useLang()
const { $api } = useNuxtApp()
const { data, refresh } = await useAsyncData('vouchers', () => $api('/my-vouchers').catch(() => ({ mine: [], claimable: [] })))
const { data: refData, refresh: refRefresh } = await useAsyncData('referral', () => $api('/referral').catch(() => null))
const mine = computed<any[]>(() => (data.value as any)?.mine || [])
const claimable = computed<any[]>(() => (data.value as any)?.claimable || [])
const referral = computed<any>(() => refData.value || null)
const busy = ref<string | null>(null)
const copied = ref(false)
const applyCode = ref(''); const applyMsg = ref('')
function copyCode() { navigator.clipboard?.writeText(referral.value?.code || ''); copied.value = true; setTimeout(() => copied.value = false, 1500) }
async function doApply() {
  const code = applyCode.value.trim().toUpperCase(); if (!code) return
  try { const r: any = await $api('/referral/apply', { method: 'POST', body: { code } }); applyMsg.value = t(`Berhasil! +${r.bonus || 0} poin untukmu & temanmu.`, `Success! +${r.bonus || 0} points for you and your friend.`); applyCode.value = ''; refRefresh() }
  catch (e: any) { applyMsg.value = e?.data?.error || t('Kode tidak valid.', 'Invalid code.') }
}
async function claim(id: string) {
  busy.value = id
  try { await $api(`/promos/${id}/claim`, { method: 'POST', body: {} }); await refresh() } catch {}
  finally { busy.value = null }
}
useHead({ title: () => t('Voucher Saya · Miruum', 'My Vouchers · Miruum') })
</script>
