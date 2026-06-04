// Neutered replacement for Google Publisher Tag (gpt.js). Implements the
// googletag API surface that publisher pages call (defineSlot, pubads, display,
// cmd queue, …) as no-ops so the page's JS doesn't throw — but no ad is fetched.
(function () {
  'use strict'
  var noopfn = function () {}
  var w = window
  var gt = w.googletag = w.googletag || {}

  function Slot() {}
  var sp = Slot.prototype
  var chainable = [
    'addService', 'defineSizeMapping', 'setCollapseEmptyDiv', 'setTargeting',
    'clearTargeting', 'setCategoryExclusion', 'clearCategoryExclusions',
    'setClickUrl', 'setForceSafeFrame', 'setSafeFrameConfig', 'updateTargetingFromMap',
    'set', 'get',
  ]
  for (var i = 0; i < chainable.length; i++) sp[chainable[i]] = function () { return this }
  sp.getAdUnitPath = function () { return '' }
  sp.getDomId = function () { return '' }
  sp.getSlotElementId = function () { return '' }
  sp.getTargeting = function () { return [] }
  sp.getTargetingKeys = function () { return [] }
  sp.getResponseInformation = function () { return null }

  function PubAds() {}
  var pp = PubAds.prototype
  var pubChain = [
    'addEventListener', 'removeEventListener', 'clear', 'clearCategoryExclusions',
    'clearTagForChildDirectedTreatment', 'clearTargeting', 'collapseEmptyDivs',
    'defineOutOfPagePassback', 'definePassback', 'disableInitialLoad', 'display',
    'enableAsyncRendering', 'enableLazyLoad', 'enableSingleRequest',
    'enableSyncRendering', 'enableVideoAds', 'get', 'refresh', 'set',
    'setCategoryExclusion', 'setCentering', 'setCookieOptions', 'setForceSafeFrame',
    'setLocation', 'setPublisherProvidedId', 'setRequestNonPersonalizedAds',
    'setSafeFrameConfig', 'setTargeting', 'setVideoContent', 'updateCorrelator',
    'markAsAmp', 'isSRA',
  ]
  for (var j = 0; j < pubChain.length; j++) pp[pubChain[j]] = function () { return this }
  pp.getTargeting = function () { return [] }
  pp.getTargetingKeys = function () { return [] }
  pp.getSlots = function () { return [] }

  var pubads = new PubAds()
  gt.cmd = gt.cmd || []
  gt.defineSlot = function () { return new Slot() }
  gt.defineOutOfPageSlot = function () { return new Slot() }
  gt.destroySlots = noopfn
  gt.display = noopfn
  gt.enableServices = noopfn
  gt.pubads = function () { return pubads }
  gt.sizeMapping = function () {
    var b = { addSize: function () { return b }, build: function () { return [] } }
    return b
  }
  gt.companionAds = function () { return { addEventListener: noopfn, removeEventListener: noopfn, setRefreshUnfilledSlots: noopfn } }
  gt.content = function () { return { addEventListener: noopfn, removeEventListener: noopfn, setContent: noopfn } }
  gt.setAdIframeTitle = noopfn
  gt.getVersion = function () { return '0' }
  gt.apiReady = true
  gt.pubadsReady = true

  // Drain any queued commands now, and run future pushes immediately.
  var q = gt.cmd
  gt.cmd = { push: function (fn) { try { if (typeof fn === 'function') fn() } catch (e) {} return 1 } }
  if (q && q.length) {
    for (var k = 0; k < q.length; k++) {
      try { if (typeof q[k] === 'function') q[k]() } catch (e) {}
    }
  }
})();
