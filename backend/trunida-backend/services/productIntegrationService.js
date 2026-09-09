/**
 * Svarg — fitting the generated application into the customer's own product
 *
 * The standalone delivery is a complete Node application with its own runtime,
 * its own database and its own chat shell. It proves the idea works. It is also
 * the thing an enterprise buyer objects to, because it does not touch anything
 * they already run.
 *
 * This produces the other artefact: the same capability rewritten to live
 * INSIDE their codebase — their framework, their models, their database access,
 * their naming — as files they can drop into their repository.
 *
 * ── It never replaces the standalone build ─────────────────────────────────
 *
 * Both are kept. The standalone one is what Yusu deploys and what a demo runs
 * on; this one is a separate artefact on the same blueprint. A customer who
 * asks for the integration and dislikes it still has a working application.
 *
 * ── What it will not do ────────────────────────────────────────────────────
 *
 * It does not push to the customer's repository and it does not deploy their
 * product. Svarg's GitHub App is read-only by design, and pushing to customer
 * accounts was deliberately removed earlier as an operational burden. Writing
 * to someone's main branch and redeploying their live product on the strength
 * of a generated diff is also the wrong default at any level of confidence.
 *
 * So the output is code plus an integration guide, verified the same way the
 * standalone build is, for a human to open as a pull request. That is the
 * honest boundary: Svarg writes the integration, their CI decides to ship it.
 *
 * ── Where the intelligence comes from ──────────────────────────────────────
 *
 * Three grounded inputs, none of them guesses:
 *   - codebaseProfile   their languages, frameworks, database and real entities
 *   - retrieveCode      the actual source of the files this feature must touch
 *   - the built app     the working implementation being translated
 *
 * A model asked to "integrate this" with none of those invents a plausible
 * architecture and produces a patch that fits nobody's repository.
 */

import GeneratedApplication from '../models/GeneratedApplication.js';
import TransformationBlueprint from '../models/TransformationBlueprint.js';
import { retrieveCode } from './codebaseProfileService.js';
import CustomerCodeChunk from '../models/CustomerCodeChunk.js';
import { extractImports, packageOf, resolvesInManifest } from './generatedProjectVerifier.js';
import { readTree, readFile, resolveRepoAccess } from './githubReadService.js';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import { generate } from './llmService.js';

/** Their code, retrieved for grounding — enough to see conventions, not the repo. */
const CONTEXT_CHUNKS = 8;
const CHUNK_CHARS = 1800;

/** The app's own files, as the thing being translated. */
const SOURCE_FILE_CHARS = 3000;

export class IntegrationError extends Error {
  constructor(message) { super(message); this.name = 'IntegrationError'; this.status = 400; }
}

const SYSTEM_PROMPT =
`You port a working AI feature into an existing codebase.

You are given a standalone implementation that already works, and the real
architecture of the codebase it must move into. Your job is translation, not
invention: the same behaviour, expressed the way THIS codebase expresses things.

WHAT MATTERS, IN ORDER

1. Their architecture wins. Their framework, their folder layout, their module
   system, their database access, their error handling, their naming. If they
   use Mongoose models in models/ and route handlers in routes/, so do you. If
   the standalone version disagrees with them, the standalone version is wrong.

2. Use their entities. You are told the entities that already exist and the
   files defining them. Reuse them by their real names and real fields. Do NOT
   create a parallel model for data they already store — that is the single
   most damaging thing you can do here, because it silently splits their data.

3. Change as little as possible. Add files. Touch existing ones only where a
   route must be registered or a model imported, and say exactly which line.
   A large diff will not be reviewed, and an unreviewed diff will not be merged.

4. Do not rebuild what they already have. A working codebase already has
   authentication, configuration loading, error handling, logging and very
   often a model client. Import theirs. Writing your own authMiddleware or
   llmService beside theirs is not integration — it is a second application
   living in their repository, which is the thing this exists to avoid. If you
   need something you cannot see, say so in the guide and import the name you
   expect rather than inventing an implementation.

5. Nothing secret, nothing hardcoded. Read configuration from their existing
   environment convention. Never inline a key, a URI or a model name.

OUTPUT

The guide comes FIRST, before any file:

=== GUIDE ===
- Where each new file goes and why
- Every existing file that must change, with the exact edit
- Any environment variable they must set
- Anything of theirs you expected to import but could not see
- What you assumed, and what a reviewer should check first
=== END GUIDE ===

Then the files:

=== FILE: relative/path.js ===
<complete file content>
=== END FILE ===

The guide is first because it is the part a reviewer reads before anything
else, and because if this response is ever cut short the instructions must
survive and a file be lost — never the other way round. A response with files
and no guide is incomplete work.

Paths are relative to their repository root. Write complete files, never
fragments or diffs. If their layout is unclear from what you were shown, follow
the strongest convention visible in the code you were given and say so in the
guide rather than guessing silently.`;

