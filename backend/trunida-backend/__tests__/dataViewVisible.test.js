/**
 * The table opened, and the page went black.
 *
 * ── What was wrong ─────────────────────────────────────────────────────────
 *
 * Every panel moved inside the shell in an earlier pass: Data, Watchers and
 * People used to be siblings of it and hid the whole thing to show
 * themselves, which is why the sidebar vanished on three screens out of five.
 * `openView` — the one screen that shows a dataset as rows — kept its copy of
 * that hiding.
 *
 * So `openView` unhid the Data page and then hid the shell that contains it:
 *
 *     ch-view  <  .dt__body  <  .dt__layout  <  ch-data  <  ch-main  <  ch-app
 *
 * Nothing looked wrong from inside. The rows arrived, the title was set,
 * `view.hidden` was false, no error was thrown — and the customer got an
 * empty page with the browser's own back button greyed out, because nothing
 * here pushes history either.
 *
 * Alongside it, a second silence: the pill on each connection row was hidden
 * inside a source card, by a rule written when the pill repeated the card's
 * title ("Zoho CRM" under a card headed CRM). The pill now carries the
 * module's name, so nine CRM modules rendered as nine rows reading "10
 * records · read 10 min ago" and nothing else — the names were in the DOM
 * the whole time, which is why a DOM probe passed while the screen failed.
 *
 * Both are shape, not behaviour, so both are guarded here rather than in a
 * browser: what matters is that the two lines never come back.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const html = read('../eame-template/frontend/index.html');
const css = read('../eame-template/frontend/app.css');
const data = read('../eame-template/frontend/data.js');

const openView = html.slice(html.indexOf('function openView(ds)'), html.indexOf('function openView(ds)') + 1400);

describe('opening a dataset as a table', () => {
  it('does not hide the shell that the table lives inside', () => {
    expect(openView).not.toMatch(/app\.hidden\s*=\s*true/);
  });

  it('goes through the one place that changes screens', () => {
    expect(openView).toMatch(/showPanel\('data'\)/);
  });

  it('shows the table in place of the connections, not in place of the page', () => {
    expect(openView).toMatch(/connections\.hidden = true/);
    expect(openView).toMatch(/view\.hidden = false/);
  });

  it('offers a way back, because nothing here pushes history', () => {
    expect(html).toContain('id="ch-view-back"');
    expect(html).toMatch(/viewBack\.addEventListener\('click',[^;]*showConnections/);
  });

  it('names the system a row came from rather than printing its key', () => {
    expect(html).toMatch(/'zoho-crm': 'Zoho CRM'/);
  });
});

describe('a connection row inside a source card', () => {
  it('is named, so nine of them are told apart', () => {
    expect(css).not.toMatch(/\.dt-card \.dt-conn__kind\s*\{[^}]*display:\s*none/);
  });

  it('keeps the column that name needs', () => {
    expect(css).toMatch(/\.dt-card \.dt-conn \{ grid-template-columns: auto minmax\(0, 1fr\) auto; \}/);
  });

  it('carries the module rather than repeating the card it sits on', () => {
    expect(data).toMatch(/esc\(moduleLabel\(c\.datasetName \|\| c\.label\)\)/);
  });
});
