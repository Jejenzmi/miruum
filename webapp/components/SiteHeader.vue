<template>
  <header class="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-line">
    <div class="container-site flex items-center gap-4 h-16">
      <NuxtLink to="/" class="flex items-center gap-2 shrink-0">
        <span class="w-9 h-9 rounded-xl bg-brand grid place-items-center text-white font-display font-bold text-lg">M</span>
        <span class="text-xl font-display font-bold text-ink hidden sm:block">Miruum</span>
      </NuxtLink>

      <nav class="hidden md:flex items-center gap-1 ml-2 text-[15px] font-medium text-ink-muted">
        <NuxtLink to="/search" class="px-3 py-2 rounded-lg hover:text-brand-600 hover:bg-brand-50">Hotel</NuxtLink>
        <NuxtLink to="/packages" class="px-3 py-2 rounded-lg hover:text-brand-600 hover:bg-brand-50">Paket</NuxtLink>
        <NuxtLink v-if="modules.tour" to="/tours" class="px-3 py-2 rounded-lg hover:text-brand-600 hover:bg-brand-50">Tour</NuxtLink>
        <NuxtLink v-if="modules.shuttle" to="/shuttle" class="px-3 py-2 rounded-lg hover:text-brand-600 hover:bg-brand-50">Transfer Bandara</NuxtLink>
      </nav>

      <div class="flex-1"></div>

      <div class="flex items-center gap-2">
        <template v-if="isLoggedIn">
          <NuxtLink to="/account/bookings" class="hidden sm:inline-flex btn-ghost btn-sm">Pesanan Saya</NuxtLink>
          <div class="relative" @mouseleave="open = false">
            <button @click="open = !open" class="flex items-center gap-2 rounded-full border border-line pl-1 pr-3 py-1 hover:border-brand">
              <span class="w-8 h-8 rounded-full bg-brand-100 text-brand-700 grid place-items-center font-bold text-sm overflow-hidden">
                <img v-if="avatar" :src="avatar" class="w-full h-full object-cover" alt="" />
                <span v-else>{{ (user?.name || 'U').charAt(0).toUpperCase() }}</span>
              </span>
              <span class="text-sm font-semibold text-ink hidden sm:block max-w-[100px] truncate">{{ user?.name }}</span>
            </button>
            <div v-if="open" class="absolute right-0 mt-2 w-52 card shadow-pop py-2 text-[15px]">
              <NuxtLink to="/account" class="block px-4 py-2 hover:bg-brand-50">Profil</NuxtLink>
              <NuxtLink to="/account/bookings" class="block px-4 py-2 hover:bg-brand-50">Pesanan Saya</NuxtLink>
              <NuxtLink to="/account/vouchers" class="block px-4 py-2 hover:bg-brand-50">Voucher Saya</NuxtLink>
              <NuxtLink to="/account/loyalty" class="block px-4 py-2 hover:bg-brand-50">Poin Miruum</NuxtLink>
              <hr class="my-2 border-line" />
              <button @click="logout" class="block w-full text-left px-4 py-2 text-red-600 hover:bg-red-50">Keluar</button>
            </div>
          </div>
        </template>
        <template v-else>
          <NuxtLink to="/login" class="btn-ghost btn-sm">Masuk</NuxtLink>
          <NuxtLink to="/register" class="btn-brand btn-sm hidden sm:inline-flex">Daftar</NuxtLink>
        </template>
      </div>
    </div>
  </header>
</template>

<script setup lang="ts">
const { isLoggedIn, user, logout } = useAuth()
const config = useRuntimeConfig()
const open = ref(false)
const avatar = computed(() => user.value?.photoUrl || user.value?.avatarUrl || '')

const { $api } = useNuxtApp()
const { data: cfg } = await useAsyncData('appcfg', () => $api('/app/config').catch(() => ({ modules: {} })))
const modules = computed<any>(() => (cfg.value as any)?.modules || { tour: false, shuttle: false })
</script>
