/**
 * The phone connector: what a call becomes once it has been read.
 *
 * ── The distinction this file exists to hold ───────────────────────────────
 *
 * The metadata is a FACT — the provider recorded who rang, when, for how
 * long. The transcript is a READING, and the two must not arrive on the same
 * row looking alike.
 *
 * `transcript_status` is what keeps them apart, and it has six values because
 * an empty transcript means six different things:
 *
 *   read     a recording was fetched and transcribed
 *   silent   it was transcribed and nothing was said
 *   pending  it has not been listened to yet
 *   failed   it could not be fetched or read
 *   none     the provider sent no recording for this call
 *   off      the owner turned reading off
 *
 * Collapse those into "the transcript is empty" and a watcher looking for
 * calls with nothing recorded reports the ones this application simply has
 * not got to yet — a finding about the business that is really a fact about
 * a queue.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

/*
 * The connector reaches a database and the gateway. Neither is what is being
 * tested here: the mapping is, so both are stood in for and the real module
 * runs its real code.
 */
const docs = [];
vi.mock('mongoose', () => ({
  default: {
    connection: {
      collection: () => ({
        find: () => ({ sort: () => ({ limit: () => ({ toArray: async () => docs }) }) }),
        countDocuments: async () => docs.length,
        updateOne: async () => ({}),
        bulkWrite: async () => ({ upsertedCount: 0 }),
      }),
    },
  },
}));
vi.mock('axios', () => ({ default: { get: vi.fn() } }));
vi.mock('../eame-template/services/transcribeService.js', () => ({
  transcribe: vi.fn(async () => ({ ok: true, text: '', empty: true, reason: '' })),
  canTranscribe: () => true,
}));

const phone = await import('../eame-template/services/connectors/phone.js');

const call = (o) => ({
  callId: 'c1', from: '9800000001', to: '08040001234', direction: 'in',
  at: new Date('2026-09-12T10:04:00Z'), durationSec: 192, agent: '9811111111',
  status: 'completed', recordingUrl: 'https://rec/1.mp3',
  transcript: '', transcriptStatus: 'pending', ...o,
});

beforeEach(() => { docs.length = 0; });

describe('a call becomes a row', () => {
  it('carries what the provider said, unchanged', async () => {
    docs.push(call({ transcript: 'Caller: I wanted to upgrade.', transcriptStatus: 'read' }));
    const [row] = await phone.pull({ provider: 'exotel', transcribe: 'no' });
    expect(row.phone).toBe('9800000001');
    expect(row.direction).toBe('in');
    expect(row.duration_seconds).toBe('192');
    expect(row.agent).toBe('9811111111');
    expect(row.call_id).toBe('c1');
    expect(row.received_at).toBe('2026-09-12T10:04:00.000Z');
  });

  it('flattens a transcript so it survives being one cell', async () => {
    /*
     * A transcript has a line per turn and a dataset row has none. Newlines
     * would break a CSV landing, so the turns are joined with a separator
     * that keeps them readable as turns.
     */
    docs.push(call({ transcript: 'Caller: hello\nStaff: I will check\nCaller: thanks', transcriptStatus: 'read' }));
    const [row] = await phone.pull({ provider: 'other' });
    expect(row.transcript).toBe('Caller: hello | Staff: I will check | Caller: thanks');
    expect(row.transcript).not.toMatch(/\n/);
  });

  it('leaves a call it could not date with empty date and time, not today', async () => {
    docs.push(call({ at: null }));
    const [row] = await phone.pull({ provider: 'other' });
    expect(row.date).toBe('');
    expect(row.time).toBe('');
    expect(row.received_at).toBe('');
  });
});

