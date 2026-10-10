/**
 * Everything this application sends out, recorded as it leaves.
 *
 * A customer asked the question every customer should: what of ours goes out
 * of this application, and to whom? A list in a document is a promise. This
 * is the evidence: every request the application makes to anywhere outside
 * itself is written down at the moment it is made -- when, where, which part
 * of the application sent it, and the body as sent -- in the application's
 * own database, where the owner reads it (routes/egressRoutes.js) and can
 * export it for their own auditor.
 *
 * ── Why at the network, and not where each call is made ───────────────────
 *
 * Recording at each call site would cover the calls somebody remembered to
 * record. This replaces the three ways a Node process can make a request --
 * the global fetch (the model SDK uses it), and the http and https modules
 * (axios and everything else uses them) -- so nothing the application does,
 * including code generated for it later, reaches the network without passing
 * through here. A test holds the template to having no other way out (no raw
 * sockets, no child processes).
 *
 * ── Three destinations ─────────────────────────────────────────────────────
 *
 *   ai      a model call: through Svarg's gateway to the model provider, or
 *           straight to one -- prompts, embeddings, recordings to transcribe
 *   svarg   Svarg itself: sign-in, usage signals, the email digest, the
 *           Zoho connection broker
 *   own     everything else: the customer's own systems -- their CRM, Meta,
 *           their phone provider -- read with their own credentials
 *
 * ── What is kept, and what is not ──────────────────────────────────────────
 *
 * The body as sent, up to 64 KB, with a SHA-256 of the whole of it. Long runs
 * of encoded binary (a recording) are replaced by their size, so the log says
 * a recording left without holding a second copy of it. Credentials -- in
 * headers or in the address -- are masked: the log proves a key was sent, and
 * is not itself a place to steal one.
 *
 * Bodies are kept 30 days and entries 90.
 *
 * ── Tamper-evident ─────────────────────────────────────────────────────────
 *
 * Each entry is numbered and carries the hash of the one before it, so an
 * entry edited or removed from the middle breaks the chain and verify() says
 * where. It cannot stop someone with the database deleting the newest
 * entries; an exported copy's last hash, compared later, catches that.
 *
 * Recording never stands in the way of a request: anything that fails here
 * is counted, and the next entry says how many went unrecorded.
 */
import http from 'http';
import https from 'https';
import crypto from 'crypto';
import path from 'path';
import { syncBuiltinESMExports } from 'module';
import mongoose from 'mongoose';

export const BODY_KEEP = 64 * 1024;
export const BODY_DAYS = 30;
export const ENTRY_DAYS = 90;
const MAX_PENDING = 2000;

export const CATEGORY_LABEL = {
  svarg: 'Shared with Svarg',
  ai: 'Shared with AI',
  own: 'Your own systems',
};

export function egressCollection() {
  return mongoose.connection.collection('svarg_egress_log');
}

// ── Where a request is going ────────────────────────────────────────────────

const SVARG_ENV = ['SELFHOSTED_BASE_URL', 'SELFHOSTED_EMBEDDING_BASE_URL', 'SVARG_AUTH_URL', 'SVARG_SIGNALS_URL', 'SVARG_NOTIFY_URL',
  'SVARG_TRANSCRIBE_URL', 'SVARG_ZOHO_URL', 'SVARG_OPS_URL'];

/** Model providers, reached directly by an install that has its own key. */
const AI_HOSTS = /(^|\.)(generativelanguage\.googleapis\.com|aiplatform\.googleapis\.com|api\.openai\.com|api\.anthropic\.com|api\.sarvam\.ai|api\.moonshot\.(ai|cn)|openai\.azure\.com)$/i;

/** What a model call looks like on Svarg's gateway or any OpenAI-shaped server. */
const AI_PATH = /\/(chat\/completions|completions|embeddings|audio\/transcriptions|audio\/translations|responses|messages)(\/|$)/i;

function hostOf(u) {
  try { return new URL(u).host.toLowerCase(); } catch { return ''; }
}

function svargHosts() {
  return new Set(SVARG_ENV.map((k) => hostOf(String(process.env[k] || '').trim())).filter(Boolean));
}

