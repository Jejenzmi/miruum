<template>
  <div class="container-site py-8">
    <h1 class="text-2xl font-bold mb-1">Bandingkan Hotel</h1>
    <p class="text-ink-muted text-sm mb-6">Tambahkan hotel dari halaman detail (tombol “Bandingkan”), lalu bandingkan berdampingan.</p>

    <div v-if="items.length" class="overflow-x-auto">
      <table class="w-full border-separate border-spacing-x-3 min-w-[600px]">
        <thead>
          <tr>
            <th class="w-32"></th>
            <th v-for="h in items" :key="h.id" class="align-top">
              <div class="card overflow-hidden text-left">
                <div class="aspect-[4/3] bg-line"><img :src="h.imageUrl" class="w-full h-full object-cover" :alt="h.name" /></div>
                <div class="p-3">
                  <div class="font-bold text-[14px] leading-tight line-clamp-2">{{ h.name }}</div>
                  <button @click="remove(h.id)" class="text-red-600 text-[12px] mt-1">Hapus</button>
                </div>
              </div>
            </th>
          </tr>
        </thead>
        <tbody class="text-[14px]">
          <tr v-for="row in rows" :key="row.k">
            <td class="font-semibold text-ink-muted py-2">{{ row.label }}</td>
            <td v-for="h in items" :key="h.id" class="py-2"><span v-html="row.val(h)"></span></td>
          </tr>
          <tr>
            <td></td>
            <td v-for="h in items" :key="h.id" class="pt-2"><NuxtLink :to="`/hotel/${h.id}`" class="btn-brand btn-sm w-full">Lihat</NuxtLink></td>
          </tr>
        </tbody>
      </table>
      <button @click="clear" class="btn-ghost btn-sm mt-5">Kosongkan Perbandingan</button>
    </div>
    <div v-else class="card p-12 text-center text-ink-muted">
      <p class="text-lg font-semibold mb-1">Belum ada hotel untuk dibandingkan</p>
      <NuxtLink to="/search" class="btn-brand btn-sm mt-3">Cari Hotel</NuxtLink>
    </div>
  </div>
</template>

<script setup lang="ts">
const { items, remove, clear } = useCompare()
const rows = [
  { k: 'price', label: 'Harga / malam', val: (h: any) => `<b class="text-brand-700">${rupiah(h.priceFrom)}</b>` },
  { k: 'rating', label: 'Rating', val: (h: any) => h.rating ? `<b>${Number(h.rating).toFixed(1)}</b> · ${ratingLabel(h.rating)}` : '-' },
  { k: 'star', label: 'Bintang', val: (h: any) => '★'.repeat(h.starRating || 0) },
  { k: 'type', label: 'Tipe', val: (h: any) => PROPERTY_TYPES[h.propertyType] || 'Hotel' },
  { k: 'city', label: 'Kota', val: (h: any) => h.city || '-' },
  { k: 'reviews', label: 'Jumlah ulasan', val: (h: any) => String(h.reviewCount || 0) },
]
useHead({ title: 'Bandingkan Hotel · Miruum' })
</script>
