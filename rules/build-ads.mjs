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
  'top-fwz1.mail.ru', 'ads.adfox.ru', 'rambler.ru/ads', 'directadvert.ru',
  'marketgid.com', 'luxup.ru', 'relap.io',
]

const RESOURCE_TYPES = [
  'script', 'image', 'sub_frame', 'xmlhttprequest', 'media', 'font',
  'ping', 'csp_report', 'websocket', 'other', 'stylesheet', 'object',
]

const rules = DOMAINS.map((d, i) => ({
  id: i + 1,
  priority: 1,
  action: { type: 'block' },
  condition: { urlFilter: `||${d}^`, resourceTypes: RESOURCE_TYPES },
}))

const out = path.join(__dirname, 'ads.json')
fs.writeFileSync(out, JSON.stringify(rules, null, 0))
console.log(`Wrote ${rules.length} ad-blocking rules to ${out}`)
