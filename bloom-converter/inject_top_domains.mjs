\import fs from 'fs';
import readline from 'readline';

async function run() {
  const filePath = 'cleaned_top_domains.txt';
  const fileStream = fs.createReadStream(filePath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  const top5000 = [];
  for await (const line of rl) {
    const domain = line.trim();
    if (!domain) continue;
    top5000.push(domain);
    if (top5000.length >= 5000) break;
  }

  const brandsJsPath = '../src/brands.js';
  let content = fs.readFileSync(brandsJsPath, 'utf8');

  // Format array to be somewhat readable by chunking
  let topStr = "[\n";
  for (let i = 0; i < top5000.length; i += 10) {
    const chunk = top5000.slice(i, i + 10);
    topStr += "  " + chunk.map(d => `'${d}'`).join(",") + ",\n";
  }
  topStr += "]";

  const replacement = `export const TOP_5000_DOMAINS = ${topStr};

// Flat set of every legitimate registrable domain, for O(1) allow-listing.
export const LEGIT_DOMAINS = new Set(TOP_5000_DOMAINS)
export const DOMAIN_TO_BRAND = new Map()

for (const brand of BRANDS) {
  for (const d of brand.domains) {
    LEGIT_DOMAINS.add(d)
    DOMAIN_TO_BRAND.set(d, brand.display)
  }
}`;

  const searchPattern = /\/\/ Flat set of every legitimate registrable domain, for O\(1\) allow-listing\.[\s\S]*?LEGIT_DOMAINS\.add\(d\)\r?\n}/m;
  if (!searchPattern.test(content)) {
    console.error("Could not find the target pattern to replace in brands.js");
    process.exit(1);
  }

  content = content.replace(searchPattern, replacement);
  fs.writeFileSync(brandsJsPath, content);
  console.log("Successfully injected Top 5000 domains and DOMAIN_TO_BRAND!");
}

run().catch(console.error);
