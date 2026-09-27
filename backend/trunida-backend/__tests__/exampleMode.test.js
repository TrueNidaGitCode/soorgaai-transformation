/**
 * Example mode: the demonstration, or the business. Never both.
 *
 * ── What was wrong ─────────────────────────────────────────────────────────
 *
 * A delivered application ships with generated sample records so a new owner
 * can see the shape of the thing before connecting anything. The answer
 * pipeline falls back to them when no real records are connected, and the
 * watchers run through that same pipeline — so a freshly delivered
 * application filled its board with findings about invented people.
 *
 * They were labelled. One quiet line under each row said they were built on
 * sample data, and that was true and far too quiet: the verdict above them
 * read "2 things need you today", the area counts were the samples' counts,
 * and the morning digest went out by email. Measured on a real tenant: 23
 * findings, all 23 simulated, and two digests sent about patients who do not
 * exist.
 *
 * So the fallback stays — it is the right behaviour for somebody exploring —
 * and it is now something a person switches on, off by default, said plainly
 * on the screen, and never in an email.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const ctl = read('../eame-template/controllers/agentsController.js');
const ui = read('../eame-template/frontend/findings.js');
const html = read('../eame-template/frontend/index.html');
const notify = read('../eame-template/services/notifyService.js');
const agents = read('../eame-template/services/agentService.js');

describe('off by default', () => {
  it('asks for the mode explicitly, and anything but "1" is off', () => {
    /*
     * Off is not a default in a variable somewhere — it is what every request
     * that does not ask for the demonstration gets, including a malformed
     * one. A truthy check on req.query.example would turn the mode on for
     * "?example=0".
     */
    expect(ctl).toContain("const example = String(req.query.example || '') === '1';");
  });

  it('shows the business findings unless the demonstration was asked for', () => {
    expect(ctl).toContain("'evidence.simulated': example ? true : { $ne: true }");
  });

  it('applies the same filter to what is open and what has resolved', () => {
    // Resolved findings are the reassurance half of the board. Filtering one
    // and not the other would let the demonstration leak into a real board
    // through "recently resolved".
    const open = ctl.slice(ctl.indexOf("state: 'open'"), ctl.indexOf("state: 'resolved'"));
    expect(open).toContain('...onlyKind');
    expect(ctl.slice(ctl.indexOf("state: 'resolved'"))).toContain('...onlyKind');
  });

  it('starts off in the browser too, and reads nothing it did not write', () => {
    expect(ui).toContain("localStorage.getItem('ch-example') === '1'");
    // A storage read that throws (private window, blocked site data) is off,
    // not on: the failure has to fall towards the business.
    expect(ui).toMatch(/catch \(e\) \{ return false; \}/);
  });
});

describe('the two sets never mix', () => {
  it('sends one query per mode, so a row cannot belong to both', () => {
    // $ne: true also catches findings recorded before `simulated` existed,
    // which are real: an older application must not have its board emptied
    // by this change.
    expect(ctl).toContain('{ $ne: true }');
  });

  it('counts, categories and verdict all read the filtered set', () => {
    /*
     * The failure this prevents is subtler than a mixed list: a verdict
     * computed over everything, sitting above a list showing half of it.
     */
    const body = ctl.slice(ctl.indexOf('const counts = { high: 0'), ctl.indexOf('everRan:'));
    expect(body).toContain('for (const r of rows) counts[r.severity]');
    expect(body).toMatch(/count: rows\.filter/);
  });

  it('re-reads the whole board when the mode changes, rather than re-filtering', () => {
    expect(ui).toContain("api('/findings' + (exampleOn() ? '?example=1' : ''))");
  });
});

describe('what the screen says', () => {
  it('has the toggle on the home board, above the verdict', () => {
    expect(html).toContain('id="fn-mode-toggle"');
    // Above, because it changes what the verdict means.
    expect(html.indexOf('id="fn-mode"')).toBeLessThan(html.indexOf('id="fn-hero"'));
    expect(html).toContain('role="switch"');
  });

  it('says which data is on screen, in the customer’s words', () => {
    expect(ui).toContain('viewing example data to see how Svarg works.');
    expect(ui).toContain('viewing your business data.');
    expect(html).toContain('Example mode <b>OFF</b>');
  });

  it('hides the toggle when there is no demonstration to switch to', () => {
    // An application whose samples were replaced by real data has nothing to
    // show, and a switch that does nothing is worse than no switch.
    expect(ui).toContain('box.hidden = !body.hasExample;');
  });

  it('marks every example finding twice: a tag to scan and a line to read', () => {
    expect(ui).toContain("(ev.simulated ? '<span class=\"fn__egtag\">Example</span>' : '')");
    expect(ui).toContain('Example data &mdash; not your own records.');
  });

  it('carries the label onto the screen somebody acts from', () => {
    // Acting on an invented finding means ringing a customer who does not
    // exist, and the detail screen is where somebody decides to act.
    expect(ui).toContain("(ev.simulated ? 'Example · ' : '')");
  });
});

describe('the state that was missing', () => {
  it('does not call an unconnected application healthy', () => {
    /*
     * With nothing connected the watchers still run and still find nothing
     * real, and the board said "Everything looks good" — which reads as "we
     * checked your business and it is fine" when nothing of their business
     * had been looked at.
     */
    expect(ui).toContain("verdict: 'Nothing connected yet'");
    expect(ui).toContain('body.hasRealData === false');
    expect(ui).toContain('Open Data to connect a source');
  });

  it('checks it before deciding anything else about the morning', () => {
    const fn = ui.slice(ui.indexOf('function health(body)'), ui.indexOf("cls: 'is-good'"));
    expect(fn.indexOf('hasRealData === false')).toBeLessThan(fn.indexOf('if (body.degraded)'));
  });

  it('only says it about the business, never about the demonstration', () => {
    // In Example mode there is deliberately no real data, and telling
    // somebody to connect a source while showing them the demonstration is
    // answering a question they did not ask.
    expect(ui).toContain('!body.example && body.hasRealData === false');
  });

  it('is told by the server whether anything real has arrived', () => {
    expect(ctl).toContain('hasRealData: await hasOwnRows()');
    // From the same test the answer pipeline uses, rather than a second
    // definition of "no data" that would drift from it.
    expect(read('../eame-template/services/answerService.js'))
      .toContain('export async function hasOwnRows()');
  });
});

describe('the email, which cannot be unsent', () => {
  it('never carries a finding built on the sample data', () => {
    /*
     * The worst of it, and the reason this is a separate guard from the
     * board. A screen can be labelled; a morning briefing about a patient
     * who does not exist has already gone.
     */
    expect(notify).toContain('if (r.simulated) continue;');
  });

  it('is told by the run itself, not by a guess at the tenant’s state', () => {
    expect(agents).toContain('simulated: !!result?.simulated');
    expect(agents).toContain('return { ran: true, fired, simulated:');
  });
});