/** 'ai', 'svarg' or 'own', from the address alone. */
export function classify(url) {
  let u;
  try { u = new URL(url); } catch { return 'own'; }
  const host = u.host.toLowerCase();
  if (AI_HOSTS.test(u.hostname)) return 'ai';
  if (svargHosts().has(host)) return AI_PATH.test(u.pathname) ? 'ai' : 'svarg';
  return 'own';
}

/** What the request is for, in words, where the address says. */
export function purposeOf(url, category) {
  let p = '';
  try { p = new URL(url).pathname; } catch { /* nothing to read */ }
  if (/audio\/(transcriptions|translations)/.test(p)) return 'Transcribe a recording';
  if (/embeddings/.test(p)) return 'Embeddings';
  if (/chat\/completions|\/completions|\/responses|\/messages/.test(p) && category === 'ai') return 'Model call';
  if (/\/signals/.test(p)) return 'Usage signals';
  if (/\/notify/.test(p)) return 'Email digest';
  if (/oauth\/zoho/.test(p)) return 'Zoho connection broker';
  if (/\/auth\//.test(p)) return 'Sign-in';
  if (category === 'ai') return 'Model call';
  if (category === 'svarg') return 'Svarg';
  return 'Request to ' + hostOf(url);
}

/** A request this application makes to itself is not leaving it. */
function isSelf(u) {
  try {
    const x = new URL(u);
    const local = ['localhost', '127.0.0.1', '[::1]', '::1', '0.0.0.0'].includes(x.hostname);
    const port = x.port || (x.protocol === 'https:' ? '443' : '80');
    return local && port === String(process.env.PORT || 3000);
  } catch { return false; }
}

// ── Masking credentials ─────────────────────────────────────────────────────

const SECRET_HEADER = /^(authorization|proxy-authorization|cookie|set-cookie|x-api-key|api-key|api-subscription-key|x-goog-api-key)$|token|secret|password|signature/i;
const SECRET_PARAM = /^(access_token|refresh_token|id_token|token|key|api_key|apikey|secret|client_secret|password|signature|sig|code|assertion|hub\.verify_token)$/i;

const masked = (v) => `•••• hidden (${String(v || '').length} characters)`;

export function maskUrl(url) {
  try {
    const u = new URL(url);
    for (const k of [...u.searchParams.keys()]) {
      if (SECRET_PARAM.test(k)) u.searchParams.set(k, 'hidden');
    }
    if (u.password) u.password = 'hidden';
    return u.href;
  } catch { return String(url || ''); }
}

/** Headers as a plain object, credentials masked. Accepts every shape Node and fetch use. */
export function maskHeaders(h) {
  const out = {};
  if (!h) return out;
  const put = (k, v) => {
    const key = String(k).toLowerCase();
    const val = Array.isArray(v) ? v.join(', ') : String(v);
    out[key] = SECRET_HEADER.test(key) ? masked(val) : val.slice(0, 500);
  };
  try {
    if (typeof h.forEach === 'function' && !Array.isArray(h)) h.forEach((v, k) => put(k, v));
    else if (Array.isArray(h)) for (const [k, v] of h) put(k, v);
    else for (const [k, v] of Object.entries(h)) if (v !== undefined) put(k, v);
  } catch { /* an odd shape: record none rather than fail */ }
  return out;
}

// ── The body ────────────────────────────────────────────────────────────────

const TEXTUAL = /json|text|xml|x-www-form-urlencoded|javascript|graphql/i;

/** A long run of base64 is a file -- a recording, an image -- and is said, not kept. */
function shrinkBinary(text) {
  return text.replace(/[A-Za-z0-9+/=]{2000,}/g, (m) => `[encoded file: ${Math.floor(m.length * 0.75).toLocaleString('en')} bytes, not kept in this log]`);
}

/**
 * What the log keeps of a body: its size, the hash of all of it, and the
 * text where it is text. Pure, so it is tested directly.
 */
export function describeBody(buf, contentType = '') {
  if (!buf || !buf.length) return { requestBytes: 0, bodySha256: '', body: '', bodyKind: 'none', truncated: false };
  const sha = crypto.createHash('sha256').update(buf).digest('hex');
  const looksText = TEXTUAL.test(contentType) || (!contentType && !buf.subarray(0, 512).includes(0));
  if (!looksText) {
    return { requestBytes: buf.length, bodySha256: sha, body: '', bodyKind: contentType || 'binary', truncated: false };
  }
  const text = buf.subarray(0, BODY_KEEP * 4).toString('utf8');
  let kept = shrinkBinary(text);
  const truncated = kept.length > BODY_KEEP || buf.length > BODY_KEEP * 4;
  if (kept.length > BODY_KEEP) kept = kept.slice(0, BODY_KEEP);
  return { requestBytes: buf.length, bodySha256: sha, body: kept, bodyKind: contentType || 'text', truncated };
}

/** A fetch body as bytes, where it can be read without consuming it. */
async function fetchBodyBytes(body) {
  if (body == null) return null;
  if (typeof body === 'string') return Buffer.from(body);
  if (Buffer.isBuffer(body)) return body;
  if (body instanceof ArrayBuffer) return Buffer.from(body);
  if (ArrayBuffer.isView(body)) return Buffer.from(body.buffer, body.byteOffset, body.byteLength);
  if (body instanceof URLSearchParams) return Buffer.from(body.toString());
  if (typeof Blob !== 'undefined' && body instanceof Blob) return Buffer.from(await body.arrayBuffer());
  if (typeof FormData !== 'undefined' && body instanceof FormData) {
    const parts = [];
    for (const [k, v] of body.entries()) parts.push(typeof v === 'string' ? `${k}=${v}` : `${k}=[file ${v.size} bytes]`);
    return Buffer.from(parts.join('\n'));
  }
  return Buffer.from('[a streamed body: its bytes were not readable here]');
}

// ── Which part of the application sent it ───────────────────────────────────

/** The first file of the application's own on the stack: 'answerService.js', 'notifyService.js'. */
export function senderFromStack(stack = new Error().stack) {
  for (const line of String(stack || '').split('\n').slice(1)) {
    const m = line.match(/\(?(?:file:\/\/\/?)?([^()\s]+\.m?js):\d+:\d+\)?\s*$/);
    if (!m) continue;
    const file = m[1].replace(/\\/g, '/');
    if (/node_modules|node:|egressLog\.js|llmCore\.js|llmService\.js/.test(file)) continue;
    if (!/\/(services|controllers|routes|scripts|middleware)\/|server\.js$/.test(file)) continue;
    return path.posix.basename(file);
  }
  return 'the application';
}

/**
 * A stack deep enough to reach the application's own code. Node keeps ten
 * frames by default, and the model SDK's own calls fill all ten before the
 * application's file -- so every model call was put down to "the application".
 */
function deepStack() {
  const was = Error.stackTraceLimit;
  Error.stackTraceLimit = 60;
  try { return new Error().stack; } finally { Error.stackTraceLimit = was; }
}

// ── Keeping it, in order, chained ───────────────────────────────────────────

/** The fields the chain covers: everything kept for 90 days. */
const CHAINED = ['seq', 'at', 'category', 'purpose', 'method', 'url', 'host', 'headers', 'sender',
  'status', 'error', 'durationMs', 'requestBytes', 'bodySha256', 'storedSha256', 'bodyKind', 'truncated',
  'responseBytes', 'model', 'unrecordedBefore', 'prevHash'];

function canonical(v) {
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
  if (v && typeof v === 'object' && !(v instanceof Date)) {
    return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}';
  }
  if (v instanceof Date) return JSON.stringify(v.toISOString());
  return JSON.stringify(v === undefined ? null : v);
}

