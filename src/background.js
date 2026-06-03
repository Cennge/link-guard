// Service worker: intercepts main-frame navigations before they commit and, when
// the detector flags a host, redirects the tab to the warning interstitial.
// MV3 can't block synchronously without enterprise webRequestBlocking, so we
// pre-empt the load with chrome.tabs.update — fast and reliable for top-level nav.

import { analyze, analyzePageSignals, Verdict } from './detector.js'
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
// Ad/tracker hosts from the updatable ad feed.
const AD_KEY = 'adExtra'
// Sites where the user disabled ad blocking ("not on this site").
const AD_ALLOW_KEY = 'adAllow'

async function getAdAllow() {
  const { [AD_ALLOW_KEY]: a } = await chrome.storage.local.get(AD_ALLOW_KEY)
  return new Set(a || [])
}

const defaultSettings = {
  enabled: true,
  blockWarnings: true,
  badges: true,
  // On-page credential-phishing guard (the warning banner).
  pageGuard: true,
  // Block ads / trackers via the bundled DNR ruleset + cosmetic CSS.
  adblock: true,
  // Updatable ad/tracker domain feed (free, no key) — adds to the bundled rules.
  adFeeds: ['https://pgl.yoyo.org/adservers/serverlist.php?hostformat=plain&showintro=0&mimetype=plaintext'],
  // Known-phishing host feeds — all free, no API key, no registration. They are
  // DOWNLOADED and checked locally (no browsing data leaves the device). Set
  // feedEnabled:false to go fully offline.
  feedEnabled: true,
  // Small/fresh feeds first so they're always ingested; the large list fills
  // the remaining budget (FEED_CAP).
  feeds: [
    'https://urlhaus.abuse.ch/downloads/hostfile/',
    'https://openphish.com/feed.txt',
    'https://raw.githubusercontent.com/mitchellkrogza/Phishing.Database/master/phishing-domains-ACTIVE.txt',
  ],
  // Optional extra custom feed URL (appended to the built-in ones).
  feedUrl: '',
}

const FEED_CAP = 150000 // max phishing feed hosts kept in storage
const ADFEED_CAP = 12000 // max ad-feed hosts (kept as DNR dynamic rules)

// --- Known-phishing blocklist (bundled file + user/feed extra) ---
let _bundledPhish = null
let _phishSetCache = null // bundled ∪ feed hosts, cached in memory for speed
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
  if (_phishSetCache) return _phishSetCache
  const set = new Set(await getBundledPhish())
  const { [PHISH_KEY]: extra } = await chrome.storage.local.get(PHISH_KEY)
  for (const h of extra || []) set.add(String(h).toLowerCase())
  _phishSetCache = set
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