function describeProfile(p) {
  const lines = [
    `Repository: ${p.repoFullName || '(unknown)'}`,
    `Languages: ${(p.languages || []).join(', ') || '(unknown)'}`,
    `Frameworks: ${(p.frameworks || []).join(', ') || '(unknown)'}`,
    `Database: ${p.database || '(unknown)'}`,
  ];

  if (p.entities?.length) {
    lines.push('', 'ENTITIES THAT ALREADY EXIST — reuse these, do not recreate them:');
    for (const e of p.entities) {
      lines.push(`  ${e.name} (${e.definedIn || 'file unknown'})`
        + `${e.describes ? ` — ${e.describes}` : ''}`
        + `${e.fields?.length ? `\n    fields: ${e.fields.join(', ')}` : ''}`);
    }
  }

  if (p.datasetMatches?.length) {
    lines.push('', 'THE DATA THIS FEATURE NEEDS, AND WHERE THEY ALREADY KEEP IT:');
    for (const m of p.datasetMatches) {
      lines.push(`  "${m.dataset}" -> ${m.entity} (${m.definedIn || 'file unknown'})`);
    }
  }
  return lines.join('\n');
}

/** The authored half of the build — the runtime is Svarg's and does not travel. */
function authoredFiles(app) {
  const RUNTIME = /^(server\.js|frontend\/(index\.html|app\.css|config\.js)|middleware\/|config\/|package\.json|\.env\.example|README)/;
  return (app.files || []).filter(f => !RUNTIME.test(f.path));
}

function parseBlocks(text) {
  const files = [];
  const fileRx = /===\s*FILE:\s*(.+?)\s*===\r?\n([\s\S]*?)\r?\n===\s*END FILE\s*===/g;
  let m;
  while ((m = fileRx.exec(text)) !== null) {
    const path = m[1].trim().replace(/\\/g, '/');
    const content = m[2];
    // Same discipline as the standalone generator: a path is untrusted input.
    if (!path || path.startsWith('/') || /^[a-zA-Z]:/.test(path) || path.split('/').includes('..')) continue;
    files.push({ path, content });
  }
  const guide = (text.match(/===\s*GUIDE\s*===\r?\n([\s\S]*?)\r?\n===\s*END GUIDE\s*===/) || [])[1] || '';
  return { files, guide: guide.trim() };
}

/**
 * Port the built application into the customer's codebase.
 *
 * @param {string} blueprintId
 * @param {{ userId: string, onProgress?: (s: string) => void }} opts
 * @returns {Promise<{files: object[], guide: string, warnings: string[], profile: object}>}
 */
