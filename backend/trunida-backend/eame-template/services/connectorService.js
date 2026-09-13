/**
 * Connectors: live sources the owner attaches to a dataset, inside this
 * application, with credentials that never leave it.
 *
 * ── The frame ──────────────────────────────────────────────────────────────
 *
 * Every connector is the same four things: connect (keep the credentials,
 * encrypted, in this application's own database), test (can we reach the
 * source with them), sync (pull, map onto the dataset's columns, land the
 * rows) and disconnect (forget the credentials; the rows stay, marked by
 * their _source). What differs per kind lives in services/connectors/<kind>.js
 * and is only: which fields it needs, how to test, and how to pull.
 *
 * ── Where rows land, and the one rule ──────────────────────────────────────
 *
 * Every way in -- a file, a folder, a WhatsApp export, a connector, the chat
 * -- ends in landRows. Rows are written to data/own/<slug>.<source>.csv with
 * _source=<source>, and the seed script for the dataset is called with
 * { datasetName, filePath }; the seed replaces the sample rows and the rows
 * that already carry that _source.
 *
 * The rule that lets the old way of working and the new one coexist: a
 * dataset has a KEY column (declared in data/datasets.json, or guessed:
 * see datasetKey). A landed row whose key already exists is an UPDATE of
 * that row, wherever it came from; a row without one is an ADD; a row the
 * source no longer has is KEPT and marked missing in the provenance, never
 * deleted by a landing. So the coach adds a student in the chat on Monday
 * and the admin adds the same student to the sheet on Wednesday, and there
 * is one row: the sheet's, with the chat's provenance replaced. One key,
 * one row, across sources. The provenance (svarg_provenance) says for each
 * key which source and file it last came from, who brought it and when.
 *
 * ── Credentials ────────────────────────────────────────────────────────────
 *
 * AES-256-GCM, keyed by CONNECTOR_ENCRYPTION_KEY from this application's
 * environment (Svarg sets one per application at go-live; a self-hosted
 * install sets its own). Without it the key is derived from JWT_SECRET, so
 * nothing is ever stored in the clear, but a dedicated key is the right
 * answer because it keeps the credentials and the key in different places.
 * Svarg's platform holds neither.
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import { sendSignal } from './tenantSignals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OWN_DIR = path.join(ROOT, 'data', 'own');

/** The same ceilings as a file import: a source, not a database dump. */
export const MAX_ROWS = 50000;
export const MAX_CELL = 2000;

/**
 * Live connectors: whatever is in services/connectors/. Eame ships only the
 * kinds this application's industry calls for (Svarg keeps the catalog;
 * see sourceCatalogService there), so the set is read from the directory
 * rather than written here. WhatsApp exports are parsed on the Data page and
 * a folder is uploaded there, so neither is a module.
 */
export const KINDS = await loadKinds();

async function loadKinds() {
  const dir = path.join(__dirname, 'connectors');
  const out = {};
  if (!fs.existsSync(dir)) return out;
  for (const f of fs.readdirSync(dir).sort()) {
    if (!/^[a-z0-9-]+\.js$/.test(f)) continue;
    try {
      const mod = await import(new URL('./connectors/' + f, import.meta.url).href);
      if (mod.kind && typeof mod.pull === 'function') out[mod.kind] = mod;
    } catch (err) {
      console.warn(`[connectors] ${f} did not load — ${err.message}`);
    }
  }
  return out;
}

/** How often a scheduled sync runs, and how often the scheduler looks. */
const SCHEDULES = { hourly: 60 * 60 * 1000, daily: 24 * 60 * 60 * 1000 };
const TICK_MS = 5 * 60 * 1000;

// ── Encryption ──────────────────────────────────────────────────────────────

let warnedDerivedKey = false;
function encryptionKey() {
  const set = process.env.CONNECTOR_ENCRYPTION_KEY || '';
  if (set) {
    const buf = Buffer.from(set, 'base64');
    if (buf.length === 32) return buf;
    return crypto.createHash('sha256').update(set).digest();
  }
  if (!warnedDerivedKey) {
    warnedDerivedKey = true;
    console.warn('[connectors] CONNECTOR_ENCRYPTION_KEY is not set; deriving the key from JWT_SECRET. Set one to keep credentials and key apart.');
  }
  return crypto.createHash('sha256').update('connectors:' + (process.env.JWT_SECRET || 'your_secret_key')).digest();
}

