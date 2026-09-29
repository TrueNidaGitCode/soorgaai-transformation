/**
 * Exotel, read rather than waited for.
 *
 * ── Why a pull, when the webhook already works ─────────────────────────────
 *
 * The phone connector is a letterbox: the provider posts when a call ends.
 * Right for liveness, wrong for getting started, twice over.
 *
 * It needs work in someone else's console — find the call-end callback in
 * Exotel, paste an address, get it right — and until that happens a connected
 * source shows nothing and the only honest thing the card can say is "nothing
 * will appear until you do".
 *
 * And it has no past. A webhook configured this morning knows nothing about
 * yesterday, so the first week of a connection is a business asking what this
 * is for. Exotel keeps six months.
 *
 * So where there are credentials the calls are fetched, the way a CRM module
 * is fetched. The webhook still works and is still worth setting up, because
 * a pull happens on the schedule and a webhook happens at once. Both land
 * through the same keep(), keyed on the call id, so a call that arrives twice
 * is one row.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import axios from 'axios';
import { callsIn, readCall } from '../eame-template/services/phoneProviders.js';
import {
  windowsFor, stamp, hostFor, ping, HOSTS, MAX_HISTORY_DAYS,
} from '../eame-template/services/exotelApi.js';

// Only the two cluster probes are faked. Everything else here is the real
// parser on a real payload shape.
vi.mock('axios', () => ({ default: { get: vi.fn() } }));

/** An HTTP refusal shaped the way axios throws one. */
const refusal = (status) => Object.assign(new Error(String(status)), { response: { status } });

beforeEach(() => { axios.get.mockReset(); });

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

/**
 * One call as Exotel's Call Details API returns it, field for field.
 *
 * Kept verbatim rather than trimmed to what the parser reads, because the
 * point of the test is that nothing in a real payload trips it.
 */
const CALL = {
  Sid: 'a7c1f0e2b3d4556677889900aabbccdd',
  ParentCallSid: null,
  DateCreated: '2026-09-29 14:21:07',
  DateUpdated: '2026-09-29 14:24:31',
  AccountSid: 'vesoma1',
  To: '+919845012345',
  From: '+919900112233',
  PhoneNumberSid: '+918047188888',
  Status: 'completed',
  StartTime: '2026-09-29 14:21:11',
  EndTime: '2026-09-29 14:24:31',
  Direction: 'inbound',
  Duration: '200',
  ConversationDuration: 176,
  Price: '1.20',
  AnsweredBy: 'human',
  RecordingUrl: 'https://s3-ap-southeast-1.amazonaws.com/exotelrecordings/vesoma1/a7c1.mp3',
  PreSignedRecordingUrl: 'https://s3-ap-southeast-1.amazonaws.com/exotelrecordings/vesoma1/a7c1.mp3?X-Amz-Signature=deadbeef',
  Leg1Status: 'completed',
  Leg2Status: 'completed',
  OnCallDuration: 176,
};

describe('a call as Exotel returns it from the API', () => {
  const { call, missing } = readCall(CALL, 'exotel');

  it('is read by the same parser the webhook uses', () => {
    // Exotel spells its fields the same way in both. Two parsers for one
    // provider is how they drift, and a drifted parser lands blanks that
    // read as a quiet week.
    expect(call.callId).toBe('a7c1f0e2b3d4556677889900aabbccdd');
    expect(call.from).toBe('+919900112233');
    expect(call.to).toBe('+919845012345');
  });

  it('takes the talking time, not the ringing time', () => {
    // Duration is 200 and includes the ring. ConversationDuration is what
    // somebody was actually on the phone for, and it is the one that means
    // anything to a watcher.
    expect(call.durationSec).toBe(176);
  });

  it('reads the direction Exotel actually sends', () => {
    expect(call.direction).toBe('in');
    expect(readCall({ ...CALL, Direction: 'outbound-dial' }, 'exotel').call.direction).toBe('out');
    expect(readCall({ ...CALL, Direction: 'outbound-api' }, 'exotel').call.direction).toBe('out');
  });

  it('takes the start of the call, not the moment the API was hit', () => {
    expect(call.at.toISOString().slice(0, 10)).toBe('2026-09-29');
  });

  it('finds the recording', () => {
    expect(call.recordingUrl).toContain('exotelrecordings');
  });

  it('is complete enough to be worth landing', () => {
    // callId de-duplicates against the webhook, from matches a customer, at
    // compares to an appointment. Those three are the row.
    expect(missing).toEqual([]);
  });
});