export async function integrateIntoProduct(blueprintId, { userId, onProgress = null } = {}) {
  const say = (s) => { if (onProgress) onProgress(s); };

  const bp = await TransformationBlueprint.findById(blueprintId).lean();
  if (!bp) throw new IntegrationError('Blueprint not found.');

  const profile = bp.codebaseProfile;
  if (!profile?.checked) {
    throw new IntegrationError(
      'No repository has been read for this blueprint. Connect the customer\'s repository on Aria first — '
      + 'without their architecture there is nothing to integrate into, and the result would be a guess.');
  }

  const app = await GeneratedApplication.findOne({ blueprintId, status: 'passed' }).lean();
  if (!app?.files?.length) {
    throw new IntegrationError('No verified application exists yet. Build it on Eame first — '
      + 'the integration is a translation of a working implementation, not a second attempt at writing one.');
  }

  const source = authoredFiles(app);
  if (!source.length) throw new IntegrationError('The build has no authored files to port.');

  // Their actual source for the areas this feature touches. Retrieval rather
  // than the whole repository: the relevant files are what shows convention,
  // and the whole repository would not fit and would bury them.
  say('Reading their code');
  const queryText = [bp.appName, app.useCase, ...(profile.entities || []).map(e => e.name)]
    .filter(Boolean).join(' ');
  const chunks = await retrieveCode({ userId, blueprintId, queryText, topK: CONTEXT_CHUNKS })
    .catch(() => []);

  const warnings = [];
  if (!chunks.length) {
    // Two very different causes, and the fix differs. Say which, because
    // "no source retrieved" alone sends someone looking at the wrong thing.
    const stored = await CustomerCodeChunk.countDocuments({ blueprintId }).catch(() => 0);
    warnings.push(stored
      ? `Their repository has ${stored} stored file(s) but none are searchable — the chunks were `
        + 'saved without embeddings. Set CODE_CHUNK_EMBEDDING=1 and re-analyse the repository, '
        + 'then run this again to ground the port in their actual code.'
      : 'No source was retrieved from their repository, so the port follows the profile alone — '
        + 'it will match their stack but not necessarily their house style.');
  }

  say('Writing the integration');
  const userMessage = [
    'THE CODEBASE THIS MUST MOVE INTO:',
    describeProfile(profile),
    '',
    chunks.length ? 'THEIR OWN SOURCE, FOR CONVENTION AND FOR THE ENTITIES ABOVE:' : '',
    ...chunks.map(c => `--- ${c.path} ---\n${String(c.content || '').slice(0, CHUNK_CHARS)}`),
    '',
    `THE WORKING IMPLEMENTATION TO PORT (${app.useCase || bp.appName || 'AI feature'}):`,
    ...source.map(f => `--- ${f.path} ---\n${String(f.content || '').slice(0, SOURCE_FILE_CHARS)}`),
  ].filter(Boolean).join('\n');

  const { text } = await generate({
    systemPrompt: SYSTEM_PROMPT,
    userMessage,
    label: 'product-integration',
    maxTokens: 16000,
  });

  const { files, guide } = parseBlocks(text);
  if (!files.length) {
    throw new Error('The model returned no files. Try Integrate again.');
  }
  if (!guide) warnings.push('No integration guide was produced — the files stand alone without instructions.');

  say('Checking what was written');
  warnings.push(...checkIntegration(files, profile));

  // Then the question the checks above cannot answer: does this fit THEIR
  // repository? Best effort — their GitHub App install can be gone since the
  // profile was taken, and an integration that was written is still worth
  // returning without the verdict. The screen says which of the two happened.
  let repoVerified = null;
  if (profile.repoFullName) {
    say('Checking it against their repository');
    try {
      const access = await resolveRepoAccess(userId);
      repoVerified = await verifyAgainstRepo(files, {
        access,
        repoFullName: profile.repoFullName,
      });
      warnings.push(...repoVerified.missingFiles);
      warnings.push(...repoVerified.missingExports);
      if (repoVerified.truncated) {
        warnings.push(`${profile.repoFullName} is too large for GitHub to return in one tree, `
          + 'so imports could not be checked against it. The files above are unverified against their repo.');
      }
    } catch (err) {
      warnings.push(`Could not read ${profile.repoFullName} to check the imports (${err.message}). `
        + 'The files were not verified against their repository.');
    }
  }

  return {
    files,
    guide,
    warnings,
    repoVerified,
    profile: {
      repoFullName: profile.repoFullName || '',
      frameworks: profile.frameworks || [],
      database: profile.database || '',
      entitiesReused: (profile.entities || []).map(e => e.name),
    },
    groundedInSource: chunks.length,
  };
}

/**
 * What can honestly be checked about code destined for someone else's repo.
 *
 * NOT the standalone build's gates. Those ask whether a complete Svarg
 * application is present — a frontend/app.js, a routes/ directory, resolvable
 * local imports — and none of that is true or desirable here. These files are
 * fragments of THEIR application; their imports point at modules Svarg does not
 * have, and a boot test failing for that reason would be reporting the wrong
 * thing entirely.
 *
 * So three checks that are meaningful without their repository present.
 */
