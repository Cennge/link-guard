// Service worker: intercepts main-frame navigations before they commit and, when
// the detector flags a host, redirects the tab to the warning interstitial.
// MV3 can't block synchronously without enterprise webRequestBlocking, so we
// pre-empt the load with chrome.tabs.update — fast and reliable for top-level nav.

import { analyze, Verdict } from './detector.js'

const WARNING_PAGE = chrome.runtime.getURL('pages/warning.html')

// Per-session list of hosts the user chose to visit anyway, so we don't loop.
const ALLOW_KEY = 'allowlist'
// User's persistent settings.
const SETTINGS_KEY = 'settings'
const USER_ALLOW_KEY = 'userAllow'
const USER_BLOCK_KEY = 'userBlock'

const defaultSettings = { enabled: true, blockWarnings: true, badges: true }

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
  if (details.frameId !== 0) return // top-level frames only

  const settings = await getSettings()
  if (!settings.enabled) return

  try {
    const parsed = new URL(details.url)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return
    const hostname = parsed.hostname.toLowerCase()

    // 1. Check user block list
    const userBlock = await getUserBlock()
    if (userBlock.has(hostname)) {
      await bumpStat('blocked')
      try {
        await chrome.tabs.update(details.tabId, { 
          url: buildWarningUrl(details.url, { verdict: Verdict.DANGER, reason: 'user_blocked', hostname }) 
        })
      } catch {}
      return
    }

    // 2. Check user allow list
    const userAllow = await getUserAllow()
    if (userAllow.has(hostname)) return

    // 3. Analyze normally
    const result = analyze(details.url)
    if (result.verdict === Verdict.SAFE) return
    if (result.verdict === Verdict.WARNING && !settings.blockWarnings) return

    // Respect "proceed anyway" for this browsing session.
    const allow = await getAllowlist()
    if (result.hostname && allow.has(result.hostname)) return

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
      sendResponse({ ok: true })
      return
    }
    if (msg.type === 'removeUserRule' && msg.host) {
      await removeFromUserAllow(msg.host)
      await removeFromUserBlock(msg.host)
      sendResponse({ ok: true })
      return
    }
    if (msg.type === 'analyze' && msg.url) {
      sendResponse(analyze(msg.url))
      return
    }
    if (msg.type === 'analyzeBatch' && Array.isArray(msg.urls)) {
      // Used by the content script to badge links. Returns a slim result per URL.
      const settings = await getSettings()
      if (!settings.badges) {
        sendResponse({ badges: false, results: [] })
        return
      }
      const results = msg.urls.map((u) => {
        const r = analyze(u)
        return {
          verdict: r.verdict,
          trusted: !!r.trusted,
          reason: r.reason,
          brand: r.brand,
          registrable: r.registrable,
        }
      })
      sendResponse({ badges: true, results })
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
      await chrome.storage.local.set({ [SETTINGS_KEY]: { ...current, ...msg.settings } })
      sendResponse({ ok: true })
      return
    }
    sendResponse({ ok: false })
  })()
  return true // keep the channel open for the async response
})

chrome.runtime.onInstalled.addListener(async () => {
  const current = await chrome.storage.local.get(SETTINGS_KEY)
  if (!current[SETTINGS_KEY]) {
    await chrome.storage.local.set({ [SETTINGS_KEY]: defaultSettings })
  }
})
