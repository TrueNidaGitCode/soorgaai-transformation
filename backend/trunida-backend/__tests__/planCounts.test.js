/**
 * The plan's two counts, enforced: active watchers and monthly evaluations.
 *
 * Sold on the pricing page since 5 October 2026 (Hobby 3 / 500, Pro 25 /
 * 15,000, Ultra 100 / 60,000) and enforced inside the application. These run
 * the real agentService against a small in-memory stand-in for the three
 * collections it touches, so what is pinned is behaviour, not wording.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const DB = vi.hoisted(() => ({ cols: {} }));

/** Just enough of a Mongo collection for agentService's calls. */
function collection(name) {
  if (DB.cols[name]) return DB.cols[name];
  const docs = [];
  const matches = (d, q = {}) => Object.entries(q).every(([k, v]) => {
    if (v && typeof v === 'object' && '$ne' in v) return d[k] !== v.$ne;
    if (v && typeof v === 'object' && '$lt' in v) return (d[k] ?? 0) < v.$lt;
    return String(d[k]) === String(v);
  });
  const c = {
    docs,
    async countDocuments(q) { return docs.filter((d) => matches(d, q)).length; },
    async insertOne(d) { const _id = d._id || `id${docs.length + 1}`; docs.push({ ...d, _id }); return { insertedId: _id }; },
    async findOne(q) { return docs.find((d) => matches(d, q)) || null; },
    find(q) { return { toArray: async () => docs.filter((d) => matches(d, q)) }; },
    async updateOne(q, u, opt = {}) {
      let d = docs.find((x) => matches(x, q));
      if (!d) {
        if (!opt.upsert) return { modifiedCount: 0 };
        // An upsert whose filter carries a condition the new doc would fail is
        // a duplicate-key error in Mongo; none of agentService's upserts do.
        d = { _id: q._id }; docs.push(d);
        Object.assign(d, u.$setOnInsert || {});
      }
      Object.assign(d, u.$set || {});
      for (const [k, v] of Object.entries(u.$inc || {})) d[k] = (d[k] || 0) + v;
      return { modifiedCount: 1 };
    },
  };
  DB.cols[name] = c;
  return c;
}

vi.mock('mongoose', () => ({
  default: {
    connection: { readyState: 1, collection: (n) => collection(n) },
    // Called with new, so it must return an object: a String wrapper compares as its text.
    Types: { ObjectId: function (s) { return new String(s); } }, // eslint-disable-line no-new-wrappers
  },
}));
vi.mock('../eame-template/services/tenantSignals.js', () => ({ sendSignal: () => {} }));
vi.mock('../eame-template/services/notifyService.js', () => ({ sendDigest: async () => ({}) }));

const A = await import('../eame-template/services/agentService.js');

const WATCHER = { name: 'Gone Quiet', question: 'who stopped', schedule: 'daily' };

beforeEach(() => {
  for (const k of Object.keys(DB.cols)) delete DB.cols[k];
  process.env.APP_PLAN_LABEL = 'Hobby';
});
afterEach(() => {
  delete process.env.APP_WATCHER_LIMIT;
  delete process.env.APP_EVALUATION_LIMIT;
  delete process.env.APP_PLAN_LABEL;
});

describe('active watchers', () => {
  it('starts watchers up to the plan, then refuses with the plan\'s own number', async () => {
    process.env.APP_WATCHER_LIMIT = '3';
    for (let i = 0; i < 3; i++) await A.createAgent({ ...WATCHER, name: `W${i}` });
    await expect(A.createAgent({ ...WATCHER, name: 'W4' })).rejects.toMatchObject({
      code: 'WATCHER_LIMIT',
      message: expect.stringMatching(/The Hobby plan runs up to 3 watchers at once/),
    });
  });

  it('counts only the ones switched on, so switching one off makes room', async () => {
    process.env.APP_WATCHER_LIMIT = '2';
    await A.createAgent({ ...WATCHER, name: 'A' });
    const b = await A.createAgent({ ...WATCHER, name: 'B' });
    await A.setAgentEnabled(b.id, false);
    await expect(A.createAgent({ ...WATCHER, name: 'C' })).resolves.toBeTruthy();
  });

  it('refuses switching one back on when the plan is full', async () => {
    process.env.APP_WATCHER_LIMIT = '1';
    const a = await A.createAgent({ ...WATCHER, name: 'A' });
    await A.setAgentEnabled(a.id, false);
    await A.createAgent({ ...WATCHER, name: 'B' });
    await expect(A.setAgentEnabled(a.id, true)).rejects.toMatchObject({ code: 'WATCHER_LIMIT' });
  });

  it('has no cap at all where the plan sends none, which is every older application', async () => {
    for (let i = 0; i < 40; i++) await A.createAgent({ ...WATCHER, name: `W${i}` });
    expect(await A.watcherRoom()).toBe(Infinity);
  });
});

describe('monitoring evaluations', () => {
  const NOW = new Date('2026-10-20T06:00:00Z');

  it('spends one per run and refuses past the month\'s allowance', async () => {
    process.env.APP_EVALUATION_LIMIT = '2';
    expect(await A.takeEvaluation(NOW)).toBe(true);
    expect(await A.takeEvaluation(NOW)).toBe(true);
    expect(await A.takeEvaluation(NOW)).toBe(false);
    expect(await A.evaluationsUsed(NOW)).toBe(2);
  });

  it('starts a fresh allowance on the first of the month', async () => {
    process.env.APP_EVALUATION_LIMIT = '1';
    expect(await A.takeEvaluation(NOW)).toBe(true);
    expect(await A.takeEvaluation(NOW)).toBe(false);
    expect(await A.takeEvaluation(new Date('2026-11-01T00:05:00Z'))).toBe(true);
  });

  it('still counts when there is no limit, so the page can say how many were used', async () => {
    for (let i = 0; i < 5; i++) expect(await A.takeEvaluation(NOW)).toBe(true);
    expect(await A.evaluationsUsed(NOW)).toBe(5);
  });

  it('tells the Watchers page both counts and when the month resumes', async () => {
    process.env.APP_WATCHER_LIMIT = '3';
    process.env.APP_EVALUATION_LIMIT = '500';
    await A.createAgent({ ...WATCHER });
    expect(await A.usageSummary(NOW)).toEqual({
      watchers: { active: 1, limit: 3 },
      evaluations: { used: 0, limit: 500, resumes: '2026-11-01' },
    });
  });
});