describe('a page of them', () => {
  it('reads the Calls array straight out of the response', () => {
    const calls = callsIn([CALL, { ...CALL, Sid: 'second' }], 'exotel');
    expect(calls.map((c) => c.callId)).toEqual([CALL.Sid, 'second']);
  });

  it('drops an entry that is not a call rather than landing a blank row', () => {
    expect(callsIn([CALL, {}, null], 'exotel')).toHaveLength(1);
  });

  it('survives a missed call, which Exotel sends a thinner shape for', () => {
    const missed = {
      Sid: 'missed1', From: '+919900112233', To: '+918047188888',
      Status: 'no-answer', Direction: 'inbound', StartTime: '2026-09-29 09:02:00',
      Duration: null, ConversationDuration: null, RecordingUrl: null,
    };
    const [c] = callsIn([missed], 'exotel');
    expect(c.callId).toBe('missed1');
    expect(c.durationSec).toBe(0);
    expect(c.recordingUrl).toBe('');
    // A missed call is a fact about the business, not a broken row.
    expect(c.missing).toEqual([]);
  });
});

describe('the date window Exotel insists on', () => {
  const NOW = new Date(2026, 8, 29, 12, 0, 0);

  it('asks for one month at a time, because more is refused', () => {
    expect(windowsFor(30, NOW)).toHaveLength(1);
    expect(windowsFor(90, NOW)).toHaveLength(3);
  });

  it('will not ask for more history than Exotel keeps', () => {
    expect(windowsFor(9999, NOW).length).toBe(Math.ceil(MAX_HISTORY_DAYS / 30));
  });

  it('runs oldest first, so stopping early leaves no hole', () => {
    const w = windowsFor(90, NOW);
    expect(w[0].from.getTime()).toBeLessThan(w[2].from.getTime());
    // Contiguous: each window starts where the one before it ended.
    expect(w[0].to.getTime()).toBe(w[1].from.getTime());
    expect(w[1].to.getTime()).toBe(w[2].from.getTime());
    expect(w[2].to.getTime()).toBe(NOW.getTime());
  });

  it('sends the format Exotel parses, not an ISO string', () => {
    /*
     * Exotel compares this against DateCreated as it stored it. An ISO string
     * with a Z on the end is not read as UTC, it is read as malformed — and a
     * malformed range is silently the whole account.
     */
    expect(stamp(new Date(2026, 8, 29, 7, 5, 3))).toBe('2026-09-29 07:05:03');
    expect(stamp(new Date(2026, 8, 29, 7, 5, 3))).not.toContain('T');
    expect(stamp(new Date(2026, 8, 29, 7, 5, 3))).not.toContain('Z');
  });
});

/**
 * The question that used to be on the card, and is not any more.
 *
 * Nothing on an Exotel dashboard is labelled "region". The answer is
 * inferrable only from the address somebody signs in at, which they have no
 * reason to have noticed — and choosing wrong produced a 404 that reads as a
 * bad Account SID, sending them off to re-check something that was right.
 *
 * So it is not asked. Both are tried, the one that answers is remembered, and
 * the failure when neither answers says more than either could alone.
 */
