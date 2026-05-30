import fs from 'fs';
import readline from 'readline';
import { BRANDS } from '../src/brands.js';
import { parseHost } from '../src/psl.js';

async function run() {
  const filePath = 'cleaned_top_domains.txt';
  const fileStream = fs.createReadStream(filePath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  const brandMap = new Map();
  for (const b of BRANDS) {
    brandMap.set(b.label, new Set(b.domains));
  }

  for await (const line of rl) {
    const domain = line.trim();
    if (!domain) continue;

    const { core, registrable } = parseHost(domain);
    if (brandMap.has(core)) {
      brandMap.get(core).add(registrable);
    }
  }

  // Now rewrite src/brands.js
  const brandsJsPath = '../src/brands.js';
  let brandsJsContent = fs.readFileSync(brandsJsPath, 'utf8');

  for (const [label, domains] of brandMap.entries()) {
    const sortedDomains = Array.from(domains).sort();
    
    // Find the line that defines this brand.
    // e.g. { label: 'google', display: 'Google', domains: ['google.com', ...] },
    const regex = new RegExp(`({ label: '${label}', display: '.*?', domains: )\\[.*?\\] (},?)`, 'g');
    const domainsStr = JSON.stringify(sortedDomains).replace(/"/g, "'");
    
    brandsJsContent = brandsJsContent.replace(regex, `$1${domainsStr} $2`);
  }

  fs.writeFileSync(brandsJsPath, brandsJsContent);
  console.log("Updated src/brands.js with grouped domains!");
}

run().catch(console.error);
