/**
 * Svarg — capture what one model produced, so another can be compared to it
 *
 * Switching the model that writes applications is only worth doing if you can
 * tell afterwards whether it got better or worse. "It looks fine" does not
 * survive a week, and neither does memory of what the last one did.
 *
 * This records everything that would differ between two providers, for one
 * blueprint, at one moment:
 *
 *   - the provider actually in use, and the prompt it was given
 *   - every file the generation produced, with sizes and a hash
 *   - what the seeded data looks like: score spread, tiers, leakage
 *   - the delivered application's answers to a fixed set of questions
 *
 * The questions are fixed on purpose. Asking a different model different
 * things measures the questions, not the model.
 *
 *   node scripts/capture_baseline.mjs <blueprintId> <app-url> [label]
 *
 * Writes a JSON file and a readable summary beside it.
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import mongoose from 'mongoose';

const [blueprintId, appUrlRaw, label = 'baseline'] = process.argv.slice(2);
if (!blueprintId || !appUrlRaw) {
  console.error('Usage: node scripts/capture_baseline.mjs <blueprintId> <app-url> [label]');
  process.exit(2);
}
const APP = appUrlRaw.replace(/\/+$/, '');

/**
 * The same questions every time.
 *
 * Chosen so the answers are checkable against the data rather than a matter of
 * taste: counts, day-figures and named students can be right or wrong. The last
 * two have no answer in the data at all, and a model that produces one anyway
 * is telling you something more useful than the six that do.
 */
const QUESTIONS = [
  'Which students should we contact this week, and why?',
  'Who has unpaid tuition, and how far behind are they?',
  'Which students have missed the most classes in a row?',
  'Why did students leave last year?',
  'Is STU-9901 at risk of leaving?',
  'How many students do we have?',
  'Which discipline loses the most students?',
  'Should we raise our fees?',
];

const out = {
  label,
  capturedAt: new Date().toISOString(),
  blueprintId,
  appUrl: APP,
  provider: {},
  build: {},
  data: {},
  answers: [],
};

await mongoose.connect(process.env.MONGO_URI);

// ── Which model was responsible ─────────────────────────────────────────────
out.provider = {
  chain: (process.env.PROVIDER_CHAIN || '').trim(),
  eameBuildProvider: (process.env.EAME_BUILD_PROVIDER || 'gemini').trim(),
  productProvider: (process.env.PRODUCT_LLM_PROVIDER || '').trim() || null,
  geminiModel: process.env.GEMINI_MODEL || null,
  selfhostedModel: process.env.SELFHOSTED_MODEL || null,
  selfhostedBase: process.env.SELFHOSTED_BASE_URL || null,
};

// ── Everything upstream of the application ──────────────────────────────────
//
// The whole chain runs on one provider, so a worse result could come from any
// stage: a thinner blueprint from Cob, vaguer datasets from Aria, a different
// model choice on Arth, or weaker code from Eame. Recording each stage is what
// makes "it got worse" answerable rather than a shrug.
//
// Structure and titles, not full prose — the point is to see whether a stage
// produced less, or produced something different, and the JSON stays readable.
const TransformationBlueprint = (await import('../models/TransformationBlueprint.js')).default;
const LinkedProjectDocument = (await import('../models/LinkedProjectDocument.js')).default;
const bp = await TransformationBlueprint.findById(blueprintId).lean();

