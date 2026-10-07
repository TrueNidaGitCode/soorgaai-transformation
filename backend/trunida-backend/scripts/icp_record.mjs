/**
 * Record ICP interviews and the wedge from a JSON file.
 *
 * Usage, from backend/trunida-backend:
 *   node scripts/icp_record.mjs <file.json>           (dry run: checks and prints)
 *   node scripts/icp_record.mjs <file.json> --write
 *
 * Since 7 October 2026 the owner shares each interview's four questions and
 * answers in the Claude chat; the playbook is filled there from an
 * understanding of the conversation, and this writes it. The Target Audience
 * tab only displays.
 *
 * The file:
 * {
 *   "vertical": "clinics",
 *   "interviews": [{
 *     "company": "…", "met": "…", "when": "…",
 *     "answers": { "problem": "…", "example": "…", "detection": "…", "value": "…" },
 *     "cells": { "<row key>": { "state": "yes|open|claim|", "text": "…", "quote": "words from the answers" } },
 *     "replace": false
 *   }],
 *   "wedge": { "groups": [{ "problem": "…", "kind": "retention|growth|outside", "companies": ["A" or name], "why": "…" }],
 *              "draft": { "segment": "…", "problem": "…", "outcome": "…", "sentence": "…" },
 *              "reason": "…", "lock": false }
 * }
 *
 * Row keys are icpInterviewService ROWS plus pilot and earlier. Every tick or
 * stated figure must quote the answers; one that does not is downgraded to
 * "asked, not established" and listed, so it can be fixed rather than
 * trusted. The wedge is ready only when two companies share one evidenced
 * problem, and it locks only then.
 */
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import { fileURLToPath } from 'url';

const BE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(BE, '.env') });
const S = await import('../services/icpInterviewService.js');

const file = process.argv.slice(2).find((a) => !a.startsWith('--'));
if (!file) { console.error('Give the JSON file.'); process.exit(1); }
const WRITE = process.argv.includes('--write');
const input = JSON.parse(fs.readFileSync(file, 'utf8'));
const vertical = String(input.vertical || '').trim();
if (!vertical) { console.error('The file needs a vertical.'); process.exit(1); }

let problems = 0;
for (const iv of input.interviews || []) {
  const answers = iv.answers || {};
  const { cells, downgraded } = S.checkCells(iv.cells || {}, answers);
  const unknown = Object.keys(iv.cells || {}).filter((k) => !(k in cells));
  console.log(`\n${vertical} · ${iv.company} (${iv.met || 'not recorded'}, ${iv.when || 'no date'})`);
  for (const [k, q] of S.QUESTIONS) console.log(`  ${k}: ${answers[k] ? String(answers[k]).slice(0, 110).replace(/\n/g, ' / ') : '(not answered)'}`);
  console.log(`  cells: ${Object.keys(cells).length}`);
  if (downgraded.length) { problems++; console.log(`  NOT TRACED to the answers (downgraded to open): ${downgraded.join(', ')}`); }
  if (unknown.length) { problems++; console.log(`  Unknown rows, ignored: ${unknown.join(', ')}`); }
}

if (!WRITE) {
  console.log(`\nDry run${problems ? ` — ${problems} interview(s) need a look` : ''}. Add --write to save.`);
  process.exit(0);
}

await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 15000 });
for (const iv of input.interviews || []) {
  await S.recordInterview({ vertical, ...iv });
  console.log(`saved ${iv.company}`);
}
if (input.wedge) {
  const w = await S.recordWedge(vertical, input.wedge);
  console.log(`wedge: ${w.ready ? 'ready' : 'not ready'}${w.locked ? ' · locked' : ''} — ${w.draft?.sentence || '(no sentence)'}`);
  for (const g of w.groups || []) console.log(`  ${g.companies.join(',')} (evidenced: ${g.evidenced.join(',') || 'none'}) ${g.problem}`);
}
const list = await S.listInterviews(vertical);
console.log(`\n${vertical}: ${list.map((i) => `${i.letter} ${i.company}`).join(' · ')}`);
await mongoose.disconnect();
