// Popup: shows the verdict for the active tab, lifetime stats, and the toggles.

const VERDICT_TEXT = {
  safe: { cls: 'safe', text: '✓ Безопасно' },
  warning: { cls: 'warning', text: '⚠ Подозрительно' },
  danger: { cls: 'danger', text: '✕ Опасно — фишинг' },
}

function send(msg) {
  return new Promise((resolve) => chrome.runtime.sendMessage(msg, resolve))
}

async function init() {
  const state = await send({ type: 'getState' })
  const { settings, stats } = state

  document.getElementById('stat-blocked').textContent = stats.blocked
  document.getElementById('stat-proceeded').textContent = stats.proceeded

  const enabled = document.getElementById('enabled')
  const blockWarnings = document.getElementById('blockWarnings')
  enabled.checked = settings.enabled
  blockWarnings.checked = settings.blockWarnings

  const statusEl = document.getElementById('status')
  const applyStatusLabel = () => {
    statusEl.textContent = enabled.checked ? 'включено' : 'выключено'
    statusEl.classList.toggle('off', !enabled.checked)
  }
  applyStatusLabel()

  enabled.addEventListener('change', async () => {
    await send({ type: 'setSettings', settings: { enabled: enabled.checked } })
    applyStatusLabel()
  })
  blockWarnings.addEventListener('change', async () => {
    await send({ type: 'setSettings', settings: { blockWarnings: blockWarnings.checked } })
  })

  // Analyze the active tab.
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  const hostEl = document.getElementById('current-host')
  const verdictEl = document.getElementById('current-verdict')

  if (!tab || !tab.url || !/^https?:/.test(tab.url)) {
    hostEl.textContent = '—'
    verdictEl.textContent = 'нет веб-страницы'
    verdictEl.className = 'current-verdict'
    return
  }

  try {
    hostEl.textContent = new URL(tab.url).hostname
  } catch {
    hostEl.textContent = tab.url
  }

  const result = await send({ type: 'analyze', url: tab.url })
  const info = VERDICT_TEXT[result.verdict] || VERDICT_TEXT.safe
  verdictEl.textContent = info.text + (result.brand ? ` (под ${result.brand})` : '')
  verdictEl.className = `current-verdict ${info.cls}`
}

init()