if (bp) {
  out.cob = {
    businessObjective: bp.businessObjective || '',
    industry: bp.industry || '',
    companyName: bp.companyName || '',
    engagement: bp.engagement || null,
    appName: bp.appName || '',
    domainCount: (bp.domains || []).length,
    domains: (bp.domains || []).map(d => ({
      domainId: d.domainId,
      status: d.status,
      capabilityCount: (d.capabilities || []).length,
      capabilities: (d.capabilities || []).map(c => ({
        title: c.title,
        sectionCount: (c.sections || []).length,
        sectionTitles: (c.sections || []).map(s => s.title),
        // Length is the crudest quality signal there is, and the most honest
        // one to compare across models without reading every word.
        chars: JSON.stringify(c.sections || []).length,
      })),
    })),
  };

  out.arth = bp.arthSelection
    ? {
        modelId: bp.arthSelection.modelId,
        displayName: bp.arthSelection.displayName,
        preference: bp.arthSelection.preference,
        rationale: bp.arthSelection.rationale || '',
      }
    : null;

  const datasets = await LinkedProjectDocument
    .find({ blueprintId, sourceType: 'synthetic' })
    .select('datasetName rawText synthetic').lean().catch(() => []);

  out.aria = {
    datasetCount: datasets.length,
    datasets: datasets.map(d => {
      const [header = '', example = ''] = String(d.rawText || '').split('\n');
      return {
        name: d.datasetName,
        rows: d.synthetic?.rowCount ?? null,
        columns: header.trim(),
        example: example.trim(),
      };
    }),
  };

  // Do the datasets describe one world? This was worth 0/47 once, and it is
  // the single number that decides whether anything built on them can work.
  const colValues = (text, name) => {
    const lines = String(text || '').split('\n').filter(Boolean);
    if (lines.length < 2) return [];
    const i = lines[0].split(',').map(h => h.trim()).indexOf(name);
    if (i < 0) return [];
    return lines.slice(1).map(l => (l.split(',')[i] || '').trim()).filter(Boolean);
  };
  const spineDoc = datasets.find(d => colValues(d.rawText, 'student_id').length)
    || datasets[0];
  const idColumn = spineDoc
    ? (String(spineDoc.rawText || '').split('\n')[0] || '').split(',')
        .map(h => h.trim()).find(h => /(^|_)id$/i.test(h) && h !== '_source')
    : null;

  if (idColumn && spineDoc) {
    const spine = new Set(colValues(spineDoc.rawText, idColumn));
    let joined = 0, total = 0;
    for (const d of datasets) {
      if (d.datasetName === spineDoc.datasetName) continue;
      const ids = colValues(d.rawText, idColumn);
      total += ids.length;
      joined += ids.filter(x => spine.has(x)).length;
    }
    out.aria.join = { column: idColumn, joined, total, spine: spine.size };
  }
}

// ── What the generation produced ────────────────────────────────────────────
const GeneratedApplication = (await import('../models/GeneratedApplication.js')).default;
const app = await GeneratedApplication.findOne({ blueprintId }).lean();

if (app) {
  const files = (app.files || []).map(f => ({
    path: f.path,
    bytes: Buffer.byteLength(f.content || '', 'utf8'),
    sha: crypto.createHash('sha256').update(f.content || '').digest('hex').slice(0, 12),
  }));
  out.build = {
    status: app.status,
    verifiedTo: app.verifiedTo,
    provider: app.provider || null,
    builtAt: app.updatedAt,
    // Attempts is the honest measure of how hard the contract was to follow.
    attempts: (app.history || []).length,
    failuresByAttempt: (app.history || []).map(h => ({
      attempt: h.attempt, stage: h.stage, failures: (h.failures || []).slice(0, 4),
    })),
    fileCount: files.length,
    files,
    // Kept whole: comparing two providers means reading their code, and a file
    // list does not tell you whether the logic is any good.
    contents: Object.fromEntries((app.files || []).map(f => [f.path, f.content])),
  };
}

// ── What the data ended up looking like ─────────────────────────────────────
// Read through the application's own API rather than the tenant database, so
// this works against any deployment without knowing its collection names.
async function api(pathname, opts) {
  const r = await fetch(APP + pathname, opts);
  const text = await r.text();
  let body = null;
  try { body = JSON.parse(text); } catch { /* leave as text */ }
  return { status: r.status, body, text };
}

const session = await api('/api/session', { method: 'POST' });
const token = session.body && session.body.token;
if (!token) {
  out.data.error = 'no session — the application would not let a visitor in';
} else {
  const auth = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };
  const root = await api('/api', { headers: auth });
  const routes = (root.body && root.body.routes) || [];
  out.data.routes = routes;

  for (const q of QUESTIONS) {
    const started = Date.now();
    const r = await api(routes[0] + '/ask', {
      method: 'POST', headers: auth, body: JSON.stringify({ message: q }),
    });
    const answer = String((r.body && r.body.answer) || r.text || '');
    const records = r.body
      ? Object.values(r.body).find(v => Array.isArray(v) && v.length && typeof v[0] === 'object')
      : null;

    out.answers.push({
      question: q,
      status: r.status,
      ms: Date.now() - started,
      chars: answer.length,
      // Recorded rather than judged. Whether markdown is a failure depends on
      // the page, and the point here is to have the evidence later.
      hasMarkdown: /^\s*#{1,6}\s/m.test(answer) || /\*\*[^*\n]+\*\*/.test(answer),
      saysSample: /sample|illustrat|not real|demonstrat/i.test(answer),
      recordCount: records ? records.length : 0,
      records: records ? records.slice(0, 12) : [],
      answer,
    });
    process.stdout.write('.');
  }

  // Score spread, from whatever the answers returned.
  const all = out.answers.flatMap(a => a.records);
  if (all.length) {
    const key = Object.keys(all[0]).find(k => /score|risk|probability/i.test(k));
    if (key) {
      const nums = all.map(r => parseFloat(String(r[key]))).filter(n => Number.isFinite(n));
      out.data.scoreField = key;
      out.data.distinctScores = new Set(nums).size;
      out.data.scoreRange = nums.length ? [Math.min(...nums), Math.max(...nums)] : null;
    }
  }
}

