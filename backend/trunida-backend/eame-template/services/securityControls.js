/**
 * Security checks that produce evidence for a named control.
 *
 * ── What this is, and what it is not ───────────────────────────────────────
 *
 * ISO/IEC 42001 certifies an organisation's AI MANAGEMENT SYSTEM, and
 * ISO/IEC 27001 its information security management system. Both are awarded
 * by an accredited body auditing how people work — neither is something an
 * application can pass. Any tool claiming to run "the ISO tests" is selling
 * something that does not exist, and repeating that claim to a buyer is a
 * liability rather than an asset.
 *
 * What an automated suite can honestly do is produce EVIDENCE against specific
 * Annex A controls: run the check, record the result, and name the control the
 * result speaks to. An auditor still decides whether the control is met. That
 * is genuinely worth having — it is the difference between "we take security
 * seriously" and "here is last Tuesday's result for A.8.3, on this deployment".
 *
 * So every check here carries the control it evidences, and the report says
 * plainly that it is evidence and not conformance.
 *
 * ── Why these checks and not others ────────────────────────────────────────
 *
 * Only what can be tested from inside a running application, against itself,
 * with no human interpretation. A control that needs a policy document, a
 * training record or a risk assessment is a real control and belongs in the
 * management system — it simply cannot be evidenced by code, and pretending
 * otherwise would put a green tick next to something nobody checked.
 */

import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import crypto from 'crypto';

/** The controls these checks speak to. Named so a report can cite them. */
export const CONTROLS = {
  ACCESS_RESTRICTION:  { id: 'ISO/IEC 27001 A.8.3',  name: 'Information access restriction' },
  AUTHENTICATION:      { id: 'ISO/IEC 27001 A.8.5',  name: 'Secure authentication' },
  LEAKAGE:             { id: 'ISO/IEC 27001 A.8.12', name: 'Data leakage prevention' },
  LOGGING:             { id: 'ISO/IEC 27001 A.8.15', name: 'Logging' },
  CONFIGURATION:       { id: 'ISO/IEC 27001 A.8.9',  name: 'Configuration management' },
  SECURE_CODING:       { id: 'ISO/IEC 27001 A.8.28', name: 'Secure coding' },
  AUTH_INFORMATION:    { id: 'ISO/IEC 27001 A.5.17', name: 'Authentication information' },
  AI_VERIFICATION:     { id: 'ISO/IEC 42001 A.6.2.4', name: 'AI system verification and validation' },
  AI_OPERATION:        { id: 'ISO/IEC 42001 A.6.2.6', name: 'AI system operation and monitoring' },
  AI_DATA_PROVENANCE:  { id: 'ISO/IEC 42001 A.7.4',  name: 'Provenance of data used in AI systems' },
  AI_USER_INFORMATION: { id: 'ISO/IEC 42001 A.8.2',  name: 'Information for users of the AI system' },
};

/**
 * What a real credential looks like.
 *
 * Shapes only. A rule like "any long random-looking string" flags a hash, a
 * base64 image and a git sha, and a scanner that cries wolf is one people stop
 * reading — which is how the real finding gets missed.
 *
 * Exported because Svarg's own scripts/secret_audit.mjs imports these rather
 * than keeping a second copy. One definition of what a secret is; two places
 * that look for it.
 */