// Hard, network-level blocking for KNOWN-bad hosts (user block list + phishing
// blocklist) via declarativeNetRequest — including the MAIN FRAME, so the evil
// host's page never loads (no race). The nice interstitial is still shown by the
// onNavigate soft-redirect on top. Hosts the user explicitly allowed (this
// session or permanently) are excluded so "proceed anyway" works.
async function syncBlockRules() {
  if (!chrome.declarativeNetRequest) return
  try {
    const existing = await chrome.declarativeNetRequest.getDynamicRules()
    const removeRuleIds = existing.map((r) => r.id)

    const settings = await getSettings()
    if (!settings.enabled) {
      await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds, addRules: [] })
      return
    }

    const allowed = new Set([...(await getUserAllow()), ...(await getAllowlist())])
    const rules = []
    let id = 1
    const PHISH_TYPES = [
      'main_frame', 'sub_frame', 'script', 'xmlhttprequest', 'image',
      'stylesheet', 'font', 'media', 'websocket', 'other',
    ]
    // Phishing / user-block rules at HIGH priority (10) so a per-site ad
    // exemption (allowAllRequests, priority 2) never disables phishing blocking.
    for (const h of new Set([...(await getPhishSet()), ...(await getUserBlock())])) {
      if (allowed.has(h)) continue // respect "proceed anyway" / whitelist
      if (id > 8000) break // DNR dynamic-rule budget guard
      rules.push({ id: id++, priority: 10, action: { type: 'block' }, condition: { urlFilter: `||${h}^`, resourceTypes: PHISH_TYPES } })
    }

    // Ad/tracker feed (dynamic), priority 1 — only while ad blocking is on.
    if (settings.adblock !== false) {
      const { [AD_KEY]: ads } = await chrome.storage.local.get(AD_KEY)
      const AD_TYPES = [
        'main_frame', 'sub_frame', 'script', 'xmlhttprequest', 'image',
        'stylesheet', 'font', 'media', 'websocket', 'other', 'object', 'ping',
      ]
      for (const h of ads || []) {
        if (allowed.has(h)) continue
        if (id > 8000 + ADFEED_CAP) break
        rules.push({ id: id++, priority: 1, action: { type: 'block' }, condition: { urlFilter: `||${h}^`, resourceTypes: AD_TYPES } })
      }
    }

    // Per-site ad exemption: allowAllRequests (priority 2) beats ad block rules
    // (priority 1) but not phishing rules (priority 10). Frees the whole page.
    let aid = 9000000
    for (const h of await getAdAllow()) {
      rules.push({
        id: aid++,
        priority: 2,
        action: { type: 'allowAllRequests' },
        condition: { requestDomains: [h], resourceTypes: ['main_frame', 'sub_frame'] },
      })
    }

    await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds, addRules: rules })
  } catch {
    // DNR unavailable or rule limit hit — heuristic path still protects main-frame.
  }
}

// Enable/disable the bundled ad/tracker DNR ruleset per settings.
async function syncAdblock() {
  if (!chrome.declarativeNetRequest || !chrome.declarativeNetRequest.updateEnabledRulesets) return
  try {
    const s = await getSettings()
    const on = s.enabled !== false && s.adblock !== false
    const ids = ['ads', 'ads-extra', 'ads-regex']
    await chrome.declarativeNetRequest.updateEnabledRulesets(
      on ? { enableRulesetIds: ids } : { disableRulesetIds: ids }
    )
  } catch {
    // ruleset API unavailable / id mismatch — ignore
  }
}

// Register the MAIN-world content scripts (pop-under guard + anti-adblock
// scriptlets) at document_start. They run in the page's JS context and are
// EXEMPT from the page CSP — unlike a DOM-injected <script>, which strict-CSP
// sites (e.g. rezka.ag) block. Gating lives here: registered only while ad
// blocking is on, and sites on the per-site ad allowlist are excluded.
const MAIN_SCRIPT_IDS = ['lg-antipopup-main', 'lg-scriptlets-main']
async function syncContentScripts() {
  if (!chrome.scripting || !chrome.scripting.registerContentScripts) return
  try {
    // Always clear our previous registration first (idempotent re-sync).
    try { await chrome.scripting.unregisterContentScripts({ ids: MAIN_SCRIPT_IDS }) } catch {}

    const s = await getSettings()
    if (s.enabled === false || s.adblock === false) return

    // Exclude allowlisted sites ("не блокировать рекламу здесь") and their subdomains.
    const exclude = []
    for (const h of await getAdAllow()) exclude.push(`*://${h}/*`, `*://*.${h}/*`)
    const common = {
      matches: ['http://*/*', 'https://*/*'],
      runAt: 'document_start',
      world: 'MAIN',
      allFrames: true,
      ...(exclude.length ? { excludeMatches: exclude } : {}),
    }
    await chrome.scripting.registerContentScripts([
      { id: 'lg-antipopup-main', js: ['content/antipopup.main.js'], ...common },
      { id: 'lg-scriptlets-main', js: ['content/scriptlets.main.js'], ...common },
    ])
  } catch {
    // scripting API / MAIN world unavailable — pop-under + scriptlets just won't run.
  }
}

