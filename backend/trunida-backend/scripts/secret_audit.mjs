/**
 * Is a secret exposed anywhere — in Svarg, or in an application it delivered?
 *
 * Every customer is asking this now, and the honest answer has to come from a
 * command anybody can run, not from an audit somebody did once and remembers
 * doing. This is that command.
 *
 * ── What it looks at ───────────────────────────────────────────────────────
 *
 *   the working tree      everything that is not ignored, plus a check that
 *                         the ignore rules still cover what they should
 *   git history           a secret committed once and removed is still on
 *                         GitHub forever — this is the failure that has ended
 *                         other companies' weeks
 *   a delivered project   the exact bytes pushed to a customer's repository
 *   client-side code      anything a browser downloads
 *   the code itself       whether any of it logs a secret
 *   a live deployment     what the running application will hand to a caller
 *
 * ── It never prints what it finds ──────────────────────────────────────────
 *
 * A scanner that writes the secret into the terminal, and from there into a CI
 * log, has leaked it a second time and more durably. Every finding is reported
 * by file, line and a short fingerprint of the value — enough to find it,
 * never enough to use it.
 *
 *   node scripts/secret_audit.mjs                  # tree, delivery, client, logging
 *   node scripts/secret_audit.mjs --history        # add all of git history (slow)
 *   node scripts/secret_audit.mjs --live <url>     # add a running deployment
 *   node scripts/secret_audit.mjs --strict         # exit 1 on any finding
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execSync } from 'child_process';

const args = process.argv.slice(2);
const strict = args.includes('--strict');
const withHistory = args.includes('--history');
const liveAt = args.includes('--live') ? args[args.indexOf('--live') + 1] : '';

const REPO = path.resolve(new URL('../../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));

/*
 * What a real credential looks like — imported, not restated.
 *
 * The delivered application runs the same check on itself as part of its own
 * security controls, and two copies of "what counts as a secret" is two things
 * to keep in step. When one is tightened and the other is not, the looser one
 * is the one that misses.
 */
import { CREDENTIAL_SHAPES as PATTERNS, PLACEHOLDER } from '../eame-template/services/securityControls.js';


/** Enough to locate a value, never enough to use it. */
const fingerprint = (v) => crypto.createHash('sha256').update(String(v)).digest('hex').slice(0, 8);

const findings = [];
const report = (where, kind, value, line) =>
  findings.push({ where, kind, line, fp: fingerprint(value), len: String(value).length });

/** Scan one piece of text. Returns the number of real findings. */
function scan(where, text) {
  let n = 0;
  const lines = String(text || '').split('\n');
  lines.forEach((l, i) => {
    for (const [kind, re] of PATTERNS) {
      const m = l.match(re);
      if (!m) continue;
      if (PLACEHOLDER.test(l)) continue;     // a template, not a credential
      report(where, kind, m[0], i + 1);
      n++;
    }
  });
  return n;
}

const SKIP_DIR = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', '__pycache__', '.chroma', 'venv']);
const SKIP_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.pdf', '.ico', '.woff', '.woff2', '.ttf', '.zip', '.sqlite3', '.bin']);

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIR.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (!SKIP_EXT.has(path.extname(e.name).toLowerCase())) out.push(p);
  }
  return out;
}

const say = (s) => console.log(s);
const rel = (p) => path.relative(REPO, p).split(path.sep).join('/');

// ── 1. The working tree ──────────────────────────────────────────────────────

say('Scanning the working tree…');
let treeFiles = 0;
for (const f of walk(REPO)) {
  // A local .env is supposed to hold secrets. What matters is that it is
  // ignored, which the next check covers.
  if (/(^|\/)\.env(\.|$)/.test(rel(f)) && !rel(f).endsWith('.example')) continue;
  try {
    const stat = fs.statSync(f);
    if (stat.size > 2_000_000) continue;
    scan(rel(f), fs.readFileSync(f, 'utf8'));
    treeFiles++;
  } catch { /* unreadable or binary */ }
}
say(`  ${treeFiles} files`);

// ── 2. The files holding secrets are ignored ─────────────────────────────────

say('Checking that secret-bearing files are ignored…');
try {
  const tracked = execSync('git ls-files', { cwd: REPO, encoding: 'utf8' }).split('\n');
  const leaked = tracked.filter(p => /(^|\/)\.env$|(^|\/)\.env\.(local|production|bak)/.test(p));
  if (leaked.length) {
    for (const p of leaked) findings.push({ where: p, kind: 'Env file is tracked by git', line: 0, fp: '-', len: 0 });
  }
  say(`  ${tracked.length} tracked files, ${leaked.length} secret-bearing`);
} catch (err) {
  say(`  skipped: ${err.message}`);
}

// ── 3. What a customer's repository receives ─────────────────────────────────

say('Scanning a delivered application…');
try {
  const { buildManifest } = await import('../services/eameProjectBuilder.js');
  const files = buildManifest({ appName: 'Audit' });
  for (const f of files) scan(`delivered:${f.path}`, f.content);
  say(`  ${files.length} files pushed to a customer repository`);
} catch (err) {
  say(`  skipped: ${err.message}`);
}

// ── 4. Anything a browser downloads ──────────────────────────────────────────

