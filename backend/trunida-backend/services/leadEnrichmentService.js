/**
 * A company name becomes an industry, and an industry becomes a question:
 * do we know anything about it?
 *
 * The manual loop this replaces: somebody meets a prospect, writes down the
 * company, opens a laptop, works out what industry it is in, checks whether
 * there is any knowledge base for that industry, and if not prepares one by
 * hand in the format the code accepts.
 *
 * Every part of that already existed here — detectCompanyIndustry finds the
 * industry, resolveIndustry stops two spellings of one industry becoming two
 * industries, ensureIndustryCoverage creates the shell, and the admin page
 * generates and publishes it. What was missing was the wire: nothing ever
 * called any of it when a lead was added.
 *
 * ── Why a sweep and not a call on add ──────────────────────────────────────
 *
 * Detection is a web-search-grounded model call. Firing one inline per lead
 * would mean a bulk import of sixty-three companies spending sixty-three of
 * them in a burst, on a click that is supposed to be instant. So this runs on
 * a timer, a few at a time, under a daily budget — which also means the
 * backlog drains predictably rather than all at once.
 *
 * ── What it deliberately does not do ───────────────────────────────────────
 *
 * It never generates a knowledge base. ensureIndustryCoverage creates a shell
 * and stops, because a new industry is around sixteen grounded calls and that
 * is a decision with a price. The shell appearing as `pending` on the industry
 * page IS the indication to go and generate it — and with thirty-two
 * industries sitting in the walk-in lane, doing it automatically would spend
 * five hundred calls the first time this ran.
 */
import ColdLead from '../models/ColdLead.js';
import { detectCompanyIndustry } from './companyResearchService.js';
import {
  listKnownIndustries, resolveIndustry, ensureIndustryCoverage,
} from './industryCapabilityKnowledgeService.js';

/** How many a single sweep will look at, and how many a day may cost. */
export const PER_SWEEP = 3;
export const DAILY_CAP = 25;

/** Long enough that a company the model could not place is not retried weekly. */
export const RECHECK_DAYS = 30;

/**
 * Which leads are worth looking up, as of `now`. Pure, so it can be tested
 * without a clock or a database.
 *
 * A lead with no company has nothing to look up. A lead that already has an
 * industry is done — including one typed by a person, which always wins. A
 * lead looked at recently is left alone whether or not the answer was found,
 * because the cost of asking again is the same as the cost of asking.
 */
export function enrichableLeads(docs, now = Date.now()) {
  const floor = now - RECHECK_DAYS * 86400000;
  return (docs || []).filter((l) => {
    if (!l) return false;
    if (!String(l.company || '').trim()) return false;
    if (String(l.industry || '').trim()) return false;
    const at = l.industryCheckedAt ? new Date(l.industryCheckedAt).getTime() : 0;
    return at < floor;
  });
}

/** How many have already been looked up today, counted from the records. */
export async function spentToday(now = new Date()) {
  const start = new Date(now);
  start.setUTCHours(0, 0, 0, 0);
  return ColdLead.countDocuments({ industryCheckedAt: { $gte: start } });
}

/**
 * Look up one lead's industry and make sure the industry has a shell.
 *
 * Returns what happened, in the words the operator needs: the industry, and
 * whether there is a knowledge base for it or one waiting to be generated.
 */
export async function enrichLead(lead, { knownIndustries = null } = {}) {
  const company = String(lead.company || '').trim();
  const known = knownIndustries || await listKnownIndustries().catch(() => []);

  const checkedAt = new Date();
  const found = await detectCompanyIndustry({ companyName: company, knownIndustries: known });

  /*
   * The provider refusing is not an answer about this company.
   *
   * Nothing is written down and no budget is counted: stamping the lead here
   * would hide it for a month because of a billing problem that might be
   * fixed in ten minutes, and the record would say "we looked into this
   * company" when nobody had.
   */
  if (found?.error === 'upstream') {
    return { company, industry: '', covered: false, upstream: true, reason: found.message };
  }

  if (!found?.industry) {
    await ColdLead.updateOne({ _id: lead._id }, { $set: { industryCheckedAt: checkedAt } });
    return { company, industry: '', covered: false, reason: 'Could not place this company.' };
  }

  // Two spellings of one industry would otherwise become two industries, and
  // the second would cost a full generation batch to say the same thing.
  const industry = await resolveIndustry(found.industry).catch(() => found.industry);

  await ColdLead.updateOne(
    { _id: lead._id },
    { $set: { industry: String(industry).slice(0, 80), industryCheckedAt: checkedAt } },
  );

  const covered = known.some((i) => String(i).toLowerCase() === String(industry).toLowerCase());

  // A shell, never a generation. This is what puts the industry on the admin
  // page with a button beside it.
  let shell = null;
  if (!covered) {
    shell = await ensureIndustryCoverage(industry, lead.addedByUserId || null).catch(() => null);
  }

  return {
    company,
    industry,
    covered,
    confidence: found.confidence || 'low',
    shellStatus: shell?.status || (covered ? 'ready' : ''),
  };
}

/**
 * One pass. Returns what it did, so a script and the scheduler can report the
 * same thing.
 */
export async function runEnrichmentSweep({ limit = PER_SWEEP } = {}) {
  const spent = await spentToday();
  const room = Math.max(0, DAILY_CAP - spent);
  if (!room) return { looked: 0, results: [], stopped: `Daily limit of ${DAILY_CAP} reached.` };

  // Oldest first: a lead added last week should not wait behind one added
  // this morning.
  const candidates = enrichableLeads(
    await ColdLead.find({ industry: { $in: [null, ''] } }).sort({ createdAt: 1 }).limit(200).lean(),
  );

  const take = candidates.slice(0, Math.min(limit, room));
  if (!take.length) return { looked: 0, results: [] };

  const known = await listKnownIndustries().catch(() => []);
  const results = [];
  for (const lead of take) {
    try {
      const r = await enrichLead(lead, { knownIndustries: known });
      results.push(r);
      // One refusal means the next call will be refused too. Trying the rest
      // of the batch learns nothing and logs the same error three times.
      if (r.upstream) return { looked: results.length, results, stopped: `The model provider refused: ${r.reason}` };
    } catch (err) {
      results.push({ company: lead.company, industry: '', covered: false, reason: err.message });
    }
  }
  return { looked: take.length, results, remainingToday: room - take.length };
}

// ── The schedule ────────────────────────────────────────────────────────────

export const SWEEP_MS = 10 * 60 * 1000;

let timer = null;

export function startEnrichmentScheduler() {
  if (process.env.LEAD_ENRICHMENT_DISABLED === 'true') {
    console.log('[enrich] scheduler disabled by LEAD_ENRICHMENT_DISABLED');
    return null;
  }
  const tick = () => runEnrichmentSweep()
    .then((r) => {
      for (const x of r.results || []) {
        console.log(`[enrich] ${x.company} → ${x.industry || '(not placed)'}${x.industry ? (x.covered ? ' — knowledge base ready' : ' — no knowledge base, shell created') : ''}`);
      }
    })
    .catch((err) => console.error('[enrich] sweep failed (non-fatal):', err.message));

  // Not on the first tick, for the same reason the outreach sweep is not: a
  // crash-looping server must never become a spending loop.
  timer = setInterval(tick, SWEEP_MS);
  if (typeof timer.unref === 'function') timer.unref();
  console.log(`[enrich] scheduler on, every ${SWEEP_MS / 60000} min, ${PER_SWEEP} at a time, ${DAILY_CAP} a day`);
  return timer;
}

export function stopEnrichmentScheduler() {
  if (timer) clearInterval(timer);
  timer = null;
}
