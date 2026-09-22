/**
 * Svarg — which watchers this business actually asked for
 *
 * Eame writes `data/agents.json` into every delivered application. The
 * application has read that file since the day the agents screen was built —
 * `catalogueFor(datasets, plan)` takes `{ order, startHere }` and has always
 * honoured both — but nothing ever wrote it, so every application shipped with
 * the default order and, more importantly, with nothing watching.
 *
 * That is what made a delivered application open on an empty board: a product
 * whose promise is "we will tell you before you have to look" arriving with
 * nothing looking.
 *
 * ── Why this is code, and not a question for the model ─────────────────────
 *
 * Choosing which watchers to start is a decision, and decisions here belong to
 * code. A model asked "which of these 28 should we run?" would answer
 * confidently every time, including for a business whose objective mentions
 * none of them — and the failure would be invisible, because a plausible list
 * looks exactly like a correct one.
 *
 * So this is a word match, deliberately dull: the customer's own objective and
 * the titles of their own opportunities, against terms written beside each
 * watcher. It is explainable, it is the same every time, and when it finds
 * nothing it says nothing rather than guessing.
 *
 * ── What it cannot do, and why that is safe ────────────────────────────────
 *
 * It can promote a watcher whose data is not there. That is fine: `startHere`
 * is only half of the gate. The application starts `startHere ∩ ready`, and
 * `ready` is decided by the matcher against the datasets that actually exist.
 * Wanting is not enough; possible is not enough either.
 */

import { CATALOGUE } from '../eame-template/services/agentCatalogue.js';

/**
 * The words that mean a watcher, in the language a customer uses.
 *
 * Written here rather than beside the catalogue entry because these are sales
 * and discovery vocabulary — how a business describes the problem before it
 * has met the product — and the catalogue is the product's own vocabulary.
 * They change for different reasons and at different times.
 */
const TERMS = {
  'stopped-coming':       ['stop', 'stopped', 'drop out', 'dropout', 'dropping out', 'drop-off', 'attrition', 'churn', 'disengage', 'abandon', 'retention', 'leaving', 'quit'],
  'missing-attendance':   ['attendance', 'register', 'roll call', 'mark present', 'absent'],
  'timesheet-chaser':     ['timesheet', 'hours', 'logged time', 'utilisation', 'utilization'],
  'leave-clash':          ['leave', 'holiday', 'time off', 'absence'],
  'new-joiner':           ['onboard', 'onboarding', 'new joiner', 'new starter', 'induction'],

  'overdue-invoice':      ['overdue', 'unpaid', 'outstanding', 'receivable', 'debtor', 'payment', 'chasing money', 'dues', 'arrears'],
  'never-invoiced':       ['uninvoiced', 'not invoiced', 'missed billing', 'unbilled', 'revenue leak'],
  'part-payment':         ['part payment', 'partial payment', 'short paid', 'balance due'],
  'unusual-expense':      ['expense', 'spend', 'cost spike', 'overspend'],
  'renewal-due':          ['renewal', 'renew', 'subscription', 'membership', 'expiry', 'expiring'],

  'unanswered-enquiry':   ['enquiry', 'inquiry', 'lead', 'unanswered', 'no reply', 'response time', 'respond', 'follow up', 'follow-up', 'followup', 'quotation', 'quote', 'proposal', 'going cold', 'cold'],
  'gone-quiet':           ['gone quiet', 'inactive', 'lapsed', 'stopped buying', 'declining', 'disengaged', 'at risk'],
  'repeat-complaint':     ['complaint', 'escalation', 'dissatisfied', 'unhappy'],
  'promise-overdue':      ['promise', 'commitment', 'sla', 'deadline', 'we said', 'due date', 'overdue task'],

  'unconfirmed-order':    ['unconfirmed', 'unacknowledged', 'purchase order', 'order confirmation'],
  'late-delivery':        ['late delivery', 'delayed', 'delay', 'shipment', 'dispatch', 'lead time'],
  'price-change':         ['price', 'pricing', 'cost change', 'rate change'],

  'empty-slot':           ['empty', 'unused', 'idle', 'capacity', 'utilisation', 'vacant', 'unbooked'],
  'over-capacity':        ['overbooked', 'over capacity', 'too many', 'crowded'],
  'no-show':              ['no show', 'no-show', 'did not attend', 'missed appointment', 'missed session'],
  'unstaffed-session':    ['unstaffed', 'no coach', 'no staff', 'cover', 'roster gap', 'unassigned'],

  'missing-detail':       ['missing', 'incomplete', 'blank', 'data quality'],
  'nothing-new':          ['stale', 'not updated', 'stopped syncing'],
  'duplicate':            ['duplicate', 'duplicates', 'same person twice', 'deduplicate'],
  'stale-source':         ['sync', 'not syncing', 'out of date'],

  'expiring-soon':        ['certificate', 'licence', 'license', 'insurance', 'compliance', 'expiry', 'expires'],
  'deadline-approaching': ['filing', 'return', 'statutory', 'regulatory deadline'],
  'missing-document':     ['document', 'paperwork', 'consent', 'missing form', 'kyc'],
};

/** How many to start without being asked. */
export const MAX_START = 5;

const norm = (s) => String(s || '').toLowerCase();

/**
 * Everything the customer said, as one lowercased haystack.
 *
 * The objective is what they typed themselves and carries the most weight by
 * simply being there; opportunity titles are Cob's reading of it and are
 * included because they name the problem in business terms the objective
 * sometimes only implies.
 */
export function blueprintText(bp) {
  const parts = [norm(bp?.businessObjective)];
  for (const key of ['opportunities', 'useCases', 'initiatives']) {
    for (const o of (Array.isArray(bp?.[key]) ? bp[key] : [])) {
      parts.push(norm(o?.title), norm(o?.description), norm(o?.name));
    }
  }
  return parts.filter(Boolean).join(' \n ');
}

/**
 * Score every watcher against what the customer said. Pure.
 *
 * One point per distinct term that appears. No weighting and no threshold
 * tuning: a watcher either got mentioned or it did not, and a business that
 * says "follow-up" twice does not need that watcher twice as much.
 */
export function scoreWatchers(text) {
  const hay = norm(text);
  const scores = new Map();
  if (!hay.trim()) return scores;

  for (const entry of CATALOGUE) {
    const terms = TERMS[entry.id] || [];
    let hits = 0;
    for (const t of terms) if (hay.includes(t)) hits++;
    if (hits > 0) scores.set(entry.id, hits);
  }
  return scores;
}

/**
 * The plan file's contents.
 *
 * `order` is every watcher the customer's words touched, best first — the
 * agents screen shows these at the top so the catalogue reads like their
 * business rather than like a feature list.
 *
 * `startHere` is the few worth running unprompted. Capped, because watchers
 * that start themselves also send mail: five findings on the first morning is
 * a product, twenty is an inbox problem and the customer switches all of it
 * off at once.
 *
 * An objective that matches nothing produces an empty plan, and an empty plan
 * is exactly what the application already handles — default order, nothing
 * auto-started, the owner chooses. Saying nothing is a valid answer here.
 */
export function watcherPlan(bp, { max = MAX_START } = {}) {
  const scores = scoreWatchers(blueprintText(bp));
  const ranked = [...scores.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([id]) => id);

  return { order: ranked, startHere: ranked.slice(0, Math.max(0, max)) };
}

/** The file itself, shaped like sourcesFile so delivery treats it the same. */
export function watcherPlanFile(bp) {
  return {
    path: 'data/agents.json',
    content: JSON.stringify(watcherPlan(bp), null, 2) + '\n',
  };
}
