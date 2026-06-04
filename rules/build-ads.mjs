// LinkGuard ad/tracker ruleset compiler (pure Node, no deps).
//
// Produces declarativeNetRequest rulesets + cosmetic/scriptlet data from free,
// no-key public filter lists (EasyList, EasyPrivacy) plus a curated high-value
// core. This is the uBlock-Origin-Lite approach: convert filter syntax to DNR at
// BUILD time, ship static rulesets, and enable as many as the browser's static
// rule budget allows at runtime (background.js: syncAdblock).
//
//   node rules/build-ads.mjs
//
// Outputs:
//   rules/ads.json          curated core blocks (incl. main_frame popunders)   [enabled]
//   rules/ads-regex.json    ad-server path/query regexes                       [enabled]
//   rules/ads-allow.json    EasyList @@ exceptions + $redirect rules           [enabled]
//   rules/ads-net-0..N.json EasyList/EasyPrivacy block rules, chunked          [adaptive]
//   rules/index.json        chunk ids + rule counts (for adaptive enabling)
//   data/cosmetics.json     domain-specific element-hiding selectors
//   content/scriptlets-data.js  per-domain scriptlet directives (MAIN world)
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')

// ---------------------------------------------------------------------------
// Curated core (ads.json) — pure ad/track infra. main_frame included so
// pop-under tabs that navigate to an ad domain are killed.
// ---------------------------------------------------------------------------
const DOMAINS = [
  'doubleclick.net', 'googlesyndication.com', 'googleadservices.com',
  'googletagservices.com', 'google-analytics.com', 'googletagmanager.com',
  '2mdn.net', 'app-measurement.com', 'adservice.google.com',
  'adnxs.com', 'adnxs-simple.com', 'criteo.com', 'criteo.net', 'rubiconproject.com',
  'pubmatic.com', 'openx.net', 'casalemedia.com', '33across.com', 'adsrvr.org',
  'bidswitch.net', 'contextweb.com', 'indexww.com', '3lift.com', 'districtm.io',
  'gumgum.com', 'smartadserver.com', 'adform.net', 'adformdsp.net', 'spotxchange.com',
  'springserve.com', 'sharethrough.com', 'yieldmo.com', 'teads.tv', 'zedo.com',
  'serving-sys.com', 'advertising.com', 'mathtag.com', 'adsafeprotected.com',
  'moatads.com', 'amazon-adsystem.com', 'media.net', 'sonobi.com', 'gammassp.com',
  'scorecardresearch.com', 'quantserve.com', 'quantcount.com', 'bluekai.com',
  'demdex.net', 'everesttech.net', 'krxd.net', 'rlcdn.com', 'agkn.com',
  'crwdcntrl.net', 'tapad.com', 'adsymptotic.com', 'eyeota.net', 'narrative.io',
  'hotjar.com', 'mouseflow.com', 'fullstory.com', 'mixpanel.com', 'amplitude.com',
  'heap.io', 'clarity.ms', 'chartbeat.com', 'parsely.com', 'segment.io',
  'fwmrm.net', 'newrelic-ads.com',
  'taboola.com', 'outbrain.com', 'revcontent.com', 'mgid.com', 'adblade.com',
  'plista.com', 'dianomi.com', 'engageya.com',
  'adroll.com', 'sail-horizon.com', 'sitescout.com', 'turn.com', 'rfihub.com',
  'simpli.fi', 'stickyadstv.com', 'undertone.com', 'districtm.ca',
  'propellerads.com', 'onclkds.com', 'propu.sh', 'popads.net', 'popcash.net',
  'exoclick.com', 'juicyads.com', 'trafficjunky.net', 'adsterra.com',
  'hilltopads.net', 'adcash.com', 'clickadu.com', 'mybetterdailythings.com',
  'applovin.com', 'inmobi.com', 'vungle.com', 'chartboost.com', 'flurry.com',
  'smaato.net', 'adcolony.com',
  'an.yandex.ru', 'mc.yandex.ru', 'yandexadexchange.net', 'adfox.ru',
  'top-fwz1.mail.ru', 'ads.adfox.ru', 'directadvert.ru',
  'marketgid.com', 'luxup.ru', 'relap.io',
  'ad-maven.com', 'admaven.com', 'displaycontentnetwork.com', 'topclickguru.com',
  'loawx.com', 'pushwhy.com', 'galaksion.com', 'adskeeper.com',
  'adskeeper.co.uk', 'bodelen.com', 'gandrad.org', 'onclickalgo.com',
  'onclickperformance.com', 'onclicksuper.com', 'onclickmax.com', 'onclickmega.com',
  'tsyndicate.com', 'realsrv.com', 'magsrv.com', 'exosrv.com', 'poweredby.jads.co',
  'jads.co', 'vidoomy.com', 'vntsm.com', 'aniview.com',
  'alooyu.com', 'aocet.com', 'admngr.com', 'adnium.com', 'adavin.com',
  'pgred90.com', 'wpadmngr.com', 'dolohen.com',
  'oclasrv.com', 'pddxn.com', 'allnitead.com',
  'hexagram.io', 'adsterratech.com',
  'highperformanceformat.com', 'effectivecpmgate.com', 'effectivegatecpm.com',
  'profitabledisplaynetwork.com', 'revenuecpmgate.com', 'adcdnxz.com',
  'coinhive.com', 'coin-hive.com', 'authedmine.com', 'jsecoin.com',
  'cryptoloot.pro', 'crypto-loot.com', 'webminepool.com', 'minero.cc',
  'coinimp.com', 'webmine.cz', 'ppoi.org', 'mepirtedch.com',
  'webminerpool.com', 'monerominer.rocks',
]
const CORE_TYPES = [
  'main_frame', 'sub_frame', 'script', 'image', 'xmlhttprequest', 'media',
  'font', 'ping', 'csp_report', 'websocket', 'other', 'stylesheet', 'object',
]

