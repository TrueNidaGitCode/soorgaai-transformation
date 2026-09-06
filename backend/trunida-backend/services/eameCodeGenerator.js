/**
 * Svarg — Eame writes the application
 *
 * Takes the spec (services/eameSpec.js) and produces the files that make up the
 * customer's application: their models, their services, their controllers,
 * their routes, their UI. The runtime around it is fixed and is not offered for
 * generation.
 *
 * ── The output format is not JSON ──────────────────────────────────────────
 *
 * Code inside JSON strings means every newline, quote and backslash in the
 * generated program has to survive being escaped and unescaped correctly. One
 * mis-escaped character invalidates the whole document and loses every file in
 * it. Delimited blocks lose nothing, degrade to "one file failed to parse"
 * instead of "the response failed to parse", and are far easier for a model to
 * emit correctly.
 *
 * ── What is enforced rather than requested ─────────────────────────────────
 *
 * The prompt asks for a path inside the authored directories. The parser does
 * not trust that: every path is checked with isAuthoredPath, and a rejected
 * path is reported rather than relocated. These files are written to disk
 * during verification, so a generated path is untrusted input.
 */

import { generateForProduct } from './productLlm.js';
import { isAuthoredPath, AUTHORED_DIRS, AUTHORED_FILES } from './eameSpec.js';

const FILE_OPEN = '=== FILE:';
const FILE_CLOSE = '=== END FILE ===';

/** Code generation is long. This is a ceiling, not an expectation. */
const MAX_TOKENS = 16000;

function describeDatasets(spec) {
  if (!spec.datasets.length) return 'None were identified. Design a sensible record shape for the use case and say so in comments.';
  return spec.datasets
    .map(d => `- ${d.name}: ${d.purpose}${d.typicalSource ? ` (lives in: ${d.typicalSource})` : ''}`)
    .join('\n');
}

function describeCodebase(spec) {
  if (!spec.codebase) {
    return 'The customer connected no repository, so nothing is known about their existing schema. Do not invent table or column names as if they were theirs.';
  }
  const c = spec.codebase;
  const entities = c.entities.length
    ? c.entities.map(e => `- ${e.name} (${e.definedIn}): ${e.fields.join(', ')}`).join('\n')
    : '- none extracted';
  return [
    `Repository: ${c.repo}`,
    `Stack: ${[...c.languages, ...c.frameworks].join(', ') || 'unknown'}${c.database ? ` on ${c.database}` : ''}`,
    'Entities found in their code:',
    entities,
  ].join('\n');
}

export function buildPrompt(spec) {
  const audience = spec.engagement.category === 'product-ai'
    ? 'Their own product will call this over HTTP, so the API matters more than the UI. Still ship a working UI so the feature can be seen working before it is integrated.'
    : 'Their staff will open this and use it directly, so the UI is the product.';

  const system = [
    'You are Eame. You write a small, complete, working Node.js application for one specific use case.',
    '',
    'You are writing REAL code that will be installed, started and called within minutes of you',
    'finishing. It is not a sketch and it is not scaffolding. Anything you leave as a TODO is a',
    'feature the customer does not get.',
    '',
    'THE RUNTIME ALREADY EXISTS. Do not write it, and do not import anything that is not listed:',
    '  server.js            starts express, connects mongoose, serves frontend/, and MOUNTS EVERY',
    '                       FILE IN routes/ automatically at /api/<filename-without-Routes>',
    '  middleware/authMiddleware.js   exports { protect } — express middleware',
    '  services/llmService.js         exports { generate({ systemPrompt, userMessage, maxTokens }) }',
    '                                 -> resolves to { text, ... }',
    '  services/modelSelectionService.js  exports { selectModel({ preference }) }',
    '  frontend/index.html            loads frontend/app.js as a module, and frontend/config.js',
    '                                 which sets window.CONFIG.API_BASE',
    '',
    'RULES',
    `1. Write files ONLY under: ${AUTHORED_DIRS.join(', ')} and exactly: ${AUTHORED_FILES.join(', ')}`,
    '2. ES modules only. Every relative import must include the .js extension.',
    `3. You may import ONLY these packages: ${spec.allowedDependencies.join(', ')} — plus Node builtins.`,
    '4. Every route file must `export default` an express Router.',
    '5. Protect every route with `protect` from ../middleware/authMiddleware.js.',
    '6. Call the model through services/llmService.js. Never call a provider SDK directly.',
    '7. Do not invent data. A seed script must read a file the customer supplies, not fabricate records.',
    '8. Write real error handling. A caught error must say what failed, not swallow it.',
    '',
    'OUTPUT FORMAT — exactly this, no prose before or after, no markdown fences:',
    `${FILE_OPEN} path/from/project/root.js ===`,
    '<the complete file>',
    FILE_CLOSE,
  ].join('\n');

  // Conditional lines are spread in, not filtered out. `.filter(Boolean)`
  // removed the blank separators too and ran every section together, which is
  // the prompt the model actually had to read.
  const user = [
    `Build: ${spec.useCase.name}`,
    ...(spec.useCase.justification ? [`Why it was chosen: ${spec.useCase.justification}`] : []),
    ...(spec.appName ? [`The customer calls this application: ${spec.appName}`] : []),
    '',
    `Who uses it: ${audience}`,
    ...(spec.engagement.maturity ? [`Company stage: ${spec.engagement.maturity}`] : []),
    '',
    'DATA THE APPLICATION WORKS ON (identified with the customer):',
    describeDatasets(spec),
    '',
    'THE CUSTOMER\'S EXISTING SYSTEM:',
    describeCodebase(spec),
    '',
    'Write the application. Include: the mongoose model(s), the service holding the actual logic,',
    'a controller, a route file, a seed script that imports the customer\'s own export, and',
    'frontend/app.js driving it. Keep it to the smallest set of files that genuinely does the job.',
  ].filter(Boolean).join('\n');

  return { system, user };
}

