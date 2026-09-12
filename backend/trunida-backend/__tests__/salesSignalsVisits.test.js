/**
 * The visits half of the sales board: who is counted, and who is merged.
 *
 * The question these pin down is "is a person double counted". A person is
 * a browser here (visitorId), and the rules are:
 *
 *   - many rows from one browser  -> one visitor, N sessions
 *   - two browsers, one address   -> two visitors, each noting the other,
 *                                    one address in the totals
 *   - no address                  -> never treated as the same as another blank
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const data = { visits: [] };

// Every model the service reads, answering empty except the visits. A chain
// of .select/.sort/.limit/.lean ends in the array either way.
function chain(result) {
  const q = {
    select: () => q, sort: () => q, limit: () => q,
    lean: async () => result, then: (r) => Promise.resolve(result).then(r),
  };
  return q;
}
const empty = () => ({ find: () => chain([]) });

vi.mock('../models/user.js', () => ({ User: empty() }));
vi.mock('../models/TransformationBlueprint.js', () => ({ default: empty() }));
vi.mock('../models/GeneratedApplication.js', () => ({ default: empty() }));
vi.mock('../models/HostedDeployment.js', () => ({ default: empty() }));
vi.mock('../models/UsageLedger.js', () => ({ default: empty() }));
vi.mock('../models/AccountPlan.js', () => ({ default: empty() }));
vi.mock('../models/ColdLead.js', () => ({ default: empty() }));
vi.mock('../models/UserProfile.js', () => ({ default: empty() }));
vi.mock('../models/SiteVisit.js', () => ({ default: { find: () => chain(data.visits) } }));
vi.mock('./llmService.js', () => ({ generate: vi.fn() }));
vi.mock('../services/llmService.js', () => ({ generate: vi.fn() }));
vi.mock('dotenv', () => ({ default: { config: () => {} } }));

const { collectSignals } = await import('../services/salesSignalsService.js');

const at = (minsAgo) => new Date(Date.now() - minsAgo * 60 * 1000);
const visit = (o) => ({ ip: '', visitorId: '', ref: '', referer: '', country: '', guestId: '', createdAt: at(1), ...o });

beforeEach(() => { data.visits = []; });

describe('visits on the sales board', () => {
  it('one browser coming back is one person with several sessions', async () => {
    data.visits = [
      visit({ visitorId: 'v1', ip: '203.0.113.0', createdAt: at(1) }),
      visit({ visitorId: 'v1', ip: '203.0.113.0', createdAt: at(300) }),
      visit({ visitorId: 'v1', ip: '203.0.113.0', createdAt: at(3000) }),
    ];
    const s = await collectSignals();
    expect(s.visits).toHaveLength(1);
    expect(s.visits[0].visits).toBe(3);
    expect(s.visits[0].sameAddress).toBe(0);
    expect(s.visitTotals).toMatchObject({ people: 1, addresses: 1, sessions: 3 });
  });

  it('two browsers from one address stay two people, and each says so', async () => {
    data.visits = [
      visit({ visitorId: 'phone',  ip: '203.0.113.0' }),
      visit({ visitorId: 'laptop', ip: '203.0.113.0', createdAt: at(30) }),
      visit({ visitorId: 'else',   ip: '198.51.100.0' }),
    ];
    const s = await collectSignals();
    expect(s.visits).toHaveLength(3);
    const byKey = Object.fromEntries(s.visits.map(v => [v.key, v]));
    expect(byKey.phone.sameAddress).toBe(1);
    expect(byKey.laptop.sameAddress).toBe(1);
    expect(byKey.else.sameAddress).toBe(0);
    expect(s.visitTotals).toMatchObject({ people: 3, addresses: 2, sessions: 3 });
  });

  it('a browser seen from two addresses links both', async () => {
    data.visits = [
      visit({ visitorId: 'roamer', ip: '203.0.113.0' }),
      visit({ visitorId: 'roamer', ip: '198.51.100.0', createdAt: at(200) }),
      visit({ visitorId: 'office', ip: '203.0.113.0' }),
      visit({ visitorId: 'home',   ip: '198.51.100.0' }),
    ];
    const s = await collectSignals();
    const byKey = Object.fromEntries(s.visits.map(v => [v.key, v]));
    expect(byKey.roamer.sameAddress).toBe(2);
    expect(byKey.office.sameAddress).toBe(1);
    expect(byKey.home.sameAddress).toBe(1);
    expect(s.visitTotals).toMatchObject({ people: 3, addresses: 2 });
  });

  it('rows without an address are never the same as each other', async () => {
    data.visits = [
      visit({ visitorId: 'a' }),
      visit({ visitorId: 'b' }),
      visit({ visitorId: 'c', ip: '203.0.113.0' }),
    ];
    const s = await collectSignals();
    const byKey = Object.fromEntries(s.visits.map(v => [v.key, v]));
    expect(byKey.a.sameAddress).toBe(0);
    expect(byKey.b.sameAddress).toBe(0);
    expect(byKey.a.ipLabel).toBe('not recorded');
    expect(s.visitTotals).toMatchObject({ people: 3, addresses: 3 });
  });

  it('a visitor with no id is keyed by address, so a private window is one row per address', async () => {
    data.visits = [
      visit({ ip: '203.0.113.0' }),
      visit({ ip: '203.0.113.0', createdAt: at(50) }),
    ];
    const s = await collectSignals();
    expect(s.visits).toHaveLength(1);
    expect(s.visits[0].visits).toBe(2);
    expect(s.visitTotals).toMatchObject({ people: 1, addresses: 1, sessions: 2 });
  });
});
