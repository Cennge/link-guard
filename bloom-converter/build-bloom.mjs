// Rebuilds the top-domains bloom filter from the REAL Tranco top-1M list
// (top-1m.csv), NOT the casino-polluted file. Output is a packed Uint32Array
// buffer that src/bloom.js reads at runtime for false-positive suppression.
//
//   node bloom-converter/build-bloom.mjs
//
// Filter params MUST match src/bloom.js (BITS=16_000_000, K=4).
import { BloomFilter } from './node_modules/bloomfilter/bloomfilter.js'
import fs from 'fs'
import readline from 'readline'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const BITS = 16_000_000
const K = 4
const SRC = path.join(__dirname, 'top-1m.csv')
const OUT = path.join(__dirname, '..', 'data', 'top-domains.bloom')

async function main() {
  if (!fs.existsSync(SRC)) {
    console.error(`Source not found: ${SRC}`)
    process.exit(1)
  }
  fs.mkdirSync(path.dirname(OUT), { recursive: true })

  const filter = new BloomFilter(BITS, K)
  const rl = readline.createInterface({ input: fs.createReadStream(SRC), crlfDelay: Infinity })

  let count = 0
  for await (const line of rl) {
    let s = line.trim()
    if (!s) continue
    // "rank,domain" -> domain
    if (s.includes(',')) {
      const parts = s.split(',')
      s = parts.find((p) => p.includes('.') && isNaN(p)) || parts[parts.length - 1]
    }
    const domain = s.toLowerCase().replace(/^(https?:\/\/)?(www\.)?/, '').split('/')[0].trim()
    if (!domain) continue
    filter.add(domain)
    count++
    if (count % 200000 === 0) console.log(`  ${count} domains…`)
  }

  const buf = Buffer.from(filter.buckets.buffer)
  fs.writeFileSync(OUT, buf)
  console.log(`Packed ${count} domains.`)
  console.log(`Output: ${OUT} (${(buf.length / 1024 / 1024).toFixed(2)} MB)`)
  console.log(`Estimated FP rate: ${(filter.error() * 100).toFixed(3)}%`)
}

main().catch((e) => { console.error(e); process.exit(1) })