export function entryHash(entry) {
  const picked = {};
  for (const k of CHAINED) picked[k] = entry[k] === undefined ? null : entry[k];
  return crypto.createHash('sha256').update(canonical(picked)).digest('hex');
}

let queue = Promise.resolve();
let lastHash = null;
let lastSeq = null;
let pending = 0;
let unrecorded = 0;

function connected() {
  if (mongoose.connection.readyState === 1) return Promise.resolve();
  return new Promise((resolve) => mongoose.connection.once('connected', resolve));
}

/** Add one entry to the chain. Never throws, never makes the caller wait. */
export function record(fields) {
  if (pending >= MAX_PENDING) { unrecorded++; return; }
  pending++;
  queue = queue.then(async () => {
    try {
      await connected();
      const col = egressCollection();
      if (lastHash === null) {
        const top = await col.find({}, { projection: { seq: 1, hash: 1 } }).sort({ seq: -1 }).limit(1).toArray();
        lastSeq = top[0]?.seq || 0;
        lastHash = top[0]?.hash || 'genesis';
      }
      const entry = {
        ...fields,
        seq: lastSeq + 1,
        storedSha256: fields.body ? crypto.createHash('sha256').update(fields.body).digest('hex') : '',
        unrecordedBefore: unrecorded || 0,
        prevHash: lastHash,
      };
      entry.hash = entryHash(entry);
      await col.insertOne(entry);
      lastSeq = entry.seq;
      lastHash = entry.hash;
      unrecorded = 0;
    } catch (err) {
      unrecorded++;
      // Re-read the top next time: a failed insert must not fork the chain.
      lastHash = null;
      if (!/buffering timed out/i.test(err.message)) console.warn('[egress] could not record —', err.message);
    } finally {
      pending--;
    }
  });
}

