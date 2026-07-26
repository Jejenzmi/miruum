// Global form UX (all pages): mark every mandatory (required) field with a red
// asterisk, and on a blocked submit scroll to + highlight the first empty required
// field. Native `required` still shows the browser's message. Runs client-side and
// re-scans on DOM changes (SPA route changes, dynamically added fields).
export default defineNuxtPlugin(() => {
  if (typeof document === 'undefined') return

  const style = document.createElement('style')
  style.textContent =
    '.req-star{color:#E5484D;font-weight:700;margin-left:1px}' +
    'input.field-touched:invalid,select.field-touched:invalid,textarea.field-touched:invalid{' +
    'border-color:#E5484D !important;box-shadow:0 0 0 2px rgba(229,72,77,.12) !important}'
  document.head.appendChild(style)

  function labelFor(el: Element): Element | null {
    const anyEl = el as any
    if (anyEl.labels && anyEl.labels.length) return anyEl.labels[0]
    let p = el.previousElementSibling
    while (p) { if (p.tagName === 'LABEL') return p; p = p.previousElementSibling }
    const box = el.closest('div,td,th,li,fieldset,label')
    if (box) { const l = box.querySelector('label'); if (l && l !== el) return l }
    return null
  }
  function mark() {
    document.querySelectorAll('input[required],select[required],textarea[required]').forEach((el) => {
      const e = el as HTMLElement
      if (e.dataset.reqMarked) return
      e.dataset.reqMarked = '1'
      const lab = labelFor(el)
      if (lab && !lab.querySelector('.req-star')) {
        const s = document.createElement('span')
        s.className = 'req-star'; s.textContent = ' *'; s.title = 'Wajib diisi'
        lab.appendChild(s)
      }
    })
  }

  const run = () => { try { mark() } catch (_) {} }
  run()
  try { new MutationObserver(run).observe(document.body, { childList: true, subtree: true }) } catch (_) {}

  // Empty/invalid required field → scroll to it + red outline on a blocked submit.
  document.addEventListener('invalid', (e) => {
    const el = e.target as HTMLElement | null
    if (!el) return
    el.classList.add('field-touched')
    if ((el as any).scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    try { (el as HTMLElement).focus({ preventScroll: true }) } catch (_) {}
  }, true)
})
