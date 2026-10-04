/**
 * The two watchers the Wellness Co. one-pager listed as "coming next".
 *
 *   Opportunity Gone Quiet   open opportunities nobody has touched in 21 days
 *   Asked About Upgrading    calls where the customer asked for more
 *
 * Both start themselves on any application whose data supports them, so most
 * of what is pinned here is WHERE they bind and where they must not: a
 * watcher that binds to the wrong records reports noise every morning, which
 * is what Leave Clash did to a clinic.
 */
import { describe, it, expect } from 'vitest';
import {
  entryFor, matchPair, matchDataset, fillQuestion, catalogueFor, severityFor,
} from '../eame-template/services/agentCatalogue.js';
import { matchesAll, windowRange, inWindow, joinOnEntity } from '../eame-template/services/reasoning.js';
import { describeShape as callShape } from '../eame-template/services/connectors/phone.js';

const LEADS = { name: 'Leads (LeadSquared)', columns: ['id', 'name', 'phone', 'email', 'mobile', 'stage', 'owner', 'source', 'created', 'modified'], internal: [] };
const ACTIVITIES = { name: 'Activities (LeadSquared)', columns: ['id', 'name', 'phone', 'email', 'activity', 'activity_date', 'note', 'event_code', 'modified', 'lead_id', 'opportunity_id'],
  internal: ['event_code', 'modified', 'lead_id', 'opportunity_id'] };
const OPPS = { name: 'Treatment Plan opportunities (LeadSquared)', columns: ['id', 'name', 'phone', 'email', 'status', 'created', 'modified', 'lead_id', 'Opportunity_Name', 'Stage', 'Expected_Value'],
  internal: ['lead_id', 'modified'] };

// Zoho, in the module shapes a clinic's CRM hands over.
const DEALS = { name: 'Deals (Zoho CRM)', columns: ['id', 'Deal_Name', 'Contact_Name', 'Stage', 'Amount', 'Closing_Date', 'Owner', 'Created_Time'] };
const MEETINGS = { name: 'Meetings (Zoho CRM)', columns: ['id', 'Event_Title', 'Participants', 'Start_DateTime', 'Owner', 'Created_Time'] };
const CONTACTS = { name: 'Contacts (Zoho CRM)', columns: ['id', 'Full_Name', 'Phone', 'Email', 'Lead_Source', 'Created_Time'] };
const TASKS = { name: 'Tasks (Zoho CRM)', columns: ['id', 'Subject', 'Who_Id', 'Status', 'Due_Date', 'Owner', 'Created_Time'] };

describe('Opportunity Gone Quiet', () => {
  const entry = entryFor('opportunity-gone-quiet');

  it('reads the opportunities against the activity record on LeadSquared', () => {
    const m = matchPair(entry, [LEADS, ACTIVITIES, OPPS]);
    expect(m.left.dataset).toBe(OPPS.name);
    expect(m.right.dataset).toBe(ACTIVITIES.name);
    expect(fillQuestion(entry, m)).toBe('name in Treatment Plan opportunities (LeadSquared) whose status matches'
      + ' none of won|lost|closed, who have no row in Activities (LeadSquared) in the last 21 days');
  });

  it('reads Zoho Deals the same way', () => {
    const m = matchPair(entry, [CONTACTS, DEALS, MEETINGS]);
    expect(m.left.dataset).toBe(DEALS.name);
    expect(m.left.using.status).toBe('Stage');
  });

  it('stays off a CRM with no opportunities in it, however many status columns it has', () => {
    // Vesoma's shape: contacts, a diary, a task list. Tasks has a status and
    // a person; without the name rule this would report open tasks as
    // customers drifting away.
    expect(matchPair(entry, [CONTACTS, MEETINGS, TASKS])).toBeNull();
    // A lead list is not an opportunity list, even beside the activities.
    expect(matchPair(entry, [LEADS, ACTIVITIES])).toBeNull();
  });

  it('is offered as ready on a LeadSquared account, and is high severity', () => {
    const row = catalogueFor([LEADS, ACTIVITIES, OPPS]).find((r) => r.id === 'opportunity-gone-quiet');
    expect(row.ready).toBe(true);
    expect(severityFor('opportunity-gone-quiet')).toBe('high');
  });

  describe('the plan it asks for, run on rows', () => {
    /*
     * What the question tells the planner to do, executed by the same code a
     * watcher's plan runs on: open opportunities, activity in the last 21
     * days, and the people in the first and not the second.
     */
    const now = new Date('2026-10-04T09:00:00Z');
    const oppCols = ['name', 'status'];
    const opps = [
      ['Rahul Menon', 'Open'],
      ['Meera Iyer', 'Open'],
      ['Arjun Rao', 'Won'],
      ['Divya Nair', 'Closed - Lost'],
      ['Kiran Shah', 'Closed Won'],
      ['Sana Khan', ''],
    ];
    const acts = [
      ['Meera Iyer', '2026-09-28 10:00:00'], // touched last week
      ['Rahul Menon', '2026-08-20 10:00:00'], // six weeks ago
      ['Arjun Rao', '2026-08-01 10:00:00'],
    ];

    const open = opps.filter((r) => matchesAll(r, oppCols, [['status', 'matches none of', 'won|lost|closed']]));
    const range = windowRange('last 21 days', now);
    const recent = acts.filter((r) => inWindow(r[1], range, now));
    const as = (rows) => rows.map((r) => ({ name: r[0], records: [{ cells: r }] }));
    const quiet = joinOnEntity(as(open), as(recent), 'leftOnly', null, now).map((x) => x.name);

    it('keeps every spelling of closed out', () => {
      expect(open.map((r) => r[0])).toEqual(['Rahul Menon', 'Meera Iyer', 'Sana Khan']);
    });

    it('reports the open ones nobody has touched, and not the one touched last week', () => {
      expect(quiet).toEqual(['Rahul Menon', 'Sana Khan']);
    });
  });
});

