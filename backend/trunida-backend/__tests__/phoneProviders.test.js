/**
 * Cloud telephony, read as one shape.
 *
 * ── What this is defending ─────────────────────────────────────────────────
 *
 * We do not know what a customer runs. There are dozens of these services in
 * India and a clinic's is whatever their telecom reseller sold them, so the
 * connector reads a list of field names per fact rather than one, and an
 * unlisted provider falls back to the union of all of them.
 *
 * The failure that matters is not an exception. It is a row landing with an
 * empty caller and a blank time, which looks like a quiet week rather than a
 * parser that could not read the payload. So most of what is checked here is
 * that a fact which could not be found is REPORTED as not found.
 *
 * The payloads below are shaped like the real ones. Where a provider's exact
 * spelling is uncertain the alias list is doing the work, which is the whole
 * point of having one.
 */
import { describe, it, expect } from 'vitest';
import {
  callsIn, readCall, normaliseDirection, normaliseSeconds, normaliseAt,
  PROVIDERS, PROVIDER_IDS, CALL_FIELDS,
} from '../eame-template/services/phoneProviders.js';

describe('one call, whoever sent it', () => {
  it('reads Twilio', () => {
    const { call, missing } = readCall({
      CallSid: 'CA123', From: '+919800000001', To: '+918040001234',
      Direction: 'inbound', CallStatus: 'completed', CallDuration: '192',
      Timestamp: '2026-09-12T10:04:00Z',
      RecordingUrl: 'https://api.twilio.com/r/CA123',
    }, 'twilio');
    expect(missing).toEqual([]);
    expect(call.callId).toBe('CA123');
    expect(call.from).toBe('+919800000001');
    expect(call.direction).toBe('in');
    expect(call.durationSec).toBe(192);
    expect(call.recordingUrl).toMatch(/twilio/);
  });

  it('reads Exotel, and prefers the talking to the ringing', () => {
    /*
     * Exotel sends both. Duration counts the ringing; ConversationDuration is
     * the part somebody was actually on the call for, and it is the one that
     * means anything to a watcher.
     */
    const { call } = readCall({
      CallSid: 'exo-1', From: '09800000002', To: '08040001234',
      Direction: 'incoming', Duration: '240', ConversationDuration: '180',
      StartTime: '2026-09-12 10:04:00', DialWhomNumber: '09811111111',
      RecordingUrl: 'https://s3.exotel.com/rec.mp3', Status: 'completed',
    }, 'exotel');
    expect(call.durationSec).toBe(180);
    expect(call.agent).toBe('09811111111');
    expect(call.direction).toBe('in');
  });

  it('reads Ozonetel, which calls the recording a filename', () => {
    const { call, missing } = readCall({
      UCID: 'ucid-9', CustomerNumber: '9800000003', DID: '08040001234',
      CallType: 'inbound', TalkTime: '00:02:15', StartTime: '1789012800',
      AgentID: 'reception-2', Filename: 'https://recordings.ozonetel.com/a.wav',
    }, 'ozonetel');
    expect(missing).toEqual([]);
    expect(call.callId).toBe('ucid-9');
    expect(call.durationSec).toBe(135);
    expect(call.recordingUrl).toMatch(/ozonetel/);
  });

  it('reads Knowlarity, MyOperator, Servetel and Smartflo', () => {
    const cases = [
      ['knowlarity', { uuid: 'k1', caller_id: '9800000004', start_time: '2026-09-12 10:00:00', recording_url: 'https://k/r.mp3' }],
      ['myoperator', { call_id: 'm1', caller_number: '9800000005', start_time: '2026-09-12 10:00:00', recording: 'https://m/r.mp3' }],
      ['servetel', { call_id: 's1', caller_id_number: '9800000006', start_stamp: '2026-09-12 10:00:00', billsec: '95', call_recording_url: 'https://s/r.mp3' }],
      ['smartflo', { uuid: 't1', caller_id_number: '9800000007', start_stamp: '2026-09-12 10:00:00', billsec: '60', recording_url: 'https://t/r.mp3' }],
    ];
    for (const [provider, payload] of cases) {
      const { call, missing } = readCall(payload, provider);
      expect(missing, provider).toEqual([]);
      expect(call.callId, provider).toBeTruthy();
      expect(call.from, provider).toBeTruthy();
      expect(call.recordingUrl, provider).toMatch(/^https/);
    }
  });

  it('reads a provider nobody listed, which is the reason the aliases exist', () => {
    /*
     * The direct answer to "we don't know what customers will use". A service
     * this code has never heard of, using names another one uses, is read
     * without anybody shipping an adapter for it.
     */
    const { call, missing } = readCall({
      call_id: 'x-1', customer_number: '9800000008', did_number: '08040001234',
      call_type: 'Incoming', duration: '210', start_time: '2026-09-12T10:04:00+05:30',
      agent_number: '9811111111', recording_url: 'https://unknown-vendor.in/r.mp3',
    }, 'other');
    expect(missing).toEqual([]);
    expect(call.from).toBe('9800000008');
    expect(call.durationSec).toBe(210);
    expect(call.direction).toBe('in');
  });

  it('finds a call inside an envelope', () => {
    // Several of these wrap the call in { data: ... } and posting the envelope
    // is the same payload indented, not a different one.
    const { call } = readCall({ event: 'call.completed', data: { call_id: 'e1', caller_id: '98000', start_time: '2026-09-12 10:00:00' } }, 'other');
    expect(call.callId).toBe('e1');
  });
});

