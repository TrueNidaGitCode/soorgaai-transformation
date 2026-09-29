/**
 * The conduct was answering the question meant for the extractor.
 *
 * ── Measured on the first real call, on the first real connection ──────────
 *
 * Eighty-four seconds, transcribed perfectly. A patient explaining why he had
 * missed his appointment, asking about a monthly package instead of paying
 * one session at a time, and a member of staff saying "I will just check with
 * the team and get back to you."
 *
 * Every signal came back empty:
 *
 *     intent "" · request "" · promise "" · promise_quote ""
 *     signals_checked: "no"
 *
 * Which is the whole product missing, on the exact conversation the pitch
 * deck is built around. A transcript no watcher can filter on is a recording
 * a person could have listened to themselves.
 *
 * The cause was one word. askModel called generate(), which frames a prompt
 * with the application's conduct — and the conduct outranks the caller on how
 * to speak: "Plain sentences. There is no Markdown renderer on this page...
 * no headings, no asterisks." Underneath it, this prompt asked for nothing
 * but JSON. The model did as it was told, twice, and answered in prose;
 * JSON.parse threw the lot away.
 *
 * llmService names this exact call in its own file: generateRaw is "for the
 * rare model call that is not an answer to a person — classifying a message,
 * extracting a field. Conduct written for a reader would only get in its way."
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { readSignals } from '../eame-template/services/callSignalService.js';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

/** The call that exposed this, near enough verbatim. */
const REAL = [
  'Staff: Hello.',
  'Caller: Hello. Am I speaking to Rahul?',
  'Staff: Yeah.',
  "Caller: Uh I'm calling from uh Clinic and Wellness Center. So, you had an appointment on "
    + '28th September. And, yeah, you know uh you had not come to the center uh can I know the reason?',
  "Staff: Um Because I don't want to go for the one time. So, I would like to go for a subscription service.",
  "Caller: So, you mean uh the monthly subscription package, ma'am?",
  'Staff: Yeah, right.',
  "Caller: Okay, fine. Okay, fine, ma'am. I'll I have collected the details. I will just check "
    + "with the team and get back to you, ma'am.",
  'Staff: Okay, thank you.',
].join('\n\n');

describe('the extractor does not go through the conduct', () => {
  const phone = read('../eame-template/services/connectors/phone.js');

  it('asks with generateRaw, not generate', () => {
    expect(phone).toContain('const out = await generateRaw({');
    expect(phone).toContain("import { generateRaw } from '../llmService.js';");
  });

  it('does not import the framed one at all, so it cannot drift back', () => {
    expect(phone).not.toMatch(/import \{ generate \} from '\.\.\/llmService\.js'/);
  });

  it('is the call llmService describes generateRaw as being for', () => {
    // Matched across the comment wrap rather than asserting a line break.
    const llm = read('../eame-template/services/llmService.js');
    expect(llm).toMatch(/classifying a message, extracting a\s+\*?\s*field/);
  });

  it('asks for something the conduct forbids, which is the whole point', () => {
    // The conduct says plain sentences and no markup; this wants only JSON.
    // Both cannot be obeyed, and the conduct is the one that outranks.
    expect(read('../eame-template/services/assistant.js')).toContain('Plain sentences.');
    expect(read('../eame-template/services/callSignalService.js')).toContain('Return ONLY JSON');
  });
});

describe('a failure that says which failure it was', () => {
  it('reports prose as unreadable, not as unreachable', async () => {
    /*
     * These are different repairs. One sends somebody to the gateway, the
     * other to the prompt, and for as long as they shared a value the first
     * real failure pointed at the wrong one.
     */
    const r = await readSignals(REAL, async () => 'Sure! The customer asked about an upgrade.');
    expect(r.signals_checked).toBe('unreadable');
  });

  it('reports a model it could not reach as no', async () => {
    const r = await readSignals(REAL, async () => { throw new Error('gateway down'); });
    expect(r.signals_checked).toBe('no');
  });

  it('still reports an empty transcript as empty', async () => {
    expect((await readSignals('', async () => '{}')).signals_checked).toBe('empty');
  });
});

