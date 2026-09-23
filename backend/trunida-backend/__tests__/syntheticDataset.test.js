/**
 * Sample data that can never be mistaken for a real export.
 *
 * Aria asks for datasets a business ought to have, and a company before launch
 * has not collected most of them. Generating a small sample makes the shape
 * real — the right columns, plausible values, the right cardinality.
 *
 * Exactly one failure matters here, and it is not a bad sample: it is somebody
 * reading a generated figure as their own number. Every defence against that
 * is a marker the model was asked to include — and a model that quietly drops
 * an instruction produces a file indistinguishable from an export. So the
 * marker is verified in code rather than trusted, and these are the tests for
 * the verification.
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';

const generate = vi.fn();
vi.mock('../services/llmService.js', () => ({ generate }));

const S = '../services/syntheticDatasetService.js';
let svc;

beforeEach(async () => {
  vi.resetModules();
  generate.mockReset();
  svc = await import(S);
});

const DATASET = { name: 'Member Attendance', purpose: 'Who came, and when' };

// ── The marker ───────────────────────────────────────────────────────────────

describe('the marker that says this is not your data', () => {
  it('adds it to every row when the model left it out entirely', async () => {
    const { csv, rowCount, columns } = svc.enforceMarker(
      'member_id,name,visits\nM1,Priya,12\nM2,Arun,4'
    );
    const lines = csv.split('\n');
    expect(lines[0]).toBe('_source,member_id,name,visits');
    expect(lines.slice(1).every(l => l.startsWith('sample,'))).toBe(true);
    expect(rowCount).toBe(2);
    // The columns reported are the real ones — the marker is not a column the
    // customer asked for, and Aria should not show it as one.
    expect(columns).toEqual(['member_id', 'name', 'visits']);
  });

  it('overwrites a marker the model filled in with something else', async () => {
    // A model that emits the column but writes "real" or "production" in it is
    // worse than one that omits it: the file looks checked.
    const { csv } = svc.enforceMarker(
      '_source,member_id\nproduction,M1\nreal,M2'
    );
    expect(csv.split('\n').slice(1).every(l => l.startsWith('sample,'))).toBe(true);
    expect(csv).not.toMatch(/production|real/);
  });

  it('reports the columns without the marker when the model did include it', () => {
    const { columns } = svc.enforceMarker('_source,member_id,name\nsample,M1,Priya');
    expect(columns).toEqual(['member_id', 'name']);
  });

  it('refuses a file with a header and no rows', () => {
    // An empty sample is not a small sample. It is a dataset that did not
    // generate, and saying so is the difference between a visible failure and
    // a blueprint grounded on nothing.
    expect(() => svc.enforceMarker('member_id,name')).toThrow(/no data rows/);
    expect(() => svc.enforceMarker('')).toThrow(/no data rows/);
    expect(() => svc.enforceMarker(null)).toThrow(/no data rows/);
  });

  it('ignores blank lines rather than counting them as rows', () => {
    const { rowCount } = svc.enforceMarker('member_id\nM1\n\n\nM2\n');
    expect(rowCount).toBe(2);
  });

  it('handles a file with Windows line endings', () => {
    const { csv, rowCount } = svc.enforceMarker('member_id\r\nM1\r\nM2');
    expect(rowCount).toBe(2);
    expect(csv.split('\n')[0]).toBe('_source,member_id');
  });
});

// ── Generating one ───────────────────────────────────────────────────────────

describe('generating a sample', () => {
  const ok = (text) => generate.mockResolvedValue({ text, model: 'gemini-x' });

  it('returns marked CSV, its shape, and which model wrote it', async () => {
    ok('member_id,name\nM1,Priya\nM2,Arun');
    const out = await svc.generateSampleDataset({ dataset: DATASET });
    expect(out.rowCount).toBe(2);
    expect(out.columns).toEqual(['member_id', 'name']);
    expect(out.model).toBe('gemini-x');
    expect(out.csv.split('\n').slice(1).every(l => l.startsWith('sample,'))).toBe(true);
  });

  it('unwraps a fenced code block, which is how a model usually answers', async () => {
    ok('Here you go:\n\n```csv\nmember_id,name\nM1,Priya\n```\n\nHope that helps.');
    const out = await svc.generateSampleDataset({ dataset: DATASET });
    expect(out.csv).not.toContain('```');
    expect(out.csv).not.toContain('Hope that helps');
    expect(out.rowCount).toBe(1);
  });

  it('files the spend under Cob rather than leaving it unattributed', async () => {
    ok('member_id\nM1');
    await svc.generateSampleDataset({ dataset: DATASET });
    expect(generate.mock.calls[0][0].label).toBe('cob:synthetic-dataset');
  });

  it('insists on a dataset name before spending anything', async () => {
    await expect(svc.generateSampleDataset({ dataset: {} })).rejects.toThrow(/dataset name is required/);
    await expect(svc.generateSampleDataset({})).rejects.toThrow(/dataset name is required/);
    expect(generate).not.toHaveBeenCalled();
  });

  it('fails loudly when the model returns nothing usable', async () => {
    ok('   ');
    await expect(svc.generateSampleDataset({ dataset: DATASET })).rejects.toThrow(/nothing usable/);
  });

  it('refuses an implausibly large sample rather than storing it', async () => {
    // Twenty-five rows is the target. A file this size is a model that has
    // started writing an export, which is the thing this must never look like.
    ok(`member_id\n${'M1\n'.repeat(9000)}`);
    await expect(svc.generateSampleDataset({ dataset: DATASET })).rejects.toThrow(/implausibly large/);
  });

  it('tells the model what the business is, so the sample is not generic', async () => {
    ok('member_id\nM1');
    await svc.generateSampleDataset({
      dataset: DATASET,
      objective: 'Members stop coming and we find out too late',
      industry: 'Fitness',
      companyName: 'GymShim',
    });
    const prompt = generate.mock.calls[0][0].userMessage;
    for (const part of ['Member Attendance', 'GymShim', 'Fitness', 'stop coming']) {
      expect(prompt, part).toContain(part);
    }
  });
});

// ── Keys shared across datasets ──────────────────────────────────────────────

describe('the identifiers that tie the datasets together', () => {
  it('finds the id columns and the values they actually use', () => {
    // Without this, one generated dataset calls somebody M1 and the next calls
    // them MEM-001, and nothing joins.
    const keys = svc.sharedKeys([
      '_source,member_id,name\nsample,M1,Priya\nsample,M2,Arun',
      '_source,member_id,visit\nsample,M1,2026-01-02\nsample,M3,2026-01-03',
    ]);
    const member = keys.find(k => k.column === 'member_id');
    expect(member.values.sort()).toEqual(['M1', 'M2', 'M3']);
  });

  it('takes only key-shaped columns, not every column in the file', () => {
    const keys = svc.sharedKeys(['member_id,name,visits\nM1,Priya,12']);
    expect(keys.map(k => k.column)).toEqual(['member_id']);
  });

  it('caps what it returns, because this goes into a prompt', () => {
    const rows = Array.from({ length: 50 }, (_, i) => `M${i}`).join('\n');
    const [key] = svc.sharedKeys([`member_id\n${rows}`], { maxValues: 5 });
    expect(key.values).toHaveLength(5);
    expect(key.more).toBe(true);
  });

  it('says so when it is showing everything', () => {
    const [key] = svc.sharedKeys(['member_id\nM1\nM2']);
    expect(key.more).toBe(false);
  });

  it('puts the busiest identifier first', () => {
    const keys = svc.sharedKeys([
      'member_id,coach_id\nM1,C1\nM2,C1\nM3,C1',
    ]);
    expect(keys[0].column).toBe('member_id');
  });

  it('is unbothered by a file with nothing in it', () => {
    expect(svc.sharedKeys(['', 'header_only', null, undefined])).toEqual([]);
    expect(svc.sharedKeys([])).toEqual([]);
  });
});

/**
 * Enough rows to demonstrate something, and no question about whose data.
 *
 * ── Why more than one call ─────────────────────────────────────────────────
 *
 * One call gave about twenty rows. That is enough to show the SHAPE of a
 * dataset and not enough to demonstrate anything on top of it: a watcher
 * looking for the client who stopped coming needs enough clients for one of
 * them to have stopped, and a board with three rows on it tells a business
 * nothing about itself.
 *
 * Asking one call for hundreds is not the answer. The reply is bounded by
 * output tokens and a CSV cut off mid-row is exactly what made three of
 * Vesoma's six datasets unreadable. So it asks several times and merges.
 */
