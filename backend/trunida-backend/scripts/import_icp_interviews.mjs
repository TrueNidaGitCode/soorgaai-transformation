/**
 * Re-file the hand-written Target Audience table under the four questions.
 *
 * Usage, from backend/trunida-backend:
 *   node scripts/import_icp_interviews.mjs            (dry run: prints what it would write)
 *   node scripts/import_icp_interviews.mjs --write
 *
 * Until 6 October 2026 every interview was typed into frontend/admin/sales.js
 * as cells. The owner chose to re-file those companies rather than start
 * fresh: their evidence moved under the four questions WORD FOR WORD, and
 * every existing cell was kept as a human-entered cell (edited: true), so a
 * later AI fill can add the rows nobody wrote but never overwrite one that
 * somebody did.
 *
 * The data is frozen in scripts/data/icp_legacy_interviews.json, extracted
 * from the page on that day: what went into an answer is only what the
 * interview established (cells marked evidenced or stated). "Asked, not
 * established" notes are ours, not the customer's, and stayed as cells rather
 * than being passed off as answers.
 *
 * Idempotent: a company already imported for a vertical is updated, not
 * duplicated. Ran against production on 6 October 2026.
 */
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import { fileURLToPath } from 'url';

const BE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(BE, '.env') });
const WRITE = process.argv.includes('--write');

const docs = JSON.parse(fs.readFileSync(path.join(BE, 'scripts', 'data', 'icp_legacy_interviews.json'), 'utf8'));

for (const d of docs) {
  console.log(`\n${d.vertical} · ${d.order} · ${d.company} (${d.met || 'not recorded'})`);
  for (const [q, a] of Object.entries(d.answers)) console.log(`  ${q}: ${a ? a.slice(0, 140).replace(/\n/g, ' / ') : '(nothing established)'}`);
  console.log(`  cells: ${Object.keys(d.cells).length}`);
}

if (!WRITE) {
  console.log('\nDry run. Add --write to save.');
  process.exit(0);
}

const IcpInterview = (await import('../models/IcpInterview.js')).default;
await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 15000 });
for (const d of docs) {
  await IcpInterview.updateOne({ vertical: d.vertical, company: d.company }, { $set: d }, { upsert: true });
}
console.log(`\nWrote ${docs.length} interviews.`);
await mongoose.disconnect();
