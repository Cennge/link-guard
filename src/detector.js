// The detection engine. Pure, synchronous, no network — given a URL it returns a
// verdict. This is what makes the extension "lightweight": every check is an
// in-memory string comparison against a small bundled brand list.

import { toUnicode } from './punycode.js'
import { skeleton, isMixedScript, hasNonAscii } from './confusables.js'
import { parseHost } from './psl.js'
import { BRANDS, LEGIT_DOMAINS, COMBO_LABELS, getBrandByDomain } from './brands.js'

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
}

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
  if (LEGIT_DOMAINS.has(registrable) || LEGIT_DOMAINS.has(asciiHost)) {
    const brandInfo = getBrandByDomain(registrable) || getBrandByDomain(asciiHost)
    return { 
      verdict: Verdict.SAFE, 
      hostname: asciiHost,
      brand: brandInfo ? brandInfo.display : undefined 
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
          suggestion: brand ? brand.domains[0] : undefined,
        }
      }
    }
  }

  return { verdict: Verdict.SAFE, hostname: asciiHost }
}