describe('a sample big enough to show a customer', () => {
  const DS = { name: 'Members', purpose: 'who attends' };
  /* Per call, so a later pass can answer differently from the first. */
  const ok = (t) => generate.mockImplementation((args) => {
    try {
      const text = typeof t === 'function' ? t(args.systemPrompt, args.userMessage) : t;
      return Promise.resolve({ text, model: 'gemini-x' });
    } catch (err) { return Promise.reject(err); }
  });

  it('asks more than once, and merges what comes back', async () => {
    let n = 0;
    ok(() => {
      n++;
      return n === 1
        ? '_source,member_id\nsample,M1\nsample,M2'
        : `_source,member_id\nsample,M${n}0\nsample,M${n}1`;
    });
    const r = await svc.generateSampleDataset({ dataset: DS, passes: 3 });
    expect(n).toBe(3);
    expect(r.passes).toBe(3);
    // Two from the first pass and two from each of the others.
    expect(r.rowCount).toBe(6);
  });

  it('does not count the same row twice', async () => {
    // A model asked four times for more of the same thing returns some of
    // the same rows. A hundred rows of which thirty are one client twice is
    // not a hundred observations.
    ok('_source,member_id\nsample,M1\nsample,M2');
    const r = await svc.generateSampleDataset({ dataset: DS, passes: 4 });
    expect(r.rowCount).toBe(2);
  });

  it('keeps what arrived when a later pass fails', async () => {
    let n = 0;
    ok(() => {
      n++;
      if (n === 1) return '_source,member_id\nsample,M1\nsample,M2';
      throw new Error('upstream fell over');
    });
    const r = await svc.generateSampleDataset({ dataset: DS, passes: 3 });
    // A smaller sample beats none: the first pass is a usable file.
    expect(r.rowCount).toBe(2);
    expect(r.passes).toBe(1);
  });

  it('still fails when the very first pass gives nothing', async () => {
    ok('   ');
    await expect(svc.generateSampleDataset({ dataset: DS, passes: 3 })).rejects.toThrow(/nothing usable/);
  });

  it('discards a pass whose header disagrees with the file', async () => {
    /*
     * The failure that made three of Vesoma's datasets unreadable: rows that
     * do not line up with their own header. A pass that invents a different
     * column order is dropped whole rather than appended.
     */
    let n = 0;
    ok(() => (++n === 1
      ? '_source,member_id\nsample,M1'
      : '_source,something_else\nsample,X1'));
    const r = await svc.generateSampleDataset({ dataset: DS, passes: 2 });
    expect(r.rowCount).toBe(1);
    // The first pass's columns, unchanged: the stray header never landed.
    expect(r.columns).toEqual(['member_id']);
  });

  it('tells a later pass it is continuing, not starting again', async () => {
    // Without saying so it returns the same twenty rows with the same
    // identifiers, and the merge throws nearly all of them away.
    const seen = [];
    ok((sys, user) => { seen.push(user); return '_source,member_id\nsample,M' + seen.length; });
    await svc.generateSampleDataset({ dataset: DS, passes: 2 });
    expect(seen[0]).not.toMatch(/CONTINUATION/);
    expect(seen[1]).toMatch(/THIS IS A CONTINUATION/);
    expect(seen[1]).toMatch(/NOT already listed/);
  });

  it('defaults to several passes without being asked', async () => {
    expect(svc.SAMPLE_PASSES).toBeGreaterThan(1);
    expect(svc.SAMPLE_PASSES).toBeLessThanOrEqual(8);
  });

  it('refuses one reply that is an export rather than a sample', async () => {
    ok(`member_id\n${'M1\n'.repeat(9000)}`);
    await expect(svc.generateSampleDataset({ dataset: DS })).rejects.toThrow(/implausibly large/);
  });
});