export function encryptSecret(plain) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  return { iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), ciphertext: ciphertext.toString('base64') };
}

export function decryptSecret(box) {
  if (!box || !box.iv) return '';
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(box.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(box.tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(box.ciphertext, 'base64')), decipher.final()]).toString('utf8');
}

// ── Datasets and the index ──────────────────────────────────────────────────

export function readIndex() {
  try {
    const list = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'datasets.json'), 'utf8'));
    return Array.isArray(list) ? list : [];
  } catch { return []; }
}

export function findDataset(datasetName) {
  return readIndex().find(d => d.name === datasetName) || null;
}

/**
 * The columns that say which row is which. Declared in the index (`key`, a
 * column name or a list), else guessed:
 *   - a column that looks like an identifier (Student ID, invoice_no, code);
 *   - else, for event-shaped data, the date AND the person: an attendance
 *     reply is one row per person per day, and keying on either alone would
 *     fold a day's replies into one;
 *   - else the person, or an email or phone;
 *   - else nothing, and every landing is an add (an exact duplicate row is
 *     left alone).
 * The Data page shows the guess so the owner can see when it is wrong.
 */
export function keyColumns(dataset) {
  const columns = (dataset?.columns || []).filter(c => c !== '_source');
  if (!columns.length) return [];
  const declared = Array.isArray(dataset.key) ? dataset.key : (dataset.key ? [dataset.key] : []);
  if (declared.length && declared.every(k => columns.includes(k))) return declared;
  const words = c => String(c).replace(/[_\s-]+/g, ' ').trim();
  const idLike = columns.find(c => /(^|[^a-z])(id|key|code|number|no|ref|uid)$/i.test(words(c)))
    || columns.find(c => /^(student|player|member|customer|employee|user|coach|invoice|order|ticket|issue|roll)[ _-]?(id|no|number|code)$/i.test(c));
  if (idLike) return [idLike];
  const date = columns.find(c => /(^|[^a-z])(date|day|on|session date|when)([^a-z]|$)/i.test(words(c)) && !/time/i.test(c));
  const person = columns.find(c => /(^|[^a-z])(name|student|player|member|person|sender|guardian|parent|coach|customer|employee|child|learner|trainee|athlete|kid)([^a-z]|$)/i.test(words(c)) && !/phone|mobile|email|e mail|whatsapp|contact|address/i.test(words(c)));
  if (date && person) return [date, person];
  if (person) return [person];
  const contact = columns.find(c => /(^|[^a-z])(email|e mail|phone|mobile|whatsapp)([^a-z]|$)/i.test(words(c)));
  if (contact) return [contact];
  return [];
}

/** The key as the page shows it: "Student ID", "date + name", or ''. */
export function datasetKey(dataset) {
  return keyColumns(dataset).join(' + ');
}

export function importsCollection() {
  return mongoose.connection.collection('svarg_imports');
}

/** For each dataset key: which source and file it last came from, who, when; missing since. */
export function provenanceCollection() {
  return mongoose.connection.collection('svarg_provenance');
}

export function connectorsCollection() {
  return mongoose.connection.collection('svarg_connectors');
}

