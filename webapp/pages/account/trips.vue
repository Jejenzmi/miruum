<template>
  <div class="container-site py-6 max-w-4xl">
    <h1 class="text-2xl font-bold mb-5">Akun Saya</h1>
    <AccountTabs active="trips" />

    <div class="flex items-center justify-between gap-3 mb-4">
      <h2 class="font-bold text-lg">Trips Saya</h2>
      <button v-if="trips.length" @click="openCreate" class="btn-brand btn-sm">+ Buat Trip</button>
    </div>

    <!-- Empty state -->
    <div v-if="!trips.length" class="card p-12 text-center text-ink-muted">
      <div class="text-4xl mb-2">🧳</div>
      <p class="text-lg font-semibold mb-1 text-ink">Belum ada trip</p>
      <p class="text-sm mb-4 leading-relaxed">Buat trip &amp; simpan hotel + tour untuk rencanamu.</p>
      <button @click="openCreate" class="btn-brand btn-sm">Buat Trip</button>
    </div>

    <!-- Trip list -->
    <div v-else class="space-y-4">
      <div v-for="t in trips" :key="t.id" class="card overflow-hidden">
        <div class="flex items-center gap-2 px-4 py-3 border-b border-line">
          <span class="text-brand">🧳</span>
          <div class="font-bold text-[15px] truncate flex-1">{{ t.name }}</div>
          <span class="text-[12px] text-ink-faint shrink-0">{{ (t.items || []).length }} item</span>
          <button @click="removeTrip(t)" :disabled="busy === t.id"
            class="text-ink-faint hover:text-red-600 text-[13px] font-semibold px-2 py-1 shrink-0" title="Hapus trip">
            Hapus
          </button>
        </div>

        <p v-if="!(t.items || []).length" class="px-4 py-4 text-[13px] text-ink-muted">
          Kosong — simpan hotel/tour dari halaman detail.
        </p>

        <div v-else class="divide-y divide-line">
          <div v-for="i in t.items" :key="i.id" class="flex items-center gap-3 px-4 py-3">
            <NuxtLink :to="itemLink(i)" class="shrink-0">
              <img v-if="i.imageUrl" :src="i.imageUrl" :alt="i.title" class="w-12 h-12 rounded-lg object-cover bg-line" />
              <div v-else class="w-12 h-12 rounded-lg bg-line"></div>
            </NuxtLink>
            <div class="min-w-0 flex-1">
              <NuxtLink :to="itemLink(i)" class="font-semibold text-[14px] truncate block hover:text-brand-600">{{ i.title }}</NuxtLink>
              <div class="flex items-center gap-2 mt-0.5">
                <span class="pill !text-[10px] !px-2 !py-0.5"
                  :class="i.kind === 'TOUR' ? 'bg-leaf-soft text-leaf-dark' : 'bg-sky-50 text-sky-700'">
                  {{ i.kind === 'TOUR' ? 'Tur' : 'Hotel' }}
                </span>
                <span class="text-[12px] text-ink-faint truncate">{{ i.subtitle }}</span>
              </div>
            </div>
            <div class="text-right shrink-0">
              <div class="text-brand-700 font-extrabold text-[13px]">{{ rupiah(i.price || 0) }}</div>
              <button @click="removeItem(i)" :disabled="busy === i.id"
                class="text-[12px] text-ink-faint hover:text-red-600 font-semibold">Hapus</button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Create trip dialog -->
    <div v-if="creating" class="fixed inset-0 z-50 grid place-items-center bg-ink/40 px-4" @click.self="creating = false">
      <div class="bg-white rounded-xl2 shadow-pop p-5 w-full max-w-sm">
        <h3 class="font-bold text-lg mb-3">Buat Trip Baru</h3>
        <label class="label">Nama trip</label>
        <input ref="nameInput" v-model="newName" class="input" placeholder="Contoh: Liburan Bali" @keyup.enter="doCreate" />
        <div class="flex justify-end gap-2 mt-4">
          <button @click="creating = false" class="btn-ghost btn-sm">Batal</button>
          <button @click="doCreate" :disabled="busy === 'new'" class="btn-brand btn-sm">{{ busy === 'new' ? '…' : 'Buat' }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ middleware: 'auth' })
const { $api } = useNuxtApp()

const { data, refresh } = await useAsyncData('trips', () => $api('/wishlists').catch(() => ({ wishlists: [] })))
const trips = computed<any[]>(() => (data.value as any)?.wishlists || [])

const busy = ref<string | null>(null)
const creating = ref(false)
const newName = ref('')
const nameInput = ref<HTMLInputElement | null>(null)

const itemLink = (i: any) => (i.kind === 'TOUR' ? `/tours/${i.refId}` : `/hotel/${i.refId}`)

function openCreate() {
  newName.value = ''
  creating.value = true
  nextTick(() => nameInput.value?.focus())
}

async function doCreate() {
  const name = newName.value.trim()
  if (!name) return
  busy.value = 'new'
  try { await $api('/wishlists', { method: 'POST', body: { name } }); creating.value = false; await refresh() } catch {}
  finally { busy.value = null }
}

async function removeTrip(t: any) {
  if (!confirm(`Hapus trip "${t.name}"?`)) return
  busy.value = t.id
  try { await $api(`/wishlists/${t.id}`, { method: 'DELETE' }); await refresh() } catch {}
  finally { busy.value = null }
}

async function removeItem(i: any) {
  if (!confirm(`Hapus "${i.title}" dari trip?`)) return
  busy.value = i.id
  try { await $api(`/wishlists/items/${i.id}`, { method: 'DELETE' }); await refresh() } catch {}
  finally { busy.value = null }
}

useHead({ title: 'Trips Saya · Miruum' })
</script>
