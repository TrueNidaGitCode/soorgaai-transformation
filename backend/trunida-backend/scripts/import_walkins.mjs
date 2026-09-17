/**
 * Load a list of places to walk into, from a file, into the walk-in lane.
 *
 * A trade show hands you sixty companies in an afternoon and none of them are
 * contacts yet — you have a hall, a stand number and a name, and you will not
 * have a person until you have stood at the stand. That is exactly the shape
 * the walk-in motion exists for, and typing sixty of them into a form one at a
 * time is how a good list becomes a list nobody finishes entering.
 *
 * It goes through addLead rather than writing to the collection, so every rule
 * the form enforces is enforced here too: the motion has to exist, the
 * organisation is required, the same company added twice is one row, and no
 * tracked link is minted for a visit that sends nothing.
 *
 *   node scripts/import_walkins.mjs <file.json>            # show what it would do
 *   node scripts/import_walkins.mjs <file.json> --write    # do it
 *
 * The file is an array of objects. `name` is the only required key:
 *
 *   [{ "name": "Acme Pvt Ltd", "booth": "H2.D35", "trueHall": "Hall 2",
 *      "segment": "rabbit" }]
 *
 * `--event "electronica India 2026"` puts the occasion in each row's private
 * note, which is the difference between "why is this company on my list" being
 * answerable in March and not.
 */
import 'dotenv/config';
import fs from 'fs';
import mongoose from 'mongoose';
import { addLead } from '../services/salesSignalsService.js';

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const write = args.includes('--write');
const event = args.includes('--event') ? args[args.indexOf('--event') + 1] : '';

if (!file) {
  console.log('Usage: node scripts/import_walkins.mjs <file.json> [--write] [--event "name"]');
  process.exit(1);
}

const rows = JSON.parse(fs.readFileSync(file, 'utf8'));
if (!Array.isArray(rows) || !rows.length) {
  console.log('That file holds no rows.');
  process.exit(1);
}

const SEGMENT = { rabbit: 'Rabbit (small)', deer: 'Deer (mid)', elephant: 'Elephant', whale: 'Whale' };

/** Several companies on one stand is one stop, and worth saying on each row. */
const perBooth = new Map();
for (const r of rows) if (r.booth) perBooth.set(r.booth, (perBooth.get(r.booth) || 0) + 1);

const plan = rows.map((r) => {
  const name = String(r.name || '').trim();
  const stand = [r.trueHall, r.booth].filter(Boolean).join(' · ');
  const shared = r.booth && perBooth.get(r.booth) > 1
    ? ` Shared stand — ${perBooth.get(r.booth)} companies at ${r.booth}, one stop.`
    : '';
  return {
    name,
    company: name,
    // 40 characters, so the hall and the stand and nothing else.
    location: stand.slice(0, 40),
    note: [SEGMENT[r.segment] || '', event, stand].filter(Boolean).join(' · ') + shared,
    // No date. The visit is on a day the show sets, and a next step carrying a
    // date somebody guessed is worse than one carrying none.
    nextStep: r.booth ? `Walk stand ${r.booth}` : 'Visit',
  };
});

const bad = plan.filter((p) => !p.company);
if (bad.length) {
  console.log(`${bad.length} row(s) have no name. Nothing was written.`);
  process.exit(1);
}

console.log(`${plan.length} companies → walk-in lane${event ? '  (' + event + ')' : ''}`);
console.log(write ? 'Writing.\n' : 'Dry run — pass --write to commit.\n');

for (const p of plan.slice(0, 5)) {
  console.log(`  ${p.company}`);
  console.log(`    where  ${p.location}`);
  console.log(`    next   ${p.nextStep}`);
  console.log(`    note   ${p.note}`);
}
if (plan.length > 5) console.log(`  … and ${plan.length - 5} more`);

if (!write) process.exit(0);

await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);

let added = 0;
let existing = 0;
const failed = [];

for (const p of plan) {
  try {
    // addLead upserts a contactless lead on { company, motion }, so a company
    // already on the list keeps its row, its status and anything written on it
    // after a visit. Re-running this is safe and that is the point.
    const before = await mongoose.connection.collection('coldleads')
      .countDocuments({ company: p.company, motion: 'walk-in' });
    await addLead({ ...p, motion: 'walk-in' });
    if (before) existing++; else added++;
  } catch (err) {
    failed.push({ company: p.company, why: err.message });
  }
}

console.log(`\n${added} added, ${existing} already on the list, ${failed.length} refused.`);
for (const f of failed) console.log(`  ${f.company}: ${f.why}`);

const total = await mongoose.connection.collection('coldleads').countDocuments({ motion: 'walk-in' });
console.log(`\nThe walk-in lane now holds ${total} row(s).`);

await mongoose.disconnect();
