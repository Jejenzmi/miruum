<template>
  <div class="bg-white rounded-2xl shadow-pop p-4 sm:p-5">
    <!-- Product tabs -->
    <div class="flex gap-1 overflow-x-auto no-scrollbar mb-4">
      <button class="flex items-center gap-2 px-4 py-2.5 rounded-full font-semibold text-[14px] whitespace-nowrap bg-brand text-white">
        <svg viewBox="0 0 24 24" class="w-4 h-4 fill-none stroke-current" stroke-width="2"><path d="M3 21h18M5 21V5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v16M15 9h3a1 1 0 0 1 1 1v11"/></svg>
        Hotel
      </button>
      <NuxtLink to="/packages" class="flex items-center gap-2 px-4 py-2.5 rounded-full font-semibold text-[14px] whitespace-nowrap text-ink-muted hover:bg-paper">
        <svg viewBox="0 0 24 24" class="w-4 h-4 fill-none stroke-current" stroke-width="2"><path d="M21 8v13H3V8M1 3h22v5H1zM10 21V3M14 21V3"/></svg>
        Paket
      </NuxtLink>
      <NuxtLink to="/tours" class="flex items-center gap-2 px-4 py-2.5 rounded-full font-semibold text-[14px] whitespace-nowrap text-ink-muted hover:bg-paper">
        <svg viewBox="0 0 24 24" class="w-4 h-4 fill-none stroke-current" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18"/></svg>
        Tour
      </NuxtLink>
      <NuxtLink to="/shuttle" class="flex items-center gap-2 px-4 py-2.5 rounded-full font-semibold text-[14px] whitespace-nowrap text-ink-muted hover:bg-paper">
        <svg viewBox="0 0 24 24" class="w-4 h-4 fill-none stroke-current" stroke-width="2"><path d="M5 17h14M6 17l-1-6 2-4h10l2 4-1 6M8 17v2M16 17v2"/></svg>
        Transfer Bandara
      </NuxtLink>
    </div>

    <!-- Search fields -->
    <form @submit.prevent="go" class="grid gap-2.5 lg:grid-cols-[2fr_1.2fr_1.2fr_auto] items-stretch">
      <!-- Destination -->
      <label class="flex items-center gap-2 border border-line rounded-xl px-3.5 py-3 focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/15">
        <svg viewBox="0 0 24 24" class="w-5 h-5 fill-none stroke-ink-faint shrink-0" stroke-width="2"><path d="M12 21s-7-5.2-7-11a7 7 0 1 1 14 0c0 5.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>
        <div class="min-w-0 flex-1">
          <div class="text-[11px] text-ink-faint font-semibold">Kota / Hotel</div>
          <input v-model="q" class="w-full outline-none text-[15px] font-semibold placeholder:font-normal placeholder:text-ink-faint" placeholder="Mau menginap di mana?" />
        </div>
      </label>

      <!-- Dates -->
      <div class="grid grid-cols-2 gap-2.5">
        <label class="border border-line rounded-xl px-3 py-3 focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/15">
          <div class="text-[11px] text-ink-faint font-semibold">Check-in</div>
          <input v-model="checkIn" type="date" :min="todayStr" class="w-full outline-none text-[14px] font-semibold bg-transparent" />
        </label>
        <label class="border border-line rounded-xl px-3 py-3 focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/15">
          <div class="text-[11px] text-ink-faint font-semibold">Check-out</div>
          <input v-model="checkOut" type="date" :min="checkIn || todayStr" class="w-full outline-none text-[14px] font-semibold bg-transparent" />
        </label>
      </div>

      <!-- Guests & rooms -->
      <div class="relative">
        <button type="button" @click="gOpen = !gOpen" class="w-full h-full text-left border border-line rounded-xl px-3.5 py-3 hover:border-brand">
          <div class="text-[11px] text-ink-faint font-semibold">Tamu & Kamar</div>
          <div class="text-[14px] font-semibold">{{ guests }} tamu · {{ rooms }} kamar</div>
        </button>
        <div v-if="gOpen" class="absolute z-20 mt-2 right-0 w-64 card shadow-pop p-4 space-y-3">
          <div class="flex items-center justify-between">
            <span class="text-[14px] font-medium">Tamu</span>
            <div class="flex items-center gap-3">
              <button type="button" @click="guests = Math.max(1, guests-1)" class="w-8 h-8 rounded-full border border-line grid place-items-center hover:border-brand">−</button>
              <span class="w-5 text-center font-semibold">{{ guests }}</span>
              <button type="button" @click="guests = Math.min(16, guests+1)" class="w-8 h-8 rounded-full border border-line grid place-items-center hover:border-brand">+</button>
            </div>
          </div>
          <div class="flex items-center justify-between">
            <span class="text-[14px] font-medium">Kamar</span>
            <div class="flex items-center gap-3">
              <button type="button" @click="rooms = Math.max(1, rooms-1)" class="w-8 h-8 rounded-full border border-line grid place-items-center hover:border-brand">−</button>
              <span class="w-5 text-center font-semibold">{{ rooms }}</span>
              <button type="button" @click="rooms = Math.min(8, rooms+1)" class="w-8 h-8 rounded-full border border-line grid place-items-center hover:border-brand">+</button>
            </div>
          </div>
          <button type="button" @click="gOpen = false" class="btn-brand btn-sm w-full">Selesai</button>
        </div>
      </div>

      <button type="submit" class="btn-brand h-full lg:w-14 lg:!px-0 text-[16px]">
        <svg viewBox="0 0 24 24" class="w-6 h-6 fill-none stroke-current" stroke-width="2.4"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
        <span class="lg:hidden">Cari Hotel</span>
      </button>
    </form>
  </div>
</template>

<script setup lang="ts">
const route = useRoute()
const todayStr = isoDate(new Date())
const q = ref((route.query.q as string) || '')
const checkIn = ref((route.query.checkIn as string) || todayStr)
const checkOut = ref((route.query.checkOut as string) || isoDate(new Date(Date.now() + 86400000)))
const guests = ref(Number(route.query.guests) || 2)
const rooms = ref(Number(route.query.rooms) || 1)
const gOpen = ref(false)

function go() {
  if (checkOut.value <= checkIn.value) checkOut.value = isoDate(new Date(new Date(checkIn.value).getTime() + 86400000))
  navigateTo({ path: '/search', query: { q: q.value || undefined, checkIn: checkIn.value, checkOut: checkOut.value, guests: guests.value, rooms: rooms.value } })
}
</script>
