<template>
  <form @submit.prevent="go" class="bg-white rounded-xl2 shadow-pop p-3 grid gap-3 md:grid-cols-[1.4fr_1fr_1fr_auto] items-end">
    <div>
      <label class="label">{{ t('Kota / Nama Hotel', 'City / Hotel Name') }}</label>
      <input v-model="q" type="text" class="input" :placeholder="t('mis. Jakarta, Bali, FM7…', 'e.g. Jakarta, Bali, FM7…')" />
    </div>
    <div>
      <label class="label">{{ t('Check-in', 'Check-in') }}</label>
      <input v-model="checkIn" type="date" :min="todayStr" class="input" />
    </div>
    <div>
      <label class="label">{{ t('Check-out', 'Check-out') }}</label>
      <input v-model="checkOut" type="date" :min="checkIn || todayStr" class="input" />
    </div>
    <div class="flex gap-2">
      <div class="w-24">
        <label class="label">{{ t('Tamu', 'Guests') }}</label>
        <select v-model.number="guests" class="input !px-2">
          <option v-for="n in 8" :key="n" :value="n">{{ n }}</option>
        </select>
      </div>
      <button type="submit" class="btn-brand h-[50px] px-6 self-end">
        <svg viewBox="0 0 24 24" class="w-5 h-5 fill-none stroke-current" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
        {{ t('Cari', 'Search') }}
      </button>
    </div>
  </form>
</template>

<script setup lang="ts">
const props = defineProps<{ compact?: boolean }>()
const { t } = useLang()
const route = useRoute()
const today = new Date()
const todayStr = isoDate(today)
const tomorrow = isoDate(new Date(Date.now() + 86400000))

const q = ref((route.query.q as string) || '')
const checkIn = ref((route.query.checkIn as string) || todayStr)
const checkOut = ref((route.query.checkOut as string) || tomorrow)
const guests = ref(Number(route.query.guests) || 2)

function go() {
  if (checkOut.value <= checkIn.value) checkOut.value = isoDate(new Date(new Date(checkIn.value).getTime() + 86400000))
  navigateTo({ path: '/search', query: { q: q.value || undefined, checkIn: checkIn.value, checkOut: checkOut.value, guests: guests.value } })
}
</script>
