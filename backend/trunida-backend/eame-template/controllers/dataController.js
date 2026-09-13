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
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { readIndex, findDataset, importsCollection, landRows, MAX_ROWS, datasetKey, keyColumns, provenanceSummary } from '../services/connectorService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// ── The owner session ───────────────────────────────────────────────────────

export function ownerStatus(req, res) {
  res.json({ configured: !!process.env.APP_OWNER_KEY });
}

export async function ownerSession(req, res) {
  const expected = process.env.APP_OWNER_KEY || '';
  if (!expected) return res.status(503).json({ error: 'No owner key is configured on this application.' });
  const given = String(req.body?.key || '');
  // Constant-time, so the length or a prefix of the key cannot be learned by
  // timing; the hashes make the two the same length whatever was typed.
  const a = crypto.createHash('sha256').update(given).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  if (!crypto.timingSafeEqual(a, b)) return res.status(401).json({ error: 'That is not the owner key.' });
  const token = jwt.sign({ userId: 'owner', role: 'owner' }, process.env.JWT_SECRET || 'your_secret_key', { expiresIn: '12h' });

  // Where the key and the person meet: someone who is signed in and holds
  // the key IS the owner, and their account says so from now on -- the chat
  // lets them add records without the key being pasted again.
  const who = signedInUserId(req);
  if (who) {
    await usersCollection().updateOne({ _id: who }, { $set: { role: 'owner', ownerSince: new Date() } }).catch(() => {});
  }
  res.json({ token, promoted: !!who });
}

/** After `protect`: the owner session, or nothing. */
export function requireOwner(req, res, next) {
  if (req.user?.role !== 'owner') return res.status(403).json({ error: 'The Data page is for the application owner. Enter the owner key first.' });
  next();
}

function usersCollection() {
  return mongoose.connection.collection('svarg_users');
}

/** The signed-in person on this request, as an ObjectId, when the session names one. */
function signedInUserId(req) {
  const h = req.header('Authorization') || '';
  const t = h.startsWith('Bearer ') ? h.slice(7) : '';
  if (!t) return null;
  try {
    const d = jwt.verify(t, process.env.JWT_SECRET || 'your_secret_key');
    return mongoose.isValidObjectId(d.userId) ? new mongoose.Types.ObjectId(d.userId) : null;
  } catch { return null; }
}

/**
 * After `protect`: may this session write records? The owner session may;
 * so may a signed-in person whose account says owner or admin (looked up
 * now, not from the session, so a promotion counts at once).
 */
export async function requireWriter(req, res, next) {
  if (req.user?.role === 'owner') return next();
  const id = req.user?._id;
  if (mongoose.isValidObjectId(id)) {
    const u = await usersCollection().findOne({ _id: new mongoose.Types.ObjectId(id) }, { projection: { role: 1, name: 1, email: 1 } }).catch(() => null);
    if (u && ['owner', 'admin'].includes(u.role)) { req.writer = u; return next(); }
  }
  return res.status(403).json({ error: 'Only the owner can add or change records. Unlock the Data page with the owner key while signed in, and your account becomes the owner.' });
}

// ── The datasets ────────────────────────────────────────────────────────────

