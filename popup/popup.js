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

// --- Splash / preloader ---
const splashStart = Date.now()
function hideSplash() {
  const s = $('splash')
  if (!s || s.classList.contains('hide')) return
  s.classList.add('hide')
  setTimeout(() => s.remove(), 450)
}
// Safety net: never leave the splash up if init hangs.
setTimeout(hideSplash, 2500)

// ---- Protection level gauge -------------------------------------------------
// Each active layer contributes points; turning one off lowers the score.
function computeScore(s) {
  if (!s.enabled) return 0
  let score = 40 // core detection engine + hard-block rules
  if (s.feedEnabled !== false) score += 20 // live known-phishing list
  if (s.pageGuard !== false) score += 20 // on-page credential-phishing guard
  if (s.blockWarnings !== false) score += 12 // actively block "suspicious"
  if (s.badges !== false) score += 8 // on-page link badges / awareness
  return score
}
// Zone palette: solid colour + soft tint + track + glow per protection band.
const GAUGE_ZONES = [
  { max: 0, color: '#94a3b8', soft: '#eef1f4', track: '#e6e9ee', glow: 'rgba(148,163,184,0.30)', label: 'Защита выключена' },
  { max: 49, color: '#dc2626', soft: '#fdeaea', track: '#f3d7d7', glow: 'rgba(220,38,38,0.32)', label: 'Слабая защита' },
  { max: 79, color: '#d97706', soft: '#fdf2e3', track: '#f1e1c4', glow: 'rgba(217,119,6,0.32)', label: 'Средняя защита' },
  { max: 99, color: '#16a34a', soft: '#e8f6ee', track: '#d0ead9', glow: 'rgba(22,163,74,0.32)', label: 'Высокая защита' },
  { max: 100, color: '#16a34a', soft: '#e8f6ee', track: '#d0ead9', glow: 'rgba(22,163,74,0.40)', label: 'Максимальная защита' },
]
function zoneFor(score) {
  for (const z of GAUGE_ZONES) if (score <= z.max) return z
  return GAUGE_ZONES[GAUGE_ZONES.length - 1]
}
let _gaugeLen = 0
function setGauge(score) {
  const z = zoneFor(score)
  const root = document.documentElement.style
  root.setProperty('--gauge-color', z.color)
  root.setProperty('--gauge-soft', z.soft)
  root.setProperty('--gauge-track', z.track)
  root.setProperty('--gauge-glow', z.glow)

  const path = $('gauge-value')
  if (path) {
    if (!_gaugeLen) _gaugeLen = path.getTotalLength()
    path.style.strokeDasharray = String(_gaugeLen)
    path.style.strokeDashoffset = String(_gaugeLen * (1 - score / 100))
  }
  $('gauge-num').textContent = score
  $('gauge-label-text').textContent = z.label
}

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

  // Live copy of settings that drives the protection gauge.
  const state = { ...settings }
  const refreshGauge = () => setGauge(computeScore(state))

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
    state.enabled = on
    refreshGauge()
    await send({ type: 'setSettings', settings: { enabled: on } })
  })

  // Toggle wiring helper: reflect into state, redraw gauge, persist.
  const wire = (id, key) => {
    const el = $(id)
    el.checked = settings[key] !== false // defaults are all "on"
    el.addEventListener('change', async () => {
      state[key] = el.checked
      refreshGauge()
      await send({ type: 'setSettings', settings: { [key]: el.checked } })
    })
  }
  wire('blockWarnings', 'blockWarnings')
  wire('badges', 'badges')
  wire('pageGuard', 'pageGuard')
  wire('feedEnabled', 'feedEnabled')
  wire('adblock', 'adblock')

  refreshGauge()

  // Rules manager: open / close + wiring
  $('rules-open').addEventListener('click', openRules)
  $('rv-back').addEventListener('click', closeRules)
  $('rv-add-btn').addEventListener('click', addRuleFromInput)
  $('rv-add-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') addRuleFromInput() })
  $('rv-search').addEventListener('input', (e) => {
    rulesQuery = e.target.value.trim().toLowerCase()
    renderRulesList()
  })
  for (const chip of document.querySelectorAll('.rv-chip')) {
    chip.addEventListener('click', () => {
      rulesFilter = chip.dataset.f
      for (const c of document.querySelectorAll('.rv-chip')) c.classList.toggle('is-active', c === chip)
      renderRulesList()
    })
  }
  $('rv-export').addEventListener('click', exportRules)
  $('rv-import').addEventListener('click', () => $('rv-file').click())
  $('rv-file').addEventListener('change', (e) => {
    const file = e.target.files[0]
    if (file) importRulesFile(file)
    e.target.value = ''
  })
  // Add-target segmented control (white / black list)
  for (const seg of document.querySelectorAll('.rv-seg-btn')) {
    seg.addEventListener('click', () => {
      addTarget = seg.dataset.t
      for (const b of document.querySelectorAll('.rv-seg-btn')) b.classList.toggle('is-active', b === seg)
    })
  }
  // Bulk selection
  $('rv-checkall').addEventListener('change', (e) => {
    for (const r of currentFiltered) {
      if (e.target.checked) selected.add(r.host)
      else selected.delete(r.host)
    }
    renderRulesList()
  })
  $('rv-bulk-del').addEventListener('click', deleteSelected)
  $('rv-bulk-white').addEventListener('click', () => moveSelected('allow'))
  $('rv-bulk-black').addEventListener('click', () => moveSelected('block'))

  await analyzeActiveTab()
  await loadRules()

  // Hold the splash for a graceful minimum, then fade it out.
  const elapsed = Date.now() - splashStart
  setTimeout(hideSplash, Math.max(0, 1400 - elapsed))
}

