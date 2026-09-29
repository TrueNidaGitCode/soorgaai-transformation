/**
 * A watcher follows the data.
 *
 * ── Found on a live application, a week after it was delivered ─────────────
 *
 * Fourteen watchers were started from the catalogue on the sample data the
 * application ships with. A Zoho CRM was then connected — nine modules, real
 * records, a real appointment marked No Show against a real patient. Every
 * watcher went on asking the question it was given on day one:
 *
 *     practitioner_name in Appointment Booking Diary booked but marked absent
 *
 * The sample diary. Week after week, while the answer sat in Meetings (Zoho
 * CRM) under Appointment_Status. The watcher ran, found nothing, and reported
 * nothing — which is indistinguishable from a business with no problems.
 *
 * A catalogue watcher's question is a BINDING: a dataset and its columns,
 * chosen from whatever happened to be connected that morning. Freezing it at
 * creation makes connecting a source a thing that changes nothing, and the
 * only repair was to delete each watcher and start it again by hand.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { watchersToRebind } from '../eame-template/services/agentService.js';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

const SAMPLE = 'practitioner_name in Appointment Booking Diary booked but marked absent';
const REAL = 'Who_Id in Meetings (Zoho CRM) booked but marked absent';

const catalogue = [
  { id: 'no-show', ready: true, question: REAL, using: 'Meetings (Zoho CRM)' },
  { id: 'stopped-coming', ready: true, question: 'Full_Name in Leads (Zoho CRM) with no Last_Activity_Time in the last 14 days', using: 'Leads (Zoho CRM)' },
  { id: 'expiring-soon', ready: false, question: '', using: '' },
];

describe('which watchers move', () => {
  it('moves one whose dataset has been bettered', () => {
    const live = [{ _id: 1, watcherId: 'no-show', question: SAMPLE }];
    expect(watchersToRebind(live, catalogue).map((a) => a.watcherId)).toEqual(['no-show']);
  });

  it('leaves one that is already asking the right question', () => {
    const live = [{ _id: 1, watcherId: 'no-show', question: REAL }];
    expect(watchersToRebind(live, catalogue)).toEqual([]);
  });

  it('never touches a question somebody typed themselves', () => {
    // No watcherId: this is the customer's own sentence, and the catalogue
    // has no opinion about it.
    const live = [{ _id: 1, watcherId: '', question: 'who has not paid me' }];
    expect(watchersToRebind(live, catalogue)).toEqual([]);
  });

  it('leaves a watcher the catalogue can no longer bind at all', () => {
    // Better an old question than none: a watcher blanked because its source
    // went away is worse than one still asking about last month's data.
    const live = [{ _id: 1, watcherId: 'expiring-soon', question: 'certificates expiring this month' }];
    expect(watchersToRebind(live, catalogue)).toEqual([]);
  });

  it('leaves one the catalogue has never heard of', () => {
    const live = [{ _id: 1, watcherId: 'invented-by-hand', question: 'anything' }];
    expect(watchersToRebind(live, catalogue)).toEqual([]);
  });

  it('says nothing moves when nothing is connected', () => {
    const live = [{ _id: 1, watcherId: 'no-show', question: SAMPLE }];
    expect(watchersToRebind(live, [])).toEqual([]);
  });
});

describe('what moving one costs', () => {
  const svc = read('../eame-template/services/agentService.js');
  const rebind = svc.slice(svc.indexOf('export async function rebindWatchers'), svc.indexOf('/** What this application has already been offered'));

  it('drops the pinned plan, which named the old dataset', () => {
    expect(rebind).toContain("$unset: { plan: '' }");
  });

  it('clears the findings rather than reporting them all resolved', () => {
    /*
     * diffFindings compares today's keys against what is stored, and the
     * digest reports `resolved`. Repoint a watcher with eleven open findings
     * and the next run reports eleven things fixed overnight — on a morning
     * when nothing happened. Cleared, so the count starts from what is true.
     */
    expect(rebind).toContain('findingsCollection().deleteMany({ agentId: a._id })');
  });

  it('is due again, because the last run answered a different question', () => {
    // dueAgents treats no last run as due, so the next tick picks it up --
    // inside five minutes, and no earlier than the hour the owner chose. A
    // watcher moved at nine would otherwise next look at seven tomorrow.
    expect(rebind).toContain('lastRunAt: null');
  });

  it('creates nothing, deletes nothing, and switches nothing on', () => {
    expect(rebind).not.toContain('createAgent');
    expect(rebind).not.toContain('deleteAgent');
    expect(rebind).not.toMatch(/enabled:\s*true/);
  });
});

describe('when it happens', () => {
  const svc = read('../eame-template/services/agentService.js');
  const srv = read('../eame-template/server.js');

  it('runs on every scheduler tick, so connecting a source needs no restart', () => {
    expect(svc).toContain('await rebindWatchers(await catalogue())');
    expect(srv).toContain('catalogue: async () => catalogueFor(await indexWithOwnCounts(), agentPlan())');
  });

  it('runs at boot too, rather than waiting five minutes', () => {
    expect(srv).toContain('.then((index) => rebindWatchers(catalogueFor(index, agentPlan())))');
  });

  it('is read fresh each time rather than captured once', () => {
    // A catalogue captured at boot would bind to the datasets that existed
    // at boot, which is the bug wearing a different hat.
    expect(svc).toContain('typeof catalogue === \'function\'');
  });
});
