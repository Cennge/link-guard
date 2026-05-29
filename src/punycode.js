// Minimal Punycode decoder (RFC 3492) used to turn IDN `xn--` labels back into
// their Unicode form so we can inspect them for homograph / mixed-script attacks.
// Adapted from the reference algorithm; decode-only to keep the bundle small.

const BASE = 36
const TMIN = 1
const TMAX = 26
const SKEW = 38
const DAMP = 700
const INITIAL_BIAS = 72
const INITIAL_N = 128
const DELIMITER = '-'

function adapt(delta, numPoints, firstTime) {
  delta = firstTime ? Math.floor(delta / DAMP) : delta >> 1
  delta += Math.floor(delta / numPoints)
  let k = 0
  while (delta > ((BASE - TMIN) * TMAX) >> 1) {
    delta = Math.floor(delta / (BASE - TMIN))
    k += BASE
  }
  return k + Math.floor(((BASE - TMIN + 1) * delta) / (delta + SKEW))
}

function basicToDigit(codePoint) {
  // 0-25 map to a-z (case-insensitive), 26-35 map to 0-9.
  if (codePoint >= 0x30 && codePoint <= 0x39) return codePoint - 0x30 + 26
  if (codePoint >= 0x41 && codePoint <= 0x5a) return codePoint - 0x41
  if (codePoint >= 0x61 && codePoint <= 0x7a) return codePoint - 0x61
  return BASE
}

// Decode a single punycode-encoded label (WITHOUT the `xn--` prefix).
function decodeLabel(input) {
  const output = []
  let i = 0
  let n = INITIAL_N
  let bias = INITIAL_BIAS

  let basic = input.lastIndexOf(DELIMITER)
  if (basic < 0) basic = 0

  for (let j = 0; j < basic; j++) {
    const c = input.charCodeAt(j)
    if (c >= 0x80) throw new Error('not-basic')
    output.push(c)
  }

  let index = basic > 0 ? basic + 1 : 0
  while (index < input.length) {
    const oldi = i
    let w = 1
    for (let k = BASE; ; k += BASE) {
      if (index >= input.length) throw new Error('invalid-input')
      const digit = basicToDigit(input.charCodeAt(index++))
      if (digit >= BASE) throw new Error('invalid-input')
      if (digit > Math.floor((0x7fffffff - i) / w)) throw new Error('overflow')
      i += digit * w
      const t = k <= bias ? TMIN : k >= bias + TMAX ? TMAX : k - bias
      if (digit < t) break
      const baseMinusT = BASE - t
      if (w > Math.floor(0x7fffffff / baseMinusT)) throw new Error('overflow')
      w *= baseMinusT
    }

    const out = output.length + 1
    bias = adapt(i - oldi, out, oldi === 0)
    if (Math.floor(i / out) > 0x7fffffff - n) throw new Error('overflow')
    n += Math.floor(i / out)
    i %= out
    output.splice(i++, 0, n)
  }

  return String.fromCodePoint(...output)
}

// Convert a full ASCII hostname (possibly containing `xn--` labels) to Unicode.
// Returns the original hostname if any label fails to decode.
export function toUnicode(hostname) {
  try {
    return hostname
      .split('.')
      .map((label) => {
        if (label.toLowerCase().startsWith('xn--')) {
          return decodeLabel(label.slice(4).toLowerCase())
        }
        return label
      })
      .join('.')
  } catch {
    return hostname
  }
}