describe('the six things an empty transcript can mean', () => {
  const statusOf = async (c, config = { provider: 'other' }) => {
    docs.length = 0;
    docs.push(call(c));
    const [row] = await phone.pull(config);
    return row.transcript_status;
  };

  it('says "off" when the owner turned reading off', async () => {
    expect(await statusOf({}, { provider: 'other', transcribe: 'no' })).toBe('off');
  });

  it('says "none" when the provider sent no recording', async () => {
    // A missed call has metadata and no audio. That is not a failure.
    expect(await statusOf({ recordingUrl: '' })).toBe('none');
  });

  it('says "pending" for one not yet listened to', async () => {
    expect(await statusOf({ transcriptStatus: 'pending' })).toBe('pending');
  });

  it('says "silent" when it was read and nothing was said', async () => {
    // Hold music, a wrong number, a call that never connected.
    expect(await statusOf({ transcriptStatus: 'silent' })).toBe('silent');
  });

  it('says "failed" when it could not be read, and keeps the row', async () => {
    /*
     * The row still lands. Who rang and when is most of what the watchers
     * need, and half the evidence beats a call nobody knows happened.
     */
    docs.push(call({ transcriptStatus: 'failed', transcriptError: 'Svarg took too long.' }));
    const [row] = await phone.pull({ provider: 'other' });
    expect(row.transcript_status).toBe('failed');
    expect(row.phone).toBe('9800000001');
  });

  it('says "read" only when there is a transcript behind it', async () => {
    expect(await statusOf({ transcriptStatus: 'read', transcript: 'Caller: hello' })).toBe('read');
  });
});

describe('what the owner is asked for', () => {
  it('names the services, and one for a service nobody listed', () => {
    const provider = phone.fields.find((f) => f.name === 'provider');
    expect(provider.options).toContain('exotel');
    expect(provider.options).toContain('twilio');
    expect(provider.options).toContain('other');
  });

  it('marks the only credential as secret', () => {
    // The frame every connector is held to: a credential the owner typed is
    // always marked, so it is never logged or returned.
    expect(phone.fields.find((f) => f.name === 'authToken').secret).toBe(true);
  });

  it('asks for credentials as optional, because many recordings are signed links', () => {
    for (const name of ['authUser', 'authToken']) {
      expect(phone.fields.find((f) => f.name === name).required, name).toBe(false);
    }
  });

  it('says the recording announcement is the owner’s to switch on', () => {
    /*
     * Recording a patient's call is processing personal data, and the "this
     * call is being recorded" announcement is how the caller consents. This
     * application cannot set it — it lives in the provider account — so the
     * help text has to say so rather than leaving somebody to find out after
     * they have recorded a month of calls.
     */
    expect(phone.help).toMatch(/recorded/i);
    expect(phone.help).toMatch(/cannot be set from here|consents/i);
  });

  it('declares the frame a connector is held to', () => {
    expect(phone.kind).toBe('phone');
    expect(typeof phone.test).toBe('function');
    expect(typeof phone.pull).toBe('function');
    expect(phone.provides.length).toBeGreaterThan(3);
    // The row a watcher reads has to carry both halves: the fact and how far
    // to trust the reading beside it.
    expect(phone.provides).toContain('transcript');
    expect(phone.provides).toContain('transcript_status');
  });
});

describe('connecting it', () => {
  it('refuses a service that is not one of the listed ones', async () => {
    await expect(phone.test({ provider: 'not-a-service' })).rejects.toThrow(/Choose one of/);
  });

  it('says plainly that nothing arrives until the address is pasted in', async () => {
    /*
     * For a webhook-only provider this connector is the reverse of every
     * other one: the provider calls us, and no credential here proves that
     * will happen. A test returning a confident "connected" would be checking
     * nothing and saying something.
     */
    const out = await phone.test({ provider: 'twilio', transcribe: 'no' });
    expect(out.ok).toBe(true);
    expect(out.message).toMatch(/Nothing will appear until you do|calls? received so far/);
  });

  it('offers Exotel the way out, because Exotel can be read instead', async () => {
    /*
     * Exotel is the one provider here that has an API worth pulling, so the
     * honest answer for it is not "nothing will appear until you paste an
     * address" — it is that there are two ways, and one of them needs nothing
     * doing in Exotel at all. See __tests__/exotelPull.test.js.
     */
    const out = await phone.test({ provider: 'exotel', transcribe: 'no' });
    expect(out.ok).toBe(true);
    expect(out.message).toMatch(/API key, token and Account SID/);
  });
});
