<template>
  <div class="container-site py-6 max-w-4xl">
    <h1 class="text-2xl font-bold mb-5">{{ t('Akun Saya', 'My Account') }}</h1>
    <AccountTabs active="security" />

    <div class="grid gap-5 md:grid-cols-2">
      <!-- Change password -->
      <div class="card p-5">
        <h2 class="font-bold text-lg mb-3">{{ t('Ganti Kata Sandi', 'Change Password') }}</h2>
        <div class="space-y-3">
          <div><label class="label">{{ t('Sandi Saat Ini', 'Current Password') }}</label><input v-model="pw.cur" type="password" class="input" /></div>
          <div><label class="label">{{ t('Sandi Baru', 'New Password') }}</label><input v-model="pw.next" type="password" class="input" :placeholder="t('Min. 6 karakter', 'Min. 6 characters')" /></div>
          <button @click="changePw" :disabled="pw.busy" class="btn-brand">{{ pw.busy ? '…' : t('Perbarui Sandi', 'Update Password') }}</button>
          <p v-if="pw.msg" :class="pw.ok ? 'text-leaf-dark' : 'text-red-600'" class="text-[13px]">{{ pw.msg }}</p>
        </div>
      </div>

      <!-- 2FA -->
      <div class="card p-5">
        <h2 class="font-bold text-lg mb-3">{{ t('Verifikasi 2 Langkah (2FA)', 'Two-Step Verification (2FA)') }}</h2>
        <label class="flex items-center justify-between cursor-pointer">
          <span class="text-[14px] text-ink-muted">{{ t('Kirim kode ke email setiap login.', 'Send a code to your email on every sign-in.') }}</span>
          <input type="checkbox" :checked="twofa" @change="toggle2fa" class="accent-brand w-5 h-5" />
        </label>
        <p class="text-[13px] mt-2" :class="twofa ? 'text-leaf-dark' : 'text-ink-faint'">{{ twofa ? t('Aktif', 'Active') : t('Nonaktif', 'Inactive') }}</p>
      </div>

      <!-- Sessions -->
      <div class="card p-5 md:col-span-2">
        <div class="flex items-center justify-between mb-3">
          <h2 class="font-bold text-lg">{{ t('Perangkat Aktif', 'Active Devices') }}</h2>
          <button @click="revokeOthers" class="btn-ghost btn-sm">{{ t('Keluarkan Perangkat Lain', 'Sign Out Other Devices') }}</button>
        </div>
        <div v-if="sessions.length" class="divide-y divide-line">
          <div v-for="s in sessions" :key="s.id" class="flex items-center justify-between py-3">
            <div>
              <div class="font-semibold text-[14px]">{{ s.device || s.deviceLabel || t('Perangkat', 'Device') }} <span v-if="s.current" class="pill bg-leaf-soft text-leaf-dark ml-1">{{ t('Ini', 'This') }}</span></div>
              <div class="text-[12px] text-ink-faint">{{ t('Terakhir aktif', 'Last active') }} {{ fmtDate(s.lastUsedAt || s.createdAt) }}</div>
            </div>
            <button v-if="!s.current" @click="revoke(s.id)" class="text-red-600 text-[13px] font-semibold">{{ t('Keluarkan', 'Sign Out') }}</button>
          </div>
        </div>
        <p v-else class="text-ink-muted text-sm">{{ t('Tidak ada sesi lain.', 'No other sessions.') }}</p>
      </div>

      <!-- Login history -->
      <div class="card p-5 md:col-span-2">
        <h2 class="font-bold text-lg mb-3">{{ t('Riwayat Masuk', 'Sign-In History') }}</h2>
        <div v-if="history.length" class="divide-y divide-line text-[14px]">
          <div v-for="(e,i) in history.slice(0,8)" :key="i" class="flex items-center justify-between py-2.5">
            <span>{{ e.device || e.deviceLabel || t('Login', 'Login') }} <span v-if="e.method" class="text-ink-faint">· {{ e.method }}</span></span>
            <span class="text-ink-faint text-[12px]">{{ fmtDate(e.createdAt, true) }}</span>
          </div>
        </div>
        <p v-else class="text-ink-muted text-sm">{{ t('Belum ada riwayat.', 'No history yet.') }}</p>
      </div>

      <!-- Data & privacy -->
      <div class="card p-5 md:col-span-2">
        <h2 class="font-bold text-lg mb-3">{{ t('Data & Privasi (UU PDP)', 'Data & Privacy (PDP Law)') }}</h2>
        <div class="flex flex-wrap gap-2">
          <button @click="exportData" class="btn-ghost btn-sm">{{ t('Unduh Data Saya', 'Download My Data') }}</button>
          <button @click="askDelete" class="btn-ghost btn-sm !text-red-600 !border-red-200 hover:!bg-red-50">{{ t('Hapus Akun', 'Delete Account') }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ middleware: 'auth' })
const { $api } = useNuxtApp()
const { t } = useLang()
const { logout } = useAuth()

const [{ data: fa }, { data: se }, { data: hi }] = await Promise.all([
  useAsyncData('2fa', () => $api('/auth/2fa').catch(() => ({ enabled: false }))),
  useAsyncData('sessions', () => $api('/auth/sessions/current', { method: 'POST', body: {} }).catch(() => ({ sessions: [] }))),
  useAsyncData('history', () => $api('/auth/login-history').catch(() => ({ events: [] }))),
])
const twofa = ref<boolean>(!!(fa.value as any)?.enabled)
const sessions = ref<any[]>((se.value as any)?.sessions || [])
const history = computed<any[]>(() => (hi.value as any)?.events || [])

const pw = reactive({ cur: '', next: '', busy: false, msg: '', ok: false })
async function changePw() {
  pw.busy = true; pw.msg = ''
  try { await $api('/auth/change-password', { method: 'POST', body: { currentPassword: pw.cur, newPassword: pw.next } }); pw.ok = true; pw.msg = t('Sandi diperbarui.', 'Password updated.'); pw.cur = ''; pw.next = '' }
  catch (e: any) { pw.ok = false; pw.msg = e?.data?.error || t('Gagal memperbarui sandi.', 'Failed to update password.') }
  finally { pw.busy = false }
}
async function toggle2fa() {
  try { const r: any = await $api('/auth/2fa', { method: 'POST', body: { enable: !twofa.value } }); twofa.value = !!r.enabled } catch {}
}
async function revoke(id: string) { try { await $api(`/auth/sessions/${id}/revoke`, { method: 'POST', body: {} }); sessions.value = sessions.value.filter((s) => s.id !== id) } catch {} }
async function revokeOthers() { try { await $api('/auth/sessions/revoke-others', { method: 'POST', body: {} }); sessions.value = sessions.value.filter((s) => s.current) } catch {} }
async function exportData() {
  try { const d = await $api('/auth/export'); const blob = new Blob([JSON.stringify(d, null, 2)], { type: 'application/json' }); const u = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = u; a.download = 'data-miruum.json'; a.click(); URL.revokeObjectURL(u) } catch {}
}
async function askDelete() {
  if (!confirm(t('Hapus akun secara permanen? Data pribadi akan dianonimkan. Ketik OK untuk lanjut.', 'Permanently delete your account? Your personal data will be anonymized. Click OK to continue.'))) return
  try { await $api('/auth/delete-account', { method: 'POST', body: { confirm: 'HAPUS' } }); await logout() } catch {}
}
useHead({ title: () => t('Keamanan · Miruum', 'Security · Miruum') })
</script>
