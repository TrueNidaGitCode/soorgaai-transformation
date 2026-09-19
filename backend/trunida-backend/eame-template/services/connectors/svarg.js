/**
 * Svarg's own operations, as a source.
 *
 * Only one application ever connects this: the tenant Svarg runs itself on.
 * Everything Svarg knows about how its customers are doing — which
 * applications are live, whether anybody has opened them this week, what the
 * pipeline looks like — arrives here as rows, so agents can watch it exactly
 * the way a customer's agents watch their own attendance or invoices.
 *
 * ── No credential is typed ─────────────────────────────────────────────────
 *
 * Every other connector asks the owner for a token, because the credential is
 * theirs and belongs in their database. This one asks for nothing: the
 * application already holds a per-deployment gateway token, and Svarg answers
 * or refuses on the strength of that. There is nothing here to steal that the
 * container did not already have.
 *
 * Svarg refuses every deployment but one. The flag that allows it is set by a
 * script run by hand and by no API at all — so this module shipping to an
 * application that should not have it would be untidy, not dangerous.
 */
import axios from 'axios';

/**
 * The one connector that holds no credential of the owner's.
 *
 * Every other kind asks for a token and marks that field secret. This one is
 * answered on the strength of the gateway token the container already has, so
 * there is no field to mark — and saying so here is what keeps the invariant
 * "a credential the owner typed is always marked secret" meaningful instead of
 * simply relaxed.
 */
export const usesDeploymentToken = true;

export const kind = 'svarg';
export const label = 'Svarg operations';
export const help = 'How the applications Svarg has delivered are doing. Available only to Svarg’s own tenant.';

export const fields = [
  {
    name: 'dataset',
    label: 'What to watch',
    placeholder: 'deployments, leads or blueprints',
  },
];

/**
 * The union of what the three datasets carry, so the mapping onto a dataset
 * has something to offer whichever one was chosen.
 */
export const provides = [
  'app', 'company', 'owner', 'status', 'running', 'url', 'requests', 'lastUsed',
  'daysSinceUse', 'liveAt', 'createdAt', 'conformanceRan', 'conformancePassed',
  'conformanceFailed', 'conformanceAt', 'motion', 'industry', 'industryMatched',
  'location', 'nextStep', 'nextStepAt', 'lastContactedAt', 'daysSinceContact',
  'emailsSent', 'deployed', 'guest', 'daysOld',
];

function base() {
  return String(process.env.SVARG_OPS_URL || '').trim().replace(/\/+$/, '');
}

function token() {
  return String(process.env.SELFHOSTED_API_KEY || '').trim();
}

function client() {
  if (!base()) throw new Error('This application was not given a Svarg operations address.');
  if (!token()) throw new Error('This application has no gateway token, so Svarg cannot identify it.');
  return axios.create({
    baseURL: base(),
    headers: { Authorization: `Bearer ${token()}` },
    timeout: 30000,
  });
}

/** The message Svarg sent, rather than the status code axios reports. */
function reason(err) {
  const m = err?.response?.data?.error;
  if (typeof m === 'string') return m;
  if (m && typeof m.message === 'string') return m.message;
  if (err?.response?.status === 403) return 'Svarg refused: this application is not the one allowed to read operations data.';
  return err?.message || 'Could not reach Svarg.';
}

export function describe(config) {
  return String(config?.dataset || '').trim();
}

export async function test(config) {
  const wanted = describe(config);
  try {
    const r = await client().get('');
    const available = r.data?.datasets || [];
    if (wanted && !available.includes(wanted)) {
      throw new Error(`There is no "${wanted}". Svarg offers: ${available.join(', ')}.`);
    }
    return { ok: true, message: `Connected. Svarg offers: ${available.join(', ')}.` };
  } catch (err) {
    throw new Error(reason(err));
  }
}

export async function pull(config, { maxRows = 50000 } = {}) {
  const wanted = describe(config);
  if (!wanted) throw new Error('Say which one to watch: deployments, leads or blueprints.');
  try {
    const r = await client().get('/' + encodeURIComponent(wanted));
    const rows = Array.isArray(r.data?.rows) ? r.data.rows : [];
    return rows.slice(0, maxRows);
  } catch (err) {
    throw new Error(reason(err));
  }
}