/** Wait until everything handed to record() is written. For tests and exports. */
export function settled() { return queue; }

/**
 * Walk the chain from the oldest entry kept. Says whether it is whole, and
 * where it breaks if it is not.
 */
export async function verify() {
  const col = egressCollection();
  let prev = null;
  let expectSeq = null;
  let count = 0;
  let first = null;
  let last = null;
  const cursor = col.find({}).sort({ seq: 1 });
  for await (const e of cursor) {
    count++;
    if (!first) first = e;
    const why = (prev !== null && e.prevHash !== prev) ? 'it does not follow the entry before it'
      : (expectSeq !== null && e.seq !== expectSeq) ? `entries ${expectSeq} to ${e.seq - 1} are missing`
      : entryHash(e) !== e.hash ? 'its contents were changed after it was written'
      : (e.body && e.storedSha256 && crypto.createHash('sha256').update(e.body).digest('hex') !== e.storedSha256) ? 'its body was changed after it was written'
      : '';
    if (why) return { ok: false, entries: count, brokenAt: e.seq, reason: `Entry ${e.seq}: ${why}.`, firstSeq: first.seq };
    prev = e.hash;
    expectSeq = e.seq + 1;
    last = e;
  }
  return { ok: true, entries: count, firstSeq: first?.seq || null, lastSeq: last?.seq || null, lastHash: last?.hash || '', firstAt: first?.at || null };
}

/** Bodies after 30 days, entries after 90. The oldest kept entry becomes the chain's start. */
export async function prune(now = Date.now()) {
  const col = egressCollection();
  await col.updateMany({ at: { $lt: new Date(now - BODY_DAYS * 86400000) }, body: { $ne: '' } },
    { $set: { body: '', bodyPruned: true } });
  await col.deleteMany({ at: { $lt: new Date(now - ENTRY_DAYS * 86400000) } });
}

// ── Installing it ───────────────────────────────────────────────────────────

function finish(base, extra) {
  try {
    const { startedAt, ...rest } = base;
    record({ error: '', responseBytes: null, model: '', ...rest, ...extra, durationMs: Date.now() - startedAt });
  } catch { unrecorded++; }
}

function startOf(url, method, headers) {
  const category = classify(url);
  return {
    at: new Date(),
    startedAt: Date.now(),
    category,
    purpose: purposeOf(url, category),
    method: String(method || 'GET').toUpperCase(),
    url: maskUrl(url),
    host: hostOf(url),
    headers: maskHeaders(headers),
    sender: senderFromStack(deepStack()),
  };
}

function contentTypeOf(h) {
  const m = maskHeaders(h);
  return m['content-type'] || '';
}

function patchFetch() {
  const orig = globalThis.fetch;
  if (typeof orig !== 'function' || orig.__svargEgress) return;
  const wrapped = async function fetch(input, init) {
    let url = '';
    try { url = typeof input === 'string' ? input : input instanceof URL ? input.href : String(input?.url || ''); } catch { /* unknown */ }
    if (!url || isSelf(url)) return orig.call(this, input, init);
    const headers = init?.headers || input?.headers;
    const base = startOf(url, init?.method || input?.method, headers);
    let bodyInfo = describeBody(null);
    try {
      let bytes = await fetchBodyBytes(init?.body);
      if (!bytes && input && typeof input === 'object' && typeof input.clone === 'function' && input.body) {
        bytes = Buffer.from(await input.clone().arrayBuffer());
      }
      bodyInfo = describeBody(bytes, contentTypeOf(headers));
    } catch { /* recorded without its body */ }
    try {
      const res = await orig.call(this, input, init);
      let model = '';
      // Which model answered, where the answer says: what an auditor most wants to know of an AI call.
      if (base.category === 'ai' && /json/i.test(res.headers.get('content-type') || '')) {
        try { model = String((await res.clone().json())?.model || ''); } catch { /* not readable */ }
      }
      finish(base, { ...bodyInfo, status: res.status, responseBytes: Number(res.headers.get('content-length')) || null, model });
      return res;
    } catch (err) {
      finish(base, { ...bodyInfo, status: 0, error: String(err?.message || err).slice(0, 300) });
      throw err;
    }
  };
  wrapped.__svargEgress = true;
  globalThis.fetch = wrapped;
}