// ============ Rules manager ============
const RENDER_CAP = 300
let allRules = [] // [{ host, type }]
let rulesFilter = 'all' // all | allow | block
let rulesQuery = ''
let currentFiltered = [] // rules matching the active filter+search (full, uncapped)
let lastDeleted = [] // [{ host, type }] from the most recent delete, for undo
let addTarget = 'allow' // which list the add field targets: allow | block
const selected = new Set() // hosts ticked for bulk editing

function openRules() {
  document.querySelector('.topbar').hidden = true
  $('view-dash').hidden = true
  $('view-rules').hidden = false
  $('rv-search').focus()
}
function closeRules() {
  $('view-rules').hidden = true
  document.querySelector('.topbar').hidden = false
  $('view-dash').hidden = false
}

async function loadRules() {
  selected.clear()
  const res = (await send({ type: 'getUserRules' })) || {}
  const allow = res.allow || []
  const block = res.block || []
  allRules = [
    ...allow.map((host) => ({ host, type: 'allow' })),
    ...block.map((host) => ({ host, type: 'block' })),
  ].sort((a, b) => a.host.localeCompare(b.host))

  $('rules-count').textContent = String(allRules.length)
  $('rv-count').textContent = String(allRules.length)
  $('cnt-all').textContent = String(allRules.length)
  $('cnt-allow').textContent = String(allow.length)
  $('cnt-block').textContent = String(block.length)
  renderRulesList()
}

function plural(n, one, few, many) {
  const m10 = n % 10
  const m100 = n % 100
  if (m10 === 1 && m100 !== 11) return one
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few
  return many
}

function renderRulesList() {
  const list = $('rv-list')
  const footText = $('rv-foot-text')
  list.innerHTML = ''

  currentFiltered = allRules.filter(
    (r) =>
      (rulesFilter === 'all' || r.type === rulesFilter) &&
      (!rulesQuery || r.host.includes(rulesQuery))
  )
  const filtered = currentFiltered

  if (!filtered.length) {
    const li = document.createElement('li')
    li.className = 'rules-empty'
    li.textContent = allRules.length ? 'Ничего не найдено' : 'Вы пока не добавляли свои домены'
    list.appendChild(li)
    footText.textContent = ''
    updateSelectionUI()
    return
  }

  const shown = filtered.slice(0, RENDER_CAP)
  for (const { host, type } of shown) {
    const li = document.createElement('li')
    li.className = 'rule-item' + (selected.has(host) ? ' is-selected' : '')

    const check = document.createElement('input')
    check.type = 'checkbox'
    check.className = 'rule-check'
    check.checked = selected.has(host)
    check.title = 'Выбрать'
    check.addEventListener('change', () => {
      if (check.checked) selected.add(host)
      else selected.delete(host)
      li.classList.toggle('is-selected', check.checked)
      updateSelectionUI()
    })

    const tag = document.createElement('span')
    tag.className = `rule-tag ${type}`
    tag.textContent = type === 'allow' ? 'Белый' : 'Чёрный'

    const name = document.createElement('span')
    name.className = 'rule-host'
    name.textContent = host
    name.title = host

    const del = document.createElement('button')
    del.className = 'rule-del'
    del.type = 'button'
    del.textContent = '✕'
    del.title = 'Удалить'
    del.addEventListener('click', async () => {
      lastDeleted = [{ host, type }]
      await send({ type: 'removeUserRule', host })
      await loadRules()
      analyzeActiveTab()
      showUndo(`Удалено: ${host}`)
    })

    li.append(check, tag, name, del)
    list.appendChild(li)
  }

  footText.textContent =
    filtered.length > shown.length
      ? `Показано ${shown.length} из ${filtered.length} — уточните поиск`
      : `${filtered.length} ${plural(filtered.length, 'правило', 'правила', 'правил')}`
  updateSelectionUI()
}

function updateSelectionUI() {
  const n = selected.size
  $('rv-bulk').hidden = n === 0
  $('rv-checkall-label').textContent = n ? `Выбрано: ${n}` : 'Выбрать все'
  const allSel = currentFiltered.length > 0 && currentFiltered.every((r) => selected.has(r.host))
  const box = $('rv-checkall')
  box.checked = allSel
  box.indeterminate = n > 0 && !allSel
}

let _msgTimer = 0
function showRvMsg(text, isError) {
  const el = $('rv-msg')
  el.textContent = text
  el.style.color = isError ? '#dc2626' : '#16a34a'
  clearTimeout(_msgTimer)
  _msgTimer = setTimeout(() => { el.textContent = '' }, 3000)
}