describe('what it reads out of that call when it answers properly', () => {
  const answered = (over) => async () => JSON.stringify({
    intent: 'upgrade',
    request: 'monthly subscription package',
    request_quote: 'I would like to go for a subscription service',
    promise: 'yes',
    promise_quote: 'I will just check with the team and get back to you',
    ...over,
  });

  it('names the intent from the closed list a watcher can filter on', async () => {
    expect((await readSignals(REAL, answered())).intent).toBe('upgrade');
  });

  it('keeps the request, because its words are in the call', async () => {
    expect((await readSignals(REAL, answered())).request).toBe('monthly subscription package');
  });

  it('records the promise, which is what Promise Overdue reads', async () => {
    const r = await readSignals(REAL, answered());
    expect(r.promise).toBe('yes');
    expect(r.promise_quote).toContain('check with the team');
    expect(r.signals_checked).toBe('yes');
  });

  it('throws away a promise nobody made, however confidently stated', async () => {
    // The one that matters: Promise Overdue puts a member of staff on a
    // morning list for forgetting something. An invented quote has no words
    // behind it, and the signal goes with it.
    const r = await readSignals(REAL, answered({
      promise_quote: 'I will personally refund you this afternoon',
    }));
    expect(r.promise).toBe('no');
    expect(r.promise_quote).toBe('');
    expect(r.signals_checked).toBe('unquoted');
  });
});

/**
 * And a call whose signals failed must be readable later.
 *
 * Transcribing is the expensive half and happens once, so a call that has
 * been read is never listened to again. The signals are a second reading of
 * that text and can fail on their own — and without a retry such a call is
 * blind for ever, because nothing will ever look at it again. Which is
 * exactly what happened: a perfect transcript, five empty columns, and no
 * amount of fixing the prompt afterwards would have touched it.
 */
describe('reading the signals again on a call that already has its words', () => {
  const phone = read('../eame-template/services/connectors/phone.js');
  const block = phone.slice(
    phone.indexOf('async function rereadSignals'),
    phone.indexOf('async function askModel'),
  );

  it('looks at calls whose transcript arrived and whose signals did not', () => {
    expect(phone).toContain('async function rereadSignals(config)');
    expect(block).toContain("'signals.signals_checked': { $in: ['no', 'unreadable', 'truncated'] }");
    expect(block).toContain('{ signals: { $exists: false } }');
  });

  it('leaves alone the ones that answered', () => {
    // 'unquoted' is an answer — the model claimed something it could not
    // quote, and asking again spends a model call to be lied to twice.
    expect(block).not.toContain("$in: ['no', 'unreadable', 'unquoted']");
  });

  it('never re-fetches the audio, only re-reads the words', () => {
    expect(block).not.toContain('fetchRecording');
    expect(block).not.toContain('await transcribe(');
  });

  it('is bounded by the same ceiling as listening', () => {
    expect(block).toContain('.limit(MAX_PER_SYNC)');
  });

  it('runs on every sync, after the new calls have been transcribed', () => {
    const pull = phone.slice(phone.indexOf('export async function pull'));
    expect(pull.indexOf('transcribePending')).toBeLessThan(pull.indexOf('rereadSignals'));
  });
});

/**
 * The model complies in substance and not always in form.
 *
 * ── The second round of the same failure ───────────────────────────────────
 *
 * The first fix stopped the prompt being wrapped in the application's
 * conduct, which was real and needed doing. The call was re-read and came
 * back marked `unreadable` — the model answered, and the answer still would
 * not parse.
 *
 * The parser stripped a code fence off each end, which works exactly as long
 * as the model returns the object and nothing else. A model told "Return ONLY
 * JSON" writes "Here is what I found:" above it, or a sentence below it, or
 * fences it, or all three. None of that is worth throwing a whole call away
 * for, and the call it was throwing away was the one the demonstration is
 * built on.
 *
 * What loosened is how the answer is FOUND. Nothing about how it is TRUSTED:
 * every quote is still checked against the transcript, which is the guard
 * between reporting a promise and inventing one.
 */
