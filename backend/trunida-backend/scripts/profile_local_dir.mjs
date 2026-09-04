/**
 * Profile a directory on disk, the way Aria profiles a connected repository.
 *
 * Same selection, redaction, profiling and dataset matching as
 * analyzeRepository — only the reader differs: the filesystem instead of the
 * GitHub API. That means the interesting half can be exercised with no GitHub
 * App, no blueprint, and no generation run.
 *
 * Nothing is written to the database. This reads and prints.
 *
 *   node scripts/profile_local_dir.mjs <dir> ["Dataset One" "Dataset Two" ...]
 *
 * Examples:
 *   node scripts/profile_local_dir.mjs ..
 *   node scripts/profile_local_dir.mjs C:/code/their-app "Class Attendance Logs" "Billing Records"
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { selectFiles, deriveProfile, matchDatasets } from '../services/codebaseProfileService.js';
import { regexRedact } from '../services/jiraContentService.js';
import { productProviderName } from '../services/productLlm.js';

const root = process.argv[2];
if (!root || !fs.existsSync(root)) {
  console.error('usage: node scripts/profile_local_dir.mjs <dir> ["Dataset One" ...]');
  process.exit(1);
}
const datasetNames = process.argv.slice(3);

/** Same shape getRepoTree returns: every file, with its size. */
function walk(dir, base = '') {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    // Cheap prune so a node_modules tree is never even walked. selectFiles
    // would reject these anyway; not descending saves the time.
    if (entry.isDirectory()) {
      if (['node_modules', '.git', 'dist', 'build', 'vendor', '.next', 'coverage'].includes(entry.name)) continue;
      out.push(...walk(path.join(dir, entry.name), base ? `${base}/${entry.name}` : entry.name));
    } else {
      const rel = base ? `${base}/${entry.name}` : entry.name;
      let bytes = 0;
      try { bytes = fs.statSync(path.join(dir, entry.name)).size; } catch { continue; }
      out.push({ path: rel, bytes });
    }
  }
  return out;
}

console.log(`directory : ${path.resolve(root)}`);
console.log(`provider  : ${productProviderName() || '(default chain)'}`);
console.log(`model     : ${process.env.SELFHOSTED_MODEL || '(provider default)'}`);

const tree = walk(root);
const { selected, capped } = selectFiles(tree);
console.log(`\nfiles in tree: ${tree.length} → selected ${selected.length}${capped ? ' (partial — budgets hit)' : ''}\n`);
for (const f of selected) console.log(`  [${f.category.padEnd(9)}] ${f.path}`);

const files = [];
for (const f of selected) {
  try {
    const raw = fs.readFileSync(path.join(root, f.path), 'utf8');
    if (raw.includes(String.fromCharCode(0))) continue;
    const { redactedText } = regexRedact(raw);
    files.push({ path: f.path, category: f.category, content: redactedText });
  } catch { /* unreadable — a partial profile is still worth having */ }
}

console.log(`\nreading ${files.length} file(s) and profiling — this takes a while on a local model…\n`);
const t0 = Date.now();
const profile = await deriveProfile(files);
console.log(`profile in ${((Date.now() - t0) / 1000).toFixed(1)}s — ok: ${profile.ok}`);
console.log(`  languages : ${profile.languages.join(', ') || '(none)'}`);
console.log(`  frameworks: ${profile.frameworks.join(', ') || '(none)'}`);
console.log(`  database  : ${profile.database || '(none)'}`);
console.log(`  summary   : ${profile.summary || '(none)'}`);
console.log(`  entities  : ${profile.entities.length}`);
for (const e of profile.entities) {
  // The file path is the evidence. If it does not exist on disk, the
  // verification in deriveProfile has a hole in it.
  const exists = fs.existsSync(path.join(root, e.definedIn));
  console.log(`    ${exists ? ' ' : '!'} ${e.name}  ←  ${e.definedIn}${exists ? '' : '   <-- CITED FILE DOES NOT EXIST'}`);
}

if (datasetNames.length) {
  const datasets = datasetNames.map(name => ({ name, purpose: '' }));
  const t1 = Date.now();
  const matches = await matchDatasets(datasets, profile.entities);
  console.log(`\nmatched in ${((Date.now() - t1) / 1000).toFixed(1)}s — ${matches.length} of ${datasets.length}`);
  for (const m of matches) console.log(`  ${m.dataset}  →  ${m.entity} (${m.definedIn})  conf ${m.confidence}`);
  const unmatched = datasetNames.filter(n => !matches.some(m => m.dataset === n));
  if (unmatched.length) console.log(`  not found in this codebase: ${unmatched.join(', ')}`);
} else {
  console.log('\n(pass dataset names as extra arguments to test matching)');
}
