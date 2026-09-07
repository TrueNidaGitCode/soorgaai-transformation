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
    '  frontend/index.html            THE CHAT UI. Already built. See THE PAGE below.',
    '  frontend/config.js             sets window.CONFIG.API_BASE and attaches the',
    '                                 session token to every /api call you make. Authentication is',
    '                                 HANDLED — do not build a login, do not read localStorage for a',
    '                                 token, do not set an Authorization header.',
    '',
    'window.CONFIG.API_BASE ALREADY ENDS IN /api. It is the origin plus /api, e.g.',
    'https://your-app.example/api — so a route mounted at /api/thing is reached as:',
    '    fetch(`${window.CONFIG.API_BASE}/thing/ask`)     CORRECT',
    '    fetch(`${window.CONFIG.API_BASE}/api/thing/ask`) WRONG — that is /api/api/thing/ask',
    'The second 404s on every request, so the application looks entirely broken while',
    'the server is fine. server.js mounts routes/<name>Routes.js at /api/<name>.',
    '',
    'THE DATA — the project ships with CSVs the seed script must load:',
    ...(spec.sampleFiles?.length
      ? [
          ...spec.sampleFiles.filter(f => f.endsWith('.csv')).map(f => '  ' + f),
          '',
          'These are SAMPLE data, not real records. Every row carries a "_source"',
          'column set to "sample". Two things follow and both are required:',
          '  - the seed script reads these files and inserts them; it does not invent anything',
    '  - the application SAYS SO on screen (see the notice rule below)',
    '',
    'THE SEED SCRIPT is called by server.js on every boot. Get this exactly right or the',
    'customer opens an application with an empty database:',
    '  - scripts/seed<Something>.js must `export default async function seed()`',
    '  - it must be SAFE TO CALL EVERY TIME: count the collection first and return early',
    '    if it already holds rows. Returning { message } logs a useful line.',
    '  - read the CSVs above with fs, relative to the project root. Parse them yourself —',
    '    no CSV package is installable. Handle quoted fields containing commas.',
    '  - the database is ALREADY CONNECTED when you are called. Do not call mongoose.connect,',
    '    do not read MONGO_URI, do not call process.exit — you are inside the running server.',
    '  - a customer file passed as process.argv[2] still wins when present, so the same',
    '    script serves both. But it must work with NO arguments, because that is how the',
    '    server calls it.',
          '  - the application SAYS SO on screen. Render a .ch-notice saying the answers come',
          '    from sample data, whenever any row it used has _source="sample". A generated',
          '    figure read as a real number is the one failure that matters here.',
          'Carry _source through your model so the check is a query, not a guess. When the',
          'customer replaces these with a real export the column is absent, and the notice',
          'must then disappear on its own.',
        ]
      : [
          '  (none — no sample data was generated for this blueprint)',
          'The seed script must read a file the customer supplies. Say on screen that the',
          'application has no data yet and what file it expects, rather than answering an',
          'empty database as though emptiness were a finding.',
        ]),
    '',
    'THE PAGE — index.html is a chat interface and you do not replace it. It is already',
    'in the DOM when your module runs. Drive these elements:',
    '  #ch-log       the conversation. Append your turns here.',
    '  #ch-form      submit fires on send and on Enter.',
    '  #ch-input     the textarea the user types into.',
    '  #ch-send      the send button; disable it while a request is in flight.',
    '  #ch-state     the status pill, which reads "Connecting..." until you set it.',
    '  #ch-examples  EMPTY. Fill it with 3 buttons of class "ch-example" holding real',
    '                questions for THIS use case; clicking one submits it.',
    '  .ch-welcome   the opening block. Remove it once the first turn is sent.',
    '',
    'Do NOT call getElementById on anything else and do not build your own layout — an id',
    'that is not in this list does not exist, and your module will die on null.',
    '',
    'THE MARKUP — app.css already styles all of this. Write these exact structures and',
    'the application looks finished; write your own div soup and it looks unstyled, because',
    'nothing outside this vocabulary has any styling behind it. Add no CSS file.',
    '',
    '  A turn in the log:',
    '    <div class="ch-turn ch-turn--user"><div class="ch-bubble">…</div></div>',
    '    <div class="ch-turn ch-turn--bot"><div class="ch-bubble"><p class="ch-answer">…</p></div></div>',
    '',
    '  While waiting for the server — append it, then replace it with the real turn:',
    '    <div class="ch-turn ch-turn--bot"><div class="ch-bubble ch-bubble--thinking">',
    '      <span class="ch-dot"></span><span class="ch-dot"></span><span class="ch-dot"></span>',
    '      <span class="ch-thinking__text">…</span></div></div>',
    '',
    '  Records behind an answer — THE reason a reply can be trusted, so show them whenever',
    '  the answer came from rows. Goes inside the bot bubble, under the .ch-answer:',
    '    <p class="ch-matches__label">…</p>',
    '    <ul class="ch-matches">',
    '      <li class="ch-match">',
    '        <div class="ch-match__head"><span class="ch-match__id">…</span>',
    '          <span class="ch-match__score">…</span></div>',
    '        <p class="ch-match__title">…</p>',
    '        <p class="ch-match__cause"><span>label</span> …</p>',
    '      </li>',
    '    </ul>',
    '',
    'IF THIS PREDICTS OR SCORES ANYTHING, these are not style notes. Each one has',
    'produced an application that ran perfectly and was worthless to use:',
    '',
    '  NEVER SCORE THE OUTCOME YOU ARE PREDICTING. A record whose outcome has already',
    '  happened — churned, cancelled, closed, failed, resigned — is HISTORY, not a',
    '  prediction. Do not give it the maximum score; do not put it in a list of who is',
    '  at risk. It belongs to the evidence you learn the pattern from. Score only the',
    '  records whose outcome is still open, and say which set you are answering about.',
    '  A retention list topped by people who already left is worse than no list.',
    '',
    '  A SCORE THAT DOES NOT DISCRIMINATE IS NOT A SCORE. If every record comes back at',
    '  the same number, or a whole tier does, the scoring is doing nothing and the',
    '  ranking below it is arbitrary. Spread comes from the signals in the data, so use',
    '  the columns you were given rather than a constant.',
    '',
    '  THE DRIVER MUST EXPLAIN THE SCORE. Anything scored high has to name the signal',
    '  that made it high, read from that record. A record marked critical whose reason',
    '  says nothing is wrong is a contradiction the customer sees immediately, and it is',
    '  what a default driver on a fallback branch always produces.',
    '',
    'THE ANSWER ITSELF is PLAIN TEXT. There is no Markdown renderer on this page, so',
    '### and ** and - bullets arrive as literal characters and the customer reads the',
    'syntax. When you call services/llmService.js, tell it so in the system prompt:',
    'plain sentences, no Markdown, no headings, no bullet characters, no asterisks.',
    '',
    'Keep the prose SHORT — two to four sentences answering the question and nothing',
    'else. The structure belongs in the .ch-match cards below it, which is what they',
    'are for: a paragraph restating ten records is unreadable, while ten cards are',
    'scannable. Do not ask the model for recommendations nobody requested.',
    '',
    'Render newlines as separate <p class="ch-answer"> elements rather than emitting',
    'a single block with \n in it, which collapses to one run-on line.',
    '',
    '  Anything that is not a turn — an error, an empty result, a seeded confirmation:',
    '    <div class="ch-notice">…</div>',
    '',
    '  #ch-state is the connection pill. Add ch-head__dot--ok to its inner span once the',
    '  first request succeeds, and set its text to something true of this application.',
    '',
    'Escape every value you interpolate — the data is the customer\'s and some of it will',
    'contain angle brackets. Keep the log scrolled to the newest turn.',
    '',
    'RULES',
    `1. Write files ONLY under: ${AUTHORED_DIRS.join(', ')} and exactly: ${AUTHORED_FILES.join(', ')}`,
    '2. ES modules only. Every relative import must include the .js extension.',
    `3. You may import ONLY these packages: ${spec.allowedDependencies.join(', ')} — plus Node builtins.`,
    '4. Every route file must `export default` an express Router.',
    '5. Protect every route with `protect` from ../middleware/authMiddleware.js.',
    '6. Call the model through services/llmService.js. Never call a provider SDK directly.',
    '7. Do not invent data IN CODE. Never fabricate a record, a name or a number — read them',
    '   from the CSVs under data/ (see THE DATA below). A hard-coded row is a lie the customer',
    '   cannot see through.',
    '8. Write real error handling. A caught error must say what failed, not swallow it.',
    '',
    'OUTPUT FORMAT — exactly this, no prose before or after, no markdown fences:',
    `${FILE_OPEN} path/from/project/root.js ===`,
    '<the complete file>',
    FILE_CLOSE,
  ].join('\n');

  // Conditional lines are spread in, and nothing is filtered on the way out.
  // `.filter(Boolean)` was still here long after the conditionals stopped
  // needing it, and it removed the blank separators too — every section ran
  // together into one wall, which is the prompt the model actually had to read.
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
    'frontend/app.js driving the chat page. Keep it to the smallest set that does the job.',
    '',
    'The user reaches this application by TYPING A QUESTION, so the route file must expose a',
    'POST taking { message } that answers it against their data — retrieve what is relevant,',
    'then put it through services/llmService.js. Whatever else the use case needs (a scored',
    'list, a batch run, a detail view) is reached by asking for it and rendered as a turn in',
    'the log, not as a separate screen. Say what each answer was based on: a reply the user',
    'cannot check is worth less than one they can.',
  ].join('\n');

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
        // Without this the model guessed at its own earlier filenames and got
        // them wrong three attempts running — importing
        // attritionClassificationService.js, then attritionService.js, neither
        // of which it had actually written.
        ...(repair.projectPaths?.length
          ? [
              'These files already exist in the project. Import from these exact paths',
              'and do not invent others:',
              ...repair.projectPaths.map(p => '  ' + p),
              '',
            ]
          : []),
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
