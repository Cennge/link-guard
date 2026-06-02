// The detection engine. Pure, synchronous, no network — given a URL it returns a
// verdict. This is what makes the extension "lightweight": every check is an
// in-memory string comparison against a small bundled brand list.

import { toUnicode } from './punycode.js'
import { skeleton, isMixedScript, hasNonAscii } from './confusables.js'
import { parseHost } from './psl.js'
import { BRANDS, LEGIT_DOMAINS, DOMAIN_TO_BRAND, COMBO_LABELS } from './brands.js'

export const Verdict = {
  SAFE: 'safe',
  WARNING: 'warning', // suspicious — let the user decide
  DANGER: 'danger', // strong impersonation signal
}

export const Reason = {
  HOMOGRAPH: 'homograph',
  TYPOSQUAT: 'typosquat',
  COMBOSQUAT: 'combosquat',
  MIXED_SCRIPT: 'mixed_script',
  SUSPICIOUS_STRUCTURE: 'suspicious_structure',
  DECEPTIVE_URL: 'deceptive_url', // userinfo trick, etc.
  FAKE_LOGIN: 'fake_login', // page impersonates a brand's login on a foreign domain
  CROSS_ORIGIN_CREDENTIALS: 'cross_origin_credentials', // password form posts off-origin
  SUSPICIOUS_LOGIN: 'suspicious_login', // alarmist login page on an obscure domain
  PAYMENT_SKIM: 'payment_skim', // card data submitted to another site
  RISKY_DOMAIN: 'risky_domain', // throwaway-looking domain asking for sensitive data
}

// TLDs that are cheap/free and disproportionately abused for phishing.
const RISKY_TLDS = new Set([
  'tk', 'ml', 'ga', 'cf', 'gq', 'top', 'xyz', 'icu', 'cyou', 'sbs', 'rest',
  'quest', 'click', 'link', 'live', 'buzz', 'work', 'fit', 'beauty', 'monster',
  'lol', 'cfd', 'bond', 'makeup', 'hair', 'skin', 'autos', 'boats', 'mom',
  'shop', 'store', 'online', 'site', 'website', 'space', 'fun', 'pw', 'su',
  'gdn', 'review', 'country', 'kim', 'men', 'date', 'racing', 'win', 'stream',
])

// Heuristic: does the host itself look like a throwaway/young phishing domain?
function looksThrowaway(hostname, registrable, suffix) {
  const tld = suffix.split('.').pop()
  const core = registrable.slice(0, Math.max(0, registrable.length - suffix.length - 1)) || registrable
  const digits = (core.match(/\d/g) || []).length
  const hyphens = (registrable.match(/-/g) || []).length
  return (
    RISKY_TLDS.has(tld) ||
    core.length >= 20 ||
    digits >= 4 ||
    hyphens >= 3 ||
    hostname.includes('xn--') ||
    hostname.split('.').length >= 5
  )
}

// Alarmist words that legitimate login pages almost never put in their title —
// classic "your account is suspended, verify now" phishing pressure.
const STRONG_KEYWORDS = [
  'verify', 'confirm', 'suspend', 'unlock', 'reactivat', 'validat', 'locked',
  'unusual', 'reconfirm', 're-enter', 'limited', 'restricted', 'verification required',
]

// Words that scream "credential page" when they show up in a hostname. Used
// only to *raise* suspicion on already-odd hosts — never on their own.
const PHISH_KEYWORDS = [
  'login', 'signin', 'sign-in', 'secure', 'verify', 'verification', 'account',
  'update', 'confirm', 'recover', 'unlock', 'wallet', 'auth', 'support',
  'billing', 'payment', 'security', 'webscr', 'activate',
]

// Damerau-Levenshtein distance (handles transpositions like "paaypl" -> "paypal").
function editDistance(a, b) {
  const al = a.length
  const bl = b.length
  if (al === 0) return bl
  if (bl === 0) return al
  const d = Array.from({ length: al + 1 }, () => new Array(bl + 1).fill(0))
  for (let i = 0; i <= al; i++) d[i][0] = i
  for (let j = 0; j <= bl; j++) d[0][j] = j
  for (let i = 1; i <= al; i++) {
    for (let j = 1; j <= bl; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1)
      }
    }
  }
  return d[al][bl]
}

// How many edits we tolerate before two labels are "the same brand, mistyped".
// Scales with brand-name length so short names don't generate false positives.
function typoThreshold(len) {
  if (len <= 4) return 0
  if (len <= 6) return 1
  return 2
}

function isIpAddress(host) {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(':')
}

