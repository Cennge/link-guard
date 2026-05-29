// Lightweight registrable-domain (eTLD+1) extraction. A full Public Suffix List
// would be ~250KB; instead we ship a compact set of the multi-label suffixes
// that actually matter for the popular brands we protect, and fall back to the
// last two labels otherwise. Good enough for phishing heuristics and tiny.

const MULTI_LABEL_SUFFIXES = new Set([
  'co.uk', 'org.uk', 'gov.uk', 'ac.uk', 'me.uk',
  'co.jp', 'or.jp', 'ne.jp', 'ac.jp', 'go.jp',
  'com.au', 'net.au', 'org.au', 'gov.au', 'edu.au',
  'com.br', 'net.br', 'org.br', 'gov.br',
  'com.cn', 'net.cn', 'org.cn', 'gov.cn',
  'co.in', 'net.in', 'org.in', 'gov.in',
  'co.kr', 'or.kr',
  'co.za', 'org.za',
  'com.mx', 'com.ar', 'com.tr', 'com.sg', 'com.hk', 'com.tw', 'com.ua',
  'co.il', 'co.id', 'co.th', 'com.ph', 'com.my', 'com.vn',
  'com.ru', 'net.ru', 'org.ru',
])

// Returns { registrable, core, suffix } for an ASCII hostname.
//   registrable -> eTLD+1, e.g. "google.co.uk"
//   core        -> the brandable label, e.g. "google"
//   suffix      -> the public suffix, e.g. "co.uk"
export function parseHost(hostname) {
  const host = hostname.replace(/\.$/, '').toLowerCase()
  const parts = host.split('.')
  if (parts.length < 2) {
    return { registrable: host, core: host, suffix: '' }
  }

  const lastTwo = parts.slice(-2).join('.')

  let suffix
  let registrable
  if (parts.length >= 3 && MULTI_LABEL_SUFFIXES.has(lastTwo)) {
    // last two labels form a known multi-label public suffix (e.g. co.uk)
    suffix = lastTwo
    registrable = parts.slice(-3).join('.')
  } else {
    suffix = parts.slice(-1).join('.')
    registrable = lastTwo
  }

  const core = registrable.slice(0, registrable.length - suffix.length - 1) || registrable
  return { registrable, core, suffix }
}
