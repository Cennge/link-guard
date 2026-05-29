// Content script: scans links on the page and badges OUTBOUND links (links that
// leave the current site). Verified brand domains get a green shield ("доверенный"),
// flagged ones get a red/amber warning. Same-site links are left untouched so we
// don't spam every internal link with icons.

const MARK = 'lgChecked'
const MAX_PER_SCAN = 400 // safety cap for very large pages

const ICONS = {
  trusted:
    '<svg viewBox="0 0 24 24"><path fill="#16a34a" d="M12 2 4 5v6c0 5 3.4 8.5 8 11 4.6-2.5 8-6 8-11V5l-8-3Z"/><path fill="#fff" d="m10.6 14.7-2.7-2.7 1.2-1.2 1.5 1.5 3.4-3.4 1.2 1.2-4.6 4.6Z"/></svg>',
  danger:
    '<svg viewBox="0 0 24 24"><path fill="#dc2626" fill-rule="evenodd" d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm3.5 5.1L12 10.6 8.5 7.1 7.1 8.5 10.6 12l-3.5 3.5 1.4 1.4L12 13.4l3.5 3.5 1.4-1.4L13.4 12l3.5-3.5-1.4-1.4Z"/></svg>',
  warning:
    '<svg viewBox="0 0 24 24"><path fill="#d97706" d="M12 3.2 2.2 20.3a1 1 0 0 0 .87 1.5h17.86a1 1 0 0 0 .87-1.5L12 3.2Z"/><rect x="11" y="9" width="2" height="6" rx="1" fill="#fff"/><circle cx="12" cy="17.6" r="1.2" fill="#fff"/></svg>',
}

const TITLES = {
  trusted: 'Доверенный сайт — проверено LinkGuard',
  danger: 'Опасно: возможный фишинг (LinkGuard)',
  warning: 'Подозрительный адрес (LinkGuard)',
}

let pageRegistrable = null
let scanQueued = false

function send(msg) {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(msg, (r) => {
        // swallow "extension context invalidated" on reloads
        void chrome.runtime.lastError
        resolve(r)
      })
    } catch {
      resolve(undefined)
    }
  })
}

function kindFor(result) {
  if (!result || !result.registrable) return null
  if (result.registrable === pageRegistrable) return null // internal link — skip
  if (result.trusted) return 'trusted'
  if (result.verdict === 'danger') return 'danger'
  if (result.verdict === 'warning') return 'warning'
  return null
}

function addBadge(anchor, kind) {
  // Avoid double-badging if a previous run already inserted one.
  const first = anchor.firstElementChild
  if (first && first.classList && first.classList.contains('lg-badge')) return
  const badge = document.createElement('span')
  badge.className = `lg-badge lg-${kind}`
  badge.title = TITLES[kind]
  badge.setAttribute('aria-label', TITLES[kind])
  badge.innerHTML = ICONS[kind]
  anchor.insertAdjacentElement('afterbegin', badge)
}

async function scan() {
  scanQueued = false

  const anchors = []
  const byHref = new Map() // href -> [anchors]
  for (const a of document.querySelectorAll('a[href]')) {
    if (a.dataset[MARK]) continue
    const href = a.href
    if (!/^https?:/i.test(href)) {
      a.dataset[MARK] = '1'
      continue
    }
    anchors.push(a)
    if (!byHref.has(href)) byHref.set(href, [])
    byHref.get(href).push(a)
    if (anchors.length >= MAX_PER_SCAN) break
  }
  if (byHref.size === 0) return

  const hrefs = [...byHref.keys()]
  const resp = await send({ type: 'analyzeBatch', urls: [location.href, ...hrefs] })
  if (!resp || resp.badges === false || !resp.results) return

  pageRegistrable = resp.results[0] ? resp.results[0].registrable : pageRegistrable

  hrefs.forEach((href, i) => {
    const result = resp.results[i + 1]
    const kind = kindFor(result)
    for (const a of byHref.get(href)) {
      a.dataset[MARK] = '1'
      if (kind) addBadge(a, kind)
    }
  })
}

function queueScan() {
  if (scanQueued) return
  scanQueued = true
  // let the page settle; rAF + small timeout keeps it off the critical path
  setTimeout(() => requestAnimationFrame(scan), 250)
}

// Initial pass once the DOM is ready.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', queueScan)
} else {
  queueScan()
}

// Re-scan when new links appear (SPA navigation, infinite scroll, etc.).
const observer = new MutationObserver((mutations) => {
  for (const m of mutations) {
    if (m.addedNodes && m.addedNodes.length) {
      queueScan()
      return
    }
  }
})
observer.observe(document.documentElement, { childList: true, subtree: true })
