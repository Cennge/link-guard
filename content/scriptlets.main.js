// Anti-adblock / ad scriptlet engine — MAIN-world content script (declared in
// the manifest with "world": "MAIN", runs at document_start, EXEMPT from page
// CSP). Implements a safe subset of uBlock Origin's scriptlet library and
// applies them per-domain from the compiled list data (content/scriptlets-data.js,
// which runs first and exposes window.__LG_SCRIPTLETS).
//
// `nofab` runs on every page (it only touches the FuckAdBlock/BlockAdBlock
// namespace, so it's inert elsewhere). Everything else is domain-targeted from
// EasyList +js() rules, so ordinary sites are untouched.
;(function () {
  'use strict'

  var GLOBAL_RULES = [['nofab']]

  // Pull per-domain directives compiled from the filter lists, then remove the
  // global so it doesn't linger on the page.
  var data = {}
  try { data = window.__LG_SCRIPTLETS || {} } catch (e) {}
  try { delete window.__LG_SCRIPTLETS } catch (e) {}

  var host = location.hostname.replace(/^www\./, '')
  var rules = GLOBAL_RULES.slice()
  if (host) {
    var parts = host.split('.')
    for (var pi = 0; pi < parts.length - 1; pi++) {
      var d = data[parts.slice(pi).join('.')]
      if (d) rules = rules.concat(d)
    }
  }
  if (!rules.length) return

  var noop = function () {}

  // --- shared helpers ------------------------------------------------------
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
  // Build a matcher from a uBO needle: /regex/ -> regex, '' or '*' -> match-all,
  // leading '!' -> negate. Otherwise literal substring.
  function matcher(needle) {
    var neg = false
    if (needle && needle.charAt(0) === '!') { neg = true; needle = needle.slice(1) }
    var re
    if (!needle || needle === '*') re = { test: function () { return true } }
    else if (needle.length > 2 && needle.charAt(0) === '/' && needle.charAt(needle.length - 1) === '/') {
      try { re = new RegExp(needle.slice(1, -1)) } catch (e) { re = { test: function () { return false } } }
    } else {
      var lit = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      re = new RegExp(lit)
    }
    return function (s) { var r = re.test(String(s)); return neg ? !r : r }
  }
  function defprop(owner, prop, get, set) {
    try { Object.defineProperty(owner, prop, { configurable: true, get: get, set: set || function () {} }) } catch (e) {}
  }

  // A single shared DOM-mutation runner for remove-attr / remove-class so we
  // don't spin up an observer per rule.
  var domCbs = []
  var domHooked = false
  function onDom(cb) {
    domCbs.push(cb)
    if (domHooked) { try { cb() } catch (e) {} return }
    domHooked = true
    var run = function () { for (var i = 0; i < domCbs.length; i++) { try { domCbs[i]() } catch (e) {} } }
    var sched = false
    var kick = function () { if (sched) return; sched = true; (window.requestAnimationFrame || setTimeout)(function () { sched = false; run() }, 0) }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run, { once: true })
    else run()
    try { new MutationObserver(kick).observe(document.documentElement, { childList: true, subtree: true, attributes: true }) } catch (e) {}
  }

  // --- scriptlets ----------------------------------------------------------
  function setConstant(chain, rawVal) {
    var value = decode(rawVal)
    var parts = chain.split('.')
    function install(owner, i) {
      if (owner == null) return
      var prop = parts[i]
      if (i === parts.length - 1) { defprop(owner, prop, function () { return value }); return }
      var cur = owner[prop]
      if (cur != null && (typeof cur === 'object' || typeof cur === 'function')) install(cur, i + 1)
      else { var stored; defprop(owner, prop, function () { return stored }, function (v) { stored = v; if (v != null) install(v, i + 1) }) }
    }
    install(window, 0)
  }
  function abortRead(chain) {
    var parts = chain.split('.')
    function install(owner, i) {
      if (owner == null) return
      var prop = parts[i]
      if (i === parts.length - 1) { defprop(owner, prop, function () { throw new ReferenceError(prop) }); return }
      var cur = owner[prop]; if (cur != null) install(cur, i + 1)
    }
    install(window, 0)
  }
  function abortWrite(chain) {
    var parts = chain.split('.')
    function install(owner, i) {
      if (owner == null) return
      var prop = parts[i]
      if (i === parts.length - 1) {
        var v = owner[prop]
        defprop(owner, prop, function () { return v }, function () { throw new ReferenceError(prop) })
        return
      }
      var cur = owner[prop]; if (cur != null) install(cur, i + 1)
    }
    install(window, 0)
  }
  // abort-current-script: throw when `chain` is read by a script whose source
  // matches `search` (or any script if no search).
  function abortCurrentScript(chain, search) {
    var test = search ? matcher(search) : null
    var parts = chain.split('.')
    function install(owner, i) {
      if (owner == null) return
      var prop = parts[i]
      if (i === parts.length - 1) {
        var val = owner[prop]
        defprop(owner, prop, function () {
          var cs = document.currentScript
          var src = cs ? (cs.src || cs.textContent || '') : ''
          if (!test || test(src)) throw new ReferenceError(prop)
          return val
        }, function (v) { val = v })
        return
      }
      var cur = owner[prop]; if (cur != null) install(cur, i + 1)
    }
    install(window, 0)
  }
  function hasPath(o, path) {
    var ks = path.split('.')
    for (var i = 0; i < ks.length; i++) { if (o == null) return false; if (ks[i] === '*') return true; o = o[ks[i]] }
    return o !== undefined
  }
  function deletePath(o, path) {
    var ks = path.split('.')
    function rec(obj, i) {
      if (obj == null || typeof obj !== 'object') return
      var k = ks[i]
      if (i === ks.length - 1) { if (k === '*') { for (var p in obj) try { delete obj[p] } catch (e) {} } else try { delete obj[k] } catch (e) {}; return }
      if (k === '*') { for (var key in obj) rec(obj[key], i + 1) }
      else rec(obj[k], i + 1)
    }
    rec(o, 0)
  }
  function jsonPrune(propsStr, reqStr) {
    var props = (propsStr || '').split(/ +/).filter(Boolean)
    var req = (reqStr || '').split(/ +/).filter(Boolean)
    if (!props.length) return
    function prune(r) {
      try {
        if (r && typeof r === 'object') {
          if (req.length && !req.every(function (p) { return hasPath(r, p) })) return r
          for (var i = 0; i < props.length; i++) deletePath(r, props[i])
        }
      } catch (e) {}
      return r
    }
    var JP = JSON.parse
    JSON.parse = function () { return prune(JP.apply(this, arguments)) }
    try {
      if (window.Response && Response.prototype && Response.prototype.json) {
        var RJ = Response.prototype.json
        Response.prototype.json = function () { return RJ.apply(this, arguments).then(prune) }
      }
    } catch (e) {}
  }
  function noFetchIf(cond) {
    var w = window
    if (typeof w.fetch !== 'function') return
    // Use only the url:-relevant part of the condition as a URL needle.
    var needle = cond || ''
    needle = needle.replace(/\b(method|type|body|mode):\S+/g, '').trim()
    var m = matcher(needle.replace(/^url:/, ''))
    var of = w.fetch
    w.fetch = function (input) {
      try {
        var url = (typeof input === 'string') ? input : (input && input.url) || ''
        if (m(url)) return Promise.resolve(new Response(''))
      } catch (e) {}
      return of.apply(this, arguments)
    }
  }
  function noXhrIf(needle) {
    var XHR = window.XMLHttpRequest
    if (!XHR || !XHR.prototype) return
    var m = matcher(needle)
    var open = XHR.prototype.open
    var send = XHR.prototype.send
    XHR.prototype.open = function (method, url) { this.__lgUrl = url || ''; return open.apply(this, arguments) }
    XHR.prototype.send = function () { try { if (m(this.__lgUrl || '')) return } catch (e) {} return send.apply(this, arguments) }
  }
  function preventTimer(which, needle, delayStr, boost) {
    var orig = window[which]
    if (typeof orig !== 'function') return
    var m = needle ? matcher(needle) : null
    var wantDelay = (delayStr != null && delayStr !== '') ? parseInt(delayStr, 10) : null
    window[which] = function (cb, delay) {
      try {
        var src = (typeof cb === 'function') ? cb.toString() : String(cb)
        var hit = (!m || m(src)) && (wantDelay == null || wantDelay === (delay || 0))
        if (hit) {
          if (boost) { var args = [].slice.call(arguments); args[1] = Math.max(0, (delay || 0) * boost); return orig.apply(this, args) }
          return 0 // drop
        }
      } catch (e) {}
      return orig.apply(this, arguments)
    }
  }
  function preventAEL(typeN, funcN) {
    var ET = window.EventTarget
    if (!ET || !ET.prototype) return
    var rt = typeN ? matcher(typeN) : null
    var rf = funcN ? matcher(funcN) : null
    var orig = ET.prototype.addEventListener
    ET.prototype.addEventListener = function (type, listener) {
      try {
        var fs = (typeof listener === 'function') ? listener.toString() : String(listener)
        if ((!rt || rt(String(type))) && (!rf || rf(fs))) return
      } catch (e) {}
      return orig.apply(this, arguments)
    }
  }
  function removeAttr(tokens, selector) {
    var attrs = (tokens || '').split(/[ ,]+/).filter(Boolean)
    if (!attrs.length) return
    var sel = selector || '[' + attrs.join('],[') + ']'
    onDom(function () {
      var els = document.querySelectorAll(sel)
      for (var i = 0; i < els.length; i++) for (var j = 0; j < attrs.length; j++) els[i].removeAttribute(attrs[j])
    })
  }
  function removeClass(tokens, selector) {
    var classes = (tokens || '').split(/[ ,]+/).filter(Boolean)
    if (!classes.length) return
    var sel = selector || '.' + classes.join(',.')
    onDom(function () {
      var els = document.querySelectorAll(sel)
      for (var i = 0; i < els.length; i++) for (var j = 0; j < classes.length; j++) els[i].classList.remove(classes[j])
    })
  }
  function setCookie(name, value) {
    if (!name) return
    try { document.cookie = encodeURIComponent(name) + '=' + encodeURIComponent(value == null ? '' : value) + '; path=/' } catch (e) {}
  }
  function noWebrtc() {
    try {
      var Stub = function () { return { close: noop, createDataChannel: function () { return {} }, createOffer: noop, setRemoteDescription: noop, addEventListener: noop, addIceCandidate: noop } }
      if (window.RTCPeerConnection) window.RTCPeerConnection = Stub
      if (window.webkitRTCPeerConnection) window.webkitRTCPeerConnection = Stub
    } catch (e) {}
  }
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

  // --- dispatch ------------------------------------------------------------
  for (var k = 0; k < rules.length; k++) {
    var r = rules[k]
    var name = r[0], a = r
    try {
      switch (name) {
        case 'nofab': nofab(); break
        case 'set-constant': setConstant(a[1], a[2]); break
        case 'abort-on-property-read': abortRead(a[1]); break
        case 'abort-on-property-write': abortWrite(a[1]); break
        case 'abort-current-script': abortCurrentScript(a[1], a[2]); break
        case 'json-prune': jsonPrune(a[1], a[2]); break
        case 'no-fetch-if': noFetchIf(a[1]); break
        case 'no-xhr-if': noXhrIf(a[1]); break
        case 'prevent-setTimeout': preventTimer('setTimeout', a[1], a[2]); break
        case 'prevent-setInterval': preventTimer('setInterval', a[1], a[2]); break
        case 'nano-st': preventTimer('setTimeout', a[1], null, a[2] ? parseFloat(a[2]) : 0.02); break
        case 'nano-si': preventTimer('setInterval', a[1], null, a[2] ? parseFloat(a[2]) : 0.02); break
        case 'prevent-addEventListener': preventAEL(a[1], a[2]); break
        case 'remove-attr': removeAttr(a[1], a[2]); break
        case 'remove-class': removeClass(a[1], a[2]); break
        case 'set-cookie': setCookie(a[1], a[2]); break
        case 'nowebrtc': noWebrtc(); break
      }
    } catch (e) {}
  }
})()