/**
 * Split a delimited response into files.
 *
 * Tolerant of a model that wraps output in markdown despite being asked not to,
 * because losing an entire generation to a stray fence is a bad trade for
 * strictness that buys nothing.
 */
export function parseFiles(text) {
  const files = [];
  const malformed = [];
  const raw = String(text || '');

  let cursor = 0;
  while (true) {
    const open = raw.indexOf(FILE_OPEN, cursor);
    if (open === -1) break;

    const headerEnd = raw.indexOf('\n', open);
    if (headerEnd === -1) { malformed.push('a file header was never terminated'); break; }

    // "=== FILE: models/X.js ===" -> "models/X.js"
    const header = raw.slice(open + FILE_OPEN.length, headerEnd).trim().replace(/=+$/, '').trim();

    const close = raw.indexOf(FILE_CLOSE, headerEnd);
    if (close === -1) {
      malformed.push(`${header || '(unnamed)'}: no closing marker, so the file is incomplete`);
      break;
    }

    let content = raw.slice(headerEnd + 1, close);
    // Strip a markdown fence if one was added around the body.
    content = content.replace(/^\s*```[a-zA-Z]*\n/, '').replace(/```\s*$/, '');

    if (!header) malformed.push('a file block had no path');
    else files.push({ path: header, content: content.replace(/\s+$/, '') + '\n' });

    cursor = close + FILE_CLOSE.length;
  }

  return { files, malformed };
}

/**
 * Generate, then keep only what is allowed to be written.
 *
 * @returns {{files: object[], rejected: object[], malformed: string[], raw: string}}
 *   `rejected` is returned rather than dropped: a model repeatedly trying to
 *   write server.js is telling you the brief is unclear, and silently
 *   discarding those attempts hides it.
 */
export async function generateApplication(spec, { provider, maxTokens = MAX_TOKENS, repair = null } = {}) {
  const { system, user } = buildPrompt(spec);

  // A repair is the same brief plus what went wrong. The errors are quoted
  // exactly — a paraphrased failure is a worse clue than the failure itself,
  // and the verifier has already stripped the sandbox paths that would
  // otherwise point at files this project does not contain.
  const message = repair
    ? [
        user,
        '',
        '--- THIS IS A REPAIR ---',
        `Your previous attempt failed at the ${repair.stage || 'verification'} stage:`,
        ...repair.failures.map(f => '  - ' + f),
        '',
        'Return the COMPLETE corrected file for each one below, in the same format.',
        'Do not return a diff, and do not return files that were not at fault.',
        '',
        ...repair.files.map(f => [`${FILE_OPEN} ${f.path} ===`, f.content, FILE_CLOSE].join('\n')),
      ].join('\n')
    : user;

  const result = await generateForProduct({
    systemPrompt: system,
    userMessage: message,
    maxTokens,
    // Unlabelled, this was the single most expensive call in the product
    // landing in the ledger's 'other' bucket.
    label: 'eame:generate',
    ...(provider ? { provider } : {}),
  });

  const { files, malformed } = parseFiles(result.text || '');

  const allowed = [];
  const rejected = [];
  for (const f of files) {
    if (isAuthoredPath(f.path)) allowed.push(f);
    else rejected.push({ path: f.path, reason: 'outside the directories Eame may write to' });
  }

  // Two files claiming the same path is ambiguous, and picking one silently
  // means delivering code the model did not intend as final.
  const seen = new Set();
  const deduped = [];
  for (const f of allowed) {
    if (seen.has(f.path)) { rejected.push({ path: f.path, reason: 'the same path was written twice' }); continue; }
    seen.add(f.path);
    deduped.push(f);
  }

  return { files: deduped, rejected, malformed, raw: result.text || '' };
}