function csvCell(v) {
  const s = String(v ?? '').slice(0, MAX_CELL).replace(/\r?\n/g, ' ');
  return /[",]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

/** A CSV this module wrote, back into rows (header first). */
export function parseCsv(text) {
  const rows = []; let row = []; let cur = ''; let q = false;
  const s = String(text || '').replace(/\r\n?/g, '\n');
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (q) {
      if (ch === '"' && s[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cur); cur = ''; }
    else if (ch === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
    else cur += ch;
  }
  if (cur.length || row.length) { row.push(cur); rows.push(row); }
  return rows.filter(r => r.some(c => String(c).trim()));
}

function sourceFile(dataset, src) {
  return path.join(OWN_DIR, src === 'own' ? `${dataset.slug}.csv` : `${dataset.slug}.${src}.csv`);
}

/** The rows an earlier landing of this source wrote, in column order, without _source. */
function readSourceRows(dataset, src) {
  const file = sourceFile(dataset, src);
  if (!fs.existsSync(file)) return [];
  const columns = (dataset.columns || []).filter(c => c !== '_source');
  const [header, ...body] = parseCsv(fs.readFileSync(file, 'utf8'));
  if (!header) return [];
  const at = columns.map(c => header.indexOf(c));
  return body.map(r => at.map(i => (i >= 0 ? String(r[i] ?? '') : '')));
}

function writeSourceRows(dataset, src, rows) {
  const columns = (dataset.columns || []).filter(c => c !== '_source');
  const header = [...columns, '_source'].map(csvCell).join(',');
  const lines = rows.map(r => [...columns.map((_, i) => csvCell(Array.isArray(r) ? r[i] : '')), src].join(','));
  fs.mkdirSync(OWN_DIR, { recursive: true });
  const file = sourceFile(dataset, src);
  fs.writeFileSync(file, header + '\n' + lines.join('\n') + '\n', 'utf8');
  return file;
}

/** A row's key: its key cells, normalised and joined; '' when they are all empty. */
export function keyOf(row, keyIndexes) {
  const parts = keyIndexes.map(i => String(row[i] ?? '').trim().toLowerCase().replace(/\s+/g, ' '));
  return parts.some(Boolean) ? parts.join('|') : '';
}

/**
 * The rule, on rows alone so it can be tested alone. `existing` and
 * `incoming` are arrays in column order; `keyIndexes` says which columns
 * make the key (none: every row is an add, unless it is an exact duplicate
 * of a row already there). Returns the merged rows plus what happened.
 */
export function mergeRows(existing, incoming, keyIndexes) {
  const merged = existing.map(r => [...r]);
  const where = new Map();
  const whole = new Set();
  if (keyIndexes.length) merged.forEach((r, i) => { const k = keyOf(r, keyIndexes); if (k && !where.has(k)) where.set(k, i); });
  else merged.forEach(r => whole.add(r.join('\u0001')));
  const seen = new Set();
  let added = 0, updated = 0, unchanged = 0;
  for (const row of incoming) {
    if (!keyIndexes.length) {
      const w = row.join('\u0001');
      if (whole.has(w)) { unchanged++; continue; }
      whole.add(w); merged.push([...row]); added++;
      continue;
    }
    const k = keyOf(row, keyIndexes);
    if (!k || !where.has(k)) {
      merged.push([...row]); added++;
      if (k) { where.set(k, merged.length - 1); seen.add(k); }
      continue;
    }
    seen.add(k);
    const i = where.get(k);
    // Last writer wins per field; an empty incoming cell does not blank a
    // value a sheet already had.
    let changed = false;
    row.forEach((v, c) => { const nv = String(v ?? ''); if (nv !== '' && nv !== merged[i][c]) { merged[i][c] = nv; changed = true; } });
    if (changed) updated++; else unchanged++;
  }
  const missing = [...where.keys()].filter(k => !seen.has(k));
  return { rows: merged, added, updated, unchanged, missing, seen: [...seen] };
}

/**
 * Call every seed script for this dataset. The contract: a default export
 * that accepts { datasetName, filePath } and seeds that dataset from that
 * file, replacing the sample rows and any rows that carry the file's own
 * _source. An older script that takes no arguments is still called; it
 * returns early on a non-empty collection, and the log says so.
 */
export async function reseed(datasetName, filePath) {
  const dir = path.join(ROOT, 'scripts');
  const results = [];
  if (!fs.existsSync(dir)) return results;
  const scripts = fs.readdirSync(dir).filter(f => /^seed.*\.m?js$/i.test(f)).sort();
  for (const filename of scripts) {
    try {
      const mod = await import(new URL('../scripts/' + filename, import.meta.url).href + '?t=' + Date.now());
      if (typeof mod.default !== 'function') continue;
      const r = await mod.default({ datasetName, filePath });
      results.push(`${filename}: ${r?.message || 'done'}`);
    } catch (err) {
      results.push(`${filename}: failed — ${err.message}`);
    }
  }
  return results;
}

/**
 * Land rows on a dataset: write the file, call the seed, log it.
 *
 * `rows` are arrays already in the dataset's column order (the page or the
 * connector mapped them); `source` is the _source value every row carries.
 * The header is always written here -- nothing trusts a client's.
 */
/**
 * Land rows on a dataset, by the rule above.
 *
 * `rows` are arrays already in the dataset's column order (the page or the
 * connector mapped them); `source` is the _source they carry; `origin` is
 * the file or thing they came from, for the record. `mode` is 'merge' (the
 * default: by key, into what this source already landed) or 'replace'
 * (what a connector's full pull means: this source's rows are exactly
 * these now). `complete` says the batch is the whole of what the source
 * holds, so a key it does not carry is marked missing; a chat add is not
 * complete and marks nothing.
 *
 * Whatever the mode, a key that lands here is removed from any OTHER
 * source's file for this dataset and that file reseeded, so there is one
 * row per key in the application.
 */
export async function landRows({ dataset, rows, source, by = 'owner', detail = '', origin = '', mode = 'merge', complete = false }) {
  if (!Array.isArray(rows) || !rows.length) throw new Error('No rows to land.');
  if (rows.length > MAX_ROWS) throw new Error(`That is more than ${MAX_ROWS.toLocaleString()} rows. Import it in parts.`);
  const src = String(source || 'own').replace(/[^a-z0-9_-]/gi, '').toLowerCase() || 'own';
  const columns = (dataset.columns || []).filter(c => c !== '_source');
  const key = datasetKey(dataset);
  const keyIndexes = keyColumns(dataset).map(k => columns.indexOf(k)).filter(i => i >= 0);
  const incoming = rows.map(r => columns.map((_, i) => String((Array.isArray(r) ? r[i] : '') ?? '')));

  let result;
  if (mode === 'replace') {
    result = { rows: incoming, added: incoming.length, updated: 0, unchanged: 0, missing: [], seen: keyIndexes.length ? incoming.map(r => keyOf(r, keyIndexes)).filter(Boolean) : [] };
  } else {
    result = mergeRows(readSourceRows(dataset, src), incoming, keyIndexes);
  }
  const file = writeSourceRows(dataset, src, result.rows);
  const seeded = await reseed(dataset.name, file);

  // One row per key across sources: the other files let go of these keys.
  const moved = [];
  if (keyIndexes.length && result.seen.length) {
    const seen = new Set(result.seen);
    for (const other of otherSources(dataset, src)) {
      const before = readSourceRows(dataset, other);
      const after = before.filter(r => !seen.has(keyOf(r, keyIndexes)));
      if (after.length === before.length) continue;
      writeSourceRows(dataset, other, after);
      await reseed(dataset.name, sourceFile(dataset, other));
      moved.push({ from: other, rows: before.length - after.length });
    }
  }

  await recordProvenance({ dataset, key, keyed: keyIndexes.length > 0, result, src, by, origin, complete });

  const entry = {
    datasetName: dataset.name, rows: incoming.length, source: src, origin,
    added: result.added, updated: result.updated, unchanged: result.unchanged, missing: complete ? result.missing.length : 0,
    file: path.relative(ROOT, file).split(path.sep).join('/'),
    seeded: seeded.join(' | '), detail, at: new Date(), by,
  };
  await importsCollection().insertOne(entry).catch(() => {});
  // Svarg hears that rows arrived -- the dataset, the kind of source and the
  // count -- and nothing of the rows.
  sendSignal('import', { datasetName: dataset.name, source: src, rows: incoming.length });
  return { rows: incoming.length, added: result.added, updated: result.updated, unchanged: result.unchanged, missing: complete ? result.missing.length : 0, moved, key, seeded, file: entry.file };
}

/**
 * Everything the application holds for a dataset, with where each row came
 * from: the owner's rows from every source file, or the sample rows when
 * nothing of theirs has arrived yet. What the tabs show; the seed loaded
 * the same files, so this is the application's data as the chat sees it.
 */
export function readAllRows(dataset, kind = 'own') {
  const columns = (dataset.columns || []).filter(c => c !== '_source');
  const out = [];
  if (kind === 'sample') {
    // What the application was built with: generated to show the shape,
    // never anyone's records. Kept apart so it is never mistaken for theirs.
    try {
      const [header, ...body] = parseCsv(fs.readFileSync(path.join(ROOT, dataset.file), 'utf8'));
      const at = columns.map(c => header.indexOf(c));
      for (const r of body) out.push({ cells: at.map(i => (i >= 0 ? String(r[i] ?? '') : '')), source: 'sample' });
    } catch { /* no sample file */ }
    return { columns, rows: out, sample: true };
  }
  for (const src of otherSources(dataset, '')) {
    for (const r of readSourceRows(dataset, src)) out.push({ cells: r, source: src });
  }
  return { columns, rows: out, sample: false };
}

/** How much of each a dataset holds: the owner's rows, and the sample's. */
export function countRows(dataset) {
  return { own: readAllRows(dataset, 'own').rows.length, sample: readAllRows(dataset, 'sample').rows.length };
}

/** The other _source files this dataset has on disk. */
function otherSources(dataset, src) {
  if (!fs.existsSync(OWN_DIR)) return [];
  const escaped = dataset.slug.replace(/[.*+?^${}()|[\]\\]/g, (m) => '\\' + m);
  const re = new RegExp('^' + escaped + '(?:\\.([a-z0-9_-]+))?\\.csv$', 'i');
  return fs.readdirSync(OWN_DIR)
    .map(f => f.match(re)).filter(Boolean)
    .map(m => m[1] || 'own')
    .filter(s => s !== src);
}

async function recordProvenance({ dataset, key, keyed, result, src, by, origin, complete }) {
  if (!keyed) return;
  const col = provenanceCollection();
  const now = new Date();
  try {
    if (result.seen.length) {
      await col.bulkWrite(result.seen.map(k => ({
        updateOne: {
          filter: { datasetName: dataset.name, key: k },
          update: { $set: { source: src, origin, by, at: now, missingSince: null }, $setOnInsert: { datasetName: dataset.name, key: k, keyColumn: key } },
          upsert: true,
        },
      })), { ordered: false });
    }
    if (complete && result.missing.length) {
      await col.updateMany(
        { datasetName: dataset.name, source: src, key: { $in: result.missing }, missingSince: null },
        { $set: { missingSince: now } },
      );
    }
  } catch (err) {
    console.warn('[data] provenance not recorded —', err.message);
  }
}

/** What the Data page shows per dataset: rows by source, the last change, how many the source no longer has. */
export async function provenanceSummary() {
  const out = {};
  try {
    const rows = await provenanceCollection().aggregate([
      { $group: { _id: { d: '$datasetName', s: '$source' }, n: { $sum: 1 }, last: { $max: '$at' }, missing: { $sum: { $cond: [{ $ifNull: ['$missingSince', false] }, 1, 0] } } } },
    ]).toArray();
    for (const r of rows) {
      const d = out[r._id.d] || (out[r._id.d] = { bySource: {}, lastChange: null, missing: 0 });
      d.bySource[r._id.s] = r.n;
      d.missing += r.missing;
      if (!d.lastChange || r.last > d.lastChange) d.lastChange = r.last;
    }
  } catch { /* an application without provenance yet */ }
  return out;
}

/** Objects from a connector, onto the dataset's columns, by the connector's mapping. */
export function mapOntoColumns(dataset, objects, mapping) {
  const columns = (dataset.columns || []).filter(c => c !== '_source');
  return objects.map(o => columns.map(c => {
    const from = mapping[c];
    const v = from ? o[from] : (c in o ? o[c] : '');
    return v == null ? '' : String(v);
  }));
}

/**
 * The best guess at which source field feeds which dataset column: the same
 * name, then one containing the other. The owner adjusts what it gets wrong,
 * and the adjustment is saved with the connector.
 */
export function guessMapping(columns, fields) {
  const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  const used = new Set();
  const out = {};
  for (const c of columns) {
    if (c === '_source') continue;
    const nc = norm(c);
    let pick = fields.find(f => !used.has(f) && norm(f) === nc);
    if (!pick) pick = fields.find(f => { const nf = norm(f); return !used.has(f) && nf && (nf.includes(nc) || nc.includes(nf)); });
    if (pick) { used.add(pick); out[c] = pick; }
  }
  return out;
}

// ── Connections ─────────────────────────────────────────────────────────────

function kindOf(kind) {
  const k = KINDS[String(kind || '').toLowerCase()];
  if (!k) throw new Error(`"${kind}" is not a source this application can connect to.`);
  return k;
}

/** The config with its secrets encrypted, and only the fields the kind declares. */
function sealConfig(kind, config = {}) {
  const sealed = {};
  for (const f of kind.fields) {
    const v = config[f.name];
    if (v == null || v === '') continue;
    sealed[f.name] = f.secret ? encryptSecret(v) : String(v);
  }
  return sealed;
}

function openConfig(kind, sealed = {}) {
  const open = {};
  for (const f of kind.fields) {
    if (!(f.name in sealed)) continue;
    open[f.name] = f.secret ? decryptSecret(sealed[f.name]) : sealed[f.name];
  }
  return open;
}

/** What the page may see: never a secret, only whether one is set. */
export function publicView(doc) {
  if (!doc) return null;
  const kind = KINDS[doc.kind];
  const config = {};
  for (const f of kind?.fields || []) {
    if (!(f.name in (doc.config || {}))) continue;
    config[f.name] = f.secret ? '••••••' : doc.config[f.name];
  }
  return {
    id: String(doc._id), kind: doc.kind, label: kind?.label || doc.kind, datasetName: doc.datasetName,
    config, mapping: doc.mapping || {}, schedule: doc.schedule || 'manual',
    status: doc.status || 'connected', lastSyncAt: doc.lastSyncAt || null, lastRows: doc.lastRows || 0,
    lastError: doc.lastError || '', createdAt: doc.createdAt,
  };
}

export function catalog() {
  return Object.values(KINDS).map(k => ({ kind: k.kind, label: k.label, help: k.help, fields: k.fields, provides: k.provides }));
}

export async function listConnectors() {
  const docs = await connectorsCollection().find({}).sort({ createdAt: 1 }).toArray();
  return docs.map(publicView);
}

/** Test, then keep. A connection that cannot reach its source is not kept. */
export async function createConnector({ kind: kindName, datasetName, config = {}, mapping = null, schedule = 'manual' }) {
  const kind = kindOf(kindName);
  const dataset = findDataset(datasetName);
  if (!dataset) throw new Error('That dataset is not one this application was built on.');
  for (const f of kind.fields) {
    if (f.required !== false && !String(config[f.name] || '').trim()) throw new Error(`${f.label} is needed.`);
  }
  await kind.test(config);
  const columns = (dataset.columns || []).filter(c => c !== '_source');
  const doc = {
    kind: kind.kind, datasetName: dataset.name, config: sealConfig(kind, config),
    mapping: mapping && typeof mapping === 'object' ? mapping : guessMapping(columns, kind.provides),
    schedule: SCHEDULES[schedule] ? schedule : 'manual',
    status: 'connected', lastSyncAt: null, lastRows: 0, lastError: '', createdAt: new Date(),
  };
  const r = await connectorsCollection().insertOne(doc);
  return publicView({ ...doc, _id: r.insertedId });
}

async function findDoc(id) {
  let oid;
  try { oid = new mongoose.Types.ObjectId(String(id)); } catch { return null; }
  return connectorsCollection().findOne({ _id: oid });
}

export async function updateConnector(id, { config, mapping, schedule } = {}) {
  const doc = await findDoc(id);
  if (!doc) throw new Error('No such connection.');
  const kind = kindOf(doc.kind);
  const $set = {};
  if (config && typeof config === 'object') {
    // A secret left blank keeps the one already stored.
    const merged = { ...openConfig(kind, doc.config), ...Object.fromEntries(Object.entries(config).filter(([, v]) => v !== '' && v != null)) };
    await kind.test(merged);
    $set.config = sealConfig(kind, merged);
  }
  if (mapping && typeof mapping === 'object') $set.mapping = mapping;
  if (schedule != null) $set.schedule = SCHEDULES[schedule] ? schedule : 'manual';
  if (Object.keys($set).length) await connectorsCollection().updateOne({ _id: doc._id }, { $set });
  return publicView(await findDoc(id));
}

export async function testConnector(id) {
  const doc = await findDoc(id);
  if (!doc) throw new Error('No such connection.');
  const kind = kindOf(doc.kind);
  return kind.test(openConfig(kind, doc.config));
}

/** Forget the credentials. The rows it brought stay, marked by their _source. */
export async function deleteConnector(id) {
  const doc = await findDoc(id);
  if (!doc) throw new Error('No such connection.');
  await connectorsCollection().deleteOne({ _id: doc._id });
  return { ok: true };
}

const running = new Set();

/** The connections of one kind with their credentials opened -- for a webhook that has to know whom a message is for. */
export async function openConnectorsOfKind(kindName) {
  const kind = KINDS[String(kindName || '').toLowerCase()];
  if (!kind) return [];
  const docs = await connectorsCollection().find({ kind: kind.kind }).toArray();
  return docs.map(d => ({ ...d, config: openConfig(kind, d.config) }));
}

export async function syncConnector(id, { by = 'owner' } = {}) {
  const doc = await findDoc(id);
  if (!doc) throw new Error('No such connection.');
  if (running.has(String(doc._id))) throw new Error('This source is already syncing.');
  running.add(String(doc._id));
  try {
    const kind = kindOf(doc.kind);
    const dataset = findDataset(doc.datasetName);
    if (!dataset) throw new Error('The dataset this source feeds is no longer in this application.');
    await connectorsCollection().updateOne({ _id: doc._id }, { $set: { status: 'syncing', lastError: '' } });

    const objects = await kind.pull(openConfig(kind, doc.config), { maxRows: MAX_ROWS });
    if (!objects.length) {
      await connectorsCollection().updateOne({ _id: doc._id }, { $set: { status: 'connected', lastSyncAt: new Date(), lastRows: 0 } });
      return { rows: 0, message: 'The source returned nothing to import.' };
    }
    const rows = mapOntoColumns(dataset, objects, doc.mapping || {});
    // A pull is the whole source: this source's rows are exactly these now.
    const landed = await landRows({ dataset, rows, source: doc.kind, by, detail: kind.describe ? kind.describe(openConfig(kind, doc.config)) : '', origin: kind.label, mode: 'replace', complete: true });
    await connectorsCollection().updateOne({ _id: doc._id }, { $set: { status: 'connected', lastSyncAt: new Date(), lastRows: landed.rows } });
    return landed;
  } catch (err) {
    await connectorsCollection().updateOne({ _id: doc._id }, { $set: { status: 'error', lastError: String(err.message || err).slice(0, 500) } }).catch(() => {});
    throw err;
  } finally {
    running.delete(String(doc._id));
  }
}

// ── The schedule ────────────────────────────────────────────────────────────

/** Which connections are due, as of `now`. Pure, so it can be tested. */
export function dueConnectors(docs, now = Date.now()) {
  return docs.filter(d => {
    const every = SCHEDULES[d.schedule];
    if (!every) return false;
    const last = d.lastSyncAt ? new Date(d.lastSyncAt).getTime() : 0;
    return now - last >= every;
  });
}

let timer = null;

/**
 * Runs from this application's own process; nothing calls back into Svarg.
 * Looks every five minutes, syncs whatever is due, and logs the outcome the
 * way the Data page would show it.
 */
export function startScheduler() {
  if (timer) return timer;
  const tick = async () => {
    try {
      if (mongoose.connection.readyState !== 1) return;
      const due = dueConnectors(await connectorsCollection().find({ schedule: { $in: Object.keys(SCHEDULES) } }).toArray());
      for (const d of due) {
        try {
          const r = await syncConnector(d._id, { by: 'schedule' });
          console.log(`[connectors] ${d.kind} → ${d.datasetName}: ${r.rows} rows`);
        } catch (err) {
          console.error(`[connectors] ${d.kind} → ${d.datasetName} failed — ${err.message}`);
        }
      }
    } catch (err) {
      console.error('[connectors] scheduler tick failed —', err.message);
    }
  };
  timer = setInterval(tick, TICK_MS);
  if (typeof timer.unref === 'function') timer.unref();
  return timer;
}

export function stopScheduler() {
  if (timer) clearInterval(timer);
  timer = null;
}
