/**
 * A conversation, read into columns a watcher can filter on.
 *
 * ── The one that has to be right ───────────────────────────────────────────
 *
 * "A promise was made" is the most consequential thing this product asserts
 * about a member of staff. It is the difference between Promise Not Kept
 * appearing on somebody's morning list and not, and a model that invents one
 * is accusing an employee of forgetting something they never said.
 *
 * No amount of prompt wording prevents that. Checking the quote does, because
 * an invented promise has no quote that survives the transcript. So most of
 * this file is about what gets thrown away.
 */
import { describe, it, expect } from 'vitest';
import { readSignals, INTENTS, SIGNAL_FIELDS }
  from '../eame-template/services/callSignalService.js';

/** Rahul's call, as it would come back from transcription. */
const RAHUL = [
  'Staff: Good morning, Vesoma physiotherapy.',
  'Caller: Hi, this is Rahul. I wanted to know about upgrading my package.',
  'Staff: Sure, I will check and get back to you.',
  'Caller: Thank you.',
].join('\n');

/** A model that answers with whatever the test wants. */
const says = (obj) => async () => JSON.stringify(obj);

describe('what it keeps', () => {
  it('reads the intent, the request and the promise from Rahul’s call', async () => {
    const out = await readSignals(RAHUL, says({
      intent: 'upgrade',
      request: 'Asked about upgrading his package',
      request_quote: 'I wanted to know about upgrading my package',
      promise: 'yes',
      promise_quote: 'I will check and get back to you',
    }));
    expect(out.intent).toBe('upgrade');
    expect(out.request).toBe('Asked about upgrading his package');
    expect(out.promise).toBe('yes');
    expect(out.promise_quote).toBe('I will check and get back to you');
    expect(out.signals_checked).toBe('yes');
  });

  it('accepts a quote whose punctuation drifted, but not its words', async () => {
    /*
     * A model reliably reproduces the words and unreliably reproduces a
     * comma. Being strict about punctuation would throw away true signals;
     * being loose about words would let an invented one through.
     */
    const out = await readSignals(RAHUL, says({
      intent: 'upgrade', promise: 'yes',
      promise_quote: 'Sure — I Will Check, And Get Back To You!',
    }));
    expect(out.promise).toBe('yes');
  });

  it('returns every column the connector lands, whatever happened', async () => {
    const out = await readSignals(RAHUL, says({ intent: 'upgrade', promise: 'no' }));
    for (const f of SIGNAL_FIELDS) expect(out, f).toHaveProperty(f);
  });
});

describe('what it throws away', () => {
  it('discards a promise nobody said', async () => {
    /*
     * The failure this whole file exists for. The model is confident, the
     * sentence is plausible, and nothing like it is in the transcript — so
     * the promise does not survive, and Promise Not Kept does not fire.
     */
    const out = await readSignals(RAHUL, says({
      intent: 'upgrade',
      promise: 'yes',
      promise_quote: 'I will call you back tomorrow morning without fail',
    }));
    expect(out.promise).toBe('no');
    expect(out.promise_quote).toBe('');
    // And it is not silently equivalent to "no promise was made": a run of
    // these is a prompt that has drifted or a model that is guessing.
    expect(out.signals_checked).toBe('unquoted');
  });

  it('discards a promise with no quote at all', async () => {
    const out = await readSignals(RAHUL, says({ intent: 'upgrade', promise: 'yes', promise_quote: '' }));
    expect(out.promise).toBe('no');
  });

  it('refuses a two-word quote as evidence of a commitment', async () => {
    /*
     * "will check" appears in half of all transcripts. A quote that short
     * proves nothing and would make the check ornamental.
     */
    const out = await readSignals(RAHUL, says({ intent: 'upgrade', promise: 'yes', promise_quote: 'will check' }));
    expect(out.promise).toBe('no');
  });

  it('discards a summary whose quote is not there', async () => {
    const out = await readSignals(RAHUL, says({
      intent: 'complaint',
      request: 'Complained about the physiotherapist',
      request_quote: 'the physio was very rude to me',
      promise: 'no',
    }));
    expect(out.request).toBe('');
    expect(out.signals_checked).toBe('unquoted');
  });

  it('keeps the intent even when a quote failed, because intent needs none', async () => {
    // The intent is a classification of the whole call, not a claim about
    // words anybody said, so it survives what the quotes do not.
    const out = await readSignals(RAHUL, says({
      intent: 'upgrade', promise: 'yes', promise_quote: 'never said this',
    }));
    expect(out.intent).toBe('upgrade');
  });
});

