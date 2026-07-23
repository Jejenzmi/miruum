<template>
  <div ref="rootEl" class="relative">
    <label
      class="flex h-full items-center gap-2 border border-line rounded-xl px-3.5 py-3 bg-white focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/15"
    >
      <svg viewBox="0 0 24 24" class="w-5 h-5 fill-none stroke-ink-faint shrink-0" stroke-width="2">
        <path d="M12 21s-7-5.2-7-11a7 7 0 1 1 14 0c0 5.8-7 11-7 11z" /><circle cx="12" cy="10" r="2.5" />
      </svg>
      <div class="min-w-0 flex-1">
        <div class="text-[11px] text-ink-faint font-semibold">{{ label || t('Kota / Hotel', 'City / Hotel') }}</div>
        <input
          ref="inputEl"
          :value="modelValue"
          type="text"
          autocomplete="off"
          role="combobox"
          aria-autocomplete="list"
          :aria-expanded="open"
          class="w-full outline-none text-[15px] font-semibold bg-transparent placeholder:font-normal placeholder:text-ink-faint"
          :placeholder="placeholder || t('Mau menginap di mana?', 'Where do you want to stay?')"
          @input="onInput"
          @focus="onFocus"
          @keydown="onKeydown"
        />
      </div>
      <button
        v-if="modelValue"
        type="button"
        :aria-label="t('Hapus', 'Clear')"
        class="shrink-0 w-6 h-6 grid place-items-center rounded-full text-ink-faint hover:bg-paper hover:text-ink"
        @click="clearAll"
      >
        <svg viewBox="0 0 24 24" class="w-3.5 h-3.5 fill-none stroke-current" stroke-width="2.6"><path d="M6 6l12 12M18 6L6 18" /></svg>
      </button>
    </label>

    <!-- Area suggestions -->
    <div
      v-if="open"
      class="absolute z-30 mt-2 left-0 right-0 card shadow-pop overflow-hidden max-h-80 overflow-y-auto"
      role="listbox"
    >
      <div v-if="loading" class="px-3.5 py-3 space-y-2">
        <div v-for="n in 3" :key="n" class="space-y-1.5">
          <div class="skeleton h-3.5 w-2/5"></div>
          <div class="skeleton h-3 w-3/5"></div>
        </div>
      </div>

      <template v-else-if="regions.length">
        <button
          v-for="(r, i) in regions"
          :key="r.id || i"
          type="button"
          role="option"
          :aria-selected="i === activeIndex"
          class="w-full text-left px-3.5 py-2.5 flex items-start gap-2.5 border-b border-line/70 last:border-0"
          :class="i === activeIndex ? 'bg-brand-50' : 'hover:bg-paper'"
          @mouseenter="activeIndex = i"
          @mousedown.prevent
          @click="choose(r)"
        >
          <svg viewBox="0 0 24 24" class="w-4 h-4 mt-0.5 shrink-0 fill-none stroke-ink-faint" stroke-width="2">
            <path d="M12 21s-7-5.2-7-11a7 7 0 1 1 14 0c0 5.8-7 11-7 11z" /><circle cx="12" cy="10" r="2.5" />
          </svg>
          <div class="min-w-0 flex-1">
            <div class="text-[14px] font-bold text-ink truncate">{{ titleCaseArea(r.name) }}</div>
            <div v-if="r.path" class="text-[12px] text-ink-faint truncate">{{ titleCaseArea(r.path) }}</div>
          </div>
          <div class="shrink-0 flex flex-col items-end gap-1 pl-1">
            <span class="pill bg-paper text-ink-muted">{{ levelLabel(r.level) }}</span>
            <span v-if="Number(r.hotels) > 0" class="text-[11px] font-semibold text-brand-700">
              {{ Number(r.hotels) }} {{ t('properti', 'properties') }}
            </span>
          </div>
        </button>
      </template>

      <div v-else class="px-3.5 py-4 text-[13px] text-ink-muted">
        {{ t('Area tidak ditemukan. Tekan cari untuk pencarian bebas.', 'No area found. Press search for a free-text search.') }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
// Structured area (region) autocomplete, shared by the home search widget and
// the search page. Self-contained + SSR-safe: it never fetches during SSR and
// the region lookup can never throw (always `.catch`ed to an empty list).
// NOTE: `<script setup>` cannot contain ES exports, so consumers declare the
// same (structural) shape locally — see SearchWidget.vue / pages/search.vue.
type AreaRegion = {
  id: string
  name: string
  level?: string
  path?: string
  hotels?: number
}

const props = defineProps<{
  modelValue?: string
  label?: string
  placeholder?: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', v: string): void
  (e: 'select', region: AreaRegion): void
  (e: 'clear'): void
}>()

// ⚠️ Every Nuxt composable is called here, before any await.
const { t } = useLang()
const { $api } = useNuxtApp()

const rootEl = ref<HTMLElement | null>(null)
const inputEl = ref<HTMLInputElement | null>(null)
const regions = ref<AreaRegion[]>([])
const open = ref(false)
const loading = ref(false)
const activeIndex = ref(-1)

let timer: ReturnType<typeof setTimeout> | null = null
let seq = 0

const levelLabel = (lvl?: string) => {
  switch ((lvl || '').toUpperCase()) {
    case 'PROVINCE': return t('Provinsi', 'Province')
    case 'CITY': return t('Kota/Kab.', 'City/Regency')
    case 'DISTRICT': return t('Kecamatan', 'District')
    default: return t('Area', 'Area')
  }
}

function close() {
  open.value = false
  activeIndex.value = -1
  if (timer) { clearTimeout(timer); timer = null }
}

async function runSearch(term: string) {
  const mine = ++seq
  const res: any = await $api('/regions/search', { query: { q: term } }).catch(() => ({ regions: [] }))
  if (mine !== seq) return
  const list = Array.isArray(res?.regions) ? res.regions : []
  regions.value = list.filter((r: any) => r && r.id && r.name)
  activeIndex.value = regions.value.length ? 0 : -1
  loading.value = false
  open.value = true
}

function schedule(raw: string) {
  if (timer) { clearTimeout(timer); timer = null }
  const term = (raw || '').trim()
  if (term.length < 2) {
    seq++
    regions.value = []
    loading.value = false
    close()
    return
  }
  loading.value = true
  open.value = true
  timer = setTimeout(() => runSearch(term), 280)
}

function onInput(e: Event) {
  const v = (e.target as HTMLInputElement)?.value ?? ''
  emit('update:modelValue', v)
  emit('clear') // typing invalidates any previously picked area
  schedule(v)
}

function onFocus() {
  if ((props.modelValue || '').trim().length >= 2 && regions.value.length) open.value = true
}

function choose(r?: AreaRegion | null) {
  if (!r || !r.id) return
  emit('update:modelValue', titleCaseArea(r.name))
  emit('select', r)
  close()
}

function clearAll() {
  seq++
  regions.value = []
  emit('update:modelValue', '')
  emit('clear')
  close()
  inputEl.value?.focus()
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') { close(); return }
  if (!open.value || !regions.value.length) return
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    activeIndex.value = (activeIndex.value + 1) % regions.value.length
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    activeIndex.value = (activeIndex.value - 1 + regions.value.length) % regions.value.length
  } else if (e.key === 'Enter') {
    if (activeIndex.value >= 0) {
      e.preventDefault()
      choose(regions.value[activeIndex.value])
    }
  } else if (e.key === 'Tab') {
    close()
  }
}

function onDocClick(e: MouseEvent) {
  if (!open.value) return
  const el = rootEl.value
  if (el && e.target instanceof Node && !el.contains(e.target)) close()
}

onMounted(() => document.addEventListener('click', onDocClick))
onBeforeUnmount(() => {
  document.removeEventListener('click', onDocClick)
  if (timer) clearTimeout(timer)
})

/** Let the parent force-close (e.g. after submitting the form). */
defineExpose({ close })
</script>
