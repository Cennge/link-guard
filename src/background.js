// Service worker: intercepts main-frame navigations before they commit and, when
// the detector flags a host, redirects the tab to the warning interstitial.
// MV3 can't block synchronously without enterprise webRequestBlocking, so we
// pre-empt the load with chrome.tabs.update — fast and reliable for top-level nav.

import { analyze, Verdict } from './detector.js'
import { getTopDomains } from './bloom.js'

const WARNING_PAGE = chrome.runtime.getURL('pages/warning.html')

// Per-session list of hosts the user chose to visit anyway, so we don't loop.
const ALLOW_KEY = 'allowlist'
// User's persistent settings.
const SETTINGS_KEY = 'settings'
const USER_ALLOW_KEY = 'userAllow'
const USER_BLOCK_KEY = 'userBlock'
// User/feed-supplied phishing hosts (merged with the bundled blocklist).
const PHISH_KEY = 'phishingExtra'

const defaultSettings = {
  enabled: true,
  blockWarnings: true,
  badges: true,
  // Optional URL of a known-phishing host feed (newline- or JSON-list). Empty =
  // off (default), keeping the extension fully local unless the user opts in.
  feedUrl: '',
}

// --- Known-phishing blocklist (bundled file + user/feed extra) ---
let _bundledPhish = null
async function getBundledPhish() {
  if (_bundledPhish) return _bundledPhish
  try {
    const data = await (await fetch(chrome.runtime.getURL('data/phishing-hosts.json'))).json()
    _bundledPhish = new Set((data.hosts || []).map((h) => String(h).toLowerCase()))
  } catch {
    _bundledPhish = new Set()
  }
  return _bundledPhish
}
async function getPhishSet() {
  const set = new Set(await getBundledPhish())
  const { [PHISH_KEY]: extra } = await chrome.storage.local.get(PHISH_KEY)
  for (const h of extra || []) set.add(String(h).toLowerCase())
  return set
}

async function getSettings() {
  const { [SETTINGS_KEY]: s } = await chrome.storage.local.get(SETTINGS_KEY)
  return { ...defaultSettings, ...(s || {}) }
}

async function getAllowlist() {
  const { [ALLOW_KEY]: a } = await chrome.storage.session.get(ALLOW_KEY)
  return new Set(a || [])
}

async function addToAllowlist(host) {
  const set = await getAllowlist()
  set.add(host)
  await chrome.storage.session.set({ [ALLOW_KEY]: [...set] })
}

async function getUserAllow() {
  const { [USER_ALLOW_KEY]: a } = await chrome.storage.local.get(USER_ALLOW_KEY)
  return new Set(a || [])
}
async function addToUserAllow(host) {
  const set = await getUserAllow()
  set.add(host)
  await chrome.storage.local.set({ [USER_ALLOW_KEY]: [...set] })
}
async function removeFromUserAllow(host) {
  const set = await getUserAllow()
  set.delete(host)
  await chrome.storage.local.set({ [USER_ALLOW_KEY]: [...set] })
}

async function getUserBlock() {
  const { [USER_BLOCK_KEY]: b } = await chrome.storage.local.get(USER_BLOCK_KEY)
  return new Set(b || [])
}
async function addToUserBlock(host) {
  const set = await getUserBlock()
  set.add(host)
  await chrome.storage.local.set({ [USER_BLOCK_KEY]: [...set] })
}
async function removeFromUserBlock(host) {
  const set = await getUserBlock()
  set.delete(host)
  await chrome.storage.local.set({ [USER_BLOCK_KEY]: [...set] })
}

// Single source of truth: run the heuristic detector, then layer on user
// rules, the known-phishing blocklist, and top-domain false-positive
// suppression. Async because the blocklist/bloom load lazily.
async function classify(url) {
  const r = analyze(url)
  if (!r.hostname) return r

  const userBlock = await getUserBlock()
  if (userBlock.has(r.hostname)) {
    return { ...r, verdict: Verdict.DANGER, reason: 'user_blocked', trusted: false }
  }
  const userAllow = await getUserAllow()
  if (userAllow.has(r.hostname)) {
    return { ...r, verdict: Verdict.SAFE, reason: 'user_allowed', trusted: true }
  }

  // Hard DANGER: host (or its registrable) is on the known-phishing blocklist.
  const phish = await getPhishSet()
  if (phish.has(r.hostname) || (r.registrable && phish.has(r.registrable))) {
    return { ...r, verdict: Verdict.DANGER, reason: 'blocklist', trusted: false }
  }

  // False-positive suppression: only soft WARNINGs, and only for domains that
  // are in the global top-1M. Never downgrade a high-confidence DANGER.
  if (r.verdict === Verdict.WARNING) {
    const top = await getTopDomains()
    if (top && (top.test(r.hostname) || (r.registrable && top.test(r.registrable)))) {
      return { verdict: Verdict.SAFE, hostname: r.hostname, registrable: r.registrable, suppressed: true }
    }
  }
  return r
}

