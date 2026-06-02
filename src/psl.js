// Lightweight registrable-domain (eTLD+1) extraction. A full Public Suffix List
// would be ~250KB; instead we ship a compact set of the multi-label suffixes
// that actually matter for the popular brands we protect, and fall back to the
// last two labels otherwise. Good enough for phishing heuristics and tiny.

// A curated subset of the Public Suffix List: the multi-label public suffixes
// (and common "private" hosting suffixes) that actually show up in real traffic
// and phishing. Full PSL is ~250KB; this covers the overwhelming majority of
// cases while staying tiny. Both ICANN ccTLD second levels and private hosting
// suffixes are included so e.g. `evil.github.io` resolves to `evil.github.io`
// (its own registrable) rather than `github.io`.
const MULTI_LABEL_SUFFIXES = new Set([
  // --- United Kingdom ---
  'co.uk', 'org.uk', 'gov.uk', 'ac.uk', 'me.uk', 'net.uk', 'ltd.uk', 'plc.uk', 'sch.uk', 'nhs.uk', 'police.uk', 'mod.uk',
  // --- Japan ---
  'co.jp', 'or.jp', 'ne.jp', 'ac.jp', 'go.jp', 'ad.jp', 'ed.jp', 'gr.jp', 'lg.jp',
  // --- Australia / NZ ---
  'com.au', 'net.au', 'org.au', 'gov.au', 'edu.au', 'id.au', 'asn.au',
  'co.nz', 'net.nz', 'org.nz', 'govt.nz', 'ac.nz', 'geek.nz', 'school.nz',
  // --- Brazil ---
  'com.br', 'net.br', 'org.br', 'gov.br', 'edu.br', 'art.br', 'eco.br', 'blog.br',
  // --- China / Hong Kong / Taiwan ---
  'com.cn', 'net.cn', 'org.cn', 'gov.cn', 'edu.cn', 'ac.cn',
  'com.hk', 'net.hk', 'org.hk', 'gov.hk', 'edu.hk', 'idv.hk',
  'com.tw', 'net.tw', 'org.tw', 'gov.tw', 'edu.tw',
  // --- India ---
  'co.in', 'net.in', 'org.in', 'gov.in', 'edu.in', 'ac.in', 'firm.in', 'gen.in', 'ind.in',
  // --- Korea ---
  'co.kr', 'or.kr', 'ne.kr', 'go.kr', 'ac.kr', 're.kr', 'pe.kr',
  // --- South Africa ---
  'co.za', 'org.za', 'net.za', 'gov.za', 'ac.za', 'web.za',
  // --- Russia / CIS ---
  'com.ru', 'net.ru', 'org.ru', 'pp.ru', 'msk.ru', 'spb.ru',
  'com.ua', 'net.ua', 'org.ua', 'in.ua', 'kiev.ua',
  'com.by', 'com.kz', 'org.kz',
  // --- Europe ---
  'co.il', 'org.il', 'net.il', 'gov.il', 'ac.il',
  'com.tr', 'net.tr', 'org.tr', 'gov.tr', 'edu.tr', 'gen.tr',
  'com.pl', 'net.pl', 'org.pl', 'gov.pl', 'edu.pl', 'waw.pl', 'wroc.pl',
  'com.es', 'org.es', 'gob.es', 'edu.es',
  'com.gr', 'net.gr', 'org.gr', 'gov.gr', 'edu.gr',
  'com.pt', 'gov.pt',
  'com.ro', 'org.ro',
  'com.hr', 'com.ua', 'com.cy',
  'co.at', 'or.at', 'ac.at', 'gv.at',
  'com.de', 'co.de',
  // --- Southeast Asia ---
  'com.sg', 'net.sg', 'org.sg', 'gov.sg', 'edu.sg',
  'co.id', 'web.id', 'or.id', 'ac.id', 'go.id', 'sch.id',
  'co.th', 'in.th', 'ac.th', 'go.th', 'or.th',
  'com.ph', 'net.ph', 'org.ph', 'gov.ph', 'edu.ph',
  'com.my', 'net.my', 'org.my', 'gov.my', 'edu.my',
  'com.vn', 'net.vn', 'org.vn', 'gov.vn', 'edu.vn',
  // --- Middle East / Africa ---
  'com.sa', 'net.sa', 'org.sa', 'gov.sa', 'edu.sa',
  'co.ke', 'or.ke', 'ne.ke',
  'com.ng', 'org.ng', 'gov.ng', 'edu.ng',
  'com.eg', 'gov.eg', 'edu.eg',
  // --- Latin America ---
  'com.mx', 'org.mx', 'gob.mx', 'edu.mx',
  'com.ar', 'net.ar', 'org.ar', 'gob.ar', 'edu.ar',
  'com.co', 'net.co', 'org.co', 'gov.co', 'edu.co',
  'com.pe', 'org.pe', 'gob.pe',
  'com.cl', 'gob.cl',
  'com.uy', 'com.ve', 'com.ec', 'com.bo', 'com.py', 'com.do', 'com.gt',
  // --- Canada / US states (common SLDs) ---
  'co.ca', 'qc.ca', 'on.ca', 'ab.ca', 'bc.ca',
  'k12.ca.us', 'gov.us', // (rare 3-label cases collapse safely via fallback)
  // --- Private / hosting suffixes (free subdomains commonly abused in phishing) ---
  'github.io', 'githubusercontent.com', 'gitlab.io', 'pages.dev', 'workers.dev',
  'web.app', 'firebaseapp.com', 'appspot.com', 'run.app',
  'netlify.app', 'netlify.com', 'vercel.app', 'now.sh',
  'herokuapp.com', 'herokudns.com', 'glitch.me', 'repl.co', 'replit.dev',
  'surge.sh', 'render.com', 'onrender.com', 'fly.dev',
  'blogspot.com', 'wordpress.com', 'weebly.com', 'wixsite.com', 'squarespace.com',
  's3.amazonaws.com', 'cloudfront.net', 'azurewebsites.net', 'blob.core.windows.net',
  'translate.goog', 'sites.google.com', 'storage.googleapis.com',
  'r2.dev', 'b-cdn.net', 'ngrok.io', 'ngrok-free.app', 'trycloudflare.com',
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

  // Find the longest known multi-label suffix (3-label beats 2-label), so
  // s3.amazonaws.com or sites.google.com are treated as public suffixes too.
  let suffix
  let registrable
  const lastThree = parts.length >= 3 ? parts.slice(-3).join('.') : ''
  const lastTwo = parts.slice(-2).join('.')
  if (parts.length >= 4 && lastThree && MULTI_LABEL_SUFFIXES.has(lastThree)) {
    suffix = lastThree
    registrable = parts.slice(-4).join('.')
  } else if (parts.length >= 3 && MULTI_LABEL_SUFFIXES.has(lastTwo)) {
    suffix = lastTwo
    registrable = parts.slice(-3).join('.')
  } else {
    suffix = parts.slice(-1).join('.')
    registrable = lastTwo
  }

  const core = registrable.slice(0, registrable.length - suffix.length - 1) || registrable
  return { registrable, core, suffix }
}
