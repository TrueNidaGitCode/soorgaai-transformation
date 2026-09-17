/** What became of each opportunity on one blueprint, and across an industry. */
import 'dotenv/config';
import mongoose from 'mongoose';
await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);
const { opportunityLedger, opportunityHistory, historyText } = await import('../services/opportunityGraph.js');
const { default: BP } = await import('../models/TransformationBlueprint.js');

const id = process.argv[2];
if (id) {
  const bp = await BP.findById(id).select('appName industry industryFit').lean();
  console.log(`${bp?.appName || id}  (${bp?.industryFit?.matched ? bp.industryFit.industry : 'industry not matched'})\n`);
  for (const o of await opportunityLedger(id)) {
    const marks = [
      o.recommended ? 'recommended' : '',
      o.built ? 'BUILT' : 'not built',
      o.quadrant,
      o.askedForLater ? `asked again (${o.askedAs[0] || ''})` : '',
      o.used ? `${o.queries} queries` : 'never queried',
    ].filter(Boolean).join(' · ');
    console.log(`  ${o.plain}\n      ${o.name}\n      ${marks}`);
  }
  const industry = bp?.industryFit?.matched ? bp.industryFit.industry : "";
  if (industry) {
    const rows = await opportunityHistory({ industry, exceptBlueprintId: id });
    console.log(`\n--- what Cob would be told about ${industry} ---`);
    console.log(historyText(rows) || `(nothing yet — ${rows.length} opportunity/ies seen, needs 2+ businesses naming the same one)`);
  }
} else {
  const all = await BP.find({ 'domains.domainId': 'ai-use-cases' }).select('_id appName industryFit').lean();
  for (const b of all) console.log(`${String(b._id)}  ${(b.industryFit?.matched ? b.industryFit.industry : '-').padEnd(14)} ${b.appName || '(unnamed)'}`);
}
await mongoose.disconnect();