export async function listDatasets(req, res) {
  try {
    const index = readIndex();
    const log = await importsCollection().find({}).sort({ at: -1 }).limit(200).toArray().catch(() => []);
    const prov = await provenanceSummary();
    // The latest landing per dataset, whichever source it came from.
    const latest = new Map();
    for (const entry of log) if (!latest.has(entry.datasetName)) latest.set(entry.datasetName, entry);
    res.json({
      datasets: index.map(d => {
        const last = latest.get(d.name);
        const p = prov[d.name] || null;
        const held = p ? Object.values(p.bySource).reduce((a, b) => a + b, 0) : (last ? last.rows : 0);
        return {
          name: d.name, slug: d.slug, sampleRows: d.sampleRows,
          columns: (d.columns || []).filter(c => c !== '_source'),
          key: datasetKey(d),
          own: last ? { rows: last.rows, at: last.at, file: last.file, origin: last.origin || '', source: last.source || 'own', seeded: last.seeded || '' } : null,
          // What the application holds of the owner's, by where it came from.
          held, bySource: p ? p.bySource : (last ? { [last.source || 'own']: last.rows } : {}),
          lastChange: p ? p.lastChange : (last ? last.at : null),
          missing: p ? p.missing : 0,
        };
      }),
      imports: log.slice(0, 50),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

/**
 * Where this application's data lives, in the order its industry works:
 * written by Eame from the industry's sources block (data/sources.json).
 * Without one, the page offers a folder and a file, which is true of every
 * business.
 */
export function listSources(req, res) {
  let sources = [];
  try { sources = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'sources.json'), 'utf8')); } catch { sources = []; }
  if (!Array.isArray(sources) || !sources.length) {
    sources = [{ kind: 'folder', label: 'Your folder of spreadsheets', providers: ['upload'], holds: [], note: 'Upload the folder your records are kept in; each sheet is matched to what the application expects.' }];
  }
  res.json({ sources });
}

// ── The import ──────────────────────────────────────────────────────────────

/**
 * What rows landed from the Data page may be marked as: the owner's own
 * file, a whole folder, a WhatsApp export parsed there. (The chat's rows
 * land through addRecord, as 'chat'; a connector's through its sync.)
 */
const FILE_SOURCES = ['own', 'folder', 'whatsapp'];

export async function importDataset(req, res) {
  try {
    const { datasetName, rows, source, origin, mode, complete } = req.body || {};
    const dataset = findDataset(datasetName);
    if (!dataset) return res.status(404).json({ error: 'That dataset is not one this application was built on.' });
    if (!Array.isArray(rows) || !rows.length) return res.status(400).json({ error: 'No rows were sent.' });
    if (rows.length > MAX_ROWS) return res.status(413).json({ error: 'That is more than ' + MAX_ROWS.toLocaleString() + ' rows. Import it in parts.' });
    const src = FILE_SOURCES.includes(String(source || 'own')) ? String(source || 'own') : 'own';

    const landed = await landRows({
      dataset, rows, source: src, by: req.user?.role || 'owner',
      origin: String(origin || '').slice(0, 200),
      mode: mode === 'replace' ? 'replace' : 'merge',
      // A file or a folder is the whole of what that source holds unless the
      // page says otherwise; the rows a sheet no longer has are marked, never dropped.
      complete: complete !== false,
    });
    res.json({ ok: true, datasetName: dataset.name, ...landed });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// ── The chat writes ─────────────────────────────────────────────────────────
//
// "Add Priya Nair to the U14 Tuesday batch, mother's number 98…" is a record,
// said instead of typed into the sheet. The model is asked -- with the
// datasets and their columns as the whole of what it may fill -- whether the
// message is one, and for the row; the chat shows the row on a card, and only
// a press on the card lands it, as _source=chat, by the person signed in. The
// row then follows the same rule as a row from the sheet: one key, one row.

const RECORD_VERBS = /^\s*(add|register|enrol|enroll|new|create|record|update|change|set|mark|move|rename|remove|delete)\b/i;

/** Does this read like a record? Cheap, before any model is asked. */
export function looksLikeRecord(text) {
  return RECORD_VERBS.test(String(text || ''));
}

function schemaFor(index) {
  return index.map(d => `- "${d.name}": columns [${(d.columns || []).filter(c => c !== '_source').map(c => '"' + c + '"').join(', ')}]; key: ${datasetKey(d) || '(none)'}`).join('\n');
}

/**
 * POST /api/data/intent { message } -> { none: true } or
 * { dataset, action: 'add'|'update', row: { column: value }, summary }.
 * Nothing is written here.
 */
export async function recordIntent(req, res) {
  try {
    const message = String(req.body?.message || '').trim().slice(0, 2000);
    const index = readIndex();
    if (!message || !index.length || !looksLikeRecord(message)) return res.json({ none: true });

    const system = [
      'You turn one sentence from a business user into ONE record for one of their datasets, or say it is not one.',
      'The datasets and the only columns you may fill:',
      schemaFor(index),
      'Rules: answer with JSON only, no prose. Fill only columns the sentence gives a value for; leave the rest out. Keep values exactly as said (names, numbers, dates as written). Do not invent an identifier the sentence did not give.',
      'If the sentence is a question, a request for analysis, or does not name a record for any dataset above, answer {"none":true}.',
      'Otherwise answer {"dataset":"<name exactly as listed>","action":"add"|"update","row":{"<column>":"<value>",...},"summary":"<one short line saying what will be recorded>"}.',
      'action is "update" when the sentence changes something about a record that already exists (a fee marked paid, a batch changed), "add" when it introduces one.',
    ].join('\n');
    // The model layer is part of the runtime Eame copies in at build; loaded
    // here so this file stands on its own in the template.
    const { generate } = await import('../services/llmService.js');
    const out = await generate({ systemPrompt: system, userMessage: message, maxTokens: 400, label: 'data:record-intent' });
    const text = String(out?.text || '').trim();
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return res.json({ none: true });
    let parsed; try { parsed = JSON.parse(m[0]); } catch { return res.json({ none: true }); }
    if (!parsed || parsed.none || !parsed.dataset || !parsed.row) return res.json({ none: true });
    const dataset = findDataset(parsed.dataset);
    if (!dataset) return res.json({ none: true });
    const columns = (dataset.columns || []).filter(c => c !== '_source');
    const row = {};
    for (const [k, v] of Object.entries(parsed.row)) if (columns.includes(k) && v != null && String(v).trim()) row[k] = String(v).trim().slice(0, 500);
    if (!Object.keys(row).length) return res.json({ none: true });
    return res.json({
      dataset: dataset.name, action: parsed.action === 'update' ? 'update' : 'add', row,
      key: datasetKey(dataset), columns,
      summary: String(parsed.summary || '').slice(0, 200),
    });
  } catch (err) {
    console.error('[data] record intent failed —', err.message);
    return res.json({ none: true });
  }
}

/** POST /api/data/records { dataset, row } -> lands one row as 'chat', by the rule. */
export async function addRecord(req, res) {
  try {
    const dataset = findDataset(req.body?.dataset);
    if (!dataset) return res.status(404).json({ error: 'That dataset is not one this application was built on.' });
    const columns = (dataset.columns || []).filter(c => c !== '_source');
    const given = req.body?.row && typeof req.body.row === 'object' ? req.body.row : {};
    const row = columns.map(c => (given[c] == null ? '' : String(given[c]).slice(0, 500)));
    if (!row.some(Boolean)) return res.status(400).json({ error: 'The record is empty.' });
    const keys = keyColumns(dataset);
    if (keys.length && !keys.some(k => String(given[k] || '').trim())) {
      return res.status(400).json({ error: `A ${dataset.name} record needs its ${keys.join(' and ')} so it can be told from the others.` });
    }
    const by = req.writer ? (req.writer.name || req.writer.email || 'owner') : 'owner';
    const landed = await landRows({ dataset, rows: [row], source: 'chat', by, origin: 'chat', mode: 'merge', complete: false });
    res.json({ ok: true, datasetName: dataset.name, ...landed });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
