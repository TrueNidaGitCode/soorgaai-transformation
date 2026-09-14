/**
 * Svarg — every objective, and what became of it
 *
 * The Blueprints page asks one question the product could not answer before:
 * *what do I actually have?* Until now that was four separate walks — into the
 * blueprint for the opportunity, on to Yusu for the address the application
 * runs at, nowhere at all for the capabilities the Learner built afterwards,
 * and the pricing page to find out why the rest is not built.
 *
 * This assembles that answer for one account. Nothing here is new knowledge:
 * the opportunity is the same one Cob's screen shows, the address is the
 * deployment's, the capabilities are CapabilityRequest rows, and the lock is
 * the entitlement the gates already enforce. What is new is that they arrive
 * together, per objective, in one request.
 *
 * ── Why the opportunity is resolved here and not read off a field ──────────
 *
 * There is no `opportunities` field. The ranked list lives four levels down
 * the domains tree, and blueprintGenerate.js has always known where. That
 * lookup is duplicated here rather than imported because the frontend copy
 * also renders it; keeping the rule in one place server-side is a later
 * tidy-up, and until then this is the copy the list must agree with. The one
 * thing that must not drift is which opportunity is the winner, so it is read
 * in the same order of preference: the model naming its own pick, then the
 * name inside the justification, then the first.
 */

import TransformationBlueprint from '../models/TransformationBlueprint.js';
import HostedDeployment from '../models/HostedDeployment.js';
import CapabilityRequest from '../models/CapabilityRequest.js';
import { resolvePlan, PLANS, UPGRADE_PATH } from './entitlements.js';

/** The two names one section has had. */
const PRIORITISATION = ['AI Implementation Prioritization', 'AI Use Case Prioritization'];

/**
 * The opportunities on a blueprint: the one to build, and the rest.
 *
 * Each carries both wordings. `name` is the technique — "Retrieval-Augmented
 * Semantic Matching for Defects" — and is the anchor every later stage is
 * keyed on. `plain` is the same opportunity in the customer's words, written
 * by the discovery section, and is what a person should be shown. A blueprint
 * generated before the plain line existed has only the name, so `plain` falls
 * back to it rather than being empty.
 *
 * @returns {{winner: {name:string, plain:string}|null, why:string,
 *            others: {name:string, plain:string}[], ranked:boolean}}
 */
export function resolveOpportunities(bp) {
  const none = { winner: null, why: '', others: [], ranked: false };
  const domain = (bp?.domains || []).find(d => d.domainId === 'ai-use-cases');
  // An incomplete domain has half-written sections; reading one produces a
  // list that changes under the reader as generation finishes.
  if (!domain || domain.status !== 'completed') return none;

  const sections = (domain.capabilities || []).flatMap(c => c.sections || []);
  const discovery = sections.find(s => s.title === 'AI Opportunity Discovery');
  const found = (discovery?.brief?.aiOpportunities || []).filter(o => o && o.name);
  const plainOf = new Map(found.map(o => [o.name, String(o.plain || '')]));
  const say = (name) => ({ name, plain: plainOf.get(name) || name });

  const ranked = sections.find(s => PRIORITISATION.includes(s.title));
  if (ranked) {
    const brief = ranked.brief || {};
    const all = (brief.priorityQuadrants || []).flatMap(q => q.initiatives || []).filter(Boolean);
    const why = String(brief.recommendedStartingPoint || '');
    // recommendedInitiativeName is the model naming its own pick. Preferred
    // over matching a name inside the justification, which breaks the moment
    // the sentence paraphrases it. Longest first among the fallbacks, so a
    // shorter initiative that is a prefix of another does not win.
    const winner = brief.recommendedInitiativeName
      || all.slice().sort((a, b) => b.length - a.length).find(n => why.includes(n))
      || all[0] || '';
    if (winner) return { winner: say(winner), why, others: all.filter(n => n !== winner).map(say), ranked: true };
  }

  if (found.length) {
    return {
      winner: say(found[0].name),
      why: String(found[0].why || ''),
      others: found.slice(1).map(o => say(o.name)),
      ranked: false,
    };
  }
  return none;
}

/**
 * What the customer should be told the objective is doing, as one word plus a
 * sentence. Deliberately about the APPLICATION, not the blueprint: "live"
 * means there is something to open, which is the only state anyone acts on.
 */
function state(bp, dep) {
  if (dep?.status === 'live')                        return { key: 'live',      label: 'Live' };
  if (dep && ['queued', 'preparing', 'prepared', 'attaching'].includes(dep.status))
    return { key: 'launching', label: 'Going live' };
  if (dep?.status === 'failed')                      return { key: 'failed',    label: 'Launch failed' };
  if (dep?.status === 'suspended')                   return { key: 'paused',    label: 'Paused' };
  if (bp.eameDelivery?.repoName)                     return { key: 'built',     label: 'Built' };
  if (bp.status === 'generating')                    return { key: 'planning',  label: 'Planning' };
  if (bp.status === 'failed')                        return { key: 'failed',    label: 'Planning failed' };
  if (bp.opportunityApproval?.approved)              return { key: 'approved',  label: 'Approved' };
  return { key: 'planned', label: 'Planned' };
}

