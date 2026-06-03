// Pop-under / click-under guard — MAIN-world content script (declared in the
// manifest with "world": "MAIN", so it runs in the page's JS context at
// document_start and is EXEMPT from the page Content-Security-Policy — unlike a
// DOM-injected <script>, which strict-CSP sites block). No chrome.* access here.
//
// The companion ISOLATED script gate.js marks the document with
// data-lg-adblock-off when ad blocking is disabled for this page (master switch
// off, adblock off, or the site is on the per-site allowlist). This hook reads
// that attribute at CALL time and stands down, so allowlisted sites behave
// normally.
//
// Conservative: allow the first window.open per real user gesture (so normal
// "open in new tab" links and OAuth popups still work) and block background
// opens, blank-then-redirect pop-unders, and extra opens fired by one click.
;(function () {
  try {
    var realOpen = window.open
    if (!realOpen) return
    var lastGesture = 0, gestureId = 0, opens = 0
    var evs = ['click', 'mousedown', 'pointerdown', 'touchstart', 'keydown']
    for (var i = 0; i < evs.length; i++) {
      document.addEventListener(evs[i], function () { lastGesture = Date.now() }, true)
    }
    function stub() {
      return {
        closed: true, close: function () {}, focus: function () {}, blur: function () {},
        postMessage: function () {}, moveTo: function () {}, resizeTo: function () {},
        document: { write: function () {}, writeln: function () {}, close: function () {} },
        location: { href: '', replace: function () {}, assign: function () {}, reload: function () {} },
      }
    }
    window.open = function (url) {
      // Stand down if ad blocking is off for this page (gate.js sets this).
      var root = document.documentElement
      if (root && root.getAttribute('data-lg-adblock-off')) {
        return realOpen.apply(window, arguments)
      }
      var now = Date.now()
      var fresh = (now - lastGesture) < 1000
      if (gestureId !== lastGesture) { gestureId = lastGesture; opens = 0 }
      opens++
      var u = (url == null ? '' : String(url)).trim()
      if (!fresh || opens > 1 || u === '' || /^about:blank/i.test(u)) {
        return stub()
      }
      return realOpen.apply(window, arguments)
    }
  } catch (e) {}
})()