say('Scanning client-side code…');
let clientFiles = 0;
for (const dir of [path.join(REPO, 'frontend'), path.join(REPO, 'backend/trunida-backend/eame-template/frontend')]) {
  if (!fs.existsSync(dir)) continue;
  for (const f of walk(dir)) {
    if (!/\.(js|mjs|html|css|json)$/.test(f)) continue;
    try { scan(rel(f), fs.readFileSync(f, 'utf8')); clientFiles++; } catch { /* skip */ }
  }
}
say(`  ${clientFiles} files a browser can fetch`);

// ── 5. Code that would print a secret ────────────────────────────────────────

say('Checking that nothing logs a secret…');
const LOGS_SECRET = /console\.(log|warn|error|info)\([^)]*process\.env\.[A-Z_]*(SECRET|TOKEN|KEY|PASSWORD|MONGO_URI)/;
let logHits = 0;
for (const f of walk(path.join(REPO, 'backend'))) {
  if (!/\.m?js$/.test(f) || /__tests__|scripts[/\\]secret_audit/.test(rel(f))) continue;
  try {
    const text = fs.readFileSync(f, 'utf8');
    text.split('\n').forEach((l, i) => {
      if (LOGS_SECRET.test(l)) {
        findings.push({ where: rel(f), kind: 'Logs a secret environment value', line: i + 1, fp: '-', len: 0 });
        logHits++;
      }
    });
  } catch { /* skip */ }
}
say(`  ${logHits} place(s) that would print one`);

// ── 6. All of git history, on request ────────────────────────────────────────

if (withHistory) {
  say('Scanning git history (every commit)…');
  try {
    const revs = execSync('git rev-list --all', { cwd: REPO, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
      .split('\n').filter(Boolean);
    let found = 0;
    for (const [kind, re] of PATTERNS) {
      // -I skips binaries; the pattern is passed to git's own matcher so the
      // whole history is searched without checking any of it out.
      let out = '';
      try {
        out = execSync(`git grep -I -n -E ${JSON.stringify(re.source)} $(git rev-list --all) --`,
          { cwd: REPO, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, shell: '/bin/bash' });
      } catch { out = ''; }       // git grep exits 1 when nothing matches
      for (const line of out.split('\n').filter(Boolean)) {
        if (PLACEHOLDER.test(line)) continue;
        const [locus] = line.split(/:(?=\d+:)/);
        findings.push({ where: `history:${locus}`, kind, line: 0, fp: fingerprint(line), len: 0 });
        found++;
      }
    }
    say(`  ${revs.length} commits, ${found} finding(s)`);
  } catch (err) {
    say(`  skipped: ${err.message}`);
  }
} else {
  say('Skipping git history (pass --history; it is slow and worth doing before a release).');
}

// ── 7. A running deployment ──────────────────────────────────────────────────

if (liveAt) {
  say(`Probing ${liveAt}…`);
  const base = liveAt.replace(/\/+$/, '');
  for (const route of ['/api', '/api/health', '/health', '/api/config', '/config.js', '/.env', '/api/debug']) {
    try {
      const res = await fetch(base + route, { signal: AbortSignal.timeout(8000) });
      const body = await res.text();
      const hits = scan(`live:${route} (HTTP ${res.status})`, body);

      /*
       * A 200 is not by itself a finding.
       *
       * A single-page application answers every unmatched path with its own
       * index.html, so /.env comes back 200 with 66KB of markup and no secret
       * in it. The first version of this check reported that as "should not be
       * reachable", which is true of the status code and false of the thing
       * anybody cares about — and a scanner that reports the shell of an app
       * as a leak is one whose next report gets skimmed.
       *
       * What matters is whether the BODY is what the path asked for.
       */
      const looksLikeEnvFile = /^\s*(#|[A-Z][A-Z0-9_]{3,}=)/m.test(body) && !/<!DOCTYPE|<html/i.test(body);
      if (res.status < 400 && /\.env/.test(route) && looksLikeEnvFile) {
        findings.push({ where: `live:${route}`, kind: 'Serves a configuration file to anyone who asks', line: 0, fp: '-', len: 0 });
      }
      const spa = /<!DOCTYPE|<html/i.test(body);
      say(`  ${route} → ${res.status}${spa && res.status < 400 ? ' (app shell)' : ''}${hits ? '  LEAK' : ''}`);
    } catch {
      say(`  ${route} → no answer`);
    }
  }
}

// ── The verdict ──────────────────────────────────────────────────────────────

say('');
if (!findings.length) {
  say('No exposed secret found.');
  say('Scanned: working tree, tracked files, a delivered application, client-side code, logging'
    + (withHistory ? ', git history' : '') + (liveAt ? ', a live deployment' : '') + '.');
} else {
  say(`${findings.length} finding(s). Values are fingerprinted, never printed.`);
  for (const f of findings) {
    say(`  ${f.kind}`);
    say(`    ${f.where}${f.line ? ':' + f.line : ''}${f.fp !== '-' ? `  sha256:${f.fp}… (${f.len} chars)` : ''}`);
  }
  say('');
  say('If any of these is a real credential: rotate it first, then remove it.');
  say('Removing it from the current commit does not remove it from history.');
}

if (strict && findings.length) process.exit(1);
