// Pop-under / click-under guard — MAIN-world content script (registered
// dynamically by the background via chrome.scripting with world:'MAIN', so it
// runs in the page's JS context at document_start and is EXEMPT from the page's
// Content-Security-Policy — unlike a DOM-injected <script>, which strict-CSP
// sites like rezka.ag block). No chrome.* access here: the background decides
// whether to register it at all (adblock on, site not allowlisted).
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