describe('what it says it could not read', () => {
  it('names the fields that decide whether a row is worth anything', () => {
    /*
     * Three, and only three. Without an id the provider's retries become
     * duplicate calls; without a caller nothing can be matched to a customer;
     * without a time it cannot be compared to an appointment, which is the
     * entire point of reading it.
     */
    const { call, missing } = readCall({ RecordingUrl: 'https://x/r.mp3' }, 'other');
    expect(missing.sort()).toEqual(['at', 'callId', 'from']);
    expect(call.at).toBeNull();
    expect(call.from).toBe('');
  });

  it('never invents a time for a call it could not date', () => {
    /*
     * The quiet disaster this prevents: `new Date()` as a fallback stamps the
     * call with the moment it was parsed. It would sort wrongly against every
     * other row for ever and nothing downstream could tell.
     */
    expect(normaliseAt('')).toBeNull();
    expect(normaliseAt('not a date')).toBeNull();
    expect(readCall({ call_id: 'a', caller_id: '1' }, 'other').call.at).toBeNull();
  });

  it('reports an unreadable duration as unknown rather than as a guess', () => {
    expect(normaliseSeconds('')).toBe(0);
    expect(normaliseSeconds('n/a')).toBe(0);
  });

  it('leaves direction empty when the payload does not say', () => {
    // Better than defaulting to inbound: "they rang us" and "we rang them"
    // are opposite findings, and a default would make one of them up.
    expect(normaliseDirection('')).toBe('');
    expect(normaliseDirection('weird')).toBe('');
  });
});

describe('the small conversions', () => {
  it('reads a duration however it is written', () => {
    expect(normaliseSeconds('192')).toBe(192);
    expect(normaliseSeconds('00:03:12')).toBe(192);
    expect(normaliseSeconds('3:12')).toBe(192);
  });

  it('reads a time from an epoch, in seconds or milliseconds', () => {
    // Ten digits are seconds, thirteen are milliseconds, and both are the
    // same instant — which is the whole reason the length is what decides.
    expect(normaliseAt('1789012800').toISOString()).toBe('2026-09-10T04:00:00.000Z');
    expect(normaliseAt('1789012800000').toISOString()).toBe('2026-09-10T04:00:00.000Z');
  });

  it('normalises every spelling of which way the call went', () => {
    for (const v of ['inbound', 'incoming', 'In', 'INCOMING', 'customer']) {
      expect(normaliseDirection(v), v).toBe('in');
    }
    for (const v of ['outbound', 'outgoing', 'outbound-api', 'click2call', 'agent']) {
      expect(normaliseDirection(v), v).toBe('out');
    }
  });
});

describe('a delivery of calls', () => {
  it('takes one call, a batch, or a bare array', () => {
    const one = { call_id: 'a', caller_id: '1', start_time: '2026-09-12 10:00:00' };
    const two = { call_id: 'b', caller_id: '2', start_time: '2026-09-12 11:00:00' };
    expect(callsIn(one, 'other')).toHaveLength(1);
    expect(callsIn([one, two], 'other')).toHaveLength(2);
    expect(callsIn({ calls: [one, two] }, 'other')).toHaveLength(2);
    expect(callsIn({ records: [one] }, 'other')).toHaveLength(1);
  });

  it('keeps a call it could only half read, with what was missing on it', () => {
    /*
     * Landed rather than dropped: who rang and when is most of what a watcher
     * needs, and a call nobody knows happened is worse than one with a gap in
     * it. The gap travels with the row so a screen can say so.
     */
    const out = callsIn({ caller_id: '9800000009' }, 'other');
    expect(out).toHaveLength(1);
    expect(out[0].missing).toContain('callId');
    expect(out[0].missing).toContain('at');
  });

  it('ignores a delivery that contains no call at all', () => {
    // A heartbeat, a test ping, an empty body: not a call, and must not
    // become a row that reads as one.
    expect(callsIn({}, 'other')).toEqual([]);
    expect(callsIn({ event: 'ping' }, 'other')).toEqual([]);
    expect(callsIn(null, 'other')).toEqual([]);
  });
});

describe('the list an owner picks from', () => {
  it('offers the services an Indian clinic is actually sold, and an escape', () => {
    for (const id of ['exotel', 'knowlarity', 'myoperator', 'ozonetel', 'servetel', 'smartflo', 'twilio']) {
      expect(PROVIDER_IDS, id).toContain(id);
    }
    // The one that makes not knowing survivable.
    expect(PROVIDER_IDS).toContain('other');
    expect(PROVIDERS.every((p) => p.id && p.label)).toBe(true);
  });

  it('reads every fact a call has, for every provider', () => {
    // A provider added later without an override must still return the whole
    // shape rather than a subset the connector then has to guess around.
    for (const id of PROVIDER_IDS) {
      const { call } = readCall({ call_id: 'a' }, id);
      expect(Object.keys(call).sort(), id).toEqual([...CALL_FIELDS].sort());
    }
  });
});
