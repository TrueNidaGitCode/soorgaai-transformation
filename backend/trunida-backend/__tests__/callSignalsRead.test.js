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
    expect(block).toContain("'signals.signals_checked': { $in: ['no', 'unreadable'] }");
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
