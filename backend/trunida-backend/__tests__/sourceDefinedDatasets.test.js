/**
 * A dataset the source defines, rather than one we guessed.
 *
 * ── What was wrong ────────────────────────────────────────────────────────
 *
 * data/datasets.json is what Eame wrote from the blueprint before anybody had
 * connected anything: a reasonable guess at the shape of a business's
 * records, baked into the container at build time. It is a good way to start
 * and a bad way to finish.
 *
 * When a real CRM arrives its fields are whatever this customer made them,
 * and mapping them onto the guess drops everything the guess did not think
 * of. The demonstration turns on two such fields — a physiotherapy package
 * and a session count — and no list written in advance would have contained
 * either. The Data page went as far as offering "Physiotherapy Discharge
 * Guidelines" as the place to put Zoho's Contacts, which is the guess failing
 * out loud.
 *
 * So a connected module now defines its own dataset: the module's fields are
 * the columns, Zoho's record id is the key, and nothing is mapped because
 * nothing needs to be.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const svc = read('../eame-template/services/connectorService.js');
const ctl = read('../eame-template/controllers/zohoConnectController.js');
const boot = read('../eame-template/server.js');

describe('the index has two halves', () => {
  it('reads the file and what sources have defined', () => {
    expect(svc).toContain('export async function defineDataset(');
    expect(svc).toContain('export function datasetsCollection()');
    expect(svc).toContain('return [...out, ...defined];');
  });

  it('lets the source win a name clash, and keeps the guess', () => {
    /*
     * A guess and a fact about the same dataset are not two datasets, and the
     * fact is the one the rows are actually in. The guess stays in the file,
     * so removing a connector does not delete the shape the application was
     * built around.
     */
    expect(svc).toContain('const out = fromFile().filter(d => !defined.some(x => x.name === d.name));');
  });

  it('stays synchronous, because a dozen callers are', () => {
    // readIndex is called inside request handlers that have no business
    // awaiting a database. The cache is filled at boot and rewritten on
    // every change, which are the only two moments it can go stale.
    expect(svc).toMatch(/export function readIndex\(\)/);
    expect(svc).toContain('await loadDefinedDatasets();');
  });

  it('is loaded before anything reads it', () => {
    /*
     * Before restoreOwnFiles, or rows would be restored onto a dataset that
     * does not exist yet; and before the watchers, which read the index to
     * decide what they can watch at all.
     */
    const i = boot.indexOf('await loadDefinedDatasets();');
    expect(i).toBeGreaterThan(0);
    expect(i).toBeLessThan(boot.indexOf('await restoreOwnFiles()'));
  });

  it('refuses a dataset with no shape', () => {
    // A dataset with no columns is a name with nothing behind it, and every
    // watcher that matched it would find nothing for ever.
    expect(svc).toContain("throw new Error('A dataset needs a name and at least one column.');");
  });
});

describe('what a connected module becomes', () => {
  const zoho = read('../eame-template/services/connectors/zohocrm.js');

  it('asks Zoho for the fields rather than reading a page of records', () => {
    /*
     * A field nobody has filled in yet still belongs in the dataset, and a
     * module holding no records at all would otherwise describe itself as
     * having no shape — which is exactly the state a customer is in five
     * minutes before they put the first record in.
     */
    expect(zoho).toContain("get('/settings/fields', { params: { module: name } })");
    expect(zoho).toContain('export async function describeShape(config)');
  });

  it('keys on the record id, so a sync is an update and not a new set of people', () => {
    expect(zoho).toContain("const columns = ['id', ...fields.filter((f) => f !== 'id')].slice(0, MAX_FIELDS);");
    expect(zoho).toContain("key: 'id'");
  });

  it('offers only modules the API can actually read', () => {
    // api_supported is Zoho's own answer. A module that cannot be read is
    // not a choice, it is a dead end with a name on it.
    expect(zoho).toContain('.filter((m) => m.api_supported && m.api_name)');
  });

  it('names the dataset for the module and the system it came from', () => {
    // A business can keep people in more than one place: "Contacts" stops
    // being an answer the moment a second CRM or a spreadsheet arrives.
    expect(ctl).toContain('name: `${shape.name} (Zoho CRM)`');
  });

  it('builds the dataset before it makes the connection', () => {
    // createConnector refuses a dataset it cannot find, so the order is not
    // a preference.
    expect(ctl.indexOf('await defineDataset(')).toBeLessThan(ctl.indexOf('await createConnector('));
  });
});

