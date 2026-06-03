// Generates rules/ads.json — a declarativeNetRequest static ruleset that blocks
// requests to major ad / tracking networks. Curated (not full EasyList) but
// covers a large share of real ads/trackers without breaking sites (no CDNs,
// fonts, or login SDKs). Run: node rules/build-ads.mjs
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Ad serving / RTB / exchanges / analytics-trackers. Pure ad/track infra only.
const DOMAINS = [
  // Google ads/analytics (not fonts/gstatic — those would break sites)
  'doubleclick.net', 'googlesyndication.com', 'googleadservices.com',
  'googletagservices.com', 'google-analytics.com', 'googletagmanager.com',
  '2mdn.net', 'app-measurement.com', 'adservice.google.com',
  // Major RTB / SSP / exchanges
  'adnxs.com', 'adnxs-simple.com', 'criteo.com', 'criteo.net', 'rubiconproject.com',
  'pubmatic.com', 'openx.net', 'casalemedia.com', '33across.com', 'adsrvr.org',
  'bidswitch.net', 'contextweb.com', 'indexww.com', '3lift.com', 'districtm.io',
  'gumgum.com', 'smartadserver.com', 'adform.net', 'adformdsp.net', 'spotxchange.com',
  'springserve.com', 'sharethrough.com', 'yieldmo.com', 'teads.tv', 'zedo.com',
  'serving-sys.com', 'advertising.com', 'mathtag.com', 'adsafeprotected.com',
  'moatads.com', 'amazon-adsystem.com', 'media.net', 'sonobi.com', 'gammassp.com',
  // DMP / identity / tracking
  'scorecardresearch.com', 'quantserve.com', 'quantcount.com', 'bluekai.com',
  'demdex.net', 'everesttech.net', 'krxd.net', 'rlcdn.com', 'agkn.com',
  'crwdcntrl.net', 'tapad.com', 'adsymptotic.com', 'eyeota.net', 'narrative.io',
  // Behaviour analytics
  'hotjar.com', 'mouseflow.com', 'fullstory.com', 'mixpanel.com', 'amplitude.com',
  'heap.io', 'clarity.ms', 'chartbeat.com', 'parsely.com', 'segment.io',
  'fwmrm.net', 'newrelic-ads.com',
  // Native ads / content recommendation
  'taboola.com', 'outbrain.com', 'revcontent.com', 'mgid.com', 'adblade.com',
  'plista.com', 'dianomi.com', 'engageya.com',
  // Adtech / retargeting
  'adroll.com', 'sail-horizon.com', 'sitescout.com', 'turn.com', 'rfihub.com',
  'simpli.fi', 'stickyadstv.com', 'undertone.com', 'districtm.ca',
  // Pop/push/aggressive ad networks
  'propellerads.com', 'onclkds.com', 'propu.sh', 'popads.net', 'popcash.net',
  'exoclick.com', 'juicyads.com', 'trafficjunky.net', 'adsterra.com',
  'hilltopads.net', 'adcash.com', 'clickadu.com', 'mybetterdailythings.com',
  // Mobile/video SDK ad infra often loaded on web
  'applovin.com', 'inmobi.com', 'vungle.com', 'chartboost.com', 'flurry.com',
  'smaato.net', 'adcolony.com',
  // RU/CIS ad & tracking
  'an.yandex.ru', 'mc.yandex.ru', 'yandexadexchange.net', 'adfox.ru',
  'top-fwz1.mail.ru', 'ads.adfox.ru', 'directadvert.ru',
  'marketgid.com', 'luxup.ru', 'relap.io',

  // Popunder / clickunder / aggressive networks (heavy on pirate-stream sites)
  'ad-maven.com', 'admaven.com', 'displaycontentnetwork.com', 'topclickguru.com',
  'loawx.com', 'pushwhy.com', 'clickadu.com', 'galaksion.com', 'adskeeper.com',
  'adskeeper.co.uk', 'bodelen.com', 'gandrad.org', 'onclickalgo.com',
  'onclickperformance.com', 'onclicksuper.com', 'onclickmax.com', 'onclickmega.com',
  'tsyndicate.com', 'cdn.tsyndicate.com', 'realsrv.com', 'magsrv.com',
  'a.realsrv.com', 'syndication.exosrv.com', 'exosrv.com', 'poweredby.jads.co',
  'jads.co', 'hpr.outbrain.com', 'vidoomy.com', 'vntsm.com', 'aniview.com',
  'alooyu.com', 'aocet.com', 'admngr.com', 'adnium.com', 'adavin.com',
  'pgred90.com', 'wpadmngr.com', 'mybetterdailythings.com', 'dolohen.com',
  'go.oclasrv.com', 'oclasrv.com', 'go.pddxn.com', 'pddxn.com', 'allnitead.com',
  'hexagram.io', 'pop.adsterratech.com', 'adsterratech.com',
  'highperformanceformat.com', 'effectivecpmgate.com', 'effectivegatecpm.com',
  'profitabledisplaynetwork.com', 'revenuecpmgate.com', 'adcdnxz.com',

  // In-browser crypto miners (very common on pirate sites)
  'coinhive.com', 'coin-hive.com', 'authedmine.com', 'jsecoin.com',
  'cryptoloot.pro', 'crypto-loot.com', 'webminepool.com', 'minero.cc',
  'coinimp.com', 'webmine.cz', 'ppoi.org', 'mepirtedch.com',
  'webminerpool.com', 'monerominer.rocks',
]

