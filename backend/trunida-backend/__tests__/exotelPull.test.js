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
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { callsIn, readCall } from '../eame-template/services/phoneProviders.js';
import {
  windowsFor, stamp, hostFor, REGION_IDS, MAX_HISTORY_DAYS,
} from '../eame-template/services/exotelApi.js';

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

describe('the region, which is part of the credential', () => {
  it('knows the two Exotel runs', () => {
    expect(hostFor('sg')).toBe('api.exotel.com');
    expect(hostFor('in')).toBe('api.in.exotel.com');
    expect(REGION_IDS).toEqual(['sg', 'in']);
  });

  it('falls back rather than building an address out of nothing', () => {
    expect(hostFor('')).toBe('api.exotel.com');
    expect(hostFor('nowhere')).toBe('api.exotel.com');
  });

  it('says so when the account is not in the region asked for', () => {
    // 404 here means the wrong cluster far more often than a wrong SID, and
    // "no such account" sends somebody to re-check a SID that was right.
    const api = read('../eame-template/services/exotelApi.js');
    expect(api).toContain('an account in Mumbai is not reachable in Singapore');
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
