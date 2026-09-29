/**
 * A connection form asks only what the person in front of it can answer.
 *
 * ── The Exotel card, as it was ─────────────────────────────────────────────
 *
 * Six questions, four of them unanswerable:
 *
 *     Into which dataset      a filing decision, from a list of datasets
 *                             about patients and appointments
 *     Which service           fine
 *     API key (optional)      the only three things that matter, all three
 *     API token (optional)    labelled as though they could be skipped
 *     Read the recordings     a cost question nobody can price yet
 *     Account SID (optional)
 *
 * Every one of the four was the product asking somebody to make a decision on
 * its behalf. The rows are calls; a call has one shape; the connector already
 * declares it. The transcript is the entire reason a phone source exists. And
 * "optional" was wrong for Exotel, whose API cannot be called without all
 * three — it is optional only on a provider that never calls an API at all.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fieldIsRequired } from '../eame-template/services/connectorService.js';
import * as phone from '../eame-template/services/connectors/phone.js';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

describe('what the phone card asks', () => {
  const names = phone.fields.map((f) => f.name);

  it('asks four things, and three of them are on one Exotel page', () => {
    expect(names).toEqual(['provider', 'authUser', 'authToken', 'accountSid']);
  });

  it('no longer asks which dataset, because the calls have one shape', () => {
    expect(names).not.toContain('__dataset');
    expect(typeof phone.describeShape).toBe('function');
  });

  it('no longer asks whether to read the recordings', () => {
    // A phone source that does not read recordings captures who rang and
    // nothing about why. The cost that question was guarding is bounded by
    // MAX_PER_SYNC instead, which is a ceiling rather than a question.
    expect(names).not.toContain('transcribe');
    expect(read('../eame-template/services/connectors/phone.js')).toContain('MAX_PER_SYNC');
  });

  it('no longer asks which cluster or how far back', () => {
    expect(names).not.toContain('region');
    expect(names).not.toContain('history');
  });
});

describe('"optional" as a fact about the service chosen', () => {
  const field = (n) => phone.fields.find((f) => f.name === n);

  it('is not optional on Exotel, whose API needs all three', () => {
    for (const n of ['authUser', 'authToken', 'accountSid']) {
      expect(fieldIsRequired(field(n), { provider: 'exotel' })).toBe(true);
    }
  });

  it('is optional on a service that only posts to a webhook', () => {
    for (const n of ['authUser', 'authToken', 'accountSid']) {
      expect(fieldIsRequired(field(n), { provider: 'knowlarity' })).toBe(false);
    }
  });

  it('leaves an ordinary required field required', () => {
    expect(fieldIsRequired({ name: 'provider', label: 'Which service' }, {})).toBe(true);
  });

  it('leaves an ordinary optional field optional', () => {
    expect(fieldIsRequired({ required: false }, { provider: 'exotel' })).toBe(false);
  });

  it('is enforced by the server, not only drawn by the form', () => {
    const svc = read('../eame-template/services/connectorService.js');
    expect(svc).toContain('if (fieldIsRequired(f, config) && !String(config[f.name] || \'\').trim())');
  });

  it('is drawn by the form from the same rule, so it agrees', () => {
    const ui = read('../eame-template/frontend/data.js');
    expect(ui).toContain('function needed(f, config)');
    expect(ui).toContain('if (!f.requiredWhen) return false;');
    // And it follows the form: choosing Exotel must drop the marks live.
    expect(ui).toContain("el.addEventListener('change', apply);");
  });
});

describe('the dataset the calls land in', () => {
  it('is named after the service, so two systems are two datasets', () => {
    expect(phone.describeShape({ provider: 'exotel' }).name).toBe('Calls (Exotel)');
    expect(phone.describeShape({ provider: 'twilio' }).name).toBe('Calls (Twilio)');
  });

  it('names itself even when the provider is not one of the listed ones', () => {
    expect(phone.describeShape({}).name).toBe('Calls (Phone)');
  });

  it('has exactly the columns the connector fills, in that order', () => {
    // Which is what makes the mapping one to one: every column tagged to the
    // field that fills it, with nothing to line up by hand.
    expect(phone.describeShape({ provider: 'exotel' }).columns).toEqual(phone.provides);
  });

  it('is keyed on the call, so the webhook and the pull are one row', () => {
    expect(phone.describeShape({ provider: 'exotel' }).key).toBe('call_id');
  });

  it('declares its bookkeeping, so no watcher binds itself to it', () => {
    const internal = phone.describeShape({ provider: 'exotel' }).internal;
    expect(internal).toContain('transcript_status');
    expect(internal).toContain('received_at');
    // And the columns that carry meaning are not in it.
    expect(internal).not.toContain('promise');
    expect(internal).not.toContain('intent');
  });
});

describe('how the dataset comes to exist', () => {
  const svc = read('../eame-template/services/connectorService.js');

  it('is defined from the shape when the form did not name one', () => {
    expect(svc).toContain("if (!dataset && typeof kind.describeShape === 'function')");
    expect(svc).toContain('await defineDataset({ ...shape, from: kind.kind })');
  });

  it('happens after the credentials are proven', () => {
    /*
     * Defining a dataset for a credential that turns out to be wrong leaves
     * an empty table nobody asked for and nobody will delete.
     */
    const create = svc.slice(svc.indexOf('export async function createConnector'));
    expect(create.indexOf('await kind.test(config)')).toBeLessThan(create.indexOf('describeShape'));
  });

  it('still honours a dataset the form did name', () => {
    expect(svc).toContain('let dataset = datasetName ? findDataset(datasetName) : null;');
  });

  it('is announced to the page, which no longer knows the name in advance', () => {
    const ui = read('../eame-template/frontend/data.js');
    expect(ui).toContain('r.connector.datasetName || chosen');
  });
});

describe('which sources name their own dataset', () => {
  it('says so in the catalogue, so the form can stop asking', () => {
    const svc = read('../eame-template/services/connectorService.js');
    expect(svc).toContain("definesDataset: typeof k.describeShape === 'function'");
  });

  it('is what the form branches on', () => {
    const ui = read('../eame-template/frontend/data.js');
    expect(ui).toContain("+ (k.definesDataset ? ''");
  });
});

describe('an application that cannot read recordings', () => {
  it('connects anyway, rather than refusing the card', () => {
    /*
     * It used to throw, telling somebody to answer "no" under a question
     * that no longer exists. Who rang, when, for how long and how it ended
     * is a real source on its own.
     */
    const p = read('../eame-template/services/connectors/phone.js');
    expect(p).not.toContain('so choose "no" under');
    expect(p).toContain('Recordings will not be read');
  });

  it('says off rather than pending, which would promise a reading', () => {
    const p = read('../eame-template/services/connectors/phone.js');
    expect(p).toContain("if (config.transcribe === 'no' || !canTranscribe()) return 'off';");
  });
});