// Parse one feed body (JSON list, /etc/hosts file, plain domains, or URL list)
// into normalised hostnames.
function parseFeedText(text) {
  let lines
  try {
    const j = JSON.parse(text)
    lines = (Array.isArray(j) ? j : j.hosts || []).map(String)
  } catch {
    lines = text.split(/\r?\n/)
  }
  const out = []
  for (let l of lines) {
    l = l.trim()
    if (!l || l.startsWith('#') || l.startsWith('!')) continue
    if (/\s/.test(l)) l = l.split(/\s+/).pop() // "0.0.0.0 evil.tld" → evil.tld
    l = l.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0].trim()
    if (l && l.includes('.') && !/^\d+\.\d+\.\d+\.\d+$/.test(l) && l !== 'localhost') out.push(l)
  }
  return out
}

// Refresh the phishing host list from the configured free feeds (downloaded and
// checked locally). All feeds are merged; failures are skipped.
async function updateFeed() {
  const settings = await getSettings()
  if (settings.feedEnabled === false) return
  const urls = [...(settings.feeds || []), ...(settings.feedUrl ? [settings.feedUrl] : [])]
  if (!urls.length) return

  const set = new Set()
  for (const url of urls) {
    try {
      const text = await (await fetch(url)).text()
      for (const h of parseFeedText(text)) {
        if (set.size >= FEED_CAP) break
        set.add(h)
      }
    } catch {
      // this feed unreachable / no permission — skip it, keep the others
    }
  }
  if (!set.size) return // total failure — keep the previous list
  await chrome.storage.local.set({ [PHISH_KEY]: [...set] })
  _phishSetCache = null
  await syncBlockRules()
}

// Refresh the ad/tracker domain feed (free, no key). Stored as adExtra and
// turned into DNR rules by syncBlockRules when ad blocking is on.
async function updateAdFeed() {
  const settings = await getSettings()
  if (settings.enabled === false || settings.adblock === false) return
  const urls = settings.adFeeds || []
  if (!urls.length) return
  const set = new Set()
  for (const url of urls) {
    try {
      const text = await (await fetch(url)).text()
      for (const h of parseFeedText(text)) {
        if (set.size >= ADFEED_CAP) break
        set.add(h)
      }
    } catch {
      // feed unreachable / no permission — skip
    }
  }
  if (!set.size) return
  await chrome.storage.local.set({ [AD_KEY]: [...set] })
  await syncBlockRules()
}

