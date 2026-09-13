/**
 * Svarg — what the application is called
 *
 * The name field on Eame is gone, so bp.appName was empty for every build and
 * the application fell back to its use case: a sentence. The repository, the
 * chat header and the Yusu hero all carried "Start with finding past faults
 * like this one: the defect history is already in Jira, so nothing has to be
 * collected first." as a product name.
 *
 * A product has a name of one or two words. This asks the model for one from
 * the objective, the use case and the company, keeps it once it has it, and
 * falls back to something short and honest when the model is unavailable.
 * Called where the name first matters -- when a build starts -- and again at
 * publish for blueprints built before this existed.
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

/**
 * Make sure the blueprint has a short name, and return it. Keeps a name the
 * customer typed; replaces one that is a sentence; writes what it chose.
 */
export async function ensureAppName(bp, { userId = null } = {}) {
  const current = String(bp?.appName || '').trim();
  if (isGoodName(current)) return current;

  const uc = resolveUseCase(bp);
  const useCaseName = uc?.source === 'approved-use-case' ? String(uc.name || '') : '';
  let companyName = String(bp?.companyName || '').trim();
  if (!companyName && (userId || bp?.userId)) {
    const profile = await UserProfile.findOne({ userId: userId || bp.userId }).select('orgName').lean().catch(() => null);
    companyName = String(profile?.orgName || '').trim();
  }

  const name = (await suggestName({ objective: bp?.businessObjective, useCaseName, companyName }))
    || fallbackName({ useCaseName, companyName, objective: bp?.businessObjective });

  if (bp?._id) {
    await TransformationBlueprint.updateOne({ _id: bp._id }, { $set: { appName: name } }).catch(() => {});
    bp.appName = name;
  }
  return name;
}
