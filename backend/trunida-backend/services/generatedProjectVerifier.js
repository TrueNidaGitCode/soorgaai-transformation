/**
 * Svarg — proving a generated project actually runs
 *
 * Eame authors the application, which means every file it delivers is a file
 * nobody has run. That is not a reason to avoid generating; it is a reason to
 * run what was generated. This is where that happens, and the promise it backs
 * is simple: **Eame never delivers a project it has not executed.**
 *
 * ── Gates, cheapest first ──────────────────────────────────────────────────
 *
 *   1  syntax           every file parses
 *   2  local imports    every relative import resolves inside the manifest
 *   3  dependencies     every bare import is declared in package.json
 *   4  install          npm install succeeds
 *   5  boot             the server starts and stays up
 *   6  smoke            an endpoint answers
 *
 * Ordered by cost and stopped at the first failure, so the error handed back to
 * the repair loop is the FIRST thing wrong rather than the loudest. A missing
 * dependency surfacing as a boot crash is a worse error message than a
 * dependency check naming the package.
 *
 * Gates 1-3 are static and free. 4-6 execute generated code, and the caller
 * decides whether to run them.
 *
 * ── The sandbox ────────────────────────────────────────────────────────────
 *
 * Gates 4-6 run LLM-authored code on Svarg's own server. The environment is
 * built from nothing: no provider keys, no Mongo URI beyond a throwaway, no
 * customer data, and a hard timeout. `process.env` is NOT inherited — a child
 * that inherits the parent environment inherits every secret in it.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { builtinModules } from 'module';
import { spawn, spawnSync } from 'child_process';

/** Node's own modules are always importable and are not dependencies. */
const BUILTINS = new Set([...builtinModules, ...builtinModules.map(m => 'node:' + m)]);

/**
 * Source with comments removed, strings left alone.
 *
 * Needed because the import patterns below are regexes over text, and prose
 * matches them: `jiraApiService.js` contains the comment
 * `indistinguishable from "no results"`, which read as an import of a package
 * called "no results" and failed the dependency gate on a project that builds
 * and runs today. A gate that rejects valid work is worse than no gate.
 *
 * Character scan rather than a regex, because a regex cannot tell `//` in a
 * comment from `//` in 'https://api.anthropic.com'.
 */