// Regex rules: ad-server paths/queries that ||host^ rules can't catch.
const REGEX_TYPES = ['script', 'image', 'sub_frame', 'xmlhttprequest', 'media', 'object', 'ping', 'websocket', 'other']
const REGEXES = [
  '(?i)/(adframe|ad-frame|adserver|ad-server|adservice|adsystem|adbanner|ad-banner|ad_banner|advertising|advertisement)/',
  '(?i)/(popunder|pop-under|pop_under|popmedia|clickunder|click-under|popad|pop-ad)/',
  '(?i)[?&](adslot|ad_slot|adunit|ad_unit|adzone|ad_zone|adsize|ad_size|adtype|ad_type)=',
  '(?i)/(www/)?delivery/[a-z]{2,7}\\.(php|js)',
  '(?i)/(openx|revive-adserver|adserver)/',
  '(?i)/(banner_view|bannerview|show_?ads?|get_?ads?|serve_?ads?|deliver_?ads?)\\b',
  '(?i)[?&](zoneid|bannerid|campaignid|adcampaign|advertiserid)=',
  '(?i)/(adsbygoogle|prebid|prebid\\.min|pubads|gpt|gpt\\.min)\\.js',
]

// ---------------------------------------------------------------------------
// Filter-list sources (free, no key) and budgets.
// ---------------------------------------------------------------------------
const LISTS = [
  'https://easylist.to/easylist/easylist.txt',
  'https://easylist.to/easylist/easyprivacy.txt',
]
const NET_CAP = 60000 // max EasyList/EP block rules kept
const CHUNK = 10000 // rules per ads-net-N file
const NUM_SLOTS = 6 // ads-net-0..5 declared in manifest.json (enabled adaptively)
const COSMETIC_CAP = 80000 // max specific element-hiding selectors
const SCRIPTLET_DOMAIN_CAP = 2000 // max domains with per-site scriptlets baked in

