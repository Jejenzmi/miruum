<template>
  <div class="fixed bottom-5 right-5 z-50">
    <!-- Panel -->
    <transition name="page">
      <div v-if="open" class="mb-3 w-[340px] max-w-[calc(100vw-2.5rem)] card shadow-pop overflow-hidden flex flex-col" style="height:460px">
        <div class="bg-brand text-white px-4 py-3 flex items-center justify-between">
          <div><div class="font-bold text-[15px]">Live Chat Miruum</div><div class="text-[11px] text-white/80">Kami balas secepatnya</div></div>
          <button @click="open = false" class="w-8 h-8 grid place-items-center rounded-full hover:bg-white/15">✕</button>
        </div>

        <div v-if="!isLoggedIn" class="flex-1 grid place-items-center p-6 text-center">
          <div>
            <p class="text-ink-muted text-sm mb-3">Masuk untuk memulai obrolan dengan CS kami.</p>
            <NuxtLink to="/login?redirect=/" class="btn-brand btn-sm">Masuk</NuxtLink>
          </div>
        </div>

        <template v-else>
          <div ref="scroll" class="flex-1 overflow-y-auto p-3 space-y-2 bg-paper">
            <div v-for="(m,i) in messages" :key="i" class="flex" :class="isMine(m) ? 'justify-end' : 'justify-start'">
              <div class="max-w-[80%] rounded-2xl px-3 py-2 text-[14px]"
                   :class="isMine(m) ? 'bg-brand text-white rounded-br-sm' : 'bg-white border border-line rounded-bl-sm'">
                <div v-if="!isMine(m) && m.sender==='BOT'" class="text-[10px] font-bold text-brand-600 mb-0.5">MIRA (Bot)</div>
                {{ m.body }}
              </div>
            </div>
            <p v-if="!messages.length" class="text-center text-ink-faint text-[13px] mt-6">Ada yang bisa kami bantu? Ketik pesanmu di bawah.</p>
          </div>
          <form @submit.prevent="send" class="p-2.5 border-t border-line flex gap-2">
            <input v-model="text" class="input !py-2.5 !text-sm" placeholder="Tulis pesan…" />
            <button class="btn-brand btn-sm px-3" :disabled="sending">➤</button>
          </form>
        </template>
      </div>
    </transition>

    <!-- FAB -->
    <button @click="toggle" class="w-14 h-14 rounded-full bg-brand text-white shadow-pop grid place-items-center hover:scale-105 transition">
      <svg viewBox="0 0 24 24" class="w-6 h-6 fill-none stroke-current" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
    </button>
  </div>
</template>

<script setup lang="ts">
const { $api } = useNuxtApp()
const { isLoggedIn } = useAuth()
const open = ref(false)
const messages = ref<any[]>([])
const text = ref('')
const sending = ref(false)
const scroll = ref<HTMLElement | null>(null)

const isMine = (m: any) => m.sender === 'USER'

async function toggle() {
  open.value = !open.value
  if (open.value && isLoggedIn.value && !messages.value.length) await loadChat()
}
async function loadChat() {
  try { const r: any = await $api('/chat'); messages.value = r.messages || r.thread?.messages || []; await nextTick(); scrollDown() } catch {}
}
async function send() {
  const body = text.value.trim(); if (!body) return
  text.value = ''; sending.value = true
  messages.value.push({ sender: 'USER', body })
  try { const r: any = await $api('/chat', { method: 'POST', body: { body } }); messages.value = r.messages || r.thread?.messages || messages.value } catch {}
  finally { sending.value = false; await nextTick(); scrollDown() }
}
function scrollDown() { if (scroll.value) scroll.value.scrollTop = scroll.value.scrollHeight }
</script>
