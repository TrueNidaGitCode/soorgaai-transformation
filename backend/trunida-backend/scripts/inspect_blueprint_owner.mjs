/**
 * Diagnostic: does the user hitting Aria own the Atlassian connection that
 * can actually see the KAN issues?
 *
 * Jira's JQL silently returns an EMPTY result set for issues the token's
 * account cannot browse — it does not error. So a second Atlassian account
 * on the same site, without browse permission on KAN, would produce exactly
 * the reported symptom: project/search lists KAN, search/jql returns none.
 *
 * Run from backend/trunida-backend:
 *   node scripts/inspect_blueprint_owner.mjs <blueprintId>
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import TransformationBlueprint from '../models/TransformationBlueprint.js';
import PersonalConfluenceConnection from '../models/PersonalConfluenceConnection.js';
import DefectRecord from '../models/DefectRecord.js';

const blueprintId = process.argv[2];
const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
await mongoose.connect(uri);

if (blueprintId) {
  const bp = await TransformationBlueprint.findById(blueprintId)
    .select('userId businessObjective createdAt companyName').lean();
  if (!bp) {
    console.log('blueprint not found:', blueprintId);
  } else {
    console.log('blueprint', blueprintId);
    console.log('  owner userId :', String(bp.userId));
    console.log('  objective    :', (bp.businessObjective || '').slice(0, 70));
    const conn = await PersonalConfluenceConnection.findOne({ userId: bp.userId })
      .select('siteName cloudId scopes connectedAt').lean();
    console.log('  owner has connection:', !!conn);
    if (conn) {
      console.log('    site   :', conn.siteName);
      console.log('    cloudId:', conn.cloudId);
      console.log('    scopes :', (conn.scopes || []).join(' '));
      console.log('    since  :', conn.connectedAt);
    }
  }
  console.log('');
}

console.log('ALL Atlassian connections (cloudId tells us if they are the same site):');
const conns = await PersonalConfluenceConnection.find({})
  .select('userId siteName cloudId scopes connectedAt').lean();
for (const c of conns) {
  console.log('  user', String(c.userId), '| site', c.siteName, '| cloudId', c.cloudId, '| since', c.connectedAt);
}

// Who linked the KAN defects, and when?
const kan = await DefectRecord.find({ sourceIssueKey: /^KAN-/ })
  .select('sourceIssueKey createdAt updatedAt').lean();
console.log('\nKAN DefectRecords:', kan.length, kan.length ? '(created ' + kan[0].createdAt + ')' : '');

await mongoose.disconnect();