const RESOURCE_TYPES = [
  // main_frame included so pop-under / pop-up tabs that navigate to an ad
  // domain are killed (a major nuisance on pirate-streaming sites).
  'main_frame', 'sub_frame', 'script', 'image', 'xmlhttprequest', 'media',
  'font', 'ping', 'csp_report', 'websocket', 'other', 'stylesheet', 'object',
]

function ruleFor(d, id) {
  return { id, priority: 1, action: { type: 'block' }, condition: { urlFilter: `||${d}^`, resourceTypes: RESOURCE_TYPES } }
}

// --- Ruleset 1: curated high-value networks (ads.json) ---
const curated = new Set(DOMAINS.map((d) => d.toLowerCase()))
const rules = [...curated].map((d, i) => ruleFor(d, i + 1))
fs.writeFileSync(path.join(__dirname, 'ads.json'), JSON.stringify(rules, null, 0))
console.log(`ads.json: ${rules.length} rules`)

// --- Ruleset 2: large list from HaGeZi (ads-extra.json), sampled across the
// whole list to span coverage and stay under the MV3 static-rule budget. ---
const EXTRA_CAP = 28000
const SRC = 'https://raw.githubusercontent.com/hagezi/dns-blocklists/main/domains/light.txt'
try {
  const text = await (await fetch(SRC)).text()
  const all = text
    .split(/\r?\n/)
    .map((l) => l.trim().toLowerCase())
    .filter((l) => l && !l.startsWith('#') && !l.startsWith('!') && l.includes('.'))
  const fresh = all.filter((d) => !curated.has(d))
  const step = Math.max(1, Math.floor(fresh.length / EXTRA_CAP))
  const picked = []
  for (let i = 0; i < fresh.length && picked.length < EXTRA_CAP; i += step) picked.push(fresh[i])
  // start ids well above ruleset 1 to keep them distinct per file (ids only need
  // to be unique within a ruleset, but distinct ranges keep things tidy)
  const extra = picked.map((d, i) => ruleFor(d, 100000 + i))
  fs.writeFileSync(path.join(__dirname, 'ads-extra.json'), JSON.stringify(extra, null, 0))
  console.log(`ads-extra.json: ${extra.length} rules (sampled from ${all.length}, step ${step})`)
} catch (e) {
  console.error('ads-extra: failed to fetch source —', e.message)
  if (!fs.existsSync(path.join(__dirname, 'ads-extra.json'))) {
    fs.writeFileSync(path.join(__dirname, 'ads-extra.json'), '[]')
  }
}
