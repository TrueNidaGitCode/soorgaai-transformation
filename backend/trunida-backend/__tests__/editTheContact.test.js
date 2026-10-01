/**
 * A contact can be corrected without losing the lead.
 *
 * ── Why this was missing ───────────────────────────────────────────────────
 *
 * A warm introduction is added from a phone number and usually nothing else —
 * the motion declares phone and not email for exactly that reason, because an
 * introduction arrives as "call this person" weeks before an address does.
 *
 * Everything the Log panel could edit was about the PROCESS: the route in,
 * what happens next, the date, the note. Nothing about the PERSON. So an
 * introduction recorded with the wrong number could only be fixed by deleting
 * the lead and adding it again — throwing away its status, its route in and
 * the date it was first recorded, which is the history that makes the funnel
 * worth having.
 *
 * ── The one field with consequences ────────────────────────────────────────
 *
 * email is not like the others. It carries a unique partial index, it is what
 * matches a lead against the User who later signs up, and it is what a
 * sequence sends to. Each of those is a way for an edit to go quietly wrong,
 * and each is pinned below.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

const svc = read('../services/salesSignalsService.js');
const ctl = read('../controllers/salesSignalsController.js');
const ui = read('../../../frontend/admin/sales.js');
const css = read('../../../frontend/admin/sales.css');

/** updateLead, on its own, so the rules can be read rather than inferred. */
const update = svc.slice(svc.indexOf('export async function updateLead'), svc.indexOf('export async function deleteLead'));

describe('what a contact edit may change', () => {
  it('takes the fields a person is made of', () => {
    for (const f of ['name', 'phone', 'email', 'company', 'role', 'relationship']) {
      expect(update, `updateLead does not accept ${f}`).toContain(f);
    }
  });

  it('is passed through by the route that fronts it', () => {
    // A field the service accepts and the controller drops is a field that
    // silently never saves — the failure looks like the form not working.
    expect(ctl).toContain('phone, relationship, location, email, role,');
    expect((ctl.match(/phone, relationship, location, email, role,/g) || []).length).toBe(2);
  });

  it('is sent by the panel, all of it, on every save', () => {
    for (const cls of ['sg-l-name', 'sg-l-phone', 'sg-l-email', 'sg-l-company', 'sg-l-role', 'sg-l-rel']) {
      expect(ui, `the panel has no ${cls}`).toContain(cls);
    }
    // And the save reads each one, rather than rendering a field that goes
    // nowhere — which is worse than no field, because it looks saved.
    for (const line of [
      "name:         box.querySelector('.sg-l-name').value.trim()",
      "phone:        box.querySelector('.sg-l-phone').value.trim()",
      "email:        box.querySelector('.sg-l-email').value.trim()",
      "company:      box.querySelector('.sg-l-company').value.trim()",
      "role:         box.querySelector('.sg-l-role').value.trim()",
      "relationship: box.querySelector('.sg-l-rel').value.trim()",
    ]) expect(ui).toContain(line);
  });

  it('keeps the process fields it already had', () => {
    // The panel gained a section; it must not have lost one.
    for (const cls of ['sg-l-via', 'sg-l-next', 'sg-l-when', 'sg-l-loc', 'sg-l-industry', 'sg-l-note']) {
      expect(ui).toContain(cls);
    }
  });

  it('is styled rather than left as bare browser inputs', () => {
    expect(css).toContain('.sg-l-who');
    expect(css).toMatch(/\.sg-l-who input\s*\{/);
  });
});

describe('the address, which is the field that can go quietly wrong', () => {
  it('is lowercased, because that is what matches a signup', () => {
    /*
     * The unique index on email is how a cold lead is matched against the User
     * who later signs up. An address stored with capitals is a lead that never
     * attributes, and nothing anywhere reports it.
     */
    expect(update).toContain('.trim().toLowerCase()');
  });

  it('is refused when it is not an address at all', () => {
    expect(update).toContain("throw new Error('That is not a valid email address.')");
  });

  it('is UNSET when cleared, never written as an empty string', () => {
    /*
     * The index is partial on { $type: 'string' }, so '' is a value: the
     * SECOND lead cleared by writing '' collides with the first. The model's
     * own comment records this having been fixed once already, which is why it
     * is pinned here rather than trusted to be remembered.
     */
    expect(update).toContain("if (clean) set.email = clean; else unset.email = '';");
    expect(update).toContain('$unset');
  });

  it('says what happened when the address is already on another lead', () => {
    // An ordinary mistake. "E11000 duplicate key error collection" is not
    // something to show somebody updating a phone number.
    expect(update).toContain('err?.code === 11000');
    expect(update).toContain('Another lead already has that email address.');
  });

  it('still refuses an update that changes nothing', () => {
    // The guard had to learn about $unset: clearing an address is a real
    // update, and before this it would have been rejected as empty.
    expect(update).toContain('if (!Object.keys(set).length && !Object.keys(unset).length)');
  });
});

describe('what the panel is for, said on the row', () => {
  it('tells the reader the contact is editable there', () => {
    // The cell was captioned as being about the route in and the next step, so
    // nobody would have clicked it to fix a phone number.
    expect(ui).toContain('Click to edit the contact, the route in, and what happens next');
  });
});
