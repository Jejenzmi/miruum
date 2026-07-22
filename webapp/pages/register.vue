<template>
  <div class="container-site py-12 max-w-md">
    <!-- Step 1 — create the account -->
    <div v-if="!otpStep" class="card p-7">
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

    <!-- Step 2 — verify the 4-digit OTP -->
    <div v-else class="card p-7">
      <img src="/logo.png" alt="Miruum" class="h-9 w-auto mb-4" />
      <h1 class="text-2xl font-bold mb-2">Cek Email Anda</h1>
      <p class="text-ink-muted text-[13px]">Masukan 4 digit kode yang dikirim ke email {{ f.email }}</p>

      <p v-if="devCode" class="text-brand-600 text-[12px] font-semibold mt-2">Kode Anda: {{ devCode }}</p>
      <button v-else type="button" @click="requestOtp" :disabled="sending" class="text-brand-600 text-[12px] font-semibold mt-2">
        {{ sending ? 'Mengirim…' : 'Kirim ulang kode' }}
      </button>

      <form @submit.prevent="confirm" class="mt-6">
        <div class="flex justify-between gap-2">
          <input
            v-for="(d, i) in digits"
            :key="i"
            :ref="(el) => setBoxRef(el, i)"
            v-model="digits[i]"
            inputmode="numeric"
            maxlength="1"
            autocomplete="one-time-code"
            class="input !w-14 h-14 !px-0 text-center text-xl font-bold"
            @input="onInput(i, $event)"
            @keydown="onKeydown(i, $event)"
            @paste="onPaste($event)"
          />
        </div>
        <p v-if="otpErr" class="text-red-600 text-[13px] mt-3">{{ otpErr }}</p>
        <button :disabled="verifying" class="btn-brand w-full mt-6">{{ verifying ? 'Memproses…' : 'Konfirmasi' }}</button>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
const route = useRoute()
const { $api } = useNuxtApp()
const { register } = useAuth()

const f = reactive({ name: '', email: '', phone: '', password: '' })
const loading = ref(false); const err = ref('')

// OTP step state (mirrors the mobile OtpScreen).
const otpStep = ref(false)
const digits = ref<string[]>(['', '', '', ''])
const boxes = ref<HTMLInputElement[]>([])
const devCode = ref('')
const sending = ref(false)
const verifying = ref(false)
const otpErr = ref('')

function setBoxRef(el: any, i: number) { if (el) boxes.value[i] = el as HTMLInputElement }

async function submit() {
  loading.value = true; err.value = ''
  try {
    await register({ name: f.name.trim(), email: f.email.trim(), password: f.password, phone: f.phone.trim() || undefined })
  } catch (e: any) {
    err.value = e?.data?.error || 'Gagal mendaftar. Email mungkin sudah terpakai.'
    loading.value = false
    return
  }
  loading.value = false
  // Registered + signed-in — now verify with an OTP before entering the app.
  otpStep.value = true
  await requestOtp()
  await nextTick()
  boxes.value[0]?.focus()
}

async function requestOtp() {
  sending.value = true; otpErr.value = ''
  const res: any = await $api('/auth/otp/request', { method: 'POST', body: {} }).catch(() => null)
  if (res?.devCode) devCode.value = String(res.devCode)
  sending.value = false
}

function onInput(i: number, e: Event) {
  const el = e.target as HTMLInputElement
  const v = el.value.replace(/\D/g, '').slice(-1)
  digits.value[i] = v
  el.value = v
  if (v && i < 3) boxes.value[i + 1]?.focus()
}

function onKeydown(i: number, e: KeyboardEvent) {
  if (e.key === 'Backspace' && !digits.value[i] && i > 0) {
    e.preventDefault()
    digits.value[i - 1] = ''
    boxes.value[i - 1]?.focus()
  }
}

function onPaste(e: ClipboardEvent) {
  const text = (e.clipboardData?.getData('text') || '').replace(/\D/g, '').slice(0, 4)
  if (!text) return
  e.preventDefault()
  digits.value = [0, 1, 2, 3].map((i) => text[i] || '')
  nextTick(() => boxes.value[Math.min(text.length, 3)]?.focus())
}

async function confirm() {
  const code = digits.value.join('')
  if (code.length < 4) { otpErr.value = 'Masukkan 4 digit kode'; return }
  verifying.value = true; otpErr.value = ''
  const ok = await $api('/auth/otp/verify', { method: 'POST', body: { code } })
    .then(() => true)
    .catch((e: any) => { otpErr.value = e?.data?.error || 'Kode OTP salah atau kedaluwarsa'; return false })
  verifying.value = false
  if (ok) await navigateTo((route.query.redirect as string) || '/')
}

useHead({ title: 'Daftar · Miruum' })
</script>
