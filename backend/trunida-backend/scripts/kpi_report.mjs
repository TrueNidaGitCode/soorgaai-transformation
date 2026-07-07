/**
 * SoorgaAI Business KPI Report — standalone, read-only.
 *
 * Does not touch any existing application code or routes. Reads MongoDB
 * (CompanyBlueprint, TransformationBlueprint, UserProfile, UserFeedback) plus
 * manual figures from ../../reports/kpi_manual_inputs.json, prints a table,
 * and appends a snapshot to ../../reports/kpi_history.csv + ../../reports/latest.json.
 *
 * KPI definitions:
 *   People Invited            — manual input (no tracking exists in-app)
 *   People Logged In          — total distinct users with a UserProfile (org
 *                               name entered) — cumulative funnel stage, not
 *                               exclusive of users who also went on to
 *                               generate a strategy
 *   AI Strategies Generated   — distinct users with >=1 completed blueprint,
 *                               counting both CompanyBlueprint (older,
 *                               single-domain flow) and TransformationBlueprint
 *                               (newer, multi-domain flow) — the app writes to
 *                               either depending on which generation flow ran,
 *                               so both must be counted to avoid undercounting
 *   High/Medium/Low-Value FB  — UserFeedback.rating counts (high/some/low)
 *   Enterprise Introductions  — manual input (no tracking exists in-app)
 *
 * Also prints a second section: Name / Email / Organization for every user
 * counted under "AI Strategies Generated", and saves it to
 * ../../reports/generators.csv + the "generators" key in latest.json.
 *
 * Usage:
 *   MONGO_URI="mongodb+srv://..." node scripts/kpi_report.mjs
 *   (or fill MONGO_URI into backend/trunida-backend/.env — it's gitignored)
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const REPORTS_DIR = path.resolve(__dirname, '..', '..', '..', 'reports');
const MANUAL_INPUTS_PATH = path.join(REPORTS_DIR, 'kpi_manual_inputs.json');
const HISTORY_CSV_PATH   = path.join(REPORTS_DIR, 'kpi_history.csv');
const LATEST_JSON_PATH   = path.join(REPORTS_DIR, 'latest.json');
const GENERATORS_CSV_PATH = path.join(REPORTS_DIR, 'generators.csv');

const MONGO_URI = process.env.MONGO_URI;
const DB_NAME   = process.env.MONGO_DB_NAME || 'test'; // real data lives in "test", not "soorgaai"

if (!MONGO_URI) {
  console.error('MONGO_URI is not set. Pass it inline or fill it into backend/trunida-backend/.env');
  process.exit(1);
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function statusFor(total, target) {
  if (total >= target) return '✅';
  if (total > 0) return '🟨';
  return '⬜';
}

async function main() {
  await mongoose.connect(MONGO_URI, { dbName: DB_NAME });

  const CompanyBlueprint       = mongoose.model('CompanyBlueprint', new mongoose.Schema({}, { strict: false, timestamps: true }));
  const TransformationBlueprint = mongoose.model('TransformationBlueprint', new mongoose.Schema({}, { strict: false, timestamps: true }), 'transformationblueprints');
  const UserProfile           = mongoose.model('UserProfile', new mongoose.Schema({}, { strict: false, timestamps: true }));
  const UserFeedback          = mongoose.model('UserFeedback', new mongoose.Schema({}, { strict: false, timestamps: true }));
  const User                  = mongoose.model('User', new mongoose.Schema({}, { strict: false, timestamps: true }));

  const today = startOfToday();

  // AI Strategies Generated — distinct users with a completed blueprint,
  // counting across both blueprint models (see header comment above)
  const [completedCompany, completedTransformation] = await Promise.all([
    CompanyBlueprint.find({ status: 'completed' }, { userId: 1, createdAt: 1, companyName: 1 }).lean(),
    TransformationBlueprint.find({ status: 'completed' }, { userId: 1, createdAt: 1, companyName: 1 }).lean(),
  ]);
  const completedBlueprints = [...completedCompany, ...completedTransformation];
  const generatedUserIds = new Set(completedBlueprints.map(b => String(b.userId)));
  const generatedUserIdsToday = new Set(
    completedBlueprints.filter(b => new Date(b.createdAt) >= today).map(b => String(b.userId))
  );

  // companyName per user, straight from their blueprint doc(s), as a fallback
  // for when UserProfile.orgName is missing
  const companyNameByUserId = new Map();
  for (const b of [...completedCompany, ...completedTransformation]) {
    if (b.companyName && !companyNameByUserId.has(String(b.userId))) {
      companyNameByUserId.set(String(b.userId), b.companyName);
    }
  }

  // People Logged In — total distinct users with a UserProfile (cumulative,
  // includes users who also went on to generate a strategy)
  const profiles = await UserProfile.find({}, { userId: 1, createdAt: 1 }).lean();
  const loggedInToday = profiles.filter(p => new Date(p.createdAt) >= today);

  // Feedback
  const feedback = await UserFeedback.find({}, { rating: 1, createdAt: 1 }).lean();
  const countRating = (rating, sinceToday = false) =>
    feedback.filter(f => f.rating === rating && (!sinceToday || new Date(f.createdAt) >= today)).length;

  // Manual inputs
  const manual = JSON.parse(fs.readFileSync(MANUAL_INPUTS_PATH, 'utf8'));

  const rows = [
    { kpi: 'People Invited',           target: 50, today: manual.peopleInvited.today,          total: manual.peopleInvited.total },
    { kpi: 'People Logged In',         target: 35, today: loggedInToday.length,                 total: profiles.length },
    { kpi: 'AI Strategies Generated',  target: 30, today: generatedUserIdsToday.size,           total: generatedUserIds.size },
    { kpi: 'High-Value Feedback',      target: 10, today: countRating('high', true),            total: countRating('high') },
    { kpi: 'Medium-Value Feedback',    target: 15, today: countRating('some', true),            total: countRating('some') },
    { kpi: 'Low-Value Feedback',       target: 5,  today: countRating('low', true),             total: countRating('low') },
    { kpi: 'Enterprise Introductions', target: 5,  today: manual.enterpriseIntroductions.today, total: manual.enterpriseIntroductions.total },
  ].map(r => ({ ...r, status: statusFor(r.total, r.target) }));

  // Page 2 — Name / Email / Organization for everyone who generated a strategy
  const generatorUsers = await User.find(
    { _id: { $in: [...generatedUserIds] } },
    { name: 1, email: 1 }
  ).lean();
  const generatorProfiles = await UserProfile.find(
    { userId: { $in: [...generatedUserIds] } },
    { userId: 1, orgName: 1 }
  ).lean();
  const orgNameByUserId = new Map(generatorProfiles.map(p => [String(p.userId), p.orgName]));

  const generators = generatorUsers.map(u => ({
    name:         u.name || '',
    email:        u.email || '',
    organization: orgNameByUserId.get(String(u._id)) || companyNameByUserId.get(String(u._id)) || '',
  })).sort((a, b) => a.name.localeCompare(b.name));

  // Console table
  const pad = (s, n) => String(s).padEnd(n);
  console.log(pad('KPI', 26) + pad('Target', 8) + pad('Today', 8) + pad('Total', 8) + 'Status');
  for (const r of rows) {
    console.log(pad(r.kpi, 26) + pad(r.target, 8) + pad(r.today, 8) + pad(r.total, 8) + r.status);
  }

  console.log('\n--- Page 2: AI Strategy Generators ---');
  console.log(pad('Name', 22) + pad('Email', 32) + 'Organization');
  for (const g of generators) {
    console.log(pad(g.name, 22) + pad(g.email, 32) + g.organization);
  }

  // Persist snapshot
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
  const runAt = new Date().toISOString();

  fs.writeFileSync(LATEST_JSON_PATH, JSON.stringify({ runAt, rows, generators }, null, 2));

  const csvHeaderNeeded = !fs.existsSync(HISTORY_CSV_PATH);
  const csvLines = rows.map(r => `${runAt},${r.kpi},${r.target},${r.today},${r.total},${r.status}`);
  if (csvHeaderNeeded) csvLines.unshift('runAt,kpi,target,today,total,status');
  fs.appendFileSync(HISTORY_CSV_PATH, csvLines.join('\n') + '\n');

  const generatorsCsv = ['name,email,organization', ...generators.map(g => `"${g.name}","${g.email}","${g.organization}"`)];
  fs.writeFileSync(GENERATORS_CSV_PATH, generatorsCsv.join('\n') + '\n');

  console.log(`\nSnapshot saved: ${LATEST_JSON_PATH}`);
  console.log(`History appended: ${HISTORY_CSV_PATH}`);
  console.log(`Generators list saved: ${GENERATORS_CSV_PATH}`);

  await mongoose.disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
