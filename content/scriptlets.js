// Anti-adblock scriptlet engine. Runs at document_start in the ISOLATED world,
// then injects a tiny uBO-style scriptlet runtime into the PAGE (MAIN) world so
// it can neutralise the anti-adblock detectors page scripts rely on BEFORE they
// run. Gated by the adblock setting and the per-site ad allowlist, so a site the
// user exempted ("не блокировать рекламу здесь") is never touched.
//
// Scriptlets supported (a safe subset of uBlock Origin's library):
//   set-constant(chain, value)      — pin window.x.y to a constant, ignore writes
//   abort-on-property-read(chain)   — throw when a bait property is read
//   nofab                           — neutralise FuckAdBlock / BlockAdBlock family
//
// `nofab` is applied GLOBALLY: it only ever touches the FuckAdBlock/BlockAdBlock
// namespace, which legitimate sites don't use, so it can't break page content —
// it just stops the "disable your adblocker" wall. The riskier set-constant
// flag-pinning is applied PER-SITE only, so ordinary sites stay untouched.

// Rules applied on every http(s) page. Keep this list to dedicated anti-adblock
// library namespaces only (zero collision with real site code).
const GLOBAL_RULES = [['nofab']]

// Per-site rules, keyed by a hostname regex. Conservative: only well-known
// anti-adblock flag names so we never shadow a property a real site reads.
const SITE_RULES = [
  {
    match: /rezka|hdrezka/i,
    rules: [
      ['set-constant', 'adb', 'false'],
      ['set-constant', 'adblock', 'false'],
      ['set-constant', 'adBlockEnabled', 'false'],
      ['set-constant', 'isAdBlockActive', 'false'],
      ['set-constant', 'canRunAds', 'true'],
      ['set-constant', 'canShowAds', 'true'],
    ],
  },
]

function collectRules() {
  const out = GLOBAL_RULES.slice()
  for (const r of SITE_RULES) if (r.match.test(location.hostname)) out.push(...r.rules)
  return out
}

// The runtime injected into the page. It receives the rule list as a JSON
// literal so nothing from the isolated world leaks in.
function pageRuntime(rules) {
  'use strict'
  if (!rules || !rules.length) return
  var noop = function () {}

  function decode(v) {
    switch (v) {
      case 'false': return false
      case 'true': return true
      case 'null': return null
      case 'undefined': return undefined
      case 'noopFunc': return function () {}
      case 'trueFunc': return function () { return true }
      case 'falseFunc': return function () { return false }
      case 'emptyArr': return []
      case 'emptyObj': return {}
      case '': return ''
    }
    if (/^-?\d+$/.test(v)) return parseInt(v, 10)
    return v
  }

  // uBO-style set-constant: pin the property to a constant and keep it pinned
  // even if the page assigns to it later (re-installs down the chain on set).
  function setConstant(chain, rawVal) {
    var value = decode(rawVal)
    var parts = chain.split('.')
    function install(owner, i) {
      if (owner == null) return
      var prop = parts[i]
      if (i === parts.length - 1) {
        try {
          Object.defineProperty(owner, prop, {
            configurable: true,
            get: function () { return value },
            set: function () {},
          })
        } catch (e) {}
        return
      }
      var cur = owner[prop]
      if (cur != null && (typeof cur === 'object' || typeof cur === 'function')) {
        install(cur, i + 1)
      } else {
        var stored
        try {
          Object.defineProperty(owner, prop, {
            configurable: true,
            get: function () { return stored },
            set: function (v) { stored = v; if (v != null) install(v, i + 1) },
          })
        } catch (e) {}
      }
    }
    install(window, 0)
  }

  function abortOnRead(chain) {
    var parts = chain.split('.')
    function install(owner, i) {
      if (owner == null) return
      var prop = parts[i]
      if (i === parts.length - 1) {
        try {
          Object.defineProperty(owner, prop, {
            configurable: false,
            get: function () { throw new ReferenceError(prop) },
            set: function () {},
          })
        } catch (e) {}
        return
      }
      var cur = owner[prop]
      if (cur != null) install(cur, i + 1)
    }
    install(window, 0)
  }

  // Neutralise the FuckAdBlock / BlockAdBlock family: the fake reports
  // "no adblocker", fires the not-detected callback, and no-ops everything else.
  function nofab() {
    var Fake = function () {
      var self = this
      this.check = noop
      this.clearEvent = function () { return self }
      this.emitEvent = function () { return self }
      this.on = function () { return self }
      this.onDetected = function () { return self }
      this.onNotDetected = function (cb) { try { if (typeof cb === 'function') cb() } catch (e) {} return self }
      this.setOption = function () { return self }
      this.options = {}
    }
    try {
      window.FuckAdBlock = window.BlockAdBlock = Fake
      window.fuckAdBlock = window.blockAdBlock = new Fake()
      window.sniffAdBlock = new Fake()
    } catch (e) {}
  }

  for (var k = 0; k < rules.length; k++) {
    var r = rules[k]
    try {
      if (r[0] === 'set-constant') setConstant(r[1], r[2])
      else if (r[0] === 'abort-on-property-read') abortOnRead(r[1])
      else if (r[0] === 'nofab') nofab()
    } catch (e) {}
  }
}

try {
  chrome.storage.local.get(['settings', 'adAllow'], (data) => {
    const s = (data && data.settings) || {}
    if (s.enabled === false || s.adblock === false) return
    const h = location.hostname.replace(/^www\./, '')
    const allowed = (data.adAllow || []).some((e) => h === e || h.endsWith('.' + e))
    if (allowed) return // user disabled ad blocking on this site

    const rules = collectRules()
    if (!rules.length) return
    const code = `(${pageRuntime.toString()})(${JSON.stringify(rules)});`
    const sc = document.createElement('script')
    sc.textContent = code
    ;(document.documentElement || document.head).appendChild(sc)
    sc.remove()
  })
} catch (e) {
  // storage unavailable / context invalidated — do nothing
}