// DNR resource types and the ABP option -> DNR type map.
const ALL_TYPES = ['main_frame', 'sub_frame', 'stylesheet', 'script', 'image', 'font', 'object', 'xmlhttprequest', 'ping', 'media', 'websocket', 'other']
const TYPE_MAP = {
  script: 'script', image: 'image', stylesheet: 'stylesheet', object: 'object',
  xmlhttprequest: 'xmlhttprequest', xhr: 'xmlhttprequest', subdocument: 'sub_frame',
  document: 'main_frame', doc: 'main_frame', font: 'font', media: 'media',
  websocket: 'websocket', ping: 'ping', beacon: 'ping', other: 'other',
  popup: 'main_frame', csp_report: 'csp_report', 'xmlhttprequest-document': 'xmlhttprequest',
}
// Options that mean "not a plain network block we can represent" -> skip the rule.
const SKIP_OPTS = new Set([
  'csp', 'replace', 'removeparam', 'cookie', 'header', 'redirect-rule', 'permissions',
  'urltransform', 'generichide', 'elemhide', 'genericblock', 'specifichide', 'badfilter',
  'webrtc', 'inline-script', 'inline-font', 'empty', 'mp4', 'rewrite', 'method', 'to',
  'stylesheet-rule', 'all',
])
// uBO/ABP $redirect resource token -> file we ship under redirect/.
const REDIRECT_MAP = {
  noopjs: 'redirect/noop.js', 'noop.js': 'redirect/noop.js',
  noopframe: 'redirect/noopframe.html', 'noop.html': 'redirect/noopframe.html',
  nooptext: 'redirect/noop.txt', 'noop.txt': 'redirect/noop.txt',
  '1x1.gif': 'redirect/1x1.gif', '1x1-transparent.gif': 'redirect/1x1.gif',
  '2x2.png': 'redirect/2x2.png', '2x2-transparent.png': 'redirect/2x2.png',
  'google-analytics.js': 'redirect/google-analytics.js',
  'google-analytics_ga.js': 'redirect/google-analytics.js',
  'googletagmanager_gtm.js': 'redirect/googletagmanager.js',
  googletagmanager_gtm: 'redirect/googletagmanager.js',
  'googletagservices_gpt.js': 'redirect/googletagservices-gpt.js',
  'googlesyndication_adsbygoogle.js': 'redirect/googlesyndication.js',
  'amazon_apstag.js': 'redirect/noop.js', 'scorecardresearch_beacon.js': 'redirect/noop.js',
  fingerprint2: 'redirect/noop.js', fingerprint3: 'redirect/noop.js',
}

// Scriptlet name aliases (uBO -> our engine's canonical names). Only the ones
// our MAIN-world engine implements are kept; anything else is dropped (counted).
const SCRIPTLET_ALIASES = {
  'set-constant': 'set-constant', 'set': 'set-constant',
  'abort-on-property-read': 'abort-on-property-read', 'aopr': 'abort-on-property-read',
  'abort-on-property-write': 'abort-on-property-write', 'aopw': 'abort-on-property-write',
  'abort-current-script': 'abort-current-script', 'acs': 'abort-current-script', 'abort-current-inline-script': 'abort-current-script', 'acis': 'abort-current-script',
  'json-prune': 'json-prune',
  'no-fetch-if': 'no-fetch-if', 'prevent-fetch': 'no-fetch-if',
  'no-xhr-if': 'no-xhr-if', 'prevent-xhr': 'no-xhr-if',
  'prevent-setTimeout': 'prevent-setTimeout', 'no-setTimeout-if': 'prevent-setTimeout', 'nostif': 'prevent-setTimeout',
  'prevent-setInterval': 'prevent-setInterval', 'no-setInterval-if': 'prevent-setInterval', 'nosiif': 'prevent-setInterval',
  'prevent-addEventListener': 'prevent-addEventListener', 'no-addEventListener-if': 'prevent-addEventListener', 'aeld': 'prevent-addEventListener',
  'remove-attr': 'remove-attr', 'ra': 'remove-attr',
  'remove-class': 'remove-class', 'rc': 'remove-class',
  'set-cookie': 'set-cookie', 'nano-setInterval-booster': 'nano-si', 'nano-setTimeout-booster': 'nano-st',
  nowebrtc: 'nowebrtc',
}

