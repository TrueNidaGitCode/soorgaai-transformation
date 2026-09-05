/**
 * Real Education Technology coverage.
 *
 * getDomainCapabilityBlueprint falls back to core content when an industry
 * file is missing, so a non-empty blob does NOT prove an overlay exists.
 * File presence is the only honest measure.
 */
import fs from 'fs';
import path from 'path';
import { getDomainCapabilities, getDomainCapabilityBlueprint, toFilename, KB_ENTERPRISE_ROOT } from './services/strategyCanvasService.js';
import { enabledDomains } from './config/domainRegistry.js';

const INDUSTRY = 'Education Technology';
let written = 0, total = 0;

for (const d of enabledDomains()) {
  const caps = getDomainCapabilities(d.kbPath);
  console.log(`\n${d.kbPath}`);
  for (const c of caps) {
    total++;
    const file = path.join(KB_ENTERPRISE_ROOT, d.kbPath, INDUSTRY, `${INDUSTRY}_${toFilename(c.name)}.md`);
    const exists = fs.existsSync(file);
    if (!exists) {
      console.log(`   [ ]  ${c.name}`);
      continue;
    }
    written++;
    const bp = getDomainCapabilityBlueprint(c.id, d.kbPath, INDUSTRY);
    const matched = bp.sections.filter(s => s.source === 'both').length;
    const bytes = fs.statSync(file).size;
    console.log(`   [x]  ${c.name.padEnd(36)} ${String(Math.round(bytes / 1024)).padStart(3)} KB, ${matched}/${bp.sections.length} pillars matched`);
  }
}

console.log(`\nwritten: ${written}/${total} capabilities`);
console.log(`remaining: ${total - written}`);