// Toast with an "Отменить" action; the deletion can be undone for ~8s.
function showUndo(text) {
  const el = $('rv-msg')
  el.textContent = ''
  el.style.color = ''
  const span = document.createElement('span')
  span.className = 'rv-undo-text'
  span.textContent = text
  const btn = document.createElement('button')
  btn.type = 'button'
  btn.className = 'rv-undo'
  btn.textContent = 'Отменить'
  btn.addEventListener('click', undoDelete)
  el.append(span, btn)
  clearTimeout(_msgTimer)
  _msgTimer = setTimeout(() => {
    el.textContent = ''
    lastDeleted = []
  }, 8000)
}

async function undoDelete() {
  if (!lastDeleted.length) return
  const allow = lastDeleted.filter((r) => r.type === 'allow').map((r) => r.host)
  const block = lastDeleted.filter((r) => r.type === 'block').map((r) => r.host)
  lastDeleted = []
  clearTimeout(_msgTimer)
  await send({ type: 'importUserRules', allow, block })
  await loadRules()
  analyzeActiveTab()
  showRvMsg('Восстановлено')
}

async function addRuleFromInput() {
  const input = $('rv-add-input')
  let host = input.value.trim()
  if (!host) return
  if (/^https?:\/\//i.test(host)) { try { host = new URL(host).hostname } catch {} }
  host = host.toLowerCase().replace(/^www\./, '')
  if (!host.includes('.')) { showRvMsg('Введите корректный домен', true); return }
  await send({ type: addTarget === 'block' ? 'blockAlways' : 'allowAlways', host })
  input.value = ''
  showRvMsg(`${host} → ${addTarget === 'block' ? 'чёрный' : 'белый'} список`)
  await loadRules()
  analyzeActiveTab()
}

// Styled confirmation dialog → Promise<boolean>. Replaces window.confirm().
function confirmModal(text, okLabel = 'Удалить') {
  return new Promise((resolve) => {
    const modal = $('modal')
    $('modal-text').textContent = text
    $('modal-ok').textContent = okLabel
    modal.hidden = false
    const done = (val) => {
      modal.hidden = true
      $('modal-ok').removeEventListener('click', onOk)
      $('modal-cancel').removeEventListener('click', onCancel)
      modal.removeEventListener('click', onBackdrop)
      document.removeEventListener('keydown', onKey)
      resolve(val)
    }
    const onOk = () => done(true)
    const onCancel = () => done(false)
    const onBackdrop = (e) => { if (e.target === modal) done(false) }
    const onKey = (e) => {
      if (e.key === 'Escape') done(false)
      else if (e.key === 'Enter') done(true)
    }
    $('modal-ok').addEventListener('click', onOk)
    $('modal-cancel').addEventListener('click', onCancel)
    modal.addEventListener('click', onBackdrop)
    document.addEventListener('keydown', onKey)
    $('modal-ok').focus()
  })
}

function selectedItems() {
  const byHost = new Map(allRules.map((r) => [r.host, r.type]))
  return [...selected].filter((h) => byHost.has(h)).map((h) => ({ host: h, type: byHost.get(h) }))
}

async function deleteSelected() {
  const items = selectedItems()
  if (!items.length) return
  const ok = await confirmModal(`Удалить выбранные правила (${items.length})? Действие необратимо.`, 'Удалить')
  if (!ok) return
  lastDeleted = items
  await send({ type: 'removeUserRules', hosts: items.map((i) => i.host) })
  await loadRules()
  analyzeActiveTab()
  showUndo(`Удалено: ${items.length}`)
}

async function moveSelected(toType) {
  const items = selectedItems().filter((i) => i.type !== toType)
  if (!items.length) {
    showRvMsg('Нечего переносить', true)
    return
  }
  const hosts = items.map((i) => i.host)
  await send({ type: 'removeUserRules', hosts })
  await send({ type: 'importUserRules', allow: toType === 'allow' ? hosts : [], block: toType === 'block' ? hosts : [] })
  await loadRules()
  analyzeActiveTab()
  showRvMsg(`Перенесено в ${toType === 'allow' ? 'белый' : 'чёрный'} список: ${hosts.length}`)
}

function exportRules() {
  const data = {
    app: 'LinkGuard',
    version: 1,
    allow: allRules.filter((r) => r.type === 'allow').map((r) => r.host),
    block: allRules.filter((r) => r.type === 'block').map((r) => r.host),
  }
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'linkguard-rules.json'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  showRvMsg('Список выгружен в файл')
}

async function importRulesFile(file) {
  try {
    const data = JSON.parse(await file.text())
    const allow = Array.isArray(data) ? data : data.allow || []
    const block = (data && data.block) || []
    if (!allow.length && !block.length) {
      showRvMsg('В файле нет доменов', true)
      return
    }
    const res = await send({ type: 'importUserRules', allow, block })
    await loadRules()
    analyzeActiveTab()
    showRvMsg(`Импортировано · белый: ${res.allow}, чёрный: ${res.block}`)
  } catch {
    showRvMsg('Не удалось прочитать файл (нужен JSON)', true)
  }
}

init()