const PROCEDURAL = /:(?:has-text|matches-css|matches-attr|matches-path|matches-media|min-text-length|upward|xpath|nth-ancestor|watch-attr|remove|others|contains|if|if-not)\(/i

// --- helpers ---------------------------------------------------------------
function writeJSON(file, obj) {
  fs.writeFileSync(path.join(ROOT, file), JSON.stringify(obj))
}
function blockRule(id, urlFilter, extra) {
  return { id, priority: 1, action: { type: 'block' }, condition: { urlFilter, ...extra } }
}

// Parse the $options segment of a filter into a normalised object.
function parseOptions(optStr) {
  const o = { types: [], notTypes: [], domains: [], notDomains: [], thirdParty: null, important: false, matchCase: false, redirect: null, skip: false }
  for (let part of optStr.split(',')) {
    part = part.trim()
    if (!part) continue
    let neg = false
    if (part.startsWith('~')) { neg = true; part = part.slice(1) }
    const eq = part.indexOf('=')
    const key = (eq >= 0 ? part.slice(0, eq) : part).toLowerCase()
    const val = eq >= 0 ? part.slice(eq + 1) : ''
    if (key === 'third-party' || key === '3p') { o.thirdParty = !neg; continue }
    if (key === 'first-party' || key === '1p') { o.thirdParty = neg; continue }
    if (key === 'important') { o.important = true; continue }
    if (key === 'match-case') { o.matchCase = true; continue }
    if (key === 'redirect') { o.redirect = val; continue }
    if (key === 'domain' || key === 'from') {
      for (let d of val.split('|')) {
        d = d.trim().toLowerCase()
        if (!d) continue
        const exclude = d.startsWith('~')
        if (exclude) d = d.slice(1)
        // DNR needs a valid host (≥2 labels, no wildcard). A bad POSITIVE domain
        // would silently broaden the rule, so skip the whole rule; a bad
        // exclusion just drops that one token.
        if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d)) { if (!exclude) o.skip = true; continue }
        if (exclude) o.notDomains.push(d)
        else o.domains.push(d)
      }
      continue
    }
    if (TYPE_MAP[key]) { (neg ? o.notTypes : o.types).push(TYPE_MAP[key]); continue }
    if (SKIP_OPTS.has(key)) { o.skip = true; continue }
    // Unknown option -> be safe and skip the rule rather than over-block.
    o.skip = true
  }
  return o
}

