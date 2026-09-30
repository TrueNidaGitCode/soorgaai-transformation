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
import { watchersToRebind, watchersToReword } from '../eame-template/services/agentService.js';

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

  it('catches one that moved earlier and has still not looked', () => {
    // Stated over the record rather than over this run, so a rebind that
    // happened before the clearing existed -- or one whose run then failed --
    // is still picked up. It settles by itself: a run puts lastRunAt past
    // reboundAt.
    expect(rebind).toContain('new Date(a.reboundAt).getTime() > new Date(a.lastRunAt).getTime()');
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

/**
 * A connector growing a column is not a watcher moving.
 *
 * ── Measured on a live application, twice in seventy-two seconds ───────────
 *
 * A clinic's phone call was fetched, transcribed, read for a promise, and a
 * Promise Not Kept finding written at 07:48:59. At 07:50:05 the watcher was
 * "rebound" and that finding deleted. The owner watched it appear and vanish
 * twice and said: make a reliable fix.
 *
 * It had not moved. Before and after it was watching
 * "Calls (Exotel) + Contacts (Zoho CRM)". What changed was the SENTENCE: the
 * phone connector grew called_from and called_to on its 07:28 sync, then
 * declared them internal when new code booted at 07:49, so businessColumns
 * offered a different column for a role and the question came out worded
 * differently about exactly the same rows.
 *
 * Both events are routine. A connector grows its shape whenever a provider
 * sends a field it has not seen, which is the whole reason shape growth
 * exists. Deleting a customer's findings each time one does is not a rebind,
 * it is data loss on a schedule.
 */
describe('the same data, described differently', () => {
  const BOUND = 'Calls (Exotel) + Contacts (Zoho CRM)';
  /* The two wordings, as the live records actually held them. */
  const BEFORE = 'name in Calls (Exotel) whose promise says yes, who have no row in'
    + ' Contacts (Zoho CRM) whose Last_Activity_Time is AFTER that call';
  const AFTER = 'name in Calls (Exotel) whose promise says yes, who have no row in'
    + ' Contacts (Zoho CRM) whose Modified_Time is AFTER that call';

  const cat = [{ id: 'promise-not-kept', ready: true, question: AFTER, using: BOUND }];
  const live = [{ _id: 1, watcherId: 'promise-not-kept', question: BEFORE, boundTo: BOUND }];

  it('is not a move, so nothing is cleared', () => {
    expect(watchersToRebind(live, cat)).toEqual([]);
  });

  it('is a rewording, so the record is brought up to date', () => {
    expect(watchersToReword(live, cat).map((a) => a.watcherId)).toEqual(['promise-not-kept']);
  });

  it('is never both at once', () => {
    const moved = watchersToRebind(live, cat).map((a) => a.watcherId);
    const said = watchersToReword(live, cat).map((a) => a.watcherId);
    expect(moved.filter((id) => said.includes(id))).toEqual([]);
  });

  it('and a watcher asking the right question already is left entirely alone', () => {
    const same = [{ _id: 1, watcherId: 'promise-not-kept', question: AFTER, boundTo: BOUND }];
    expect(watchersToRebind(same, cat)).toEqual([]);
    expect(watchersToReword(same, cat)).toEqual([]);
  });
});

describe('a watcher that really has moved', () => {
  const cat = [{ id: 'no-show', ready: true, question: REAL, using: 'Meetings (Zoho CRM)' }];

  it('moves when the dataset under it is different', () => {
    const live = [{ _id: 1, watcherId: 'no-show', question: SAMPLE, boundTo: 'Appointment Booking Diary' }];
    expect(watchersToRebind(live, cat).map((a) => a.watcherId)).toEqual(['no-show']);
    expect(watchersToReword(live, cat)).toEqual([]);
  });

  it('moves on the binding even when somebody reworded it to match', () => {
    /*
     * The wording cannot be trusted as the binding in either direction. A
     * question that happens to read the same about two different datasets is
     * still a watcher pointed somewhere new.
     */
    const live = [{ _id: 1, watcherId: 'no-show', question: REAL, boundTo: 'Appointment Booking Diary' }];
    expect(watchersToRebind(live, cat).map((a) => a.watcherId)).toEqual(['no-show']);
  });
});

describe('a record from before bindings were stored', () => {
  /*
   * boundTo did not always exist. With no binding on the record the wording is
   * the only evidence there is, so it is used — and such a record must land in
   * exactly one of the two lists, never both.
   */
  const cat = [{ id: 'no-show', ready: true, question: REAL, using: 'Meetings (Zoho CRM)' }];

  it('falls back to the wording', () => {
    const live = [{ _id: 1, watcherId: 'no-show', question: SAMPLE }];
    expect(watchersToRebind(live, cat).map((a) => a.watcherId)).toEqual(['no-show']);
    expect(watchersToReword(live, cat)).toEqual([]);
  });

  it('is left alone when the wording already matches', () => {
    const live = [{ _id: 1, watcherId: 'no-show', question: REAL }];
    expect(watchersToRebind(live, cat)).toEqual([]);
    expect(watchersToReword(live, cat)).toEqual([]);
  });
});

/**
 * And the comparison must survive the limits the store imposes.
 *
 * createAgent trims a question and cuts it at 600 characters; a rebind used to
 * write the raw string. A question longer than the limit therefore differed
 * from itself on every tick — a rebind every five minutes, for ever, each one
 * deleting the watcher's findings. Nothing in the catalogue is that long
 * today, which is exactly why this needs a test rather than a reader noticing.
 */
describe('a question longer than the store keeps', () => {
  const LONG = 'rows in Ledger (Tally) where ' + 'the amount does not reconcile and '.repeat(30);
  const cat = [{ id: 'never-invoiced', ready: true, question: LONG, using: 'Ledger (Tally)' }];

  it('does not differ from itself once stored', () => {
    expect(LONG.length).toBeGreaterThan(600);
    const live = [{ _id: 1, watcherId: 'never-invoiced', question: LONG.trim().slice(0, 600), boundTo: 'Ledger (Tally)' }];
    expect(watchersToRebind(live, cat)).toEqual([]);
    expect(watchersToReword(live, cat)).toEqual([]);
  });

  it('and neither does a binding at the edge of its own limit', () => {
    const wide = 'A'.repeat(130);
    const c = [{ id: 'never-invoiced', ready: true, question: 'rows in x', using: wide }];
    const live = [{ _id: 1, watcherId: 'never-invoiced', question: 'rows in x', boundTo: wide.slice(0, 120) }];
    expect(watchersToRebind(live, c)).toEqual([]);
  });

  it('is written to the record the way the record keeps it', () => {
    const svc = read('../eame-template/services/agentService.js');
    const rebind = svc.slice(svc.indexOf('export async function rebindWatchers'), svc.indexOf('/** What this application has already been offered'));
    expect(rebind).toContain('question: asStored.question(c.question)');
    expect(rebind).toContain('boundTo: asStored.binding(c.using)');
  });
});

describe('what a rewording costs', () => {
  const svc = read('../eame-template/services/agentService.js');
  const rebind = svc.slice(svc.indexOf('export async function rebindWatchers'), svc.indexOf('/** What this application has already been offered'));
  const reword = rebind.slice(rebind.indexOf('const reworded = []'), rebind.indexOf('And any watcher that moved but has not looked since'));

  it('keeps the findings, because they are about the same rows', () => {
    expect(reword).not.toContain('deleteMany');
  });

  it('keeps the schedule, because the watcher has not missed a look', () => {
    expect(reword).not.toContain('lastRunAt');
    expect(reword).not.toContain('reboundAt');
  });

  it('drops the pinned plan, which was compiled against the old sentence', () => {
    expect(reword).toContain("$unset: { plan: '' }");
  });

  it('is logged as something other than following the data', () => {
    // A log calling both "followed the data" is how repeated deletion of a
    // customer's findings went unnoticed for an hour.
    expect(rebind).toContain('same data, new wording');
  });
});
