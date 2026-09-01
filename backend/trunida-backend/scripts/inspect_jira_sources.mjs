/**
 * Diagnostic: which Jira projects do we actually hold issues from?
 *
 * The Aria screen reports "no issues" for the only project Jira lists,
 * while the pipeline demo previously pulled six tickets successfully. If
 * those tickets came from a different project key, that explains it —
 * project/search would be returning a narrower list than the data implies.
 *
 * Run from backend/trunida-backend:  node scripts/inspect_jira_sources.mjs
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import LinkedProjectDocument from '../models/LinkedProjectDocument.js';
import DefectRecord from '../models/DefectRecord.js';
import PersonalConfluenceConnection from '../models/PersonalConfluenceConnection.js';

const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
if (!uri) { console.error('No MONGO_URI in .env'); process.exit(1); }

await mongoose.connect(uri);
console.log('connected\n');

const jiraDocs = await LinkedProjectDocument.find({ sourceType: 'jira' })
  .select('sourceId projectKey title blueprintId createdAt').lean();
console.log('LinkedProjectDocument (sourceType=jira):', jiraDocs.length);
for (const d of jiraDocs) {
  console.log('   ', d.sourceId, '| projectKey:', JSON.stringify(d.projectKey), '|', (d.title || '').slice(0, 50));
}

const defects = await DefectRecord.find({ sourceIssueKey: { $ne: '' } })
  .select('defectId sourceIssueKey title createdAt').lean();
console.log('\nDefectRecord with a real Jira key:', defects.length);
for (const d of defects.slice(0, 20)) {
  console.log('   ', d.sourceIssueKey, '|', (d.title || '').slice(0, 50));
}

const keys = new Set([
  ...jiraDocs.map(d => d.projectKey).filter(Boolean),
  ...defects.map(d => String(d.sourceIssueKey || '').split('-')[0]).filter(Boolean),
]);
console.log('\nDistinct Jira project keys seen in stored data:', [...keys]);

const conns = await PersonalConfluenceConnection.find({})
  .select('userId siteName siteUrl cloudId scopes connectedAt').lean();
console.log('\nAtlassian connections:', conns.length);
for (const c of conns) {
  console.log('   user:', String(c.userId), '| site:', c.siteName, '| scopes:', (c.scopes || []).join(' '));
}

await mongoose.disconnect();
