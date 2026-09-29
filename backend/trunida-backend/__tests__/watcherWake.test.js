/**
 * The board must not outlive its evidence.
 *
 * ── Found on the live physiotherapy application ────────────────────────────
 *
 * Nine Zoho modules were connected and the owner then deleted the sample
 * records out of the CRM. Within seconds the Data page was correct: Leads 0,
 * Deals 0, Tasks 0, Meetings 1 — one real appointment against one real
 * patient. The front page was not. Eighteen findings, seventeen of them
 * naming leads, deals and tasks that no longer existed anywhere:
 *
 *     Promise Overdue — Kris Marrier (Sample)
 *     Deadline Approaching — 1425808000000546781
 *
 * about records deleted an hour earlier. Every watcher had already run that
 * morning, so the record said the question had been asked today and the next
 * look was seven o'clock the following morning. Two screens of the same
 * product disagreeing for a day, one of them confidently wrong.
 *
 * A finding is a claim about records. When the records change the claim is
 * not wrong — it is UNVERIFIED, which is worse, because the board goes on
 * stating it in the present tense.
 *
 * So a sync that lands different rows makes the watchers reading them due
 * again. It does not decide which findings are stale: the watcher looks
 * again, through the pipeline that counted them in code, and diffFindings
 * resolves what has genuinely gone.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { watchersToWake, WAKE_FLOOR_MS } from '../eame-template/services/agentService.js';

const NOW = Date.parse('2026-09-29T14:00:00Z');
const ago = (ms) => new Date(NOW - ms).toISOString();

const agent = (over) => ({
  _id: Math.random(), watcherId: 'promise-overdue', name: 'Promise Overdue',
  enabled: true, status: 'active', boundTo: 'Tasks (Zoho CRM)',
  lastRunAt: ago(6 * 60 * 60 * 1000), ...over,
});

const woke = (live, name = 'Tasks (Zoho CRM)') =>
  watchersToWake(live, name, NOW).map((a) => a.watcherId);

describe('which watchers the records wake', () => {
  it('wakes one reading the dataset that changed', () => {
    expect(woke([agent()])).toEqual(['promise-overdue']);
  });

  it('leaves the ones reading something else alone', () => {
    // Emptying Tasks says nothing about Meetings, and waking every watcher on
    // every sync is how a daily plan quietly becomes an hourly bill.
    expect(woke([agent({ watcherId: 'no-show', boundTo: 'Meetings (Zoho CRM)' })])).toEqual([]);
  });

  it('picks out the bound ones from a full board', () => {
    const live = [
      agent({ watcherId: 'promise-overdue', boundTo: 'Tasks (Zoho CRM)' }),
      agent({ watcherId: 'deadline-approaching', boundTo: 'Tasks (Zoho CRM)' }),
      agent({ watcherId: 'no-show', boundTo: 'Meetings (Zoho CRM)' }),
      agent({ watcherId: 'never-invoiced', boundTo: 'Deals (Zoho CRM)' }),
    ];
    expect(woke(live)).toEqual(['promise-overdue', 'deadline-approaching']);
  });
});

describe('what it will not wake', () => {
  it('leaves a watcher somebody switched off switched off', () => {
    expect(woke([agent({ enabled: false })])).toEqual([]);
    expect(woke([agent({ status: 'paused' })])).toEqual([]);
  });

  it('leaves one that stopped itself stopped', () => {
    // Degraded means three failures in a row. Data arriving is not a reason
    // to run a watcher that cannot answer.
    expect(woke([agent({ status: 'degraded' })])).toEqual([]);
  });

  it('leaves one that is already waiting to run', () => {
    // No last run is already due. Writing lastRunAt: null over lastRunAt:
    // null changes nothing and would report a wake that did not happen.
    expect(woke([agent({ lastRunAt: null })])).toEqual([]);
  });

  it('does nothing when the dataset has no name', () => {
    // A blank boundTo must never match a blank dataset name and sweep up
    // every watcher that has not got one.
    expect(watchersToWake([agent({ boundTo: '' })], '', NOW)).toEqual([]);
  });
});

describe('the floor', () => {
  it('will not wake one that ran ten minutes ago', () => {
    expect(woke([agent({ lastRunAt: ago(10 * 60 * 1000) })])).toEqual([]);
  });

  it('wakes one that ran just over an hour ago', () => {
    expect(woke([agent({ lastRunAt: ago(WAKE_FLOOR_MS + 1000) })])).toEqual(['promise-overdue']);
  });

  it('caps a source somebody is editing all afternoon at one look an hour', () => {
    /*
     * The cost bound, stated as arithmetic rather than as a comment. A daily
     * watcher is one model call a day, which is the number the plan, the
     * spend cap and the owner's inbox are all sized for. Somebody working
     * through a CRM makes a change every few minutes; without the floor that
     * is a wake every few minutes.
     */
    const runs = [];
    let lastRunAt = ago(6 * 60 * 60 * 1000);
    for (let t = NOW - 6 * 60 * 60 * 1000; t <= NOW; t += 5 * 60 * 1000) {
      if (watchersToWake([agent({ lastRunAt })], 'Tasks (Zoho CRM)', t).length) {
        runs.push(t);
        lastRunAt = new Date(t).toISOString();
      }
    }
    expect(runs.length).toBeLessThanOrEqual(6);
  });
});