/** The address an http(s).request call is going to, from any of its argument shapes. */
export function requestUrl(args, defaultProtocol) {
  let [a, b] = args;
  if (typeof a === 'string' || a instanceof URL) {
    const u = new URL(String(a));
    if (b && typeof b === 'object' && typeof b !== 'function') {
      if (b.path) { const p = new URL(b.path, u); u.pathname = p.pathname; u.search = p.search; }
      if (b.hostname || b.host) u.hostname = b.hostname || String(b.host).split(':')[0];
      if (b.port) u.port = String(b.port);
    }
    return { url: u.href, opts: (b && typeof b === 'object') ? b : {} };
  }
  const o = a || {};
  const protocol = o.protocol || defaultProtocol;
  const host = o.hostname || String(o.host || 'localhost').split(':')[0];
  const port = o.port ? `:${o.port}` : '';
  const hostPart = host.includes(':') && !host.startsWith('[') ? `[${host}]` : host;
  return { url: `${protocol}//${hostPart}${port}${o.path || '/'}`, opts: o };
}

function patchModule(mod, protocol) {
  const orig = mod.request;
  if (orig.__svargEgress) return;
  const request = function request(...args) {
    const req = orig.apply(this, args);
    try {
      const { url, opts } = requestUrl(args, protocol);
      if (isSelf(url)) return req;
      const chunks = [];
      let size = 0;
      const hash = crypto.createHash('sha256');
      const take = (chunk, enc) => {
        if (chunk == null || typeof chunk === 'function') return;
        const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, typeof enc === 'string' ? enc : 'utf8');
        hash.update(buf);
        size += buf.length;
        if (chunks.reduce((n, c) => n + c.length, 0) < BODY_KEEP * 4) chunks.push(buf);
      };
      const write = req.write;
      req.write = function (chunk, enc, cb) { try { take(chunk, enc); } catch { /* keep going */ } return write.call(this, chunk, enc, cb); };
      const end = req.end;
      req.end = function (chunk, enc, cb) { try { take(chunk, enc); } catch { /* keep going */ } return end.call(this, chunk, enc, cb); };

      let base = null;
      let done = false;
      const close = (extra) => {
        if (done) return;
        done = true;
        // The headers as finally sent, which axios sets after the call is made.
        let headers = {};
        try { headers = req.getHeaders(); } catch { /* none */ }
        base.headers = maskHeaders(headers);
        const info = describeBody(Buffer.concat(chunks), contentTypeOf(headers));
        if (size) { info.requestBytes = size; info.bodySha256 = hash.copy().digest('hex'); }
        finish(base, { ...info, ...extra });
      };
      base = startOf(url, req.method || opts.method, opts.headers);
      req.once('response', (res) => close({ status: res.statusCode, responseBytes: Number(res.headers['content-length']) || null }));
      req.once('error', (err) => close({ status: 0, error: String(err?.message || err).slice(0, 300) }));
      req.once('close', () => close({ status: 0, error: 'closed before an answer' }));
    } catch { unrecorded++; }
    return req;
  };
  request.__svargEgress = true;
  mod.request = request;
  mod.get = function get(...args) {
    const req = mod.request(...args);
    req.end();
    return req;
  };
}

let installed = false;

/** Start recording. Called once, first thing, by server.js. */
export function install() {
  if (installed) return;
  installed = true;
  patchFetch();
  patchModule(http, 'http:');
  patchModule(https, 'https:');
  try { syncBuiltinESMExports(); } catch { /* older Node: the default exports are patched */ }
  const t = setInterval(() => { prune().catch(() => {}); }, 6 * 60 * 60 * 1000);
  t.unref?.();
}

// Installed when imported, so importing it first is the whole of the wiring.
install();
