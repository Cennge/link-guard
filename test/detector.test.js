// Minimal test harness (no deps): runs the detector over known attack samples
// and legitimate URLs, and asserts the verdicts. Run with: node test/detector.test.js
import { analyze, Verdict } from '../src/detector.js'

const cases = [
  // ---- Legitimate: must be SAFE ----
  ['https://www.google.com/search?q=x', Verdict.SAFE],
  ['https://accounts.google.com', Verdict.SAFE],
  ['https://www.paypal.com/signin', Verdict.SAFE],
  ['https://github.com/anthropics', Verdict.SAFE],
  ['https://user.github.io/page', Verdict.SAFE],
  ['https://s3.amazonaws.com/bucket', Verdict.SAFE],
  ['https://online.sberbank.ru', Verdict.SAFE],
  ['https://en.wikipedia.org', Verdict.SAFE],
  ['http://localhost:3000', Verdict.SAFE],
  ['https://192.168.1.1/admin', Verdict.SAFE],

  // ---- Typosquatting: must be flagged ----
  ['https://gooogle.com', null],
  ['https://faceb00k.com/login', null],
  ['https://paaypal.com', null],
  ['https://wikipedoa.org', Verdict.SAFE], // not a protected brand -> safe
  ['https://microsofy.com', null],
  ['https://gihub.com', null],

  // ---- Homograph / IDN (Cyrillic look-alikes) ----
  // The URL parser punycode-encodes these just like Chrome does before the
  // detector sees them. а = Cyrillic 'а', о = Cyrillic 'о'.
  ['https://pаypаl.com/login', Verdict.DANGER], // pаypаl.com
  ['https://gооgle.com', Verdict.DANGER], // gооgle.com
  ['https://аpple.com', Verdict.DANGER], // аpple.com (Cyrillic а)

  // ---- Combosquatting ----
  ['https://paypal.secure-login.com', Verdict.WARNING],
  ['https://sberbank.account-verify.ru', Verdict.WARNING],
]

let pass = 0
let fail = 0
for (const [url, expected] of cases) {
  const r = analyze(url)
  let ok
  if (expected === null) ok = r.verdict !== Verdict.SAFE
  else ok = r.verdict === expected
  const tag = ok ? 'PASS' : 'FAIL'
  if (ok) pass++
  else fail++
  const detail = `${r.verdict}${r.reason ? '/' + r.reason : ''}${r.brand ? ' (' + r.brand + ')' : ''}`
  console.log(`${tag}  ${url}\n      -> ${detail}${expected ? `   [expected ${expected}]` : '   [expected: flagged]'}`)
}
console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
