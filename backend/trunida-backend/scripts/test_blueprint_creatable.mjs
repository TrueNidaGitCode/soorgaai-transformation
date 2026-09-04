/**
 * Can a brand-new blueprint actually be created?
 *
 * Between 2026-09-01 and 2026-09-04 it could not: arthSelection.preference
 * defaulted to null against an enum that did not permit null, so Mongoose
 * rejected every new document on save. Nothing caught it, because all work
 * in that window used blueprints created earlier — the product looked fine
 * while its front door was shut.
 *
 * This validates a document with the same shape the controller builds, and
 * separately asserts that no enum anywhere defaults to a value it forbids.
 *
 *   node scripts/test_blueprint_creatable.mjs
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import TransformationBlueprint from '../models/TransformationBlueprint.js';
import { enabledDomains } from '../config/domainRegistry.js';
import { getDomainCapabilities } from '../services/strategyCanvasService.js';

let pass = true;
const check = (l, ok, d = '') => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${l}${d ? ' — ' + d : ''}`); if (!ok) pass = false; };

console.log('1. a new blueprint validates with nothing but defaults');
{
  const doc = new TransformationBlueprint({
    userId: new mongoose.Types.ObjectId(),
    businessObjective: 'A representative objective, long enough to be real.',
    industry: 'General',
    companyName: 'Test Co',
    domains: enabledDomains().map(d => ({
      domainId: d.id,
      domainName: d.name,
      status: 'pending',
      capabilities: getDomainCapabilities(d.kbPath).map(c => ({
        capabilityId: c.id, capabilityName: c.name, status: 'pending', sections: [],
      })),
    })),
  });

  try {
    await doc.validate();
    check('validates', true);
  } catch (err) {
    const paths = Object.keys(err.errors || {});
    check('validates', false, paths.join(', ') || err.message);
    paths.forEach(p => console.log(`        ${p}: ${err.errors[p].message}`));
  }
}

console.log('\n2. no enum defaults to a value it forbids');
{
  // The general form of the bug. Walking the compiled schema catches it in
  // any model, including ones added later.
  const offenders = [];
  for (const name of mongoose.modelNames()) {
    const schema = mongoose.model(name).schema;
    schema.eachPath((path, type) => {
      const allowed = type.enumValues || type.options?.enum;
      if (!Array.isArray(allowed) || !allowed.length) return;
      const dflt = type.options?.default;
      if (dflt === undefined) return;                 // absent is always fine
      if (typeof dflt === 'function') return;         // computed — cannot judge statically
      if (!allowed.includes(dflt)) offenders.push(`${name}.${path} defaults to ${JSON.stringify(dflt)}`);
    });
  }
  check('none found', offenders.length === 0, offenders.join('; '));
}

console.log(pass ? '\nPASS — blueprint creation works' : '\nFAILED');
process.exit(pass ? 0 : 1);