// Main entry point. `url` is the full navigation URL.
// Returns { verdict, reason, brand, hostname, unicodeHost, suggestion, distance }.
export function analyze(url) {
  let parsed
  try {
    parsed = new URL(url)
  } catch {
    return { verdict: Verdict.SAFE }
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { verdict: Verdict.SAFE }
  }

  const asciiHost = parsed.hostname.toLowerCase()
  if (!asciiHost || asciiHost === 'localhost' || isIpAddress(asciiHost)) {
    return { verdict: Verdict.SAFE }
  }

  const { registrable, core } = parseHost(asciiHost)

  // 1) Allow-list: the real brand sites and any of their sub-domains.
  //    `trusted` marks a verified brand domain so the UI can show a green shield.
  if (LEGIT_DOMAINS.has(registrable) || LEGIT_DOMAINS.has(asciiHost)) {
    return {
      verdict: Verdict.SAFE,
      trusted: true,
      brand: DOMAIN_TO_BRAND.get(asciiHost) || DOMAIN_TO_BRAND.get(registrable),
      hostname: asciiHost,
      registrable,
    }
  }

  // 1b) Deceptive URL shape: userinfo that looks like a host hides the real
  //     destination, e.g. https://paypal.com@evil.tld/.
  if (parsed.username && parsed.username.includes('.')) {
    return {
      verdict: Verdict.WARNING,
      reason: Reason.DECEPTIVE_URL,
      hostname: asciiHost,
      registrable,
    }
  }

  const unicodeHost = toUnicode(asciiHost)
  const { core: unicoreRaw } = parseHost(unicodeHost)
  const unicore = unicoreRaw
  const isPuny = asciiHost !== unicodeHost
  const hadNonAscii = isPuny || hasNonAscii(unicodeHost)

  // The skeleton folds homographs AND leetspeak into one canonical shape.
  const skel = skeleton(unicore)

  // 2) Brand impersonation: compare the (skeletonised) core against each brand.
  let best = null
  for (const brand of BRANDS) {
    const dist = editDistance(skel, brand.label)

    if (dist === 0 && skel === brand.label && core !== brand.label) {
      // Skeleton equals a brand exactly but the real text differs:
      // classic homograph (pаypal) or character-swap typo (faceb00k).
      best = { brand, dist: 0, exact: true }
      break
    }

    const lenOk = Math.abs(skel.length - brand.label.length) <= typoThreshold(brand.label.length)
    if (dist > 0 && dist <= typoThreshold(brand.label.length) && lenOk) {
      if (!best || dist < best.dist) best = { brand, dist, exact: false }
    }
  }

  if (best) {
    const reason = hadNonAscii ? Reason.HOMOGRAPH : Reason.TYPOSQUAT
    // High-confidence DANGER: an exact look-alike (faceb00k, pаypal) or any
    // homograph. Plain edit-distance typos stay a softer WARNING because real
    // words can land one edit away from a brand (e.g. "applet" vs "apple").
    const verdict = best.exact || reason === Reason.HOMOGRAPH ? Verdict.DANGER : Verdict.WARNING
    return {
      verdict,
      reason,
      brand: best.brand.display,
      hostname: asciiHost,
      registrable,
      unicodeHost: isPuny ? unicodeHost : undefined,
      suggestion: best.brand.domains[0],
      distance: best.dist,
    }
  }

  // 3) Mixed-script IDN with no brand match — still inherently deceptive.
  for (const label of unicodeHost.split('.')) {
    if (isMixedScript(label)) {
      return {
        verdict: Verdict.WARNING,
        reason: Reason.MIXED_SCRIPT,
        hostname: asciiHost,
        registrable,
        unicodeHost: isPuny ? unicodeHost : undefined,
      }
    }
  }

  // 4) Combosquatting: a distinctive brand appears as a standalone label inside
  //    a domain that is NOT the brand's (e.g. paypal.secure-login.com).
  const labels = asciiHost.split('.')
  for (const label of labels) {
    const labelSkel = skeleton(label)
    for (const comboLabel of COMBO_LABELS) {
      if (labelSkel === comboLabel) {
        const brand = BRANDS.find((b) => b.label === comboLabel)
        return {
          verdict: Verdict.WARNING,
          reason: Reason.COMBOSQUAT,
          brand: brand ? brand.display : comboLabel,
          hostname: asciiHost,
          registrable,
          suggestion: brand ? brand.domains[0] : undefined,
        }
      }
    }
  }

  // 5) Credential-phishing structure. A brand name buried INSIDE a label
  //    (paypal-login, secure-kucoin) or a generally messy host paired with a
  //    phishing keyword (account-verify-now, lots of hyphens, punycode).
  const hasPhishKw = PHISH_KEYWORDS.some((kw) => asciiHost.includes(kw))
  if (hasPhishKw) {
    for (const label of labels) {
      const labelSkel = skeleton(label)
      for (const comboLabel of COMBO_LABELS) {
        // substring (not exact) — exact was handled in step 4 above
        if (labelSkel.length > comboLabel.length && labelSkel.includes(comboLabel)) {
          const brand = BRANDS.find((b) => b.label === comboLabel)
          return {
            verdict: Verdict.WARNING,
            reason: Reason.COMBOSQUAT,
            brand: brand ? brand.display : comboLabel,
            hostname: asciiHost,
            registrable,
            suggestion: brand ? brand.domains[0] : undefined,
          }
        }
      }
    }
    const hyphens = (registrable.match(/-/g) || []).length
    if (isPuny || hyphens >= 2) {
      return {
        verdict: Verdict.WARNING,
        reason: Reason.SUSPICIOUS_STRUCTURE,
        hostname: asciiHost,
        registrable,
        unicodeHost: isPuny ? unicodeHost : undefined,
      }
    }
  }

  return { verdict: Verdict.SAFE, hostname: asciiHost, registrable }
}

