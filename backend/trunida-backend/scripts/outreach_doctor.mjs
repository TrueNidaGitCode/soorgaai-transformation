/**
 * Why is the outreach engine sending nothing?
 *
 * There is a scheduler (server.js, every 15 minutes) and a sweep that claims
 * leads and sends the next email in each sequence. When no mail is going out
 * the cause is almost never the timer — it is one of a dozen deliberate
 * refusals in canSend(), each of which exists for a good reason and none of
 * which announces itself anywhere a person looks.
 *
 * This asks canSend() about every lead and buckets the answers, so the reason
 * the machine is quiet is one command away instead of a guess.
 *
 * Strictly read-only. Nothing is sent and nothing is written.
 *
 *   node scripts/outreach_doctor.mjs
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import ColdLead from '../models/ColdLead.js';
import { canSend, outreachReadiness } from '../services/outreachService.js';
import { motionOf, motionEmails, DEFAULT_MOTION } from '../services/gtmMotions.js';

await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);

const say = (s = '') => console.log(s);

say('── Is the machine switched on? ─────────────────────────────');
try {
  const r = await outreachReadiness();
  for (const [k, v] of Object.entries(r)) say(`  ${k.padEnd(24)} ${JSON.stringify(v)}`);
} catch (err) {
  say(`  could not read readiness: ${err.message}`);
}

const leads = await ColdLead.find({}).lean();
say(`\n── ${leads.length} leads, by lane ──────────────────────────────`);

const byMotion = new Map();
for (const l of leads) {
  const k = l.motion || DEFAULT_MOTION;
  byMotion.set(k, (byMotion.get(k) || 0) + 1);
}
for (const [k, n] of [...byMotion.entries()].sort((a, b) => b[1] - a[1])) {
  say(`  ${String(n).padStart(3)}  ${(motionOf(k)?.label || k).padEnd(26)} ${motionEmails(k) ? 'sends email' : 'never sends'}`);
}

say('\n── What canSend() says about each one ──────────────────────');
const reasons = new Map();
let sendable = 0;
for (const l of leads) {
  let v;
  try { v = await canSend(l, { ignoreSchedule: true }); }
  catch (err) { v = { ok: false, reason: `canSend threw: ${err.message}` }; }
  if (v.ok) { sendable++; continue; }
  // The motion refusal names the motion, which would give one bucket per lane.
  const key = /is not an email motion/.test(v.reason) ? 'Not an email motion (by design)' : v.reason;
  reasons.set(key, (reasons.get(key) || 0) + 1);
}
say(`  ${sendable} lead(s) the engine would send to right now.\n`);
for (const [why, n] of [...reasons.entries()].sort((a, b) => b[1] - a[1])) {
  say(`  ${String(n).padStart(3)}  ${why}`);
}

say('\n── Sequences ──────────────────────────────────────────────');
const count = (fn) => leads.filter(fn).length;
say(`  sequence enabled        ${count(l => l.sequence?.enabled)}`);
say(`  has subject and body    ${count(l => l.sequence?.subject && l.sequence?.body)}`);
say(`  has an org paragraph     ${count(l => String(l.orgContext || '').trim())}`);
say(`  ever received one       ${count(l => (l.sequence?.sentCount || 0) > 0)}`);
say(`  emails sent, all time   ${leads.reduce((a, l) => a + (l.sequence?.sentCount || 0), 0)}`);
say(`  unsubscribed            ${count(l => l.unsubscribedAt)}`);
say(`  replied                 ${count(l => l.status === 'replied')}`);
say(`  marked dead             ${count(l => l.status === 'dead')}`);

await mongoose.disconnect();