describe('the closed vocabulary', () => {
  it('forces anything unrecognised to "other"', async () => {
    /*
     * A watcher asks ["intent", "is", "upgrade"]. A column holding "asking
     * about upgrading his package" matches nothing, so free text here would
     * make the column useless while looking full.
     */
    for (const invented of ['wants_to_upgrade', 'UPGRADE_REQUEST', 'enquiry about price', '']) {
      const out = await readSignals(RAHUL, says({ intent: invented, promise: 'no' }));
      expect(out.intent, invented).toBe('other');
    }
  });

  it('accepts every word it offers, in any case', async () => {
    for (const i of INTENTS) {
      const out = await readSignals(RAHUL, says({ intent: i.toUpperCase(), promise: 'no' }));
      expect(out.intent, i).toBe(i);
    }
  });
});

describe('when it cannot read the call', () => {
  it('says so rather than claiming there was nothing in it', async () => {
    /*
     * The distinction that keeps a watcher honest. "No promise was made" and
     * "nobody could read this call" are different facts, and a watcher
     * counting kept promises must not treat the second as the first.
     */
    /*
     * And the two ways of not reading it are now told apart.
     *
     * They shared 'no' until the first real call failed, and the value sent
     * somebody to check whether the gateway was up. It was: the model was
     * answering fine, in prose, because the prompt had been framed with the
     * application's conduct. One points at the gateway and the other at the
     * prompt, so they are different words. See callSignalsRead.test.js.
     */
    const broken = await readSignals(RAHUL, async () => 'not json at all');
    expect(broken.signals_checked).toBe('unreadable');
    expect(broken.promise).toBe('');

    const threw = await readSignals(RAHUL, async () => { throw new Error('gateway down'); });
    expect(threw.signals_checked).toBe('no');
  });

  it('never throws, because a call still happened', async () => {
    await expect(readSignals(RAHUL, async () => { throw new Error('x'); })).resolves.toBeTruthy();
  });

  it('marks an empty transcript as empty, not as a call with no signals', async () => {
    const out = await readSignals('', says({ intent: 'upgrade', promise: 'yes' }));
    expect(out.signals_checked).toBe('empty');
    expect(out.intent).toBe('');
  });

  it('survives a model that fences its JSON', async () => {
    const out = await readSignals(RAHUL, async () =>
      '```json\n{"intent":"upgrade","promise":"no"}\n```');
    expect(out.intent).toBe('upgrade');
  });
});

describe('what it is told', () => {
  it('asks the model to classify and quote, never to judge', async () => {
    let seen = null;
    await readSignals(RAHUL, async (p) => { seen = p; return '{}'; });
    // The vocabulary is in the prompt, so the model is choosing from a list
    // rather than inventing a label the column cannot be filtered on.
    for (const i of INTENTS) expect(seen.systemPrompt, i).toContain(i);
    // A customer promising to ring back is not the business committing.
    expect(seen.systemPrompt).toMatch(/customer saying they will call back is NOT a promise/i);
    // Nothing here decides anything is wrong; that is the watchers' job.
    expect(seen.systemPrompt).toMatch(/never decide whether anything is a problem/i);
    // Reading a conversation is not reasoning work, and thinking is billed
    // as output.
    expect(seen.thinking).toBe(false);
    expect(seen.userMessage).toContain('I wanted to know about upgrading');
  });
});