describe('finding the account without asking which cluster it is on', () => {
  /** Only this host holds the account; every other answers 404. */
  const only = (host, { total = 7 } = {}) => {
    const tried = [];
    axios.get.mockImplementation(async (url) => {
      tried.push(new URL(url).host);
      if (!url.includes(host)) { throw refusal(404); }
      return { data: { Calls: [], Metadata: { Total: total } } };
    });
    return tried;
  };

  it('finds an account in Singapore', async () => {
    only('api.exotel.com');
    const out = await ping({ key: 'k', token: 't', sid: 'acct-sg' });
    expect(out.host).toBe('api.exotel.com');
    expect(out.total).toBe(7);
  });

  it('finds an account in Mumbai, which used to need the right dropdown', async () => {
    const tried = only('api.in.exotel.com');
    const out = await ping({ key: 'k', token: 't', sid: 'acct-in' });
    expect(out.host).toBe('api.in.exotel.com');
    // It got there by trying, not by being told.
    expect(tried).toEqual(['api.exotel.com', 'api.in.exotel.com']);
  });

  it('asks the one that answered first next time', async () => {
    const tried = only('api.in.exotel.com');
    await ping({ key: 'k', token: 't', sid: 'acct-remembered' });
    tried.length = 0;
    await ping({ key: 'k', token: 't', sid: 'acct-remembered' });
    // One request, not two: the cluster is worked out once per account.
    expect(tried).toEqual(['api.in.exotel.com']);
  });

  it('says the SID is wrong, because both were tried', async () => {
    /*
     * The reason this is better than the dropdown it replaced. A 404 from one
     * cluster means "not here". A 404 from both means the SID really is
     * wrong, and that is something the message can now state outright rather
     * than leave somebody guessing between two causes.
     */
    axios.get.mockImplementation(async () => { throw refusal(404); });
    await expect(ping({ key: 'k', token: 't', sid: 'nope' }))
      .rejects.toThrow(/tried both Singapore and Mumbai/);
  });

  it('blames the credentials only when every cluster refused them', async () => {
    axios.get.mockImplementation(async () => { throw refusal(401); });
    await expect(ping({ key: 'bad', token: 'bad', sid: 'acct' }))
      .rejects.toThrow(/refused the API key and token/);
  });

  it('does not blame the credentials when one cluster simply broke', async () => {
    // 401 from one and a 500 from the other is not a bad token, and must not
    // send somebody to regenerate one that was fine.
    let n = 0;
    axios.get.mockImplementation(async () => { n += 1; throw refusal(n === 1 ? 401 : 500); });
    await expect(ping({ key: 'k', token: 't', sid: 'acct' }))
      .rejects.not.toThrow(/refused the API key and token/);
  });

  it('asks for all three before making any request at all', async () => {
    axios.get.mockImplementation(async () => { throw refusal(500); });
    await expect(ping({ key: 'k', token: 't' })).rejects.toThrow(/Account SID/);
    expect(axios.get).not.toHaveBeenCalled();
  });

  it('knows the two Exotel runs', () => {
    expect(HOSTS).toEqual(['api.exotel.com', 'api.in.exotel.com']);
  });

  it('still honours a region on a connection saved before the field went', () => {
    expect(hostFor('sg')).toBe('api.exotel.com');
    expect(hostFor('in')).toBe('api.in.exotel.com');
    expect(hostFor('')).toBe('api.exotel.com');
  });

  it('says the SID is wrong only after trying both', async () => {
    /*
     * The reason this is better than the dropdown it replaced. A 404 from one
     * cluster means "not here". A 404 from both means the SID really is
     * wrong, and that is now something the message can state outright.
     */
    const api = read('../eame-template/services/exotelApi.js');
    expect(api).toContain('tried both Singapore and Mumbai');
  });

  it('does not blame the credentials when only one cluster refused them', () => {
    // Every host saying 401 is a credential. One saying 401 and the other
    // timing out is not, and must not send somebody to regenerate a token.
    const api = read('../eame-template/services/exotelApi.js');
    expect(api).toContain("codes.every((c) => c === 401 || c === 403)");
  });

  it('remembers which one answered, so it is worked out once', () => {
    const api = read('../eame-template/services/exotelApi.js');
    expect(api).toContain('found.set(auth.sid, host)');
    // In memory, not written back: a config the connector silently edits
    // behind the owner is worse than one extra request after a restart.
    expect(api).toContain('const found = new Map()');
  });
});

describe('what the connector does with it', () => {
  const phone = read('../eame-template/services/connectors/phone.js');

  it('only pulls for Exotel, and only with all three credentials', () => {
    // Every other provider here is webhook-only. A half-filled card must not
    // start making requests that cannot succeed.
    expect(phone).toContain("String(config.provider || '') === 'exotel'");
    expect(phone).toContain("!!String(config.accountSid || '').trim()");
  });

  it('fetches before it listens, so the first sync lands rows with words in', () => {
    const pull = phone.slice(phone.indexOf('export async function pull'));
    expect(pull.indexOf('fetchCalls')).toBeLessThan(pull.indexOf('transcribePending'));
  });

  it('never fails the sync when Exotel does', () => {
    // The webhook's calls are still here and still worth landing, and a
    // connection that goes red because Exotel was slow is one somebody
    // deletes.
    expect(phone).toContain("console.warn('[phone] could not read from Exotel:'");
  });

  it('lands through keep(), so a call fetched and posted is one row', () => {
    expect(phone).toContain("keep(callsIn(got.calls, 'exotel'))");
  });

  it('tests by actually reaching Exotel, the way a CRM does', () => {
    expect(phone).toContain('const seen = await ping({');
    expect(phone).toContain('Connected to Exotel at ${seen.host}');
  });

  it('still says the honest thing for the seven providers that cannot pull', () => {
    expect(phone).toContain('Nothing will appear until you do.');
  });
});

describe('it ships', () => {
  it('is in both lists, because a file in only one ships to nobody', () => {
    expect(read('../services/eameSpec.js')).toContain("'services/exotelApi.js',");
    expect(read('../services/eameProjectBuilder.js')).toContain("'services/exotelApi.js':");
  });
});
