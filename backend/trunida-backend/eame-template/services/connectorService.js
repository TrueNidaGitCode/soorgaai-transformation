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
 * ── Where rows land ────────────────────────────────────────────────────────
 *
 * The same way an imported file does. The pulled rows are written to
 * data/own/<slug>.<kind>.csv with _source=<kind>, and the seed script for the
 * dataset is called with { datasetName, filePath }. The seed replaces the
 * sample rows and the rows that already carry that _source, so running a
 * sync twice leaves one copy, and a file the owner imported by hand
 * (_source=own) is never touched by a connector.
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
import * as jira from './connectors/jira.js';
import * as confluence from './connectors/confluence.js';
import * as github from './connectors/github.js';
import { sendSignal } from './tenantSignals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OWN_DIR = path.join(ROOT, 'data', 'own');

/** The same ceilings as a file import: a source, not a database dump. */
export const MAX_ROWS = 50000;
export const MAX_CELL = 2000;

/** Live connectors. WhatsApp is a file export, parsed on the Data page, so it is not here. */
export const KINDS = { jira, confluence, github };

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

export function importsCollection() {
  return mongoose.connection.collection('svarg_imports');
}

export function connectorsCollection() {
  return mongoose.connection.collection('svarg_connectors');
}

function csvCell(v) {
  const s = String(v ?? '').slice(0, MAX_CELL).replace(/\r?\n/g, ' ');
  return /[",]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
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
export async function landRows({ dataset, rows, source, by = 'owner', detail = '' }) {
  if (!Array.isArray(rows) || !rows.length) throw new Error('No rows to land.');
  if (rows.length > MAX_ROWS) throw new Error(`That is more than ${MAX_ROWS.toLocaleString()} rows. Import it in parts.`);
  const src = String(source || 'own').replace(/[^a-z0-9_-]/gi, '').toLowerCase() || 'own';
  const columns = (dataset.columns || []).filter(c => c !== '_source');
  const header = [...columns, '_source'].map(csvCell).join(',');
  const lines = rows.map(r => [...columns.map((_, i) => csvCell(Array.isArray(r) ? r[i] : '')), src].join(','));
  const csv = header + '\n' + lines.join('\n') + '\n';

  fs.mkdirSync(OWN_DIR, { recursive: true });
  const file = path.join(OWN_DIR, src === 'own' ? `${dataset.slug}.csv` : `${dataset.slug}.${src}.csv`);
  fs.writeFileSync(file, csv, 'utf8');

  const seeded = await reseed(dataset.name, file);
  const entry = {
    datasetName: dataset.name, rows: rows.length, source: src,
    file: path.relative(ROOT, file).split(path.sep).join('/'),
    seeded: seeded.join(' | '), detail, at: new Date(), by,
  };
  await importsCollection().insertOne(entry).catch(() => {});
  // Svarg hears that rows arrived -- the dataset, the kind of source and the
  // count -- and nothing of the rows.
  sendSignal('import', { datasetName: dataset.name, source: src, rows: rows.length });
  return { rows: rows.length, seeded, file: entry.file };
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
    const landed = await landRows({ dataset, rows, source: doc.kind, by, detail: kind.describe ? kind.describe(openConfig(kind, doc.config)) : '' });
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