await mongoose.disconnect();

// ── Write it down ───────────────────────────────────────────────────────────
const dir = path.join(process.cwd(), '.baselines');
fs.mkdirSync(dir, { recursive: true });
const stem = path.join(dir, `${label}-${out.capturedAt.slice(0, 19).replace(/[:T]/g, '')}`);

fs.writeFileSync(stem + '.json', JSON.stringify(out, null, 2));

const summary = [
  `# ${label}`,
  ``,
  `Captured ${out.capturedAt}`,
  `Provider: ${out.provider.eameBuildProvider} (chain: ${out.provider.chain || 'default'})`,
  `Model: ${out.provider.selfhostedModel || out.provider.geminiModel || 'unknown'}`,
  ``,
  `## Cob — the blueprint`,
  `objective: ${out.cob?.businessObjective || '(none)'}`,
  `engagement: ${out.cob?.engagement?.category || '?'} / ${out.cob?.engagement?.maturity || '?'}`,
  `${out.cob?.domainCount ?? 0} domains`,
  ...(out.cob?.domains || []).map(d =>
    `  ${d.domainId}: ${d.capabilityCount} capabilities, `
    + `${d.capabilities.reduce((n, c) => n + c.sectionCount, 0)} sections, `
    + `${d.capabilities.reduce((n, c) => n + c.chars, 0)} chars`),
  ``,
  `## Aria — the data`,
  `${out.aria?.datasetCount ?? 0} datasets`,
  ...(out.aria?.datasets || []).map(d => `  ${d.name}: ${d.rows ?? '?'} rows — ${d.columns.slice(0, 110)}`),
  out.aria?.join
    ? `join on ${out.aria.join.column}: ${out.aria.join.joined}/${out.aria.join.total} rows reach a spine of ${out.aria.join.spine}`
    : `join: not measurable`,
  ``,
  `## Arth — the model chosen`,
  out.arth ? `${out.arth.displayName} (${out.arth.modelId}), preference ${out.arth.preference}` : '(none)',
  ``,
  `## Eame — the build`,
  `${out.build.status || 'no build'} — verified to ${out.build.verifiedTo || '?'}, ${out.build.attempts ?? '?'} attempt(s), ${out.build.fileCount ?? 0} files`,
  ...(out.build.files || []).map(f => `  ${f.path} (${f.bytes}b)`),
  ``,
  `## Data`,
  `routes: ${(out.data.routes || []).join(', ') || 'none'}`,
  `distinct scores: ${out.data.distinctScores ?? 'n/a'}${out.data.scoreRange ? ` over ${out.data.scoreRange[0]}–${out.data.scoreRange[1]}` : ''}`,
  ``,
  `## Answers`,
  ...out.answers.flatMap(a => [
    `### ${a.question}`,
    `${a.status} · ${a.ms}ms · ${a.chars} chars · ${a.recordCount} records`
      + `${a.hasMarkdown ? ' · MARKDOWN' : ''}${a.saysSample ? ' · says-sample' : ''}`,
    '',
    a.answer.slice(0, 900),
    '',
  ]),
].join('\n');

fs.writeFileSync(stem + '.md', summary);

console.log('\n\nwrote:');
console.log('  ' + stem + '.json');
console.log('  ' + stem + '.md');
console.log(`\n${out.build.status || 'no build'} · ${out.build.fileCount ?? 0} files · `
  + `${out.answers.length} questions · ${out.data.distinctScores ?? '?'} distinct scores`);