describe('Asked About Upgrading', () => {
  const entry = entryFor('asked-to-upgrade');
  const calls = callShape({ provider: 'exotel' });

  it('binds to the calls a phone system brings, by the intent the call was read into', () => {
    const m = matchDataset(entry, calls);
    expect(m.using.intent).toBe('intent');
    expect(fillQuestion(entry, m)).toBe('name in Calls (Exotel) whose intent is upgrade, in the last 14 days');
  });

  it('is not offered on records nobody has read a call into', () => {
    for (const d of [LEADS, ACTIVITIES, OPPS, DEALS, CONTACTS]) expect(matchDataset(entry, d), d.name).toBeNull();
  });

  it('does not mistake an "Interested in" column for a wish to upgrade', () => {
    const leads = { name: 'Leads (Zoho CRM)', columns: ['id', 'Full_Name', 'Interested_In', 'Created_Time'] };
    expect(matchDataset(entry, leads)).toBeNull();
  });
});

describe('reached from what the business said', () => {
  it('starts first for a business that describes opportunities drifting', async () => {
    const { watcherPlan } = await import('../services/watcherPlanService.js');
    // Close to the words of the Wellness Co. interview, not a keyword list.
    const plan = watcherPlan({ businessObjective: 'A lead converts into an opportunity in LeadSquared, '
      + 'and keeping that customer engaged over the next three months is hard. They drift away.' });
    expect(plan.order[0]).toBe('opportunity-gone-quiet');
    expect(plan.startHere).toContain('opportunity-gone-quiet');
  });

  it('starts for a business that wants to catch upgrade requests', async () => {
    const { watcherPlan } = await import('../services/watcherPlanService.js');
    const plan = watcherPlan({ businessObjective: 'Clients ring asking to upgrade their package and we lose the upsell.' });
    expect(plan.startHere).toContain('asked-to-upgrade');
  });
});

describe('on a clinic’s real Zoho CRM', () => {
  /*
   * The shapes of Vesoma's live modules, where the first version of this
   * watcher was checked before it shipped and was wrong twice: it named the
   * deal ("Knee rehab package") instead of the person, and it compared against
   * Contacts, whose only date is when the contact was created — so every open
   * deal older than three weeks would have read as quiet.
   */
  const entry = entryFor('opportunity-gone-quiet');
  const LIVE = [
    { name: 'Contacts (Zoho CRM)', columns: ['id', 'First_Name', 'Last_Name', 'Full_Name', 'Phone', 'Email', 'Last_Activity_Time', 'Created_Time'] },
    { name: 'Deals (Zoho CRM)', columns: ['id', 'Deal_Name', 'Contact_Name', 'Stage', 'Amount', 'Closing_Date', 'Owner', 'Last_Activity_Time', 'Created_Time'] },
    { name: 'Tasks (Zoho CRM)', columns: ['id', 'Subject', 'Who_Id', 'Status', 'Due_Date', 'Owner', 'Created_Time'] },
    { name: 'Meetings (Zoho CRM)', columns: ['id', 'Event_Title', 'Participants', 'Start_DateTime', 'Owner', 'Created_Time'] },
    { name: 'Calls (Exotel)', columns: callShape({ provider: 'exotel' }).columns, internal: callShape({ provider: 'exotel' }).internal },
  ];

  it('names the person on the deal, not the deal', () => {
    expect(matchPair(entry, LIVE).left.using.who).toBe('Contact_Name');
  });

  it('measures quiet against a record of contact, never the contact list', () => {
    const right = matchPair(entry, LIVE).right.dataset;
    expect(right).not.toBe('Contacts (Zoho CRM)');
    expect(right).not.toBe('Tasks (Zoho CRM)');
    expect(['Meetings (Zoho CRM)', 'Calls (Exotel)']).toContain(right);
  });
});