// Page-level credential-phishing check, complementing the URL-only analyze().
// The content script supplies cheap signals about the *loaded* page:
//   { hasPassword, identity, crossOriginPost }
// where `identity` is the page's claimed name (title / og:site_name / logo alt).
// This catches phishing on otherwise-unremarkable domains, regardless of any
// look-alike in the URL.
export function analyzePageSignals(url, signals = {}) {
  const base = analyze(url)
  const out = { verdict: Verdict.SAFE, hostname: base.hostname, registrable: base.registrable }
  if (!base.hostname || base.trusted) return out
  // Only credential or payment pages are interesting.
  if (!signals.hasPassword && !signals.hasPayment) return out

  // The page presents a known brand's identity, but the domain isn't theirs.
  const skel = skeleton(String(signals.identity || '').toLowerCase())
  if (skel) {
    for (const brand of BRANDS) {
      if (brand.label.length < 4) continue
      if (!skel.includes(brand.label)) continue
      const isReal =
        brand.domains.includes(base.registrable) || brand.domains.includes(base.hostname)
      if (!isReal) {
        return {
          verdict: Verdict.DANGER,
          reason: Reason.FAKE_LOGIN,
          brand: brand.display,
          hostname: base.hostname,
          registrable: base.registrable,
          suggestion: brand.domains[0],
        }
      }
    }
  }

  // The brand identity is given away by a hot-linked favicon served straight
  // from the brand's own domain (a common copy-paste phishing tell), even when
  // no brand name appears in the text.
  if (signals.iconHost) {
    const ireg = parseHost(String(signals.iconHost).toLowerCase()).registrable
    for (const brand of BRANDS) {
      const fromBrand = brand.domains.includes(ireg) || brand.domains.includes(String(signals.iconHost).toLowerCase())
      const isOwn = brand.domains.includes(base.registrable) || brand.domains.includes(base.hostname)
      if (fromBrand && !isOwn) {
        return {
          verdict: Verdict.DANGER,
          reason: Reason.FAKE_LOGIN,
          brand: brand.display,
          hostname: base.hostname,
          registrable: base.registrable,
          suggestion: brand.domains[0],
        }
      }
    }
  }

  // A sensitive form that submits to a different site is a classic exfiltration
  // pattern. Card data going off-origin = skimming (DANGER); a password going
  // off-origin is a softer WARNING.
  if (signals.crossOriginPost) {
    return {
      verdict: signals.hasPayment ? Verdict.DANGER : Verdict.WARNING,
      reason: signals.hasPayment ? Reason.PAYMENT_SKIM : Reason.CROSS_ORIGIN_CREDENTIALS,
      hostname: base.hostname,
      registrable: base.registrable,
    }
  }

  // Alarmist wording on a credential page. On its own this is weak, so the
  // caller's top-1M suppression downgrades it for popular/real domains — what
  // survives is "scary login page on an obscure domain".
  const idLower = String(signals.identity || '').toLowerCase()
  if (STRONG_KEYWORDS.some((k) => idLower.includes(k))) {
    return {
      verdict: Verdict.WARNING,
      reason: Reason.SUSPICIOUS_LOGIN,
      hostname: base.hostname,
      registrable: base.registrable,
    }
  }

  // Throwaway-looking domain (cheap TLD / random / punycode / many hyphens)
  // asking for a password or card. The caller's top-1M suppression keeps this
  // off popular/real sites, so what survives is "young/rare domain wants
  // sensitive data".
  const { suffix } = parseHost(base.hostname)
  if (looksThrowaway(base.hostname, base.registrable, suffix)) {
    return {
      verdict: Verdict.WARNING,
      reason: Reason.RISKY_DOMAIN,
      hostname: base.hostname,
      registrable: base.registrable,
    }
  }
  return out
}
