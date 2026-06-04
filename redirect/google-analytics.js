// Neutered replacement for Google Analytics (analytics.js / ga.js). Implements
// just enough of the API surface (ga(), GoogleAnalyticsObject, gtag) that pages
// don't throw — nothing is ever sent.
(function () {
  'use strict'
  var noopfn = function () {}
  var w = window
  function ga() {
    var a = arguments
    // ga('send', ..., {hitCallback}) — invoke the callback so app flow continues.
    if (a.length && typeof a[a.length - 1] === 'object' && a[a.length - 1] && typeof a[a.length - 1].hitCallback === 'function') {
      try { a[a.length - 1].hitCallback() } catch (e) {}
    } else if (a.length === 1 && typeof a[0] === 'function') {
      try { a[0]() } catch (e) {}
    }
  }
  ga.create = function () {
    var tracker = {}
    var api = ['get', 'set', 'send', 'require', 'provide', 'on']
    for (var i = 0; i < api.length; i++) tracker[api[i]] = noopfn
    return tracker
  }
  ga.getByName = function () { return ga.create() }
  ga.getAll = function () { return [ga.create()] }
  ga.remove = noopfn
  ga.loaded = true
  w.GoogleAnalyticsObject = 'ga'
  w.ga = w.ga || ga
  // gtag shim (gtag.js).
  w.dataLayer = w.dataLayer || []
  if (typeof w.gtag !== 'function') w.gtag = function () { try { w.dataLayer.push(arguments) } catch (e) {} }
})();