async function bumpStat(key, by = 1) {
  const { stats } = await chrome.storage.local.get('stats')
  const next = stats || { blocked: 0, proceeded: 0, adsBlocked: 0 }
  next[key] = (next[key] || 0) + by
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
      await syncBlockRules() // drop any hard-block rule so the user can proceed
      await bumpStat('proceeded')
      sendResponse({ ok: true })
      return
    }
    if (msg.type === 'allowAlways' && msg.host) {
      await addToUserAllow(msg.host)
      await syncBlockRules()
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
    if (msg.type === 'getUserRules') {
      sendResponse({
        allow: [...(await getUserAllow())],
        block: [...(await getUserBlock())],
      })
      return
    }
    if (msg.type === 'removeUserRules' && Array.isArray(msg.hosts)) {
      const allow = await getUserAllow()
      const block = await getUserBlock()
      for (const h of msg.hosts) {
        allow.delete(h)
        block.delete(h)
      }
      await chrome.storage.local.set({
        [USER_ALLOW_KEY]: [...allow],
        [USER_BLOCK_KEY]: [...block],
      })
      await syncBlockRules()
      sendResponse({ ok: true })
      return
    }
    if (msg.type === 'importUserRules') {
      const norm = (arr) =>
        (Array.isArray(arr) ? arr : [])
          .map((h) => String(h).toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0].trim())
          .filter((h) => h && h.includes('.'))
      const allow = await getUserAllow()
      const block = await getUserBlock()
      for (const h of norm(msg.allow)) if (allow.size < 50000) allow.add(h)
      for (const h of norm(msg.block)) if (block.size < 50000) block.add(h)
      await chrome.storage.local.set({
        [USER_ALLOW_KEY]: [...allow],
        [USER_BLOCK_KEY]: [...block],
      })
      await syncBlockRules()
      sendResponse({ ok: true, allow: allow.size, block: block.size })
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
    if (msg.type === 'analyzePage' && msg.url) {
      const settings = await getSettings()
      if (settings.pageGuard === false) {
        sendResponse({ verdict: Verdict.SAFE })
        return
      }
      const r = analyzePageSignals(msg.url, msg)
      if (r.verdict !== Verdict.SAFE && r.hostname) {
        // Don't second-guess the user's own allow-list or popular real sites.
        const userAllow = await getUserAllow()
        if (userAllow.has(r.hostname)) {
          sendResponse({ verdict: Verdict.SAFE })
          return
        }
        const top = await getTopDomains()
        if (top && (top.test(r.hostname) || (r.registrable && top.test(r.registrable)))) {
          sendResponse({ verdict: Verdict.SAFE })
          return
        }
      }
      sendResponse(r)
      return
    }
    if (msg.type === 'updateFeed') {
      await updateFeed()
      await updateAdFeed()
      sendResponse({ ok: true })
      return
    }
    if (msg.type === 'adsBlocked') {
      const n = Number(msg.n) || 0
      if (n > 0) await bumpStat('adsBlocked', n)
      sendResponse({ ok: true })
      return
    }
    if (msg.type === 'getState') {
      sendResponse({
        settings: await getSettings(),
        stats: (await chrome.storage.local.get('stats')).stats || { blocked: 0, proceeded: 0, adsBlocked: 0 },
        adAllow: [...(await getAdAllow())],
      })
      return
    }
    if (msg.type === 'adAllowSet' && msg.host) {
      const host = String(msg.host).toLowerCase().replace(/^www\./, '')
      const set = await getAdAllow()
      if (msg.on === false) set.delete(host)
      else set.add(host)
      await chrome.storage.local.set({ [AD_ALLOW_KEY]: [...set] })
      await syncBlockRules()
      await syncContentScripts() // refresh excludeMatches for this site
      sendResponse({ ok: true, allow: [...set] })
      return
    }
    if (msg.type === 'setSettings') {
      const current = await getSettings()
      const next = { ...current, ...msg.settings }
      await chrome.storage.local.set({ [SETTINGS_KEY]: next })
      // React to feed changes: refresh when (re)enabled, drop the list when off.
      if (msg.settings && ('feedUrl' in msg.settings || 'feedEnabled' in msg.settings)) {
        if (next.feedEnabled === false) {
          await chrome.storage.local.set({ [PHISH_KEY]: [] })
          _phishSetCache = null
          await syncBlockRules()
        } else {
          updateFeed()
        }
      }
      // Master switch toggled → install or tear down the hard-block rules.
      if (msg.settings && ('enabled' in msg.settings || 'adblock' in msg.settings)) await syncBlockRules()
      if (msg.settings && ('adblock' in msg.settings || 'enabled' in msg.settings)) await syncAdblock()
      if (msg.settings && ('adblock' in msg.settings || 'enabled' in msg.settings)) await syncContentScripts()
      if (msg.settings && 'adblock' in msg.settings && next.adblock !== false) updateAdFeed()
      sendResponse({ ok: true })
      return
    }
    sendResponse({ ok: false })
  })()
  return true // keep the channel open for the async response
})

// Drop the in-memory phishing-set cache whenever the stored feed list changes.
chrome.storage?.onChanged?.addListener((changes) => {
  if (changes && changes[PHISH_KEY]) _phishSetCache = null
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
  syncAdblock()
  syncContentScripts()
  updateFeed()
  updateAdFeed()
})

// Keep the hard-block + adblock rules in sync whenever the worker spins up, and
// refresh the feeds on a daily alarm. All guarded so older Chrome / the test
// harness (which mock only a subset of chrome.*) don't throw at load.
chrome.runtime?.onStartup?.addListener(() => {
  syncBlockRules()
  syncAdblock()
  syncContentScripts()
  updateFeed()
  updateAdFeed()
})
if (chrome.alarms) {
  chrome.alarms.create('lg-feed', { periodInMinutes: 1440 })
  chrome.alarms.onAlarm?.addListener((a) => {
    if (a.name === 'lg-feed') {
      updateFeed()
      updateAdFeed()
    }
  })
}
// Best-effort initial sync (e.g. after a manual reload that isn't onInstalled).
syncBlockRules()
syncAdblock()
syncContentScripts()
