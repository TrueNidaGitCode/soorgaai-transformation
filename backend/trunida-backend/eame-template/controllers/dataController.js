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
 *
 * A WhatsApp chat export is parsed on the page the same way a spreadsheet is
 * and lands here with _source "whatsapp". Live sources -- Jira, Confluence,
 * GitHub -- land through services/connectorService.js by the same path, with
 * their own _source, so every row says where it came from.
 */
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { readIndex, findDataset, importsCollection, landRows, MAX_ROWS } from '../services/connectorService.js';

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

export async function listDatasets(req, res) {
  try {
    const index = readIndex();
    const log = await importsCollection().find({}).sort({ at: -1 }).limit(200).toArray().catch(() => []);
    // The latest landing per dataset, whichever source it came from.
    const latest = new Map();
    for (const entry of log) if (!latest.has(entry.datasetName)) latest.set(entry.datasetName, entry);
    res.json({
      datasets: index.map(d => {
        const last = latest.get(d.name);
        return {
          name: d.name, slug: d.slug, sampleRows: d.sampleRows,
          columns: (d.columns || []).filter(c => c !== '_source'),
          own: last ? { rows: last.rows, at: last.at, file: last.file, source: last.source || 'own', seeded: last.seeded || '' } : null,
        };
      }),
      imports: log.slice(0, 50),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// ── The import ──────────────────────────────────────────────────────────────

/** What a file on the Data page may be marked as: the owner's own, or a WhatsApp export parsed there. */
const FILE_SOURCES = ['own', 'whatsapp'];

export async function importDataset(req, res) {
  try {
    const { datasetName, rows, source } = req.body || {};
    const dataset = findDataset(datasetName);
    if (!dataset) return res.status(404).json({ error: 'That dataset is not one this application was built on.' });
    if (!Array.isArray(rows) || !rows.length) return res.status(400).json({ error: 'No rows were sent.' });
    if (rows.length > MAX_ROWS) return res.status(413).json({ error: 'That is more than ' + MAX_ROWS.toLocaleString() + ' rows. Import it in parts.' });
    const src = FILE_SOURCES.includes(String(source || 'own')) ? String(source || 'own') : 'own';

    const landed = await landRows({ dataset, rows, source: src, by: req.user?.role || 'owner' });
    res.json({ ok: true, datasetName: dataset.name, rows: landed.rows, seeded: landed.seeded });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
