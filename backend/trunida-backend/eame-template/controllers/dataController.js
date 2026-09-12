/**
 * The Data page's back end: the datasets this application was built on,
 * importing the owner's own file onto one of them, and the log of imports.
 *
 * ── Why this is here and not on Svarg ──────────────────────────────────────
 *
 * A customer's records never go to Svarg. The blueprint and this application
 * were built from the SHAPE of the data -- column names, a few invented rows
 * -- and the rows themselves are imported here, inside the application the
 * customer owns, into the database that is theirs. Svarg's platform sees
 * usage and feedback; it does not see a row.
 *
 * ── The owner ──────────────────────────────────────────────────────────────
 *
 * Importing is the owner's act, and the owner is whoever holds the owner key
 * (APP_OWNER_KEY, issued at go-live and shown once on the Svarg screen). The
 * key is exchanged for a session with role 'owner'; the public session that
 * opens the chat carries role 'user' and is refused everything below.
 *
 * ── How an import lands ────────────────────────────────────────────────────
 *
 * data/datasets.json lists each dataset with the columns it expects -- the
 * header of its sample file. The page matches the owner's columns onto those
 * and sends rows already in that order. They are written to data/own/<slug>.csv
 * with a _source column of "own", and the seed script for the dataset is
 * called with { datasetName, filePath } so the rows replace the sample ones
 * in the database. The application's "this is sample data" notice keys on
 * _source, so it disappears by itself.
 *
 * The file on disk is a convenience for a self-hosted install; the database
 * is the record. On a host whose filesystem does not survive a redeploy the
 * rows are still in the database, and the seed-on-boot path never overwrites
 * a collection that already holds rows.
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OWN_DIR = path.join(ROOT, 'data', 'own');

/** Hard limits: a file, not a database dump, and a request that stays in memory. */
const MAX_ROWS = 50000;
const MAX_CELL = 2000;

// ── The owner session ───────────────────────────────────────────────────────

export function ownerStatus(req, res) {
  res.json({ configured: !!process.env.APP_OWNER_KEY });
}

export function ownerSession(req, res) {
  const expected = process.env.APP_OWNER_KEY || '';
  if (!expected) return res.status(503).json({ error: 'No owner key is configured on this application.' });
  const given = String(req.body?.key || '');
  // Constant-time, so the length or a prefix of the key cannot be learned by
  // timing; the hashes make the two the same length whatever was typed.
  const a = crypto.createHash('sha256').update(given).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  if (!crypto.timingSafeEqual(a, b)) return res.status(401).json({ error: 'That is not the owner key.' });
  const token = jwt.sign({ userId: 'owner', role: 'owner' }, process.env.JWT_SECRET || 'your_secret_key', { expiresIn: '12h' });
  res.json({ token });
}

/** After `protect`: the owner session, or nothing. */
export function requireOwner(req, res, next) {
  if (req.user?.role !== 'owner') return res.status(403).json({ error: 'The Data page is for the application owner. Enter the owner key first.' });
  next();
}

// ── The datasets ────────────────────────────────────────────────────────────

function readIndex() {
  try {
    const list = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'datasets.json'), 'utf8'));
    return Array.isArray(list) ? list : [];
  } catch { return []; }
}

function importsCollection() {
  return mongoose.connection.collection('svarg_imports');
}

export async function listDatasets(req, res) {
  try {
    const index = readIndex();
    const log = await importsCollection().find({}).sort({ at: -1 }).limit(200).toArray().catch(() => []);
    const latest = new Map();
    for (const entry of log) if (!latest.has(entry.datasetName)) latest.set(entry.datasetName, entry);
    res.json({
      datasets: index.map(d => {
        const last = latest.get(d.name);
        return {
          name: d.name, slug: d.slug, sampleRows: d.sampleRows,
          columns: (d.columns || []).filter(c => c !== '_source'),
          own: last ? { rows: last.rows, at: last.at, file: last.file, seeded: last.seeded || '' } : null,
        };
      }),
      imports: log.slice(0, 50),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// ── The import ──────────────────────────────────────────────────────────────

function csvCell(v) {
  const s = String(v ?? '').slice(0, MAX_CELL).replace(/\r?\n/g, ' ');
  return /[",]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

/**
 * Call every seed script for this dataset. The contract: a default export
 * that accepts { datasetName, filePath } and seeds that dataset from that
 * file, replacing its sample rows. An older script that takes no arguments
 * is still called; it returns early on a non-empty collection, and the
 * response says the rows were written but not seeded.
 */
async function reseed(datasetName, filePath) {
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

export async function importDataset(req, res) {
  try {
    const { datasetName, rows } = req.body || {};
    const index = readIndex();
    const dataset = index.find(d => d.name === datasetName);
    if (!dataset) return res.status(404).json({ error: 'That dataset is not one this application was built on.' });
    if (!Array.isArray(rows) || !rows.length) return res.status(400).json({ error: 'No rows were sent.' });
    if (rows.length > MAX_ROWS) return res.status(413).json({ error: `That is more than ${MAX_ROWS.toLocaleString()} rows. Import it in parts.` });

    // The page sends rows already in the dataset's column order; the server
    // still writes the header itself and never trusts the client's.
    const columns = (dataset.columns || []).filter(c => c !== '_source');
    const header = [...columns, '_source'].map(csvCell).join(',');
    const lines = rows.map(r => [...columns.map((_, i) => csvCell(Array.isArray(r) ? r[i] : '')), 'own'].join(','));
    const csv = header + '\n' + lines.join('\n') + '\n';

    fs.mkdirSync(OWN_DIR, { recursive: true });
    const file = path.join(OWN_DIR, `${dataset.slug}.csv`);
    fs.writeFileSync(file, csv, 'utf8');

    const seeded = await reseed(dataset.name, file);
    const entry = {
      datasetName: dataset.name, rows: rows.length, file: path.relative(ROOT, file).split(path.sep).join('/'),
      seeded: seeded.join(' | '), at: new Date(), by: req.user?.role || 'owner',
    };
    await importsCollection().insertOne(entry).catch(() => {});

    res.json({ ok: true, datasetName: dataset.name, rows: rows.length, seeded });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
