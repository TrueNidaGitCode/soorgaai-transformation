/**
 * Svarg — the opportunity as a thing with a history, not a line in a document
 *
 * Cob names six to twelve AI opportunities for a business, ranks them, and
 * recommends one. Then Execute builds that one. And then, until now, nothing:
 * Cob made a dozen predictions per customer and never once found out whether
 * any of them were right.
 *
 * ── Why this is the node ───────────────────────────────────────────────────
 *
 * Four stores already know about the same things and cannot be joined:
 *
 *   the blueprint            problems, workflow, opportunities, the ranking
 *   CapabilityRequest        what got built afterwards, and what was refused
 *   CustomerUnderstanding    what they keep asking for, and how often
 *   HostedDeployment         whether anyone actually uses the result
 *
 * The opportunity's NAME is the join. It already is one — blueprintGeneration
 * calls it "the anchor every later capability is keyed on", and the ranking,
 * the value section and the delivery phases are all keyed on that exact
 * string. Everything after go-live simply stopped using it.
 *
 * So this is not a new store. It is the same records, given a shared key and
 * read together.
 *
 * ── What it makes possible ─────────────────────────────────────────────────
 *
 *   A need arriving in conversation can be matched against the opportunities
 *   already identified, so "add fee reminders" is recognised as the fourth
 *   item on their own roadmap rather than planned from nothing.
 *
 *   An opportunity can carry what happened to it: built or not, used or not,
 *   asked for again or never mentioned since.
 *
 *   And Cob, generating for the next coaching centre, can be told what
 *   actually happened at the last four — which is the only part of this
 *   nobody who merely generates code can copy, because it requires running
 *   the application afterwards.
 */

import CapabilityRequest from '../models/CapabilityRequest.js';
import TransformationBlueprint from '../models/TransformationBlueprint.js';
import HostedDeployment from '../models/HostedDeployment.js';

/** The section titles the ranking has had. */
const PRIORITISATION = ['AI Implementation Prioritization', 'AI Use Case Prioritization'];

