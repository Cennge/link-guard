// Ad-blocking gate — ISOLATED world, document_start. Reads the settings + the
// per-site ad allowlist (only the ISOLATED world can touch chrome.storage) and,
// if ad blocking should NOT apply to this page, marks the document so the
// MAIN-world hooks (antipopup.main.js) stand down. The MAIN-world scripts can't
// read storage, so this attribute is the bridge between the two worlds.
//
// The pop-under hook reads the attribute at CALL time (when the user clicks),
// long after document_start, so the async storage read has always resolved by
// then — no race.
try {
  chrome.storage.local.get(['settings', 'adAllow'], (data) => {
    const s = (data && data.settings) || {}
    const h = location.hostname.replace(/^www\./, '')
    const allowed = (data.adAllow || []).some((e) => h === e || h.endsWith('.' + e))
    if (s.enabled === false || s.adblock === false || allowed) {
      const root = document.documentElement
      if (root) root.setAttribute('data-lg-adblock-off', '1')
    }
  })
} catch (e) {
  // storage unavailable / context invalidated — leave ad blocking on (default)
}