export function stripComments(source) {
  let out = '';
  let i = 0;
  const n = source.length;

  while (i < n) {
    const c = source[i];
    const next = source[i + 1];

    if (c === '/' && next === '/') {
      while (i < n && source[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && next === '*') {
      i += 2;
      while (i < n && !(source[i] === '*' && source[i + 1] === '/')) i++;
      i += 2;
      // Keep a space so `a/*x*/b` does not become `ab`.
      out += ' ';
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      const quote = c;
      out += c;
      i++;
      while (i < n) {
        // An escaped quote does not close the string, and the escape itself
        // must be copied or the next character is misread as the escape.
        if (source[i] === '\\') { out += source[i] + (source[i + 1] || ''); i += 2; continue; }
        out += source[i];
        if (source[i] === quote) { i++; break; }
        i++;
      }
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

/**
 * Every module specifier a file imports.
 *
 * Covers static import, re-export, dynamic import and require — a generated
 * file may use any of them, and a specifier missed here is a dependency that
 * escapes gate 3 and fails at install time instead, where the error names a
 * line number rather than a package.
 */
export function extractImports(rawSource) {
  const source = stripComments(rawSource);
  const specifiers = [];
  const patterns = [
    /\bfrom\s*['"]([^'"]+)['"]/g,       // import x from 'y' / export * from 'y'
    /\bimport\s*\(\s*['"]([^'"]+)['"]/g, // import('y')
    /\brequire\s*\(\s*['"]([^'"]+)['"]/g,
    /\bimport\s+['"]([^'"]+)['"]/g,      // import 'y' for side effects
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(source)) !== null) specifiers.push(m[1]);
  }

  const relative = [];
  const bare = [];
  for (const s of new Set(specifiers)) {
    // A module specifier never contains whitespace. Second line of defence
    // behind stripComments, for prose that reaches these patterns some other
    // way — a sentence in a template literal, say.
    if (!s || /\s/.test(s)) continue;
    // Nor an unresolved template placeholder. A model wrote
    // `import('${resolvedPath}')` — quotes, not backticks — and this reported
    // "${resolvedPath} is not a dependency of this project", which is true and
    // useless: it sent the repair loop after a package that never existed
    // while the actual mistake, a placeholder in a string, went unmentioned.
    if (s.includes('${')) continue;
    if (s.startsWith('.') || s.startsWith('/')) relative.push(s);
    else bare.push(s);
  }
  return { relative, bare };
}

/** The package a bare specifier belongs to — '@scope/name/sub' is '@scope/name'. */
export function packageOf(specifier) {
  const parts = specifier.split('/');
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}

const norm = (p) => p.split(path.sep).join('/').replace(/^\.\//, '');

/** Gate 2 — a relative import must land on a file that is actually shipped. */
function resolvesInManifest(fromPath, specifier, paths) {
  const base = norm(path.posix.join(path.posix.dirname(norm(fromPath)), specifier));
  // Node resolves an extensionless ESM specifier only in some configurations,
  // so all three forms are accepted here and gate 5 is what settles it.
  return paths.has(base) || paths.has(base + '.js') || paths.has(base + '/index.js');
}

/**
 * Gates 1-3. Free, and they catch the failures that generation actually makes.
 *
 * @param {{path:string, content:string}[]} files
 * @returns {{ok:boolean, stage:string, failures:string[]}}
 */
export function staticGates(files) {
  const paths = new Set(files.map(f => norm(f.path)));
  const failures = [];

  // ── 1. syntax ───────────────────────────────────────────────────────────
  // node --check needs a real file. Written under one temp dir and removed.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'svarg-syntax-'));
  try {
    for (const f of files) {
      if (!/\.(js|mjs)$/.test(f.path)) continue;
      // Written as .mjs, never .js. For a .js file Node's module detection
      // swallows an ESM syntax error and exits 0 — this gate passed every
      // broken file until that was caught. The delivered project is
      // "type": "module", so .mjs is also what these files actually are.
      const tmp = path.join(dir, norm(f.path).replace(/\//g, '__').replace(/\.js$/, '.mjs'));
      fs.writeFileSync(tmp, f.content);
      const r = spawnSync(process.execPath, ['--check', tmp], { encoding: 'utf8' });
      if (r.status !== 0) {
        // The sandbox path is noise, and worse than noise when this text is
        // handed back to the model to repair: it names a file that does not
        // exist in the project it is being asked to fix.
        const detail = String(r.stderr || '')
          .split('\n').filter(Boolean).slice(0, 3).join(' ')
          .split(tmp).join(f.path)
          .split(dir).join('');
        failures.push(`${f.path}: does not parse — ${detail}`);
      }
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  if (failures.length) return { ok: false, stage: 'syntax', failures };

  // ── 2. local imports ────────────────────────────────────────────────────
  for (const f of files) {
    if (!/\.(js|mjs)$/.test(f.path)) continue;
    for (const spec of extractImports(f.content).relative) {
      if (!resolvesInManifest(f.path, spec, paths)) {
        failures.push(`${f.path}: imports "${spec}", which is not in the project`);
      }
    }
  }
  if (failures.length) return { ok: false, stage: 'local-imports', failures };

  // ── 3. dependencies ─────────────────────────────────────────────────────
  const pkgFile = files.find(f => norm(f.path) === 'package.json');
  if (!pkgFile) return { ok: false, stage: 'dependencies', failures: ['package.json is missing'] };

  let declared;
  try {
    const pkg = JSON.parse(pkgFile.content);
    declared = new Set(Object.keys({ ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) }));
  } catch (err) {
    return { ok: false, stage: 'dependencies', failures: ['package.json is not valid JSON — ' + err.message] };
  }

  for (const f of files) {
    if (!/\.(js|mjs)$/.test(f.path)) continue;
    for (const spec of extractImports(f.content).bare) {
      const pkg = packageOf(spec);
      if (BUILTINS.has(pkg) || BUILTINS.has(spec) || declared.has(pkg)) continue;
      failures.push(`${f.path}: imports "${pkg}", which is not a dependency of this project`);
    }
  }
  if (failures.length) return { ok: false, stage: 'dependencies', failures };

  return { ok: true, stage: 'static', failures: [] };
}

/** Write a manifest into a directory, creating parents. */
function writeProject(files, dir) {
  for (const f of files) {
    const full = path.join(dir, norm(f.path));
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, f.content);
  }
}

/**
 * Gates 4-6. Executes the generated project.
 *
 * @param {object} opts
 * @param {string} [opts.mongoUri]  A throwaway database. Without one, boot is
 *   skipped rather than pretended: server.js requires MONGO_URI, so "it did not
 *   start" would say nothing about the generated code.
 * @param {string} [opts.smokePath] A GET path expected to answer.
 * @param {number} [opts.timeoutMs]
 */
export async function runtimeGates(files, { mongoUri = '', smokePath = '/api', timeoutMs = 120000 } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'svarg-build-'));

  /**
   * Best effort, and never fatal.
   *
   * A killed child does not release its file handles instantly on Windows, so
   * the first rmSync fails with EBUSY — which, thrown from a finally block,
   * replaced the verdict with a housekeeping error and lost the result of the
   * whole run. A sandbox that could not be tidied is a warning; a sandbox
   * whose result was discarded is a bug.
   */
  const cleanup = async () => {
    for (let attempt = 0; attempt < 5; attempt++) {
      try { fs.rmSync(dir, { recursive: true, force: true }); return true; }
      catch { await new Promise(r => setTimeout(r, 300)); }
    }
    console.warn('[verifier] could not remove sandbox ' + dir);
    return false;
  };

  try {
    writeProject(files, dir);

    // ── 4. install ────────────────────────────────────────────────────────
    const install = spawnSync('npm', ['install', '--omit=dev', '--no-audit', '--no-fund'], {
      cwd: dir, encoding: 'utf8', timeout: timeoutMs, shell: process.platform === 'win32',
    });
    if (install.status !== 0) {
      const detail = String(install.stderr || install.stdout || '').split('\n')
        .filter(l => /error|ERR!/i.test(l)).slice(0, 4).join(' ');
      return { ok: false, stage: 'install', failures: ['npm install failed — ' + (detail || 'no output')] };
    }

    if (!mongoUri) {
      return { ok: true, stage: 'install', skipped: ['boot', 'smoke'],
               failures: [], note: 'No throwaway database was supplied, so boot and smoke were not run.' };
    }

    // ── 5. boot ───────────────────────────────────────────────────────────
    const port = 3000 + Math.floor(Math.random() * 2000);
    const child = spawn(process.execPath, ['server.js'], {
      cwd: dir,
      // Built from nothing. A child inheriting process.env inherits every
      // provider key this server holds, handed to code a model wrote.
      env: {
        PATH: process.env.PATH,
        NODE_ENV: 'test',
        PORT: String(port),
        MONGO_URI: mongoUri,
        JWT_SECRET: 'sandbox-only-not-a-real-secret',
        APP_NAME: 'Verification build',
        APP_PUBLIC_ACCESS: 'true',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let output = '';
    child.stdout.on('data', d => { output += d; });
    child.stderr.on('data', d => { output += d; });

    const started = await new Promise((resolve) => {
      const deadline = setTimeout(() => resolve(false), Math.min(timeoutMs, 45000));
      const poll = setInterval(async () => {
        try {
          const res = await fetch(`http://127.0.0.1:${port}${smokePath}`);
          if (res.status < 500) { clearInterval(poll); clearTimeout(deadline); resolve(res); }
        } catch { /* not up yet */ }
      }, 500);
      child.on('exit', () => { clearInterval(poll); clearTimeout(deadline); resolve(false); });
    });

    // Wait for it to actually go. kill() returns before the process has
    // exited, and on Windows its handles keep the sandbox directory locked.
    await new Promise((resolve) => {
      if (child.exitCode !== null || child.signalCode !== null) return resolve();
      const give = setTimeout(resolve, 5000);
      child.on('exit', () => { clearTimeout(give); resolve(); });
      child.kill('SIGKILL');
    });

    if (!started) {
      const detail = output.split('\n').filter(Boolean).slice(-6).join(' ');
      return { ok: false, stage: 'boot', failures: ['the server did not start — ' + (detail || 'no output')] };
    }

    // ── 6. smoke ──────────────────────────────────────────────────────────
    if (started.status >= 400) {
      return { ok: false, stage: 'smoke',
               failures: [`${smokePath} answered ${started.status}`] };
    }

    return { ok: true, stage: 'smoke', failures: [] };
  } catch (err) {
    return { ok: false, stage: 'sandbox', failures: ['the sandbox itself failed — ' + err.message] };
  } finally {
    await cleanup();
  }
}

/** Static gates, then runtime gates if those pass. */
export async function verifyProject(files, opts = {}) {
  const stat = staticGates(files);
  if (!stat.ok) return stat;
  if (opts.staticOnly) return stat;
  return runtimeGates(files, opts);
}
