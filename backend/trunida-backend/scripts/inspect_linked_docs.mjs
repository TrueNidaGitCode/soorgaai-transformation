/**
 * Diagnostic: why does the Structured column read "Pending" for Jira?
 *
 * "Structured" counts documents whose extraction produced usable output.
 * This prints what each linked document actually stored, so we can see
 * whether classification returned nothing, or whether the column's
 * definition is simply too strict for Jira's shape.
 *
 * Run from backend/trunida-backend: node scripts/inspect_linked_docs.mjs
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import LinkedProjectDocument from '../models/LinkedProjectDocument.js';

await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);

const docs = await LinkedProjectDocument.find({})
  .select('sourceType sourceId title keywords summary rawText extractionStatus redactionApplied redactionCount updatedAt')
  .sort({ updatedAt: -1 })
  .lean();

console.log('linked documents:', docs.length, '\n');

for (const d of docs) {
  console.log(`[${d.sourceType || 'confluence'}] ${d.sourceId} — ${(d.title || '').slice(0, 44)}`);
  console.log(`    extractionStatus : ${d.extractionStatus}`);
  console.log(`    keywords         : ${(d.keywords || []).length} ${JSON.stringify((d.keywords || []).slice(0, 5))}`);
  console.log(`    summary          : ${d.summary ? JSON.stringify(d.summary.slice(0, 60)) : '(empty)'}`);
  console.log(`    rawText length   : ${(d.rawText || '').length}`);
  console.log(`    redaction        : applied=${d.redactionApplied} count=${d.redactionCount}`);
  console.log(`    updated          : ${d.updatedAt}`);
}

const jira = docs.filter(d => d.sourceType === 'jira');
const conf = docs.filter(d => (d.sourceType || 'confluence') === 'confluence');
const structured = ds => ds.filter(d => d.extractionStatus === 'extracted' && (d.keywords || []).length).length;
console.log('\n--- summary ---');
console.log(`confluence: ${conf.length} docs, ${structured(conf)} with keywords`);
console.log(`jira      : ${jira.length} docs, ${structured(jira)} with keywords`);
console.log(`jira docs with empty rawText: ${jira.filter(d => !(d.rawText || '').trim()).length}`);

await mongoose.disconnect();
