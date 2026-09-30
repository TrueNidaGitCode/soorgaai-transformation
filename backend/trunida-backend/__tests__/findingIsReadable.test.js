/**
 * A finding has to say what happened, not hand over a table.
 *
 * ── The first finding built on a phone call ────────────────────────────────
 *
 * It read "Promise made with no task logged afterwards" and then showed a
 * table whose ninth column held eight hundred characters of transcript. The
 * sentence that caused it — "I will just check with the team and get back to
 * you" — was in there, in the same size type as the call duration and the
 * same width as a column called received_at.
 *
 * The owner's words were that anybody would find it difficult to understand
 * what promise was not kept. They would: the evidence was all present and
 * none of it was legible.
 *
 * So the sentences come out of the table and are read as sentences, above the
 * records rather than inside them. The quote leads, because on a promise
 * finding that IS the finding; the transcript follows, because it is the
 * proof rather than the point.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const js = read('../eame-template/frontend/findings.js');
const html = read('../eame-template/frontend/index.html');
const css = read('../eame-template/frontend/app.css');

/**
 * The page's own rule, lifted and run rather than reimplemented — so this
 * tests what a reader gets, not a copy of it that could drift.
 */
const proseColumns = new Function(
  `${js.slice(js.indexOf('var PROSE_NAME ='), js.indexOf('  /** promise_quote ->'))}
   return proseColumns;`,
)();

/** The call that exposed this, as it is actually stored. */
const COLUMNS = ['date', 'time', 'name', 'phone', 'direction', 'duration_seconds',
  'agent', 'status', 'transcript', 'transcript_status', 'call_id', 'received_at',
  'intent', 'request', 'promise', 'promise_quote', 'signals_checked'];
const ROW = ['29/09/2026', '20:12', '07349250500', '07349250500', 'out', '84', '',
  'completed',
  'Staff: Hello. | Caller: Hello. Am I speaking to Rahul? | Staff: Yeah. | Caller: '
    + "Uh I'm calling from uh Clinic and Wellness Center. So, you had an appointment on "
    + '28th September, and you had not come to the center, can I know the reason?',
  'read', '80592ec7bca66af93e4450e5fe981a9t', '2026-09-29T20:12:12.000Z',
  'other', 'a subscription service', 'yes',
  "I will just check with the team and get back to you, ma'am.", 'yes'];

describe('which columns are read as sentences', () => {
  const idx = proseColumns(COLUMNS, [ROW]);
  const named = idx.map((i) => COLUMNS[i]);

  it('lifts the transcript out', () => {
    expect(named).toContain('transcript');
  });

  it('lifts the promise quote out, which is the whole point', () => {
    expect(named).toContain('promise_quote');
  });

  it('leaves the status word in the table where it belongs', () => {
    /*
     * transcript_status matches "transcript" and holds the word "read".
     * Lifted out, it became a quotation of the word "read" sitting under the
     * conversation it describes — the sort of thing that makes a careful
     * screen look careless.
     */
    expect(named).not.toContain('transcript_status');
  });

  it('leaves the short signals in the table', () => {
    for (const c of ['intent', 'request', 'promise', 'signals_checked']) {
      expect(named, c).not.toContain(c);
    }
  });

  it('leaves the ordinary columns alone', () => {
    for (const c of ['date', 'time', 'name', 'phone', 'direction', 'duration_seconds', 'status']) {
      expect(named, c).not.toContain(c);
    }
  });

  it('lifts a long value out of a column with an ordinary name', () => {
    // A customer's own column can be called anything at all, so length
    // decides where the name gives no hint.
    const long = 'x'.repeat(200);
    expect(proseColumns(['notes_field', 'whatever'], [[long, 'short']])).toEqual([0]);
  });

  it('finds nothing to lift out of a finding with no prose in it', () => {
    expect(proseColumns(['name', 'amount'], [['Rahul', '2400']])).toEqual([]);
  });
});

describe('how they are drawn', () => {
  it('reads them above the records, under their own heading', () => {
    expect(html).toContain('<div class="fd__said" id="fd-said" hidden>');
    expect(html).toContain('<h3 class="fd__h">What was said</h3>');
    expect(html.indexOf('id="fd-said"')).toBeLessThan(html.indexOf('id="fd-rows"'));
  });

  it('puts the quote first, because it is the finding', () => {
    expect(js).toContain('var qa = /quote/i.test(s.columns[a]) ? 0 : 1;');
  });

  it('gives the quote the accent and nothing else', () => {
    expect(css).toContain('.fd-said__item--quote { border-left-color: var(--ch-accent); }');
  });

  it('keeps the sentences out of the table, so it is not read twice', () => {
    expect(js).toContain('var drop = proseColumns(s.columns, s.rows);');
    expect(js).toContain('return drop.indexOf(i) < 0;');
  });

  it('hides the block on a finding that has no sentences', () => {
    expect(js).toContain("d.said.hidden = !d.saidbody.innerHTML;");
    // And clears it before every open, or one finding shows the last one's.
    expect(js).toContain("d.saidbody.innerHTML = '';");
  });

  it('keeps the whole conversation readable rather than truncating it', () => {
    // The transcript is the proof. Clipping it to a cell width is what this
    // was fixing, so it wraps instead.
    expect(css).toContain('white-space: pre-wrap;');
  });
});
