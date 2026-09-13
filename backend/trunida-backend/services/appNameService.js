/**
 * Svarg — what the application is called
 *
 * The name field on Eame is gone, so bp.appName was empty for every build and
 * the application fell back to its use case: a sentence. The repository, the
 * chat header and the Yusu hero all carried "Start with finding past faults
 * like this one: the defect history is already in Jira, so nothing has to be
 * collected first." as a product name.
 *
 * The application carries the ORGANISATION'S name: it is their product, on
 * their front door, for their people -- "Six Cricket Academy", not a name a
 * model invented. Only when no organisation is on record does the model
 * suggest one or two words from the objective, with a plain fallback when
 * the model is unavailable. A name the customer typed themselves is kept.
 * Called where the name first matters -- when a build starts -- and again at
 * publish and on the live-update sweep for blueprints named before this.
 */
import TransformationBlueprint from '../models/TransformationBlueprint.js';
import UserProfile from '../models/UserProfile.js';
import { resolveUseCase } from './blueprintUseCase.js';
import { generate } from './llmService.js';

const MAX_WORDS = 3;
const MAX_CHARS = 30;

const STOP = new Set(['a', 'an', 'the', 'for', 'of', 'and', 'or', 'with', 'using', 'based', 'via', 'to', 'in', 'on', 'by', 'from', 'into', 'our', 'your', 'their', 'this', 'that', 'ai', 'automated', 'automatic', 'like', 'one', 'first', 'so', 'is', 'are', 'be', 'has', 'have', 'it', 'we', 'start', 'startup', 'running', 'run', 'manage', 'managing', 'build', 'building', 'want', 'need', 'help', 'where', 'there', 'which', 'when']);

/** A name a product could carry: one to three words, letters and digits, Title Case. */
export function isGoodName(name) {
  const n = String(name || '').trim();
  if (!n || n.length > MAX_CHARS) return false;
  const words = n.split(/\s+/);
  if (words.length > MAX_WORDS) return false;
  return words.every(w => /^[A-Za-z][A-Za-z0-9'&-]*$/.test(w));
}

function titleCase(w) {
  return w.charAt(0).toUpperCase() + w.slice(1);
}

/** Without a model: the first two words of the use case that carry meaning, or the company plus a role. */
export function fallbackName({ useCaseName = '', companyName = '', objective = '' } = {}) {
  const pick = (text) => String(text || '').replace(/[^A-Za-z0-9\s'-]/g, ' ').split(/\s+/)
    .filter(w => w && !STOP.has(w.toLowerCase()) && w.length > 2).slice(0, 2).map(titleCase).join(' ');
  const fromUseCase = pick(useCaseName);
  if (fromUseCase && fromUseCase.split(' ').length === 2) return fromUseCase;
  const company = String(companyName || '').trim();
  if (company && !/^your organisation$/i.test(company)) return titleCase(company.split(/\s+/)[0]) + ' Assistant';
  const fromObjective = pick(objective);
  return fromObjective && fromObjective.split(' ').length === 2 ? fromObjective : (fromUseCase || 'Your Assistant');
}

/** The model's one or two words, or '' when it would not give a usable one. */
export async function suggestName({ objective = '', useCaseName = '', companyName = '' } = {}) {
  try {
    const { text } = await generate({
      systemPrompt: 'You name software products. Answer with the name only: one or two words, Title Case, letters only, no punctuation, no quotes, no explanation. Concrete and specific to what the product does for this business; never generic words like Assistant, Platform, Solution, System, AI, App, Tool on their own.',
      userMessage: [
        companyName ? `Company: ${companyName}` : '',
        useCaseName ? `What it does: ${useCaseName}` : '',
        objective ? `The objective it serves: ${String(objective).slice(0, 600)}` : '',
        'Name:',
      ].filter(Boolean).join('\n'),
      maxTokens: 16,
      label: 'eame:app-name',
    });
    const name = String(text || '').split('\n')[0].replace(/["'.`*]/g, '').trim();
    return isGoodName(name) ? name : '';
  } catch {
    return '';
  }
}

/** The organisation on record for this blueprint, or ''. */
export async function organisationName(bp, userId = null) {
  let name = String(bp?.companyName || '').trim();
  if (!name && (userId || bp?.userId)) {
    const profile = await UserProfile.findOne({ userId: userId || bp.userId }).select('orgName').lean().catch(() => null);
    name = String(profile?.orgName || '').trim();
  }
  return /^your organisation$/i.test(name) ? '' : name.slice(0, 48);
}

/**
 * Make sure the blueprint carries its name, and return it.
 *
 * In order: a name the customer typed (appNameSource 'customer') is theirs;
 * the organisation's name, when one is on record; otherwise the model's one
 * or two words, or the fallback. A name this service chose earlier
 * (appNameSource 'model' or 'fallback') is replaced by the organisation's
 * as soon as one is known, which is how applications named before this
 * rule get their right name on the next sweep.
 */
export async function ensureAppName(bp, { userId = null } = {}) {
  const current = String(bp?.appName || '').trim();
  const source = String(bp?.appNameSource || '');
  if (current && source === 'customer') return current;

  const org = await organisationName(bp, userId);
  if (org) return write(bp, org, 'organisation');
  if (isGoodName(current)) return current;

  const uc = resolveUseCase(bp);
  const useCaseName = uc?.source === 'approved-use-case' ? String(uc.name || '') : '';
  const suggested = await suggestName({ objective: bp?.businessObjective, useCaseName, companyName: '' });
  return suggested
    ? write(bp, suggested, 'model')
    : write(bp, fallbackName({ useCaseName, companyName: '', objective: bp?.businessObjective }), 'fallback');
}

async function write(bp, name, source) {
  if (bp?.appName === name && bp?.appNameSource === source) return name;
  if (bp?._id) {
    await TransformationBlueprint.updateOne({ _id: bp._id }, { $set: { appName: name, appNameSource: source } }).catch(() => {});
  }
  if (bp) { bp.appName = name; bp.appNameSource = source; }
  return name;
}
