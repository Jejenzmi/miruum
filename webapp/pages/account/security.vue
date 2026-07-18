<template>
  <div class="container-site py-6 max-w-4xl">
    <h1 class="text-2xl font-bold mb-5">Akun Saya</h1>
    <AccountTabs active="security" />

    <div class="grid gap-5 md:grid-cols-2">
      <!-- Change password -->
      <div class="card p-5">
        <h2 class="font-bold text-lg mb-3">Ganti Kata Sandi</h2>
        <div class="space-y-3">
          <div><label class="label">Sandi Saat Ini</label><input v-model="pw.cur" type="password" class="input" /></div>
          <div><label class="label">Sandi Baru</label><input v-model="pw.next" type="password" class="input" placeholder="Min. 6 karakter" /></div>
          <button @click="changePw" :disabled="pw.busy" class="btn-brand">{{ pw.busy ? '…' : 'Perbarui Sandi' }}</button>
          <p v-if="pw.msg" :class="pw.ok ? 'text-leaf-dark' : 'text-red-600'" class="text-[13px]">{{ pw.msg }}</p>
        </div>
      </div>

      <!-- 2FA -->
      <div class="card p-5">
        <h2 class="font-bold text-lg mb-3">Verifikasi 2 Langkah (2FA)</h2>
        <label class="flex items-center justify-between cursor-pointer">
          <span class="text-[14px] text-ink-muted">Kirim kode ke email setiap login.</span>
          <input type="checkbox" :checked="twofa" @change="toggle2fa" class="accent-brand w-5 h-5" />
        </label>
        <p class="text-[13px] mt-2" :class="twofa ? 'text-leaf-dark' : 'text-ink-faint'">{{ twofa ? 'Aktif' : 'Nonaktif' }}</p>
      </div>

      <!-- Sessions -->
      <div class="card p-5 md:col-span-2">
        <div class="flex items-center justify-between mb-3">
          <h2 class="font-bold text-lg">Perangkat Aktif</h2>
          <button @click="revokeOthers" class="btn-ghost btn-sm">Keluarkan Perangkat Lain</button>
        </div>
        <div v-if="sessions.length" class="divide-y divide-line">
          <div v-for="s in sessions" :key="s.id" class="flex items-center justify-between py-3">
            <div>
              <div class="font-semibold text-[14px]">{{ s.device || s.deviceLabel || 'Perangkat' }} <span v-if="s.current" class="pill bg-leaf-soft text-leaf-dark ml-1">Ini</span></div>
              <div class="text-[12px] text-ink-faint">Terakhir aktif {{ fmtDate(s.lastUsedAt || s.createdAt) }}</div>
            </div>
            <button v-if="!s.current" @click="revoke(s.id)" class="text-red-600 text-[13px] font-semibold">Keluarkan</button>
          </div>
        </div>
        <p v-else class="text-ink-muted text-sm">Tidak ada sesi lain.</p>
      </div>

      <!-- Login history -->
      <div class="card p-5 md:col-span-2">
        <h2 class="font-bold text-lg mb-3">Riwayat Masuk</h2>
        <div v-if="history.length" class="divide-y divide-line text-[14px]">
          <div v-for="(e,i) in history.slice(0,8)" :key="i" class="flex items-center justify-between py-2.5">
            <span>{{ e.device || e.deviceLabel || 'Login' }} <span v-if="e.method" class="text-ink-faint">· {{ e.method }}</span></span>
            <span class="text-ink-faint text-[12px]">{{ fmtDate(e.createdAt, true) }}</span>
          </div>
        </div>
        <p v-else class="text-ink-muted text-sm">Belum ada riwayat.</p>
      </div>

      <!-- Data & privacy -->
      <div class="card p-5 md:col-span-2">
        <h2 class="font-bold text-lg mb-3">Data & Privasi (UU PDP)</h2>
        <div class="flex flex-wrap gap-2">
          <button @click="exportData" class="btn-ghost btn-sm">Unduh Data Saya</button>
          <button @click="askDelete" class="btn-ghost btn-sm !text-red-600 !border-red-200 hover:!bg-red-50">Hapus Akun</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ middleware: 'auth' })
const { $api } = useNuxtApp()
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
  try { await $api('/auth/change-password', { method: 'POST', body: { currentPassword: pw.cur, newPassword: pw.next } }); pw.ok = true; pw.msg = 'Sandi diperbarui.'; pw.cur = ''; pw.next = '' }
  catch (e: any) { pw.ok = false; pw.msg = e?.data?.error || 'Gagal memperbarui sandi.' }
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
  if (!confirm('Hapus akun secara permanen? Data pribadi akan dianonimkan. Ketik OK untuk lanjut.')) return
  try { await $api('/auth/delete-account', { method: 'POST', body: { confirm: 'HAPUS' } }); await logout() } catch {}
}
useHead({ title: 'Keamanan · Miruum' })
</script>