export function checkIntegration(files, profile = {}) {
  const warnings = [];

  // 1. Syntax. A file that does not parse is worthless however well it reads,
  //    and it is the one defect a human reviewer will not catch by eye.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'svarg-int-'));
  try {
    for (const f of files) {
      if (!/\.(js|mjs)$/.test(f.path)) continue;
      const tmp = path.join(dir, 'check.mjs');
      fs.writeFileSync(tmp, f.content);
      try {
        execFileSync(process.execPath, ['--check', tmp], { stdio: 'pipe' });
      } catch (err) {
        const detail = String(err.stderr || err.message).split('\n').find(l => /Error/.test(l)) || 'parse error';
        warnings.push(`${f.path} does not parse — ${detail.trim()}`);
      }
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }

  // 2. Secrets. Configuration must come from their environment convention, and
  //    a generated file is exactly where an inlined key would go unnoticed into
  //    a commit.
  const SECRET = [
    [/\bsk-[A-Za-z0-9]{16,}/, 'an OpenAI-style API key'],
    [/\bxkeysib-[A-Za-z0-9]{16,}/, 'a Brevo API key'],
    [/\bAIza[A-Za-z0-9_-]{20,}/, 'a Google API key'],
    [/\bghp_[A-Za-z0-9]{20,}/, 'a GitHub token'],
    [/mongodb(\+srv)?:\/\/[^\s'"]*:[^\s'"@]+@/, 'a MongoDB URI with credentials'],
  ];
  for (const f of files) {
    for (const [rx, what] of SECRET) {
      if (rx.test(f.content)) warnings.push(`${f.path} contains ${what} — it must read from their environment instead.`);
    }
  }

  // 3. Duplicated entities. The prompt calls this the most damaging outcome:
  //    a parallel model for data they already store silently splits it, and
  //    nothing at review time makes that obvious. Worth checking rather than
  //    only asking for.
  const existing = new Set((profile.entities || []).map(e => String(e.name || '').toLowerCase()).filter(Boolean));
  if (existing.size) {
    const declare = /mongoose\.model\(\s*['"`]([^'"`]+)|class\s+([A-Z]\w+)\s+extends\s+Model|sequelize\.define\(\s*['"`]([^'"`]+)/g;
    for (const f of files) {
      let m;
      while ((m = declare.exec(f.content)) !== null) {
        const name = (m[1] || m[2] || m[3] || '').toLowerCase();
        if (name && existing.has(name)) {
          warnings.push(`${f.path} declares "${m[1] || m[2] || m[3]}", which already exists in their codebase — `
            + 'importing theirs avoids splitting the same data across two models.');
        }
      }
    }
  }

  // 4. Rebuilt infrastructure. A working repository already has authentication,
  //    configuration loading and very often a model client. A second copy
  //    beside theirs is not an integration — it is a second application living
  //    in their tree, which is the exact thing this feature exists to avoid.
  const INFRA = [
    [/(^|\/)auth\w*\.(js|ts)$/i, 'authentication'],
    [/(^|\/)(llm|openai|ai)Service\.(js|ts)$/i, 'a model client'],
    [/(^|\/)(config|env)\.(js|ts)$/i, 'configuration loading'],
    [/(^|\/)logger\.(js|ts)$/i, 'logging'],
  ];
  for (const f of files) {
    for (const [rx, what] of INFRA) {
      if (rx.test(f.path)) {
        warnings.push(`${f.path} rebuilds ${what} — their codebase almost certainly has this `
          + 'already, and importing theirs keeps the diff reviewable.');
      }
    }
  }

  return warnings;
}

/**
 * Does this actually fit their repository?
 *
 * The checks above verify the files in isolation — they parse, leak nothing,
 * declare no duplicate model. None of that confirms that
 * `routes/churnRoutes.js` importing `../models/StudentChurnProfile` refers to
 * anything that exists, which is the first thing to break their build and the
 * first thing a reviewer would find by being annoyed.
 *
 * ── Why this is not a clone ─────────────────────────────────────────────────
 *
 * Import resolution needs the file LIST, not the file contents, and readTree
 * returns every path in one call. So this answers the same question as
 * cloning, installing and booting — will this break their build — for two API
 * calls and a handful of targeted reads.
 *
 * It also means Svarg never holds a copy of a customer's proprietary source.
 * Nothing read here is stored: the tree and the few files fetched live for the
 * length of this function and are never written to the blueprint or to disk.
 *
 * ── What it cannot tell you ─────────────────────────────────────────────────
 *
 * It does not install, boot, or run their tests. Those need their environment
 * and their secrets. The screen says so rather than implying the diff is proven.
 */
export async function verifyAgainstRepo(files, { access, repoFullName }) {
  const result = {
    checkedAt: new Date(),
    resolved: 0,
    missingFiles: [],
    missingPackages: [],
    missingExports: [],
    treeSize: 0,
  };

  const tree = await readTree(access, repoFullName);
  const paths = new Set((tree.files || []).map(f => f.path.replace(/\\/g, '/')));
  result.treeSize = paths.size;

  // A truncated tree means paths are missing from the set, and every "missing"
  // verdict below would then be unsafe. Say so and check nothing rather than
  // report confident nonsense.
  if (tree.truncated) {
    result.truncated = true;
    return result;
  }

  // Their own files count too: an integration file may import another one.
  const own = new Set(files.map(f => f.path.replace(/\\/g, '/')));
  const known = new Set([...paths, ...own]);

  // 1. Relative imports must land on something real.
  // 2. Bare imports must be a package they already depend on.
  const bareNeeded = new Set();
  const importedFrom = new Map();   // their file -> symbols the integration wants

  for (const f of files) {
    if (!/\.(js|mjs)$/.test(f.path)) continue;
    const { relative, bare } = extractImports(f.content);

    for (const spec of relative) {
      if (resolvesInManifest(f.path, spec, known)) {
        result.resolved += 1;
        // Only their files need an export check; ours are in this same set.
        const target = resolveTo(f.path, spec, paths);
        if (target) {
          if (!importedFrom.has(target)) importedFrom.set(target, new Set());
          for (const sym of namedImportsOf(f.content, spec)) importedFrom.get(target).add(sym);
        }
      } else {
        result.missingFiles.push(`${f.path} imports "${spec}", which is not in ${repoFullName}`);
      }
    }

    for (const spec of bare) bareNeeded.add(packageOf(spec));
  }

  // Node builtins are not dependencies and never appear in package.json.
  const pkgRaw = await readFile(access, repoFullName, 'package.json').catch(() => null);
  if (pkgRaw) {
    let deps = {};
    try {
      const pkg = JSON.parse(pkgRaw);
      deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
    } catch { /* unparseable package.json — skip rather than guess */ }
    for (const name of bareNeeded) {
      if (name.startsWith('node:') || BUILTINS.has(name)) continue;
      if (!deps[name]) result.missingPackages.push(name);
    }
  }

  // 3. The symbols actually exported. Only the files being imported from, so a
  //    handful of reads rather than a repository.
  for (const [target, symbols] of importedFrom) {
    if (!symbols.size) continue;
    const src = await readFile(access, repoFullName, target).catch(() => null);
    if (!src) continue;
    for (const sym of symbols) {
      if (!exportsSymbol(src, sym)) {
        result.missingExports.push(`${target} does not export "${sym}"`);
      }
    }
  }

  return result;
}

/**
 * Which of THEIR paths a relative specifier lands on, or null.
 *
 * Deliberately the same base computation and the same three candidate forms as
 * resolvesInManifest in generatedProjectVerifier.js. If these two ever
 * disagreed, an import could be counted as resolved and then have its exports
 * checked against the wrong file, or against nothing.
 */
function resolveTo(fromPath, specifier, theirPaths) {
  const clean = (p) => p.split(path.sep).join('/').replace(/^\.\//, '');
  const base = clean(path.posix.join(path.posix.dirname(clean(fromPath)), specifier));
  for (const candidate of [base, `${base}.js`, `${base}/index.js`]) {
    if (theirPaths.has(candidate)) return candidate;
  }
  return null;
}

/** The named bindings one import statement pulls from a specifier. */
function namedImportsOf(source, specifier) {
  const esc = specifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const rx = new RegExp(`import\\s*\\{([^}]+)\\}\\s*from\\s*['"\`]${esc}['"\`]`, 'g');
  const out = new Set();
  let m;
  while ((m = rx.exec(source)) !== null) {
    for (const raw of m[1].split(',')) {
      const name = raw.trim().split(/\s+as\s+/)[0].trim();
      if (name) out.add(name);
    }
  }
  return out;
}

/** Whether a module exports that name, in any of the forms people write. */
function exportsSymbol(source, name) {
  const n = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(
    `export\\s+(async\\s+)?(function|const|let|var|class)\\s+${n}\\b`
    + `|export\\s*\\{[^}]*\\b${n}\\b[^}]*\\}`
    + `|exports\\.${n}\\s*=`,
  ).test(source);
}

const BUILTINS = new Set([
  'fs', 'path', 'os', 'url', 'util', 'crypto', 'http', 'https', 'events', 'stream',
  'child_process', 'zlib', 'buffer', 'assert', 'net', 'dns', 'tls', 'querystring',
  'readline', 'worker_threads', 'perf_hooks', 'timers', 'string_decoder', 'vm',
]);