/**
 * And what tells the watchers the records moved.
 *
 * A connection reads its source every hour and almost always finds exactly
 * what it found last time. Waking on every sync would put the board's cost on
 * the sync schedule rather than the watcher's, so the sync compares.
 */
describe('how a sync knows the records changed', () => {
  const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
  const svc = read('../eame-template/services/connectorService.js');
  const agents = read('../eame-template/services/agentService.js');
  const ctl = read('../eame-template/controllers/agentsController.js');
  const sync = svc.slice(svc.indexOf('export async function syncConnector'), svc.indexOf('// ── The schedule ──'));

  it('takes a fingerprint of what landed, not of what was pulled', () => {
    // So a reordering upstream that lands identically counts as no change.
    expect(svc).toContain('const fingerprint = crypto.createHash');
    expect(svc).toContain('result.rows.map((r) => r.join(');
    expect(svc).toContain('.sort().join(');
  });

  it('reports it to the caller', () => {
    expect(svc).toContain('file: entry.file, fingerprint };');
  });

  it('compares it against the last sync before waking anything', () => {
    expect(sync).toContain('landed.fingerprint !== doc.fingerprint');
    expect(sync).toContain('if (changed) await wakeWatchersFor(dataset.name)');
  });

  it('remembers it, so the next sync has something to compare against', () => {
    expect(sync).toContain("fingerprint: landed.fingerprint || ''");
  });

  it('never lets a wake fail a sync', () => {
    expect(sync).toContain('wakeWatchersFor(dataset.name).catch(() => {});');
  });
});

/**
 * A watcher can only be woken by the records it reads if it says which those
 * are. boundTo was written on a rebind and nowhere else — so a watcher
 * started when the records were ALREADY the right ones never gained one, and
 * was unreachable by the very mechanism meant to keep it honest.
 */
describe('a watcher says which records it reads', () => {
  const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
  const agents = read('../eame-template/services/agentService.js');
  const ctl = read('../eame-template/controllers/agentsController.js');

  it('is recorded when it is created, not only when it moves', () => {
    expect(agents).toMatch(/boundTo: String\(boundTo \|\| ''\)\.slice\(0, 120\)/);
  });

  it('is carried by the watchers the application starts for itself', () => {
    const auto = agents.slice(agents.indexOf('export async function autoStartWatchers'));
    expect(auto).toContain("boundTo: c.using || ''");
  });

  it('is carried by one somebody starts from the board', () => {
    expect(ctl).toContain("boundTo: match.dataset || ''");
  });

  it('is still rewritten when the catalogue moves it somewhere better', () => {
    expect(agents).toContain("boundTo: c.using || ''");
  });
});
