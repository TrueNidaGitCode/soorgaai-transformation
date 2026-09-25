/**
 * The numbers behind the investor page, and the three rules they follow.
 *
 * ── One: counts leave a tenant, never rows ────────────────────────────────
 *
 * The findings live in the customer's own database, one per deployment, and
 * counting them is the only way to say what the product has actually done. So
 * this service opens tenant databases — and may only ever count. A customer's
 * record reaching an investor slide would be the worst bug in this codebase,
 * and it is the kind that arrives as a helpful "let's show an example".
 *
 * ── Two: opened is read from the signal, not from the finding ─────────────
 *
 * A delivered application signals Svarg when somebody opens a finding and
 * stores no flag on the record. Counting `openedAt` on findings therefore
 * returns zero — which reads as "nobody has ever looked" and is a measurement
 * artefact, not a fact. That mistake was made once already while preparing
 * this page, and caught before it was published.
 *
 * ── Three: nothing is projected ───────────────────────────────────────────
 *
 * Every field is a count of something that has happened. No run rate, no
 * annualisation, and no build cost — that last one is not measured at all
 * (nine ledger rows for thirty-six blueprints), and a number wrong by an
 * unknown multiple is worse than an absent one.
 */
import fs from 'fs';
import { describe, it, expect } from 'vitest';

const src = fs.readFileSync(new URL('../services/capitalProofService.js', import.meta.url), 'utf8');
const route = fs.readFileSync(new URL('../routes/capitalRoutes.js', import.meta.url), 'utf8');
const server = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');

describe('nothing but counts leaves a tenant database', () => {
  it('reads tenant collections only through countDocuments', () => {
    /*
     * The tenant section of the file. `find` appears once, against
     * svarg_users, for a single lastSeenAt — a timestamp, projected to that
     * field alone, never a row of business data.
     */
    const tenant = src.slice(src.indexOf('async function tenantTotals'), src.indexOf('async function openedCount'));
    expect(tenant).toContain('countDocuments');
    const finds = [...tenant.matchAll(/\.find\(/g)];
    expect(finds).toHaveLength(1);
    expect(tenant).toMatch(/projection: \{ lastSeenAt: 1 \}/);
    expect(tenant).not.toMatch(/toArray\(\)\s*;/);
  });

  it('returns no names, rows or identifiers', () => {
    // Every field on the payload is a number, a date, or the industry label
    // the operator typed into the funnel themselves.
    const returned = src.slice(src.indexOf('return {\n    measuredAt'));
    for (const leak of [/email/i, /\bname\b(?!s\(\))/, /question:/, /title/i, /evidence/i]) {
      expect(returned, String(leak)).not.toMatch(leak);
    }
  });
});

describe('how many findings have been opened', () => {
  it('counts the signal, not a field the application never writes', () => {
    expect(src).toMatch(/kind: 'finding_opened'/);
    expect(src).toMatch(/tenantsignals/);
    // The artefact this avoids, named so nobody reintroduces it.
    expect(src).toMatch(/measurement artefact/);
    expect(src).not.toMatch(/openedAt: \{ \$ne: null \}/);
  });
});

describe('it reports what happened, and nothing else', () => {
  it('projects nothing', () => {
    /*
     * The code, not the comment that forbids it. The file says "it does not
     * project, annualise or derive a run rate" in its own header, and a check
     * that cannot tell the prohibition from the act would delete the
     * prohibition.
     */
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    // Not /projection/: that is a Mongo query option and appears twice.
    for (const word of [/ARR/, /annualis/i, /run rate/i, /forecast/i, /projected/i]) {
      expect(code, String(word)).not.toMatch(word);
    }
  });

  it('does not report a build cost it cannot measure', () => {
    /*
     * The usage ledger holds nine rows for thirty-six blueprints, so what
     * generation costs is unknown. The service refuses to supply a figure
     * rather than supplying a wrong one.
     */
    expect(src).not.toMatch(/usageledgers/);
    expect(src).toMatch(/nine rows for thirty-six blueprints/);
  });

  it('keeps spend to four decimals, so tens of cents do not round to nothing', () => {
    expect(src).toMatch(/toFixed\(4\)/);
  });
});

describe('who may read it', () => {
  it('is platform-admin only', () => {
    expect(route).toMatch(/router\.get\('\/proof', protect, adminOnly, getCapitalProof\)/);
  });

  it('is mounted', () => {
    expect(server).toContain('app.use("/api/admin/capital", capitalRoutes);');
  });

  it('answers with an error rather than an empty page when it cannot measure', () => {
    const ctrl = fs.readFileSync(new URL('../controllers/capitalController.js', import.meta.url), 'utf8');
    expect(ctrl).toMatch(/res\.status\(500\)/);
    expect(ctrl).toMatch(/Could not measure/);
  });
});