// Hard, all-frame, all-resource blocking for KNOWN-bad hosts (user block list +
// phishing blocklist) via declarativeNetRequest. Main-frame is excluded so the
// nice interstitial (handled in onNavigate) wins for top-level navigations,
// while iframes / sub-resources get blocked outright.
async function syncBlockRules() {
  if (!chrome.declarativeNetRequest) return
  try {
    const hosts = new Set([...(await getPhishSet()), ...(await getUserBlock())])
    const rules = []
    let id = 1
    for (const h of hosts) {
      if (id > 5000) break // DNR dynamic-rule budget guard
      rules.push({
        id: id++,
        priority: 1,
        action: { type: 'block' },
        condition: {
          urlFilter: `||${h}^`,
          resourceTypes: [
            'sub_frame', 'script', 'xmlhttprequest', 'image',
            'stylesheet', 'font', 'media', 'websocket', 'other',
          ],
        },
      })
    }
    const existing = await chrome.declarativeNetRequest.getDynamicRules()
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: existing.map((r) => r.id),
      addRules: rules,
    })
  } catch {
    // DNR unavailable or rule limit hit — heuristic path still protects main-frame.
  }
}

// Optional opt-in: refresh the phishing host list from settings.feedUrl.
async function updateFeed() {
  const settings = await getSettings()
  if (!settings.feedUrl) return
  try {
    const text = await (await fetch(settings.feedUrl)).text()
    let hosts
    try {
      const j = JSON.parse(text)
      hosts = Array.isArray(j) ? j : j.hosts || []
    } catch {
      hosts = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))
    }
    hosts = hosts
      .map((h) => String(h).toLowerCase().replace(/^https?:\/\//, '').split('/')[0].trim())
      .filter(Boolean)
      .slice(0, 100000)
    await chrome.storage.local.set({ [PHISH_KEY]: hosts })
    await syncBlockRules()
  } catch {
    // feed unreachable / no permission — keep the previous list.
  }
}

async function bumpStat(key) {
  const { stats } = await chrome.storage.local.get('stats')
  const next = stats || { blocked: 0, proceeded: 0 }
  next[key] = (next[key] || 0) + 1
  await chrome.storage.local.set({ stats: next })
}

function buildWarningUrl(targetUrl, result) {
  const params = new URLSearchParams({
    target: targetUrl,
    verdict: result.verdict,
    reason: result.reason || '',
    brand: result.brand || '',
    host: result.hostname || '',
    suggestion: result.suggestion || '',
  })
  if (result.unicodeHost) params.set('unicode', result.unicodeHost)
  return `${WARNING_PAGE}?${params.toString()}`
}

async function onNavigate(details) {
  const settings = await getSettings()
  if (!settings.enabled) return

  try {
    const parsed = new URL(details.url)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return

    const result = await classify(details.url)
    if (result.verdict === Verdict.SAFE) return

    // Respect "proceed anyway" for this browsing session.
    const allow = await getAllowlist()
    if (result.hostname && allow.has(result.hostname)) return

    if (details.frameId !== 0) {
      // Sub-frame (embedded iframe): only intervene on high-confidence DANGER,
      // and replace the whole tab with the interstitial. Known-bad hosts are
      // additionally hard-blocked at the network layer by syncBlockRules().
      if (result.verdict !== Verdict.DANGER) return
    } else if (result.verdict === Verdict.WARNING && !settings.blockWarnings) {
      return
    }

    await bumpStat('blocked')
    try {
      await chrome.tabs.update(details.tabId, { url: buildWarningUrl(details.url, result) })
    } catch {
      // tab may have been closed mid-navigation; ignore.
    }
  } catch {
    // invalid URL; ignore
  }
}

chrome.webNavigation.onBeforeNavigate.addListener(onNavigate)

// --- Tab Badge Updater ---
async function updateTabBadge(tabId, url) {
  if (!url || (!url.startsWith('http:') && !url.startsWith('https:'))) {
    await chrome.action.setBadgeText({ tabId, text: '' }).catch(() => {})
    return
  }
  const settings = await getSettings()
  if (!settings.enabled) {
    await chrome.action.setBadgeText({ tabId, text: '' }).catch(() => {})
    return
  }

  const r = await classify(url)

  let text = ''
  let color = '#64748b' // default (none)

  if (r.verdict === Verdict.SAFE && r.trusted) {
    text = '✓'
    color = '#16a34a' // green
  } else if (r.verdict === Verdict.WARNING) {
    text = '!'
    color = '#d97706' // orange
  } else if (r.verdict === Verdict.DANGER) {
    text = 'X'
    color = '#dc2626' // red
  }

  try {
    await chrome.action.setBadgeBackgroundColor({ tabId, color })
    await chrome.action.setBadgeText({ tabId, text })
  } catch {}
}

