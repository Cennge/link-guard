// Anti-adblock scriptlet engine — MAIN-world content script (declared in the
// manifest with "world": "MAIN"). Running as a content script means it executes
// in the page context at document_start and is EXEMPT from the page CSP (a
// DOM-injected <script> is not, and strict-CSP sites block it). No chrome.*
// dependency here; the only scriptlet applied everywhere is `nofab`, which is
// inert on sites without anti-adblock libraries, so it needs no per-site gating.
//
// Scriptlets (a safe subset of uBlock Origin's library):
//   set-constant(chain, value)      — pin window.x.y to a constant, ignore writes
//   abort-on-property-read(chain)   — throw when a bait property is read
//   nofab                           — neutralise FuckAdBlock / BlockAdBlock family
//
// `nofab` runs on every page: it only touches the FuckAdBlock/BlockAdBlock
// namespace (legit sites don't use it), so it can't break content — it just
// removes the "disable your adblocker" wall. The riskier flag-pinning
// set-constant rules are per-site only, so ordinary sites stay untouched.
;(function () {
  'use strict'

  var GLOBAL_RULES = [['nofab']]
  // Per-site flag-pinning rules, keyed by a hostname regex. Empty by default —
  // add entries only for sites that need specific anti-adblock flags pinned.
  var SITE_RULES = []

  var rules = GLOBAL_RULES.slice()
  for (var i = 0; i < SITE_RULES.length; i++) {
    if (SITE_RULES[i].match.test(location.hostname)) rules = rules.concat(SITE_RULES[i].rules)
  }
  if (!rules.length) return

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

  // uBO-style set-constant: pin the property and keep it pinned even if the page
  // assigns to it later (re-installs down the chain on set).
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

  // Neutralise the FuckAdBlock / BlockAdBlock family.
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
})()