/**
 * A capability the Learner acted on, as the page shows it.
 *
 * The status word on its own says nothing a customer can act on. What makes
 * this legible is the JOURNEY: what someone actually said, how many times it
 * came up before anything was decided, when it was decided, what it will do,
 * and what it is still waiting on. That is the difference between "Building"
 * and "your coaches asked for this four times, so it is being built now".
 */
function feature(req) {
  return {
    id:      String(req._id),
    title:   req.plan?.title || req.need || '',
    summary: req.plan?.summary || '',
    status:  req.status,
    // The requirement in the customer's own words — the thing that started it.
    need:    req.need || '',
    // How many times it had come up when the decision was taken. This is the
    // evidence for having acted at all, and the answer to "why this?".
    mentions: req.mentionsAtDecision || 1,
    // What the application will do, as steps a person would recognise.
    steps:   req.plan?.steps || [],
    dataNeeded: req.plan?.dataNeeded || [],
    // What the customer still has to do themselves before it works.
    connectorsNeeded: req.plan?.connectorsNeeded || [],
    // Why a build did not survive, in the words the build gave.
    error:   req.error || '',
    noticedAt: req.createdAt || null,
    at:      req.updatedAt || req.createdAt || null,
    toldAt:  req.notifiedAt || null,
  };
}

/**
 * Every objective this account has, with what became of it.
 *
 * One query per collection rather than per blueprint: an account with twenty
 * objectives would otherwise open sixty round trips to draw one page.
 */
export async function blueprintsOverview(userId) {
  const blueprints = await TransformationBlueprint
    .find({ userId }, {
      businessObjective: 1, status: 1, createdAt: 1, updatedAt: 1, appName: 1,
      opportunityApproval: 1, eameDelivery: 1, engagement: 1, industryFit: 1, domains: 1,
    })
    .sort({ createdAt: -1 })
    .lean();

  const ids = blueprints.map(b => b._id);
  const [deployments, requests, plan] = await Promise.all([
    HostedDeployment.find({ blueprintId: { $in: ids } },
      { blueprintId: 1, status: 1, statusMessage: 1, railway: 1, hosting: 1, liveAt: 1 }).lean(),
    // dismissed is the Learner's own veto — a wish it decided not to build.
    // Showing it would read as a refusal by us of something they asked for.
    // Dismissed is the Learner's own veto — a wish it decided not to build.
    // Kept out: showing it reads as Svarg refusing something they asked for.
    CapabilityRequest.find({ userId, status: { $ne: 'dismissed' } })
      .sort({ updatedAt: -1 }).lean(),
    resolvePlan(userId),
  ]);

  const depOf = new Map(deployments.map(d => [String(d.blueprintId), d]));
  const featuresOf = new Map();
  for (const r of requests) {
    const k = String(r.blueprintId);
    if (!featuresOf.has(k)) featuresOf.set(k, []);
    featuresOf.get(k).push(feature(r));
  }

  const upgradeTo = UPGRADE_PATH[plan.effective] || null;

  return {
    plan: {
      key:       plan.effective,
      label:     PLANS[plan.effective]?.label || 'Hobby',
      viaAdmin:  !!plan.viaAdmin,
      lapsed:    !!plan.lapsed,
      upgradeTo,
      upgradeLabel: upgradeTo ? PLANS[upgradeTo].label : '',
      // Ultra and Enterprise build every opportunity, so nothing is locked and
      // the page says so rather than showing a lock with no way past it.
      opportunitiesLocked: plan.effective === 'hobby' || plan.effective === 'pro',
    },
    blueprints: blueprints.map(bp => {
      const id  = String(bp._id);
      const dep = depOf.get(id) || null;
      const opp = resolveOpportunities(bp);
      return {
        id,
        objective: bp.businessObjective || '',
        appName:   bp.appName || '',
        industry:  bp.industryFit?.industry || '',
        status:    bp.status,
        state:     state(bp, dep),
        createdAt: bp.createdAt,
        approved:  !!bp.opportunityApproval?.approved,
        built:     opp.winner,
        why:       opp.why,
        others:    opp.others,
        // Only a live application has an address worth offering. A queued or
        // failed one would hand out a link that answers with an error page.
        app: dep?.status === 'live' && dep?.railway?.url
          ? { url: dep.railway.url, liveAt: dep.liveAt || null }
          : null,
        deployment: dep ? { status: dep.status, message: dep.statusMessage || '' } : null,
        features: featuresOf.get(id) || [],
      };
    }),
  };
}
