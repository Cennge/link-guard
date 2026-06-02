// Read-only Bloom filter whose hashing is byte-for-byte identical to the
// `bloomfilter` npm package, so it can query the bundled `data/top-domains.bloom`
// produced by bloom-converter/build-bloom.mjs.
//
// Purpose: false-positive suppression. "Is this host among the global top ~1M
// popular domains?" If yes, an edit-distance/typo warning is almost certainly a
// false alarm (popular ≠ a verified brand, but it is known-real, so we don't
// block it). Membership is probabilistic with ~0.24% false-positive rate.

export const BLOOM_BITS = 16_000_000
export const BLOOM_K = 4

export class BloomReader {
  constructor(buckets, k = BLOOM_K) {
    this.buckets = buckets // Uint32Array
    this.m = buckets.length * 32
    this.k = k
    this._loc = new Uint32Array(k)
  }

  // Mirrors bloomfilter.locations(): FNV-1a (64-bit) + enhanced double hashing.
  locations(v) {
    const k = this.k
    const m = this.m
    const r = this._loc
    let a
    let b
    {
      const fnv64PrimeX = 0x01b3
      const l = v.length
      let t0 = 0
      let t1 = 0
      let t2 = 0
      let t3 = 0
      let v0 = 0x2325
      let v1 = 0x8422
      let v2 = 0x9ce4
      let v3 = 0xcbf2
      for (let i = 0; i < l; ++i) {
        v0 ^= v.charCodeAt(i)
        t0 = v0 * fnv64PrimeX
        t1 = v1 * fnv64PrimeX
        t2 = v2 * fnv64PrimeX
        t3 = v3 * fnv64PrimeX
        t2 += v0 << 8
        t3 += v1 << 8
        t1 += t0 >>> 16
        v0 = t0 & 0xffff
        t2 += t1 >>> 16
        v1 = t1 & 0xffff
        v3 = (t3 + (t2 >>> 16)) & 0xffff
        v2 = t2 & 0xffff
      }
      a = (v3 << 16) | v2
      b = (v1 << 16) | v0
    }
    a = a % m
    if (a < 0) a += m
    b = b % m
    if (b < 0) b += m
    r[0] = a
    for (let i = 1; i < k; ++i) {
      a = (a + b) % m
      b = (b + i) % m
      r[i] = a
    }
    return r
  }

  test(v) {
    const l = this.locations(v + '')
    const buckets = this.buckets
    for (let i = 0; i < this.k; ++i) {
      const x = l[i]
      if ((buckets[x >>> 5] & (1 << (x & 0x1f))) === 0) return false
    }
    return true
  }
}

// Lazily fetch + parse the bundled filter once. Returns a BloomReader, or null
// if unavailable (e.g. file missing) so callers degrade gracefully.
let _readerPromise = null
export function getTopDomains() {
  if (!_readerPromise) {
    _readerPromise = (async () => {
      try {
        const url = chrome.runtime.getURL('data/top-domains.bloom')
        const buf = await (await fetch(url)).arrayBuffer()
        return new BloomReader(new Uint32Array(buf), BLOOM_K)
      } catch {
        return null
      }
    })()
  }
  return _readerPromise
}