chrome.tabs?.onUpdated?.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url || changeInfo.status === 'complete') {
    updateTabBadge(tabId, tab.url)
  }
})

chrome.tabs?.onActivated?.addListener(async (activeInfo) => {
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId)
    if (tab && tab.url) updateTabBadge(tab.id, tab.url)
  } catch {}
})
// Messages from the warning page / popup.
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  ;(async () => {
    if (msg.type === 'allow' && msg.host) {
      await addToAllowlist(msg.host)
      await bumpStat('proceeded')
      sendResponse({ ok: true })
      return
    }
    if (msg.type === 'allowAlways' && msg.host) {
      await addToUserAllow(msg.host)
      await bumpStat('proceeded')
      sendResponse({ ok: true })
      return
    }
    if (msg.type === 'blockAlways' && msg.host) {
      await addToUserBlock(msg.host)
      await syncBlockRules()
      sendResponse({ ok: true })
      return
    }
    if (msg.type === 'removeUserRule' && msg.host) {
      await removeFromUserAllow(msg.host)
      await removeFromUserBlock(msg.host)
      await syncBlockRules()
      sendResponse({ ok: true })
      return
    }
    if (msg.type === 'analyze' && msg.url) {
      sendResponse(await classify(msg.url))
      return
    }
    if (msg.type === 'analyzeBatch' && Array.isArray(msg.urls)) {
      // Used by the content script to badge links. Returns a slim result per URL.
      const settings = await getSettings()
      if (!settings.badges) {
        sendResponse({ badges: false, results: [] })
        return
      }
      const results = await Promise.all(
        msg.urls.map(async (u) => {
          const r = await classify(u)
          return {
            verdict: r.verdict,
            trusted: !!r.trusted,
            reason: r.reason,
            brand: r.brand,
            registrable: r.registrable,
          }
        })
      )
      sendResponse({ badges: true, results })
      return
    }
    if (msg.type === 'updateFeed') {
      await updateFeed()
      sendResponse({ ok: true })
      return
    }
    if (msg.type === 'getState') {
      sendResponse({
        settings: await getSettings(),
        stats: (await chrome.storage.local.get('stats')).stats || { blocked: 0, proceeded: 0 },
      })
      return
    }
    if (msg.type === 'setSettings') {
      const current = await getSettings()
      const next = { ...current, ...msg.settings }
      await chrome.storage.local.set({ [SETTINGS_KEY]: next })
      // If the feed URL was just (re)configured, refresh it immediately.
      if (msg.settings && 'feedUrl' in msg.settings && next.feedUrl && next.feedUrl !== current.feedUrl) {
        updateFeed()
      }
      sendResponse({ ok: true })
      return
    }
    sendResponse({ ok: false })
  })()
  return true // keep the channel open for the async response
})

chrome.runtime.onInstalled.addListener(async (details) => {
  const current = await chrome.storage.local.get(SETTINGS_KEY)
  
  if (details.reason === 'install' || !current[SETTINGS_KEY]) {
    // Первый запуск
    await chrome.storage.local.set({ [SETTINGS_KEY]: defaultSettings })
  } else if (details.reason === 'update') {
    // Обновление версии расширения
    let settings = current[SETTINGS_KEY]
    let needsUpdate = false

    // 1. Слияние: добавляем новые поля настроек, появившиеся в новой версии
    for (const key in defaultSettings) {
      if (!(key in settings)) {
        settings[key] = defaultSettings[key]
        needsUpdate = true
      }
    }

    // 2. Место для будущих миграций данных (если изменится структура)
    // if (details.previousVersion === '1.0.0') {
    //   ...
    // }

    if (needsUpdate) {
      await chrome.storage.local.set({ [SETTINGS_KEY]: settings })
    }
  }
  syncBlockRules()
  updateFeed()
})

// Keep the hard-block rules in sync whenever the worker spins up, and refresh
// the optional feed on a 12h alarm. All guarded so older Chrome / the test
// harness (which mock only a subset of chrome.*) don't throw at load.
chrome.runtime?.onStartup?.addListener(() => {
  syncBlockRules()
  updateFeed()
})
if (chrome.alarms) {
  chrome.alarms.create('lg-feed', { periodInMinutes: 720 })
  chrome.alarms.onAlarm?.addListener((a) => {
    if (a.name === 'lg-feed') updateFeed()
  })
}
// Best-effort initial sync (e.g. after a manual reload that isn't onInstalled).
syncBlockRules()
