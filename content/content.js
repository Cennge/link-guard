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
  // Neutral "checked, nothing suspicious" — a grey shield for ordinary links
  // that aren't a known brand and aren't flagged.
  neutral:
    '<svg viewBox="0 0 24 24"><path fill="#9ca3af" d="M12 2 4 5v6c0 5 3.4 8.5 8 11 4.6-2.5 8-6 8-11V5l-8-3Z"/><path fill="#fff" d="m10.6 14.7-2.7-2.7 1.2-1.2 1.5 1.5 3.4-3.4 1.2 1.2-4.6 4.6Z"/></svg>',
}

const TITLES = {
  trusted: 'Доверенный сайт — проверено LinkGuard',
  danger: 'Опасно: возможный фишинг (LinkGuard)',
  warning: 'Подозрительный адрес (LinkGuard)',
  neutral: 'Проверено LinkGuard — ничего подозрительного',
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
  // Skip same-site / internal links — badging a site's own navigation chrome
  // (tabs, menus, app buttons) is noisy and breaks layouts. Only outbound.
  if (result.registrable === pageRegistrable) return null
  if (result.trusted) return 'trusted'
  if (result.verdict === 'danger') return 'danger'
  if (result.verdict === 'warning') return 'warning'
  // Any other outbound site with a real domain is an ordinary, checked link.
  return 'neutral'
}

// A link "carries text" if it has any visible non-whitespace text. Links
// without text are image/icon/logo tiles — an inline icon there would displace
// the image, so those get an absolute corner overlay instead.
function carriesText(anchor) {
  return !!(anchor.textContent && anchor.textContent.replace(/\s+/g, '').length)
}

// Net horizontal/vertical flip imposed by transformed ancestors. A vertical
// flip on any ancestor (scaleY(-1), rotate(180deg), rotateX(180deg) — common in
// carousels/scrollers) turns our shield upside down, and a descendant cannot
// cancel an ancestor's transform. We return the factors needed to mirror back.
function ancestorFlip(el) {
  let fx = 1
  let fy = 1
  for (let n = el; n instanceof Element; n = n.parentElement) {
    const t = getComputedStyle(n).transform
    if (!t || t === 'none') continue
    let m
    try {
      m = new DOMMatrixReadOnly(t)
    } catch {
      continue
    }
    if (m.a < 0) fx = -fx
    if (m.d < 0) fy = -fy
  }
  return { fx, fy }
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
  // Keep the container's own transform neutral — defends against host rules
  // that flip the span/icon directly (inline !important beats any selector).
  badge.style.setProperty('transform', 'none', 'important')
  badge.style.setProperty('rotate', 'none', 'important')
  badge.style.setProperty('scale', 'none', 'important')

  // If a transformed ancestor flips the subtree, mirror the SVG back upright.
  const { fx, fy } = ancestorFlip(anchor)
  if (fx < 0 || fy < 0) {
    const svg = badge.firstElementChild
    if (svg) svg.style.setProperty('transform', `scaleX(${fx}) scaleY(${fy})`, 'important')
  }

  if (carriesText(anchor)) {
    // Text link: a small inline icon just before the text. It lives INSIDE the
    // <a>, so it never becomes a sibling flex/grid item that could disrupt the
    // container — the link just gets slightly wider.
    // Scale the icon to the link's font size so it looks proportional.
    const fs = parseFloat(getComputedStyle(anchor).fontSize) || 16
    const size = Math.max(12, Math.min(22, Math.round(fs * 0.8)))
    badge.style.setProperty('--lg-size', size + 'px')
    anchor.insertAdjacentElement('afterbegin', badge)
    return
  }

  // Image/icon-only link: overlay in the corner so we don't displace the image.
  // Add a positioning context only if the anchor lacks one.
  badge.classList.add('lg-overlay')
  if (getComputedStyle(anchor).position === 'static') {
    anchor.style.setProperty('position', 'relative', 'important')
  }
  anchor.insertAdjacentElement('afterbegin', badge)
}

async function scan() {
  scanQueued = false

  const anchors = []
  const byHref = new Map() // href -> [anchors]
  for (const a of document.querySelectorAll('a[href]')) {
    if (a.dataset[MARK]) continue
    const raw = a.getAttribute('href')
    const href = a.href
    // Skip in-page anchors (#section) and non-http(s) schemes (mailto:,
    // javascript:, tel: …) — there's nothing to verify there.
    if (!/^https?:/i.test(href) || (raw && raw[0] === '#')) {
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

  // results[0] is the page itself — its registrable lets us skip internal links.
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