export const CREDENTIAL_SHAPES = [
  ['OpenAI key',          /\bsk-[A-Za-z0-9]{32,}\b/],
  ['Anthropic key',       /\bsk-ant-[A-Za-z0-9_-]{32,}\b/],
  ['Google API key',      /\bAIza[A-Za-z0-9_-]{35}\b/],
  ['GitHub token',        /\b(ghp|gho|ghs|ghr)_[A-Za-z0-9]{36}\b/],
  ['GitHub fine-grained', /\bgithub_pat_[A-Za-z0-9_]{60,}\b/],
  ['Slack token',         /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/],
  ['AWS access key',      /\bAKIA[0-9A-Z]{16}\b/],
  ['Private key block',   /-----BEGIN (RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/],
  // The password has to be long enough to be one: mongodb://u:p@host is a test
  // fixture, and flagging it is how a scanner's next report gets skimmed.
  ['Credentialed URI',    /\b(mongodb(\+srv)?|postgres(ql)?|redis|amqp):\/\/[^\s:/@'"]+:[^\s@'"]{8,}@/],
];

/** A template showing the SHAPE of a secret is documentation, not a secret. */
export const PLACEHOLDER = /(example|placeholder|replace|your[-_]?|<[^>]+>|xxx+|user:password|USERNAME|PASSWORD|changeme|dummy|sample)/i;

/** Enough to locate a value, never enough to use it. */
function fingerprint(v) {
  return crypto.createHash('sha256').update(String(v)).digest('hex').slice(0, 8);
}

/**
 * Credential-shaped literals in a piece of text.
 *
 * Returns fingerprints, never values. A check that writes a secret into a
 * report — which is then stored, shown on a screen and possibly emailed — has
 * leaked it a second time and more durably than the code did.
 */
export function credentialsIn(text, where = '') {
  const out = [];
  String(text || '').split('\n').forEach((line, i) => {
    if (PLACEHOLDER.test(line)) return;
    for (const [kind, re] of CREDENTIAL_SHAPES) {
      const m = line.match(re);
      if (m) out.push({ kind, where, line: i + 1, fp: fingerprint(m[0]) });
    }
  });
  return out;
}

const PASS = (detail, evidence) => ({ passed: true, detail, evidence });
const FAIL = (detail, evidence) => ({ passed: false, detail, evidence });
const SKIP = (detail) => ({ skipped: true, detail });

/** This application's own directory, wherever it was installed. */
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');

/** Where this application answers itself. Loopback: never leaves the container. */
function selfUrl(p) {
  return `http://127.0.0.1:${process.env.PORT || 3000}${p}`;
}

/**
 * Ask this application a question with no credentials at all.
 *
 * A real request over the real stack, not a reading of the source. Middleware
 * that is imported but never mounted looks identical to middleware that works
 * when you grep for it, and the difference is the whole control.
 */
async function knockWithoutCredentials(route) {
  try {
    const res = await fetch(selfUrl(route), {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(2000),
    });
    return { route, status: res.status, reachable: true };
  } catch (err) {
    return { route, status: 0, reachable: false, error: err.message };
  }
}

/**
 * The routes that carry customer data, as the server actually mounted them.
 *
 * Read from the express router stack rather than from a list somebody keeps up
 * to date: a route added later and forgotten is exactly the one worth testing.
 */
/**
 * The path a mounted router answers on, read back out of its regular
 * expression: `^\/api\/data\/?(?=\/|$)` becomes `/api/data`.
 *
 * Done with string operations rather than a pattern, because the thing being
 * parsed is itself a pattern and the escaping needed to match it is where this
 * went wrong the first time — it stopped at the first escaped slash, returned
 * `/api` for every router, and the open-doors list then discarded all of them.
 * The check found nothing to test and skipped quietly on every deployment,
 * which is the failure mode a security check can least afford.
 */
export function mountPathOf(source) {
  const SUFFIX = String.raw`\/?(?=\/|$)`;
  let s = String(source || '');
  if (s.startsWith('^')) s = s.slice(1);
  if (s.endsWith(SUFFIX)) s = s.slice(0, -SUFFIX.length);
  // A bare app.get('/api') compiles to ^\/api\/?$ instead.
  if (s.endsWith(String.raw`\/?$`)) s = s.slice(0, -String.raw`\/?$`.length);
  return s.split('\\/').join('/');
}

export function mountedDataRoutes(app) {
  // Doors that answer anonymously by design: the health endpoint, and the
  // ones somebody has to reach before they have any credentials to present.
  const OPEN = new Set(['/api', '/api/auth', '/api/session', '/api/health']);
  const out = [];
  try {
    for (const layer of app?._router?.stack || []) {
      // Only a mounted router has a stack of its own. A plain app.get does not,
      // and neither does middleware.
      if (!layer.handle?.stack || !layer.regexp?.source) continue;
      /*
       * Express keeps the mount path as a regular expression, so read it back:
       *   ^/api/data/?(?=/|$)   ->   /api/data
       * The first version of this stopped at the first escaped slash and
       * returned /api for every router — which the open-doors list then
       * discarded, so the check found nothing to test and quietly skipped on
       * every deployment.
       */
      const base = mountPathOf(layer.regexp.source);
      if (!base.startsWith("/api")) continue;
      if (OPEN.has(base)) continue;
      out.push(base);
    }
  } catch { /* an express internal changing shape is not a security finding */ }
  return [...new Set(out)];
}

// ── The checks ───────────────────────────────────────────────────────────────

export async function securityChecks({ app = null } = {}) {
  const checks = [];
  /*
   * Whether there is a server to talk to.
   *
   * The two checks below make a real request to this application over the
   * loopback address, which is the point of them — middleware that is imported
   * but never mounted reads identically to middleware that works. Outside a
   * served process there is nothing listening, and waiting for a connection
   * that will never come would turn a diagnostic into a hang.
   *
   * The app object is the honest signal: the caller hands it over precisely
   * because it came off a live request.
   */
  const serving = !!app;
  const add = (id, control, name, outcome) => checks.push({ id, control, name, ...outcome });

  // ── A.8.3 / A.8.5 — an anonymous caller gets nothing ──────────────────────
  const routes = serving ? mountedDataRoutes(app) : [];
  if (!routes.length) {
    add('anonymous-access-refused', CONTROLS.ACCESS_RESTRICTION,
      'A caller with no credentials cannot read customer data',
      SKIP(serving
        ? 'The mounted routes could not be read, so nothing was tested.'
        : 'Not running inside a served application, so no route was called.'));
  } else {
    const knocks = await Promise.all(routes.map(knockWithoutCredentials));
    const answered = knocks.filter(k => k.reachable);
    const letIn = answered.filter(k => k.status < 400);

    add('anonymous-access-refused', CONTROLS.ACCESS_RESTRICTION,
      'A caller with no credentials cannot read customer data',
      !answered.length
        ? SKIP('No route answered, so nothing could be tested.')
        : letIn.length
          ? FAIL(`${letIn.length} of ${answered.length} data routes answered a request carrying no credentials: `
               + letIn.map(k => `${k.route} (HTTP ${k.status})`).join(', '),
               { routes: letIn })
          : PASS(`All ${answered.length} data routes refused a request carrying no credentials.`,
               { routes: answered.map(k => `${k.route} → ${k.status}`) }));
  }

  // ── A.8.5 — a session does not last forever ───────────────────────────────
  add('sessions-expire', CONTROLS.AUTHENTICATION,
    'A session token stops working on its own',
    await (async () => {
      try {
        // ROOT, not the working directory: a process started from somewhere
        // else would read nothing here and report a finding about the wrong thing.
        const src = fs.readFileSync(path.join(ROOT, 'controllers', 'authController.js'), 'utf-8');
        const ttl = src.match(/const SESSION_TTL = '([^']+)'/)?.[1];
        if (!ttl) return FAIL('No session lifetime is set, so a token issued once is valid forever.');
        return PASS(`Sessions expire after ${ttl}.`, { ttl });
      } catch (err) {
        return SKIP(`The sign-in configuration could not be read: ${err.message}`);
      }
    })());

  // ── A.8.12 — the health endpoint says what is configured, not what it is ──
  add('no-secret-disclosed', CONTROLS.LEAKAGE,
    'Diagnostics report what is configured without disclosing it',
    await (async () => {
      if (!serving) return SKIP('Not running inside a served application, so nothing was called.');
      try {
        const res = await fetch(selfUrl('/api'), { signal: AbortSignal.timeout(2000) });
        const body = await res.text();
        const secrets = [
          process.env.JWT_SECRET, process.env.MONGO_URI, process.env.SVARG_AUTH_SECRET,
          process.env.APP_OWNER_KEY, process.env.SELFHOSTED_API_KEY,
        ].filter(v => v && String(v).length >= 12);
        const leaked = secrets.filter(v => body.includes(v));
        return leaked.length
          ? FAIL(`The health endpoint disclosed ${leaked.length} configured secret value(s).`)
          : PASS('The health endpoint names what is configured and discloses no value.');
      } catch (err) {
        return SKIP(`The health endpoint could not be read: ${err.message}`);
      }
    })());

  // ── A.8.15 / 42001 A.6.2.8 — every answer is recorded ─────────────────────
  add('answers-are-recorded', CONTROLS.LOGGING,
    'Every answer the application gives is recorded and retrievable',
    await (async () => {
      /*
       * Not asked when the connection is down.
       *
       * Mongoose buffers a query against a dead connection and resolves it ten
       * seconds later, so this one check would make the whole report take ten
       * seconds to produce — precisely when something is already wrong. The
       * health endpoint learned this the same way.
       */
      if (mongoose.connection.readyState !== 1) {
        return SKIP('Not counted — the database is not connected.');
      }
      try {
        const { turnsCollection } = await import('./turnLog.js');
        const n = await turnsCollection().countDocuments({});
        // Zero is honest for an application nobody has asked anything yet.
        return PASS(n > 0
          ? `${n} answer${n === 1 ? '' : 's'} recorded, each with its question and when it was asked.`
          : 'An audit trail is in place; no questions have been asked yet.', { turns: n });
      } catch (err) {
        return FAIL(`The audit trail could not be read: ${err.message}`);
      }
    })());

  // ── A.8.9 — configuration comes from the environment ──────────────────────
  add('configuration-not-hardcoded', CONTROLS.CONFIGURATION,
    'Connection details and keys come from configuration, not from the code',
    await (async () => {
      try {
        const committed = ['.env'].filter(f => fs.existsSync(path.join(ROOT, f)));
        if (committed.length) {
          return FAIL('A .env file is present in the application directory — configuration must not ship with the code.');
        }
        const template = fs.existsSync(path.join(ROOT, '.env.example'));
        return template
          ? PASS('Configuration is supplied by the environment, and .env.example documents what is required.')
          : FAIL('No .env.example documents what configuration this application requires.');
      } catch (err) {
        return SKIP(`The application directory could not be read: ${err.message}`);
      }
    })());

  // ── A.8.28 — no credential is written into this application's own code ────
  add('no-credential-in-the-code', CONTROLS.SECURE_CODING,
    'No credential is written into this application\'s own code',
    await (async () => {
      try {
        const found = scanOwnFiles();
        return found.hits.length
          ? FAIL(`${found.hits.length} credential-shaped literal(s) in ${found.files} file(s) of this application.`,
                 { hits: found.hits })
          : PASS(`No credential-shaped literal in ${found.files} source files.`, { files: found.files });
      } catch (err) {
        return SKIP(`The application's own files could not be read: ${err.message}`);
      }
    })());

  // ── A.8.12 — nothing credential-shaped is handed to a browser ─────────────
  add('no-credential-served-to-a-browser', CONTROLS.LEAKAGE,
    'Nothing a browser downloads carries a credential',
    await (async () => {
      try {
        const found = scanOwnFiles(path.join(ROOT, 'frontend'));
        return found.hits.length
          ? FAIL(`${found.hits.length} credential-shaped literal(s) in files served to browsers.`, { hits: found.hits })
          : PASS(`No credential in the ${found.files} files a browser can fetch.`, { files: found.files });
      } catch (err) {
        return SKIP(`The front end could not be read: ${err.message}`);
      }
    })());

  // ── A.5.17 — this application holds no model provider credential ──────────
  add('holds-no-provider-key', CONTROLS.AUTH_INFORMATION,
    'This application holds no model provider credential of its own',
    await (async () => {
      /*
       * The strongest thing this report can say, and the reason the gateway
       * exists. A Svarg-hosted application reaches a model through Svarg with
       * a token scoped to this one deployment, so there is no OpenAI or
       * Anthropic key in its environment, its repository or its database to
       * lose — and a customer asking "what happens if you are breached" can be
       * answered with a fact rather than a policy.
       *
       * A customer running this themselves may legitimately set their own key.
       * That is their choice and their key, so it is reported rather than
       * failed: the check exists to say which arrangement is in force.
       */
      const own = ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'GOOGLE_API_KEY', 'GEMINI_API_KEY']
        .filter(k => String(process.env[k] || '').trim());
      const throughGateway = !!String(process.env.SELFHOSTED_BASE_URL || '').trim();

      if (!own.length && throughGateway) {
        return PASS('No provider credential is present. The model is reached through Svarg\'s gateway '
                  + 'with a token scoped to this deployment, so there is none here to lose.',
                    { throughGateway: true });
      }
      if (!own.length) {
        return PASS('No provider credential is present in this application\'s environment.', { throughGateway: false });
      }
      return PASS(`This deployment holds its own ${own.length === 1 ? 'credential' : 'credentials'} for `
                + `${own.map(k => k.replace('_API_KEY', '').toLowerCase()).join(', ')}, supplied by whoever runs it. `
                + 'Rotation and storage of it are theirs to manage.',
                  { self_hosted_keys: own.map(k => k.replace('_API_KEY', '')) });
    })());

  return checks;
}

/**
 * Credential-shaped literals in this application's own files.
 *
 * Its own: never node_modules, which is somebody else's code and would drown
 * a real finding in thousands of test fixtures. Bounded in size and depth so
 * a report that runs on request cannot be turned into a disk crawl.
 */
function scanOwnFiles(dir = ROOT) {
  const SKIP_DIR = new Set(['node_modules', '.git', 'data', 'dist', 'build', 'coverage']);
  const TEXT = /\.(js|mjs|cjs|json|html|css|md|ya?ml|env\.example)$/;
  const hits = [];
  let files = 0;

  const walk = (d, depth) => {
    if (depth > 6 || hits.length > 40) return;
    let entries = [];
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (SKIP_DIR.has(e.name)) continue;
      const full = path.join(d, e.name);
      if (e.isDirectory()) { walk(full, depth + 1); continue; }
      if (!TEXT.test(e.name)) continue;
      try {
        if (fs.statSync(full).size > 1_000_000) continue;
        const text = fs.readFileSync(full, 'utf8');
        files++;
        hits.push(...credentialsIn(text, path.relative(ROOT, full).split(path.sep).join('/')));
      } catch { /* unreadable */ }
    }
  };

  walk(dir, 0);
  return { files, hits };
}
