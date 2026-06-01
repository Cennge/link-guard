// Popup: renders the verdict for the active tab plus stats and toggles.
// All heavy lifting (analyze / settings) lives in the service worker; this file
// is purely presentation.

const ICONS = {
  safe: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm-1.2 14.2-4-4 1.4-1.4 2.6 2.6 5.2-5.2 1.4 1.4-6.6 6.6Z"/></svg>',
  warning: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 3.2 2.2 20.3a1 1 0 0 0 .87 1.5h17.86a1 1 0 0 0 .87-1.5L12 3.2Z"/><rect x="11" y="9" width="2" height="6" rx="1" fill="#fff"/><circle cx="12" cy="17.6" r="1.2" fill="#fff"/></svg>',
  danger: '<svg viewBox="0 0 24 24"><path fill="currentColor" fill-rule="evenodd" d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm3.5 5.1L12 10.6 8.5 7.1 7.1 8.5 10.6 12l-3.5 3.5 1.4 1.4L12 13.4l3.5 3.5 1.4-1.4L13.4 12l3.5-3.5-1.4-1.4Z"/></svg>',
  neutral: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 2 4 5v6c0 5 3.4 8.5 8 11 4.6-2.5 8-6 8-11V5l-8-3Z"/></svg>',
}

const STATUS = {
  safe: 'Сайт безопасен',
  warning: 'Подозрительный сайт',
  danger: 'Опасно: фишинг',
  none: 'Нет веб-страницы',
  loading: 'Проверяем…',
}

const BADGE = {
  homograph: 'Гомограф / IDN',
  typosquat: 'Опечатка в адресе',
  combosquat: 'Чужой домен',
  mixed_script: 'Смешанные алфавиты',
}

function reasonText(reason, brand) {
  switch (reason) {
    case 'homograph':
      return `Адрес имитирует ${brand || 'известный бренд'} с помощью похожих символов из других алфавитов (например, кириллической «а» вместо латинской). Домен другой, чем у настоящего сайта.`
    case 'typosquat':
      return `Адрес очень похож на ${brand || 'известный бренд'}, но написан с искажением. Так работает тайпосквоттинг — переход на сайт злоумышленника по почти правильному адресу.`
    case 'combosquat':
      return `Имя бренда ${brand || ''} используется в домене, который ему не принадлежит. Частый приём, чтобы вызвать доверие.`.trim()
    case 'mixed_script':
      return 'В адресе одновременно используются символы из разных алфавитов. Легитимные сайты так почти никогда не делают.'
    default:
      return 'Адрес имеет признаки фишингового сайта.'
  }
}

function $(id) { return document.getElementById(id) }
function send(msg) { return new Promise((resolve) => chrome.runtime.sendMessage(msg, resolve)) }

function setVerdict(v) { document.body.dataset.verdict = v }

function renderHero(verdict, hostText) {
  setVerdict(verdict)
  const iconKey = ICONS[verdict] ? verdict : 'neutral'
  $('hero-icon').innerHTML = ICONS[iconKey]
  $('hero-status').textContent = STATUS[verdict] || STATUS.none
  $('hero-host-text').textContent = hostText || '—'
}

function renderDetail(result) {
  const detail = $('detail')
  if (result.verdict === 'safe' || result.verdict === 'none' || result.verdict === 'loading') {
    detail.hidden = true
    return
  }

  detail.hidden = false
  $('detail-badge').textContent = BADGE[result.reason] || 'Угроза'
  $('detail-title').textContent = result.brand ? `Маскируется под ${result.brand}` : 'Подозрительный адрес'
  $('detail-text').textContent = reasonText(result.reason, result.brand)

  // IDN comparison: what the user sees vs the real punycode.
  const compare = $('compare')
  if (result.unicodeHost && result.hostname && result.unicodeHost !== result.hostname) {
    $('compare-shown').textContent = result.unicodeHost
    $('compare-real').textContent = result.hostname
    compare.hidden = false
  } else {
    compare.hidden = true
  }

  // Suggestion to the genuine site.
  const suggest = $('suggest')
  if (result.suggestion) {
    $('suggest-host').textContent = result.suggestion
    suggest.href = `https://${result.suggestion}`
    suggest.hidden = false
  } else {
    suggest.hidden = true
  }
}

async function analyzeActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })

  if (!tab || !tab.url || !/^https?:/.test(tab.url)) {
    renderHero('none', tab && tab.url ? 'служебная страница' : '—')
    renderDetail({ verdict: 'none' })
    return
  }

  let host = tab.url
  try { host = new URL(tab.url).hostname } catch {}

  const result = await send({ type: 'analyze', url: tab.url })
  renderHero(result.verdict, result.unicodeHost || host)
  renderDetail(result)
}

async function init() {
  const { settings, stats } = await send({ type: 'getState' })

  $('stat-blocked').textContent = stats.blocked
  $('stat-proceeded').textContent = stats.proceeded

  // Power toggle (protection on/off).
  const power = $('power')
  const applyPower = (on) => {
    document.body.dataset.enabled = String(on)
    power.setAttribute('aria-checked', String(on))
    $('power-text').textContent = on ? 'Защита' : 'Выключено'
  }
  applyPower(settings.enabled)
  power.addEventListener('click', async () => {
    const on = document.body.dataset.enabled !== 'true'
    applyPower(on)
    await send({ type: 'setSettings', settings: { enabled: on } })
  })

  // "Block warnings" switch.
  const blockWarnings = $('blockWarnings')
  blockWarnings.checked = settings.blockWarnings
  blockWarnings.addEventListener('change', async () => {
    await send({ type: 'setSettings', settings: { blockWarnings: blockWarnings.checked } })
  })

  // "Trust badges" switch.
  const badges = $('badges')
  badges.checked = settings.badges !== false
  badges.addEventListener('change', async () => {
    await send({ type: 'setSettings', settings: { badges: badges.checked } })
  })

  // Custom domain addition
  const customDomainInput = $('custom-domain-input')
  const customDomainBtn = $('custom-domain-btn')
  const customDomainMsg = $('custom-domain-msg')

  customDomainBtn.addEventListener('click', async () => {
    let raw = customDomainInput.value.trim()
    if (!raw) return
    
    let host = raw
    if (host.startsWith('http://') || host.startsWith('https://')) {
      try { host = new URL(host).hostname } catch {}
    }
    host = host.toLowerCase()

    await send({ type: 'allowAlways', host })
    
    customDomainInput.value = ''
    customDomainMsg.textContent = `Домен ${host} добавлен в белый список`
    customDomainMsg.style.color = '#16a34a' // success green
    setTimeout(() => { customDomainMsg.textContent = '' }, 3000)

    // Re-analyze just in case we are on that domain right now
    await analyzeActiveTab()
  })

  await analyzeActiveTab()
}

init()