// Convert one ABP network filter line to a DNR rule (or null to skip).
function toDnrRule(line, id) {
  let isException = false
  let s = line
  if (s.startsWith('@@')) { isException = true; s = s.slice(2) }

  let optStr = ''
  const dollar = s.lastIndexOf('$')
  // A '$' inside a regex literal isn't an option separator; treat /.../ as regex.
  const isRegexLiteral = s.startsWith('/') && /\/(\$.*)?$/.test(s)
  if (dollar >= 0 && !isRegexLiteral) { optStr = s.slice(dollar + 1); s = s.slice(0, dollar) }

  const o = optStr ? parseOptions(optStr) : { types: [], notTypes: [], domains: [], notDomains: [], thirdParty: null, important: false, matchCase: false, redirect: null, skip: false }
  if (o.skip) return null

  let pattern = s.trim()
  if (!pattern || pattern === '*' || pattern.startsWith('/') ) return null // empty or regex literal -> skip
  if (pattern.length > 480) return null
  if (/[^\x21-\x7e]/.test(pattern)) return null // non-ASCII (IDN) -> skip
  pattern = pattern.replace(/^\*+/, '') // leading * is redundant in urlFilter
  if (!pattern || pattern === '|' || pattern === '||') return null
  // DNR requires a case-insensitive urlFilter to be lowercase (matching folds
  // case anyway, so this is behaviour-preserving). Keep case only for match-case.
  if (!o.matchCase) pattern = pattern.toLowerCase()

  // resourceTypes: explicit positives win; else ALL minus negatives; else omit (=all).
  let resourceTypes
  if (o.types.length) resourceTypes = [...new Set(o.types)]
  else if (o.notTypes.length) resourceTypes = ALL_TYPES.filter((t) => !o.notTypes.includes(t))

  const cond = { urlFilter: pattern }
  if (resourceTypes && resourceTypes.length && resourceTypes.length < ALL_TYPES.length) cond.resourceTypes = resourceTypes
  if (o.thirdParty === true) cond.domainType = 'thirdParty'
  else if (o.thirdParty === false) cond.domainType = 'firstParty'
  if (o.domains.length) cond.initiatorDomains = o.domains
  if (o.notDomains.length) cond.excludedInitiatorDomains = o.notDomains
  if (o.matchCase) cond.isUrlFilterCaseSensitive = true

  if (isException) {
    return { id, priority: 1, action: { type: 'allow' }, condition: cond, _kind: 'allow' }
  }
  if (o.redirect) {
    const res = REDIRECT_MAP[o.redirect] || REDIRECT_MAP[o.redirect.replace(/\.js$/, '')]
    if (!res) return null // redirect to a resource we don't ship -> skip
    // Redirect must beat plain blocks (block > redirect at equal priority), so p2.
    // Never redirect a top-level navigation.
    if (!cond.resourceTypes) cond.resourceTypes = ALL_TYPES.filter((t) => t !== 'main_frame')
    else cond.resourceTypes = cond.resourceTypes.filter((t) => t !== 'main_frame')
    if (!cond.resourceTypes.length) return null
    return { id, priority: 2, action: { type: 'redirect', redirect: { extensionPath: '/' + res } }, condition: cond, _kind: 'redirect' }
  }
  return { id, priority: o.important ? 2 : 1, action: { type: 'block' }, condition: cond, _kind: 'block' }
}

// --- cosmetic + scriptlet parsing -----------------------------------------
const cosmetics = new Map() // domain -> { h:Set<selector>, s:Array<[sel,decl]> }
const scriptlets = new Map() // domain -> Array<[name, ...args]>
let cosmeticCount = 0
const dropped = { procedural: 0, generic: 0, scriptletUnsupported: 0, net: 0 }

