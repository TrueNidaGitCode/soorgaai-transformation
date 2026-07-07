/**
 * SoorgaAI Business KPI Report — standalone, read-only.
 *
 * Does not touch any existing application code or routes. Reads MongoDB
 * (CompanyBlueprint, UserProfile, UserFeedback) plus manual figures from
 * ../../reports/kpi_manual_inputs.json, prints a table, and appends a
 * snapshot to ../../reports/kpi_history.csv + ../../reports/latest.json.
 *
 * KPI definitions:
 *   People Invited            — manual input (no tracking exists in-app)
 *   People Logged In          — distinct users with a UserProfile (org name
 *                               entered) who have NOT generated a completed
 *                               blueprint yet
 *   AI Strategies Generated   — distinct users with >=1 completed CompanyBlueprint
 *   High/Medium/Low-Value FB  — UserFeedback.rating counts (high/some/low)
 *   Enterprise Introductions  — manual input (no tracking exists in-app)
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

  const CompanyBlueprint = mongoose.model('CompanyBlueprint', new mongoose.Schema({}, { strict: false, timestamps: true }));
  const UserProfile      = mongoose.model('UserProfile', new mongoose.Schema({}, { strict: false, timestamps: true }));
  const UserFeedback     = mongoose.model('UserFeedback', new mongoose.Schema({}, { strict: false, timestamps: true }));

  const today = startOfToday();

  // AI Strategies Generated — distinct users with a completed blueprint
  const completedBlueprints = await CompanyBlueprint.find({ status: 'completed' }, { userId: 1, createdAt: 1 }).lean();
  const generatedUserIds = new Set(completedBlueprints.map(b => String(b.userId)));
  const generatedUserIdsToday = new Set(
    completedBlueprints.filter(b => new Date(b.createdAt) >= today).map(b => String(b.userId))
  );

  // People Logged In — UserProfile exists, but no completed blueprint yet
  const profiles = await UserProfile.find({}, { userId: 1, createdAt: 1 }).lean();
  const loggedInOnly = profiles.filter(p => !generatedUserIds.has(String(p.userId)));
  const loggedInOnlyToday = loggedInOnly.filter(p => new Date(p.createdAt) >= today);

  // Feedback
  const feedback = await UserFeedback.find({}, { rating: 1, createdAt: 1 }).lean();
  const countRating = (rating, sinceToday = false) =>
    feedback.filter(f => f.rating === rating && (!sinceToday || new Date(f.createdAt) >= today)).length;

  // Manual inputs
  const manual = JSON.parse(fs.readFileSync(MANUAL_INPUTS_PATH, 'utf8'));

  const rows = [
    { kpi: 'People Invited',           target: 50, today: manual.peopleInvited.today,          total: manual.peopleInvited.total },
    { kpi: 'People Logged In',         target: 35, today: loggedInOnlyToday.length,             total: loggedInOnly.length },
    { kpi: 'AI Strategies Generated',  target: 30, today: generatedUserIdsToday.size,           total: generatedUserIds.size },
    { kpi: 'High-Value Feedback',      target: 10, today: countRating('high', true),            total: countRating('high') },
    { kpi: 'Medium-Value Feedback',    target: 15, today: countRating('some', true),            total: countRating('some') },
    { kpi: 'Low-Value Feedback',       target: 5,  today: countRating('low', true),             total: countRating('low') },
    { kpi: 'Enterprise Introductions', target: 5,  today: manual.enterpriseIntroductions.today, total: manual.enterpriseIntroductions.total },
  ].map(r => ({ ...r, status: statusFor(r.total, r.target) }));

  // Console table
  const pad = (s, n) => String(s).padEnd(n);
  console.log(pad('KPI', 26) + pad('Target', 8) + pad('Today', 8) + pad('Total', 8) + 'Status');
  for (const r of rows) {
    console.log(pad(r.kpi, 26) + pad(r.target, 8) + pad(r.today, 8) + pad(r.total, 8) + r.status);
  }

  // Persist snapshot
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
  const runAt = new Date().toISOString();

  fs.writeFileSync(LATEST_JSON_PATH, JSON.stringify({ runAt, rows }, null, 2));

  const csvHeaderNeeded = !fs.existsSync(HISTORY_CSV_PATH);
  const csvLines = rows.map(r => `${runAt},${r.kpi},${r.target},${r.today},${r.total},${r.status}`);
  if (csvHeaderNeeded) csvLines.unshift('runAt,kpi,target,today,total,status');
  fs.appendFileSync(HISTORY_CSV_PATH, csvLines.join('\n') + '\n');

  console.log(`\nSnapshot saved: ${LATEST_JSON_PATH}`);
  console.log(`History appended: ${HISTORY_CSV_PATH}`);

  await mongoose.disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
