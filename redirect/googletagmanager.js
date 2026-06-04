// Neutered replacement for Google Tag Manager (gtm.js). Provides dataLayer +
// gtag so pages don't throw; no tags are loaded.
(function () {
  'use strict'
  var w = window
  w.dataLayer = w.dataLayer || []
  if (typeof w.gtag !== 'function') {
    w.gtag = function () { try { w.dataLayer.push(arguments) } catch (e) {} }
  }
  // GTM marks itself started so snippets that gate on this don't retry forever.
  try {
    w.google_tag_manager = w.google_tag_manager || {}
  } catch (e) {}
})();