function addCosmetic(domainsPart, selector) {
  const isStyle = /:style\(/i.test(selector)
  let sel = selector, decl = null
  if (isStyle) {
    const m = selector.match(/^(.*):style\((.*)\)\s*$/i)
    if (!m) return
    sel = m[1]; decl = m[2]
  }
  if (PROCEDURAL.test(sel)) { dropped.procedural++; return }
  if (sel.includes('^') || /^script/i.test(sel)) { dropped.procedural++; return } // HTML/script filters
  if (!domainsPart) { dropped.generic++; return } // skip generic element-hiding (breakage risk)
  for (let d of domainsPart.split(',')) {
    d = d.trim().toLowerCase()
    if (!d || d.startsWith('~')) continue // skip exclusions & exception-anchored
    if (cosmeticCount >= COSMETIC_CAP) return
    let e = cosmetics.get(d)
    if (!e) { e = { h: new Set(), s: [] }; cosmetics.set(d, e) }
    if (decl != null) e.s.push([sel.trim(), decl.trim()])
    else if (!e.h.has(sel.trim())) e.h.add(sel.trim())
    cosmeticCount++
  }
}

function addScriptlet(domainsPart, body) {
  // body like: +js(set-constant, foo.bar, false)
  const m = body.match(/\+js\((.*)\)\s*$/)
  if (!m) return
  const args = splitArgs(m[1])
  if (!args.length) return
  const name = SCRIPTLET_ALIASES[args[0].trim()]
  if (!name) { dropped.scriptletUnsupported++; return }
  const directive = [name, ...args.slice(1).map((a) => a.trim())]
  for (let d of (domainsPart || '').split(',')) {
    d = d.trim().toLowerCase()
    if (!d || d.startsWith('~')) continue
    if (!scriptlets.has(d) && scriptlets.size >= SCRIPTLET_DOMAIN_CAP) continue
    let arr = scriptlets.get(d)
    if (!arr) { arr = []; scriptlets.set(d, arr) }
    arr.push(directive)
  }
}
function splitArgs(s) {
  const out = []
  let cur = '', esc = false
  for (const ch of s) {
    if (esc) { cur += ch; esc = false; continue }
    if (ch === '\\') { cur += ch; esc = true; continue }
    if (ch === ',') { out.push(cur); cur = ''; continue }
    cur += ch
  }
  out.push(cur)
  return out.map((x) => x.trim())
}

// --- main ------------------------------------------------------------------
const seen = new Set()
const blocks = []
const allowsAndRedirects = []
let idCounter = 1

function ingestNetwork(line) {
  if (blocks.length >= NET_CAP) return
  const r = toDnrRule(line, 0)
  if (!r) { dropped.net++; return }
  const kind = r._kind
  delete r._kind
  const key = JSON.stringify(r.condition) + (r.action.type) + (r.action.redirect ? r.action.redirect.extensionPath : '')
  if (seen.has(key)) return
  seen.add(key)
  r.id = idCounter++
  if (kind === 'block') blocks.push(r)
  else allowsAndRedirects.push(r)
}

function ingestLine(raw) {
  const line = raw.trim()
  if (!line || line.startsWith('!') || line.startsWith('[')) return
  // Cosmetic / scriptlet separators.
  const ci = line.search(/#[@?$%]*#/)
  if (ci >= 0) {
    const sep = line.slice(ci).match(/^#[@?$%]*#/)[0]
    const domainsPart = line.slice(0, ci)
    const right = line.slice(ci + sep.length)
    if (sep === '#@#' || sep.includes('@')) return // unhide exceptions -> skip
    if (right.startsWith('+js(')) { addScriptlet(domainsPart, right); return }
    if (sep === '##' || sep === '#?#') { addCosmetic(domainsPart, right); return }
    return // #$# (CSS inject w/o :style), #%# etc. -> skip
  }
  ingestNetwork(line)
}

console.log('Fetching filter lists…')
for (const url of LISTS) {
  try {
    const text = await (await fetch(url)).text()
    const before = blocks.length + allowsAndRedirects.length
    for (const line of text.split(/\r?\n/)) ingestLine(line)
    console.log(`  ${url.split('/').pop()}: +${blocks.length + allowsAndRedirects.length - before} net rules`)
  } catch (e) {
    console.error(`  FAILED ${url}: ${e.message}`)
  }
}

// --- write curated core + regex --------------------------------------------
const curated = [...new Set(DOMAINS.map((d) => d.toLowerCase()))].map((d, i) =>
  ({ id: i + 1, priority: 1, action: { type: 'block' }, condition: { urlFilter: `||${d}^`, resourceTypes: CORE_TYPES } }))
writeJSON('rules/ads.json', curated)
console.log(`ads.json: ${curated.length} rules`)

const regexRules = REGEXES.map((re, i) => ({ id: i + 1, priority: 1, action: { type: 'block' }, condition: { regexFilter: re, resourceTypes: REGEX_TYPES } }))
writeJSON('rules/ads-regex.json', regexRules)
console.log(`ads-regex.json: ${regexRules.length} rules`)

// --- curated redirects: serve neutered stubs for the big vendor scripts so
// pages that load them don't throw. Their domains are already blocked by
// ads.json; redirect (priority 2) beats that block (priority 1) for the script
// itself, while everything else on the domain stays blocked. ---
const CURATED_REDIRECTS = [
  ['||googlesyndication.com/pagead/js/adsbygoogle.js', 'redirect/googlesyndication.js'],
  ['||pagead2.googlesyndication.com/pagead/js/adsbygoogle.js', 'redirect/googlesyndication.js'],
  ['||googletagservices.com/tag/js/gpt.js', 'redirect/googletagservices-gpt.js'],
  ['||securepubads.g.doubleclick.net/tag/js/gpt.js', 'redirect/googletagservices-gpt.js'],
  ['||google-analytics.com/analytics.js', 'redirect/google-analytics.js'],
  ['||google-analytics.com/ga.js', 'redirect/google-analytics.js'],
  ['||ssl.google-analytics.com/ga.js', 'redirect/google-analytics.js'],
  ['||googletagmanager.com/gtm.js', 'redirect/googletagmanager.js'],
  ['||googletagmanager.com/gtag/js', 'redirect/google-analytics.js'],
]
for (const [urlFilter, res] of CURATED_REDIRECTS) {
  allowsAndRedirects.push({
    id: 0, priority: 2, action: { type: 'redirect', redirect: { extensionPath: '/' + res } },
    condition: { urlFilter, resourceTypes: ['script'] },
  })
}

// --- write exceptions + redirects (always enabled) -------------------------
// Re-id within the file (ids only need to be unique per ruleset).
allowsAndRedirects.forEach((r, i) => { r.id = i + 1 })
writeJSON('rules/ads-allow.json', allowsAndRedirects)
console.log(`ads-allow.json: ${allowsAndRedirects.length} rules (exceptions + redirects)`)

// --- chunk block rules into ads-net-N (adaptively enabled) -----------------
const index = { chunkSize: CHUNK, net: [] }
for (let slot = 0; slot < NUM_SLOTS; slot++) {
  const part = blocks.slice(slot * CHUNK, (slot + 1) * CHUNK)
  part.forEach((r, i) => { r.id = i + 1 })
  writeJSON(`rules/ads-net-${slot}.json`, part)
  index.net.push({ id: `ads-net-${slot}`, count: part.length })
}
writeJSON('rules/index.json', index)
const usedSlots = index.net.filter((n) => n.count).length
console.log(`ads-net-*: ${blocks.length} block rules across ${usedSlots}/${NUM_SLOTS} slots`)
if (blocks.length >= NET_CAP) console.log(`  NOTE: hit NET_CAP=${NET_CAP}; some block rules were dropped.`)

// --- write cosmetics --------------------------------------------------------
const cosOut = {}
for (const [d, e] of cosmetics) {
  const entry = {}
  if (e.h.size) entry.h = [...e.h]
  if (e.s.length) entry.s = e.s
  cosOut[d] = entry
}
if (!fs.existsSync(path.join(ROOT, 'data'))) fs.mkdirSync(path.join(ROOT, 'data'))
writeJSON('data/cosmetics.json', cosOut)
console.log(`data/cosmetics.json: ${cosmetics.size} domains, ${cosmeticCount} selectors`)

// --- write per-domain scriptlet data (MAIN-world content script) -----------
const slOut = {}
for (const [d, arr] of scriptlets) slOut[d] = arr
const slJson = JSON.stringify(slOut)
fs.writeFileSync(path.join(ROOT, 'content/scriptlets-data.js'),
  '// AUTO-GENERATED by rules/build-ads.mjs — per-domain scriptlet directives.\n' +
  '// MAIN-world content script: exposes the map to scriptlets.main.js, then\n' +
  '// removes the global so it does not leak to the page beyond the next script.\n' +
  'window.__LG_SCRIPTLETS = ' + slJson + ';\n')
console.log(`content/scriptlets-data.js: ${scriptlets.size} domains`)

console.log('Dropped:', JSON.stringify(dropped))
