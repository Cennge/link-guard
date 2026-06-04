// Neutered replacement for googlesyndication adsbygoogle.js. Provides the
// adsbygoogle array shim so pages that push ad slots don't throw — but no ads
// are ever fetched or rendered.
(function () {
  'use strict'
  var noopfn = function () {}
  var w = window
  w.adsbygoogle = w.adsbygoogle || []
  // Replace push so queued slots are swallowed instead of triggering loads.
  w.adsbygoogle.push = function () { return 1 }
  w.adsbygoogle.loaded = true
  // Some pages read these.
  w.adsbygoogle.pauseAdRequests = 0
  w.__google_ad_urls = w.__google_ad_urls || []
  w.googleadsense = w.googleadsense || {}
  void noopfn
})();
