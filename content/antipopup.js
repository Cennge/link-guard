// Anti pop-under / click-under guard. Runs at document_start in the ISOLATED
// world, then injects a small hook into the PAGE (MAIN) world so it overrides
// the page's own window.open before page scripts run. Gated by the adblock
// setting. Conservative: it allows the first window.open per real user gesture
// (so normal "open in new tab" links and OAuth popups still work) and blocks
// background opens, blank-then-redirect pop-unders, and extra opens fired by a
// single click — the classic pop-under pattern.
try {
  chrome.storage.local.get(['settings', 'adAllow'], (data) => {
    const s = (data && data.settings) || {}
    if (s.enabled === false || s.adblock === false) return
    const h = location.hostname.replace(/^www\./, '')
    const allowed = (data.adAllow || []).some((e) => h === e || h.endsWith('.' + e))
    if (allowed) return // user disabled ad blocking on this site
    const code = `(function(){
      try {
        var realOpen = window.open;
        if (!realOpen) return;
        var lastGesture = 0, gestureId = 0, opens = 0;
        var evs = ['click','mousedown','pointerdown','touchstart','keydown'];
        for (var i=0;i<evs.length;i++){
          document.addEventListener(evs[i], function(){ lastGesture = Date.now(); }, true);
        }
        function stub(){
          return { closed:true, close:function(){}, focus:function(){}, blur:function(){},
            postMessage:function(){}, moveTo:function(){}, resizeTo:function(){},
            document:{ write:function(){}, writeln:function(){}, close:function(){} },
            location:{ href:'', replace:function(){}, assign:function(){}, reload:function(){} } };
        }
        window.open = function(url){
          var now = Date.now();
          var fresh = (now - lastGesture) < 1000;
          if (gestureId !== lastGesture) { gestureId = lastGesture; opens = 0; }
          opens++;
          var u = (url == null ? '' : String(url)).trim();
          if (!fresh || opens > 1 || u === '' || /^about:blank/i.test(u)) {
            return stub();
          }
          return realOpen.apply(window, arguments);
        };
      } catch (e) {}
    })();`
    const sc = document.createElement('script')
    sc.textContent = code
    ;(document.documentElement || document.head).appendChild(sc)
    sc.remove()
  })
} catch (e) {
  // storage unavailable / context invalidated — do nothing
}
