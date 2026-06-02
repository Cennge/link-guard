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
let pageBannerShown = false

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

// --- On-page credential-phishing guard ---------------------------------------
// Looks at the LOADED page (not just the URL): a password field whose page
// claims a brand identity it doesn't own, or that posts credentials off-origin.

// Classify a single input as a password / card-number / CVV field.
function fieldKind(el) {
  if ((el.type || '').toLowerCase() === 'password') return 'password'
  const ac = (el.getAttribute('autocomplete') || '').toLowerCase()
  const hint = `${el.name || ''} ${el.id || ''} ${el.getAttribute('placeholder') || ''} ${ac}`.toLowerCase()
  if (ac === 'cc-csc' || /\bcvv\b|\bcvc\b|\bcsc\b|cvv2|cvc2|security ?code|код ?карт/.test(hint)) return 'cvv'
  if (ac === 'cc-number' || /card.?number|cardnum|ccnum|cc.?num|номер ?карт/.test(hint)) return 'ccnum'
  return ''
}

// Scan the page once: does it ask for a password, and/or full card details?
function sensitiveScan(root = document) {
  let password = false
  let ccnum = false
  let cvv = false
  for (const el of root.querySelectorAll('input')) {
    const k = fieldKind(el)
    if (k === 'password') password = true
    else if (k === 'ccnum') ccnum = true
    else if (k === 'cvv') cvv = true
  }
  return { password, payment: ccnum && cvv }
}

// The page's claimed identity — title, og:site_name, and short logo alt text.
function getIdentityText() {
  const parts = []
  if (document.title) parts.push(document.title)
  const og = document.querySelector('meta[property="og:site_name"]')
  if (og && og.content) parts.push(og.content)
  let n = 0
  for (const img of document.querySelectorAll('img[alt]')) {
    const a = img.alt
    if (a && a.length <= 40) {
      parts.push(a)
      if (++n >= 8) break
    }
  }
  return parts.join(' ').slice(0, 300)
}

// Host of a favicon served from a DIFFERENT domain than the page — phishing
// pages often hot-link the real brand's favicon. Same-host icons are ignored.
function getFaviconHost() {
  for (const l of document.querySelectorAll('link[rel~="icon" i], link[rel="apple-touch-icon" i]')) {
    const href = l.getAttribute('href')
    if (!href) continue
    try {
      const u = new URL(href, location.href)
      if ((u.protocol === 'http:' || u.protocol === 'https:') && u.hostname && u.hostname !== location.hostname) {
        return u.hostname
      }
    } catch {
      // ignore
    }
  }
  return ''
}

// True if a form holding sensitive fields (password OR card data) submits to a
// different origin — credential theft / card skimming.
function crossOriginSensitiveForm() {
  for (const form of document.querySelectorAll('form')) {
    let sensitive = false
    for (const el of form.querySelectorAll('input')) {
      if (fieldKind(el)) { sensitive = true; break }
    }
    if (!sensitive) continue
    const action = form.getAttribute('action')
    if (!action) continue
    try {
      const u = new URL(action, location.href)
      if ((u.protocol === 'http:' || u.protocol === 'https:') && u.origin !== location.origin) {
        return true
      }
    } catch {
      // ignore malformed action
    }
  }
  return false
}

const PAGE_MSG = {
  fake_login: (b) =>
    `Эта страница выдаёт себя за <b>${b || 'известный сервис'}</b>, но домен ему не принадлежит. Не вводите логин и пароль — это похоже на фишинг.`,
  cross_origin_credentials:
    'Форма входа на этой странице отправляет пароль на сторонний сайт. Это типичный приём кражи учётных данных.',
  suspicious_login:
    'Похоже на поддельную страницу входа: тревожные формулировки («подтвердите», «аккаунт заблокирован») на малоизвестном домене. Не вводите данные, пока не убедитесь в адресе.',
  payment_skim:
    'Данные банковской карты с этой страницы отправляются на сторонний сайт — типичный скимминг/фишинг. Не вводите номер карты и CVV.',
}

function showPhishBanner(resp) {
  if (pageBannerShown || document.getElementById('lg-phish-banner')) return
  pageBannerShown = true
  const bar = document.createElement('div')
  bar.id = 'lg-phish-banner'
  bar.className = `lg-phish-banner lg-${resp.verdict}`
  const entry = PAGE_MSG[resp.reason]
  const msg =
    typeof entry === 'function'
      ? entry(resp.brand)
      : entry || 'LinkGuard обнаружил признаки фишинговой страницы.'
  bar.innerHTML =
    `<span class="lg-phish-ico">${resp.verdict === 'danger' ? '⛔' : '⚠️'}</span>` +
    `<span class="lg-phish-text"><b>LinkGuard:</b> ${msg}</span>` +
    `<button class="lg-phish-x" type="button" aria-label="Скрыть">✕</button>`
  bar.querySelector('.lg-phish-x').addEventListener('click', () => bar.remove())
  const mount = () => (document.body || document.documentElement).appendChild(bar)
  if (document.body) mount()
  else document.addEventListener('DOMContentLoaded', mount, { once: true })
}

async function pageGuard() {
  if (pageBannerShown) return
  const sens = sensitiveScan()
  if (!sens.password && !sens.payment) return
  const resp = await send({
    type: 'analyzePage',
    url: location.href,
    hasPassword: sens.password,
    hasPayment: sens.payment,
    identity: getIdentityText(),
    crossOriginPost: crossOriginSensitiveForm(),
    iconHost: getFaviconHost(),
  })
  if (resp && (resp.verdict === 'danger' || resp.verdict === 'warning')) showPhishBanner(resp)
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

  // Page-level credential-phishing check runs independently of link badging.
  pageGuard()

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