describe('finding the answer inside whatever the model said', () => {
  const GOOD = {
    intent: 'upgrade',
    request: 'monthly subscription package',
    request_quote: 'I would like to go for a subscription service',
    promise: 'yes',
    promise_quote: 'I will just check with the team and get back to you',
  };
  const said = (raw) => async () => raw;
  const obj = JSON.stringify(GOOD);

  it('reads a bare object', async () => {
    expect((await readSignals(REAL, said(obj))).promise).toBe('yes');
  });

  it('reads it through a code fence', async () => {
    expect((await readSignals(REAL, said('```json\n' + obj + '\n```'))).promise).toBe('yes');
  });

  it('reads it under a sentence of preamble', async () => {
    const r = await readSignals(REAL, said('Here is what I found:\n' + obj));
    expect(r.signals_checked).toBe('yes');
    expect(r.intent).toBe('upgrade');
  });

  it('reads it with prose on both sides, which is the shape that failed', async () => {
    const r = await readSignals(REAL, said(
      'Sure! Here you go.\n```json\n' + obj + '\n```\nLet me know if you need anything else.',
    ));
    expect(r.promise).toBe('yes');
    expect(r.promise_quote).toContain('check with the team');
  });

  it('does not end the object early on a brace inside a quote', async () => {
    // A promise quote containing a brace would otherwise truncate the object
    // and turn a good answer into a bad one.
    const r = await readSignals(REAL, said(JSON.stringify({ ...GOOD, request: 'the {monthly} package' })));
    expect(r.signals_checked).toBe('yes');
  });

  it('still fails honestly when there is no object at all', async () => {
    const r = await readSignals(REAL, said('The customer asked about an upgrade.'));
    expect(r.signals_checked).toBe('unreadable');
    expect(r.promise).toBe('');
  });

  it('keeps what the model said, so the next failure is not guesswork', async () => {
    /*
     * Two rounds of this were diagnosed by guessing, because the only
     * evidence was a container log nobody was watching. It is never a column
     * — the connector lands the five named signals and nothing else.
     */
    const r = await readSignals(REAL, said('Nope, not doing JSON today.'));
    expect(r.said).toContain('not doing JSON today');
    expect(Object.keys(r)).not.toContain('transcript');
  });

  it('checks the quotes exactly as before, however the answer was wrapped', async () => {
    const r = await readSignals(REAL, said(
      'Here you go!\n' + JSON.stringify({ ...GOOD, promise_quote: 'I will refund you this afternoon' }),
    ));
    expect(r.promise).toBe('no');
    expect(r.signals_checked).toBe('unquoted');
  });
});

/**
 * Round three, and the last one, because the evidence was finally kept.
 *
 * The `said` field added in round two paid for itself on its first run. What
 * the model actually returned was not prose at all:
 *
 *     ```json
 *     {"intent":"other",
 *      "request":"subscription service",
 *
 * Correct JSON, cut off after about twenty-five tokens. The parser was never
 * the problem in round two either — there was no closing brace to find.
 *
 * Gemini 3.8 Flash was asked for 400 tokens with thinkingBudget: 0, thought
 * anyway, and spent the budget doing it. Svarg's llmService dropped its
 * thinking headroom whenever a caller switched thinking off, on the
 * reasoning that there was then nothing to pay for. A cap is not a bill, so
 * the headroom now stays on both branches.
 *
 * Three rounds, three different causes, one symptom. The lesson this file
 * keeps is the one that ended it: every failure has to name itself, because
 * a shared value sends the next person to the wrong repair.
 */
describe('an answer that ran out of room', () => {
  const CUT = '```json\n{"intent":"other",\n "request":"subscription service",\n';

  it('is called truncated, not unreadable', async () => {
    // One points at the token budget, the other at the prompt.
    expect((await readSignals(REAL, async () => CUT)).signals_checked).toBe('truncated');
  });

  it('is still told apart from an answer with no object in it', async () => {
    const r = await readSignals(REAL, async () => 'The customer asked about an upgrade.');
    expect(r.signals_checked).toBe('unreadable');
  });

  it('keeps what came back, which is how this was found', async () => {
    expect((await readSignals(REAL, async () => CUT)).said).toContain('"intent":"other"');
  });

  it('is picked up by the re-read, or the call that exposed it stays blind', () => {
    const phone = read('../eame-template/services/connectors/phone.js');
    expect(phone).toContain("$in: ['no', 'unreadable', 'truncated']");
  });

  it('cannot happen again for want of room', () => {
    // The headroom is no longer dropped when thinking is switched off.
    const llm = readFileSync(new URL('../services/llmService.js', import.meta.url), 'utf8');
    expect(llm).toMatch(/const budget = asked \+ THINKING_HEADROOM;/);
  });
});
