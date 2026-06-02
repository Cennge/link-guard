// Confusable -> canonical ASCII mapping (a pragmatic subset of Unicode TR39
// "confusables" plus common leetspeak substitutions). Reducing a label to its
// "skeleton" lets us treat pаypal (Cyrillic а), paypaӏ, and faceb00k as the same
// shape as the real brand name, which is exactly how these attacks work.

const CONFUSABLES = {
  // ---- Cyrillic look-alikes ----
  а: 'a', б: '6', в: 'b', г: 'r', д: 'a', е: 'e', ё: 'e', з: '3', и: 'u',
  й: 'u', к: 'k', м: 'm', н: 'h', о: 'o', п: 'n', р: 'p', с: 'c', т: 't',
  у: 'y', х: 'x', ь: 'b', ы: 'bi', э: 'e', ѕ: 's', і: 'i', ї: 'i', ј: 'j',
  ӏ: 'l', ԁ: 'd', ԛ: 'q', ԝ: 'w', һ: 'h', ҩ: 'q', ғ: 'f',
  ԑ: 'e', ҽ: 'e', ѵ: 'v', ԍ: 'g', ӡ: '3', ԃ: 'd', ѡ: 'w', ҏ: 'p', ҍ: 'b',
  ӄ: 'k', ԉ: 'l', ԧ: 'n', ӻ: 'f', ԟ: 'q', ѐ: 'e', ҿ: 'e', ӕ: 'ae',
  // ---- Greek look-alikes ----
  α: 'a', β: 'b', γ: 'y', ε: 'e', ζ: 'z', η: 'n', ι: 'i', κ: 'k', ν: 'v',
  ο: 'o', ρ: 'p', τ: 't', υ: 'u', χ: 'x', ω: 'w', ϲ: 'c', ϳ: 'j',
  ς: 'c', σ: 'o', μ: 'u', ϱ: 'p', ϰ: 'k', ϖ: 'w', ϴ: 'o', ϵ: 'e',
  // ---- Armenian look-alikes ----
  օ: 'o', ո: 'n', ս: 'u', ց: 'g', զ: 'q', գ: 'q', ա: 'w', հ: 'h', ք: 'p',
  յ: 'j', ե: 'b', դ: 'n', ի: 'h', ղ: 'n',
  // ---- Latin-extended / IPA look-alikes ----
  ɑ: 'a', ɡ: 'g', ɩ: 'i', ɪ: 'i', ʟ: 'l', ɴ: 'n', ʀ: 'r', ʏ: 'y', ɓ: 'b',
  ɗ: 'd', ɵ: 'o', ø: 'o', đ: 'd', ƚ: 'l', ɭ: 'l', ł: 'l', ḷ: 'l', ı: 'i',
  ǀ: 'l', ɔ: 'o', ɉ: 'j', ƀ: 'b', ɇ: 'e', ɨ: 'i', ŧ: 't', ꞁ: 'l',
  ꞇ: 't', ꭺ: 'a', ꞵ: 'b', ɸ: 'o', ꬲ: 'e', ɢ: 'g', ʜ: 'h', ʙ: 'b', ᴄ: 'c',
  ᴅ: 'd', ᴋ: 'k', ᴍ: 'm', ᴏ: 'o', ᴘ: 'p', ᴛ: 't', ᴜ: 'u', ᴠ: 'v', ᴢ: 'z',
  // ---- Full-width Latin (belt-and-braces; NFKC already folds most) ----
  ａ: 'a', ｅ: 'e', ｉ: 'i', ｏ: 'o', ｐ: 'p', ｌ: 'l', ｓ: 's', ｃ: 'c', ｇ: 'g',
  '𝟢': '0',
  // ---- Spacing / dashes / separators that get stripped ----
  ' ': '', '‐': '', '‑': '', '–': '', '—': '', '_': '', '·': '', '․': '',
  // ---- Digits / leetspeak that imitate letters ----
  '0': 'o', '1': 'l', '3': 'e', '4': 'a', '5': 's', '6': 'b', '7': 't',
  '8': 'b', '9': 'g', '@': 'a', '$': 's', '|': 'l', '!': 'i', '€': 'e',
}

// Reduce a string to its confusable skeleton: lowercase, NFKC-normalize, then
// map every known confusable character to its canonical representative.
export function skeleton(input) {
  let s
  try {
    s = input.normalize('NFKC')
  } catch {
    s = input
  }
  s = s.toLowerCase()
  let out = ''
  for (const ch of s) {
    out += Object.prototype.hasOwnProperty.call(CONFUSABLES, ch) ? CONFUSABLES[ch] : ch
  }
  return out
}

// Detect mixed-script labels (e.g. Latin + Cyrillic in one word), a strong
// homograph signal even when the brand is unknown.
export function isMixedScript(label) {
  let latin = false
  let cyrillic = false
  let greek = false
  let other = false
  for (const ch of label) {
    const code = ch.codePointAt(0)
    if (code < 0x80) {
      if (/[a-z]/i.test(ch)) latin = true
      continue
    }
    if (code >= 0x0400 && code <= 0x04ff) cyrillic = true
    else if ((code >= 0x0370 && code <= 0x03ff) || (code >= 0x1f00 && code <= 0x1fff)) greek = true
    else if (/\p{L}/u.test(ch)) other = true
  }
  const scripts = [latin, cyrillic, greek, other].filter(Boolean).length
  return scripts > 1
}

// True if the string contains any non-ASCII character.
export function hasNonAscii(input) {
  for (const ch of input) {
    if (ch.codePointAt(0) >= 0x80) return true
  }
  return false
}