describe('the consent comes before the questions', () => {
  it('holds the claimed token only in memory, and only while it is needed', () => {
    /*
     * Claiming from Svarg can happen once, and the question that follows
     * needs it. A connection nobody finishes should leave nothing behind, so
     * it is never written down.
     */
    expect(ctl).toContain('const held = new Map();');
    expect(ctl).toMatch(/HOLD_MS = 15 \* 60 \* 1000/);
    expect(ctl).not.toMatch(/insertOne|updateOne|save\(\)/);
  });

  it('drops the hold once the connection exists', () => {
    expect(ctl).toContain('held.delete(handoff);');
  });

  it('will not connect a module nobody chose', () => {
    expect(ctl).toContain("if (!moduleName) return res.status(400).json({ error: 'Choose which module to read.' });");
  });
});

describe('a dataset that has to survive the machinery around it', () => {
  const svc = read('../eame-template/services/connectorService.js');
  const ctl = read('../eame-template/controllers/zohoConnectController.js');

  it('gets a slug, because every row file is named by one', () => {
    /*
     * The real failure, reported as "an error in the webpage which could not
     * be traced": a connection that had just been made, a first sync, and
     * "Cannot read properties of undefined (reading 'replace')" from three
     * calls deep.
     *
     * otherSources builds a regular expression straight out of dataset.slug
     * and runs on every read AND write of rows, so a dataset without one
     * could not be read from or written to at all.
     */
    expect(svc).toContain("export function slugFor(name)");
    expect(svc).toContain("slug: slugFor(name),");
    // And anything written before slugs existed repairs itself at boot,
    // rather than needing somebody to connect it again and hope.
    expect(svc).toContain("const broken = await col.find({ $or: [{ slug: { $exists: false } }, { slug: '' }] }).toArray();");
  });

  it('reads as having no files rather than throwing, if it somehow has none', () => {
    // The rows are in the database either way; the file scan only picks up
    // what an earlier version of the application left on disk.
    expect(svc).toContain("const slug = String(dataset.slug || '');");
    expect(svc).toContain('if (slug && fs.existsSync(OWN_DIR)) {');
  });

  it('tells a fault here apart from a refusal from Zoho', () => {
    /*
     * A refusal from Zoho is a sentence somebody can act on — a module that
     * cannot be read, a scope that was not granted. A fault in this
     * application is whatever the runtime threw, which is no use to a
     * customer and every use in a log.
     */
    expect(ctl).toContain("const zoho = /zoho|module|scope|token|refused/i.test(err.message || '');");
    expect(ctl).toContain("console.error('[zoho] connecting %s failed after the consent:', moduleName, err);");
    expect(ctl).toContain('The reason has been logged: ');
  });
});

describe('whichever step asks first is the one that claims', () => {
  const ctl = read('../eame-template/controllers/zohoConnectController.js');

  /*
   * ── The bug this exists for ──────────────────────────────────────────────
   *
   * "That connection attempt has expired. Press Connect again." — reported
   * immediately after a consent that had just succeeded.
   *
   * Svarg hands a refresh token over once and once only, so whichever step
   * asks first has to be the one that claims it. That used to be the module
   * listing. When the listing was removed — because nobody should be asked
   * which module to read — nothing claimed at all, and finishing looked for
   * a token in a hold that was never filled. The handoff id was perfectly
   * good; there was simply nothing behind it.
   *
   * A step that is removed should not take a responsibility with it, so the
   * claim no longer lives in a step.
   */
  it('claims inside one helper, not inside whichever step happens to run', () => {
    expect(ctl).toContain('async function credsFor(handoff)');
    expect(ctl).toContain('const claimed = await claimConsent(handoff);');
  });

  it('is used by every step that needs credentials', () => {
    /*
     * Five of them now — status, modules, scan, connect, finish — and any
     * one can be the first to run. The count is asserted rather than the
     * list, because the failure this guards against is a NEW step that
     * claims for itself, or an old one that stops claiming when another is
     * removed.
     */
    const uses = (ctl.match(/await credsFor\(handoff\)/g) || []).length;
    expect(uses).toBe(5);
  });

  it('no longer reports a fresh consent as expired', () => {
    // The message stays for a handoff that really has expired — it was only
    // wrong when nothing ever tried to claim.
    expect(ctl).not.toMatch(/const creds = heldFor\(handoff\);/);
  });
});