/** Two names for the same opportunity — compared on words, not spelling. */
export function sameOpportunity(a, b) {
  const key = (t) => String(t || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const ka = key(a);
  return !!ka && ka === key(b);
}

/**
 * Every opportunity Cob identified for this blueprint, with where the ranking
 * put it and whether it is the one recommended to start with.
 *
 * Reads the same two sections the screens read, in the same order of
 * preference, so this and the Blueprints page can never disagree about which
 * opportunity is the winner.
 *
 * @returns {{name, plain, why, quadrant, recommended}[]} in ranked order where
 *   there is a ranking, else discovery order.
 */
export function opportunitiesOf(bp) {
  const domain = (bp?.domains || []).find(d => d.domainId === 'ai-use-cases');
  // A domain still generating has half-written sections; reading one produces
  // a list that changes under the reader.
  if (!domain || domain.status !== 'completed') return [];

  const sections = (domain.capabilities || []).flatMap(c => c.sections || []);
  const discovery = sections.find(s => s.title === 'AI Opportunity Discovery');
  const found = (discovery?.brief?.aiOpportunities || []).filter(o => o && o.name);
  if (!found.length) return [];

  const ranked = sections.find(s => PRIORITISATION.includes(s.title));
  const brief = ranked?.brief || {};
  const quadrantOf = new Map();
  for (const q of brief.priorityQuadrants || []) {
    for (const name of q.initiatives || []) quadrantOf.set(String(name), String(q.label || q.id || ''));
  }
  const all = (brief.priorityQuadrants || []).flatMap(q => q.initiatives || []).filter(Boolean);
  const recommended = brief.recommendedInitiativeName
    || all.slice().sort((a, b) => b.length - a.length).find(n => String(brief.recommendedStartingPoint || '').includes(n))
    || all[0] || '';

  const rows = found.map(o => ({
    name: String(o.name),
    plain: String(o.plain || o.name),
    why: String(o.why || ''),
    quadrant: quadrantOf.get(String(o.name)) || '',
    recommended: sameOpportunity(o.name, recommended),
  }));

  // Ranked order where there is one: the quadrants are the judgement, and a
  // list shown in discovery order hides it.
  if (!all.length) return rows;
  const rank = new Map(all.map((n, i) => [String(n), i]));
  return rows.slice().sort((a, b) =>
    (rank.has(a.name) ? rank.get(a.name) : 999) - (rank.has(b.name) ? rank.get(b.name) : 999));
}

/**
 * What became of each opportunity on one blueprint.
 *
 * The edges Execute already produces, read back against the node: whether a
 * capability was built for it, what state that build reached, and whether the
 * application it belongs to is being used at all.
 *
 * `built` is deliberately separate from `used`. An opportunity that shipped
 * and is queried weekly is evidence; one that shipped into an application
 * nobody has opened is not, and averaging them would turn the second into the
 * first.
 */
export async function opportunityLedger(blueprintId) {
  const bp = await TransformationBlueprint.findById(blueprintId).lean().catch(() => null);
  if (!bp) return [];

  const opportunities = opportunitiesOf(bp);
  if (!opportunities.length) return [];

  const [requests, deployment] = await Promise.all([
    CapabilityRequest.find({ blueprintId: String(blueprintId) })
      .select('opportunityName need status plan createdAt').lean().catch(() => []),
    HostedDeployment.findOne({ blueprintId }).select('status usage liveAt').lean().catch(() => null),
  ]);

  const requests_ = requests || [];
  const live = !!deployment?.liveAt;
  const queries = deployment?.usage?.requests || 0;

  return opportunities.map(o => {
    const mine = requests_.filter(r => sameOpportunity(r.opportunityName, o.name));
    const built = mine.find(r => ['ready', 'live'].includes(r.status)) || null;
    const planned = mine.find(r => ['planned', 'building'].includes(r.status)) || null;
    const refused = mine.find(r => r.status === 'dismissed') || null;

    return {
      ...o,
      /*
       * The recommended opportunity is the one the first build delivered, so
       * it counts as built even though no CapabilityRequest exists for it —
       * those only exist for capabilities added AFTER go-live.
       */
      built: !!built || (o.recommended && live),
      buildState: built ? built.status : planned ? planned.status : refused ? 'dismissed' : '',
      askedForLater: mine.length > 0,
      // What the customer said, in their words, when they asked for it again.
      askedAs: mine.map(r => r.need).filter(Boolean).slice(0, 3),
      used: queries > 0,
      queries,
    };
  });
}

/**
 * What happened to opportunities like these, at other businesses.
 *
 * The compounding half. Cob's opportunities are a prediction, and this is the
 * only place the prediction is ever scored — so it is what makes the next
 * blueprint better than the last, and it cannot be copied by anyone who does
 * not run the application afterwards.
 *
 * Scoped to an industry rather than retrieved by similarity: the population is
 * small, the join is exact, and a nearest-neighbour search over a handful of
 * blueprints would be machinery around a list that fits on a screen. When
 * there are hundreds, this is where retrieval goes.
 *
 * ── Which industry ─────────────────────────────────────────────────────────
 *
 * industryFit's, and only when it MATCHED. The blueprint's own `industry`
 * field defaults to 'Automotive' in the schema and is never written, so every
 * blueprint in the database carries it — a bank, a gym and a greeting included.
 * Grouping on it and calling the result "similar businesses" would be a false
 * claim in a block whose entire value is that it reports what actually
 * happened.
 *
 * An unmatched business has no peer group, so it gets no history. That is the
 * honest answer, and it is also what happened before any of this existed.
 *
 * Never throws and returns [] when there is nothing to say.
 */
export async function opportunityHistory({ industry, exceptBlueprintId = '', limit = 8 } = {}) {
  const trade = String(industry || '').trim();
  // 'General' is the sentinel for "industryFit found no match" — a bucket, not
  // a peer group, and the one most likely to be large and meaningless.
  if (!trade || trade === 'General') return [];

  try {
    const peers = await TransformationBlueprint
      .find({
        // The resolved industry, not the schema default. See above.
        'industryFit.matched': true,
        'industryFit.industry': trade,
        ...(exceptBlueprintId ? { _id: { $ne: exceptBlueprintId } } : {}),
        'domains.domainId': 'ai-use-cases',
      })
      .select('_id')
      .sort({ updatedAt: -1 })
      .limit(limit)
      .lean();

    const ledgers = await Promise.all(peers.map(p => opportunityLedger(p._id).catch(() => [])));

    // One row per distinct opportunity, counting how many businesses named it
    // and how many of those actually built it.
    const byName = new Map();
    for (const rows of ledgers) {
      for (const r of rows) {
        const key = r.name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
        const at = byName.get(key) || { name: r.name, plain: r.plain, named: 0, built: 0, askedForLater: 0 };
        at.named += 1;
        if (r.built) at.built += 1;
        if (r.askedForLater) at.askedForLater += 1;
        byName.set(key, at);
      }
    }

    return [...byName.values()].sort((a, b) => (b.built - a.built) || (b.named - a.named));
  } catch (err) {
    console.warn('[opportunityGraph] history unavailable:', err.message);
    return [];
  }
}

/**
 * The history as Cob reads it, or '' when there is nothing worth saying.
 *
 * Deliberately says what was NEVER built as well as what was: an opportunity
 * six businesses named and none built is the more useful signal of the two,
 * and a block that only lists successes teaches Cob to repeat them.
 */
export function historyText(rows) {
  if (!rows?.length) return '';

  // One business is an anecdote. Saying "at 1 similar business" invites the
  // model to treat a single case as a pattern.
  const worth = rows.filter(r => r.named >= 2);
  if (!worth.length) return '';

  const lines = worth.slice(0, 12).map(r => {
    const of = `${r.built} of ${r.named}`;
    if (r.built === 0) return `- ${r.name} — named at ${r.named}, built by none of them`;
    return `- ${r.name} — named at ${r.named}, built by ${of.split(' of ')[0]}`
         + (r.askedForLater ? `, and asked for again after go-live at ${r.askedForLater}` : '');
  });

  return [
    'WHAT HAPPENED AT SIMILAR BUSINESSES',
    'Opportunities Svarg identified for businesses like this one, and what they did with them.',
    'Evidence, not instruction: name what fits THIS business. An opportunity many named and',
    'none built is a warning; one asked for again after go-live was under-rated the first time.',
    ...lines,
  ].join('\n');
}
