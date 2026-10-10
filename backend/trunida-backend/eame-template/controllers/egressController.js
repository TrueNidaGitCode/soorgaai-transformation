/**
 * The owner's view of everything this application sent out
 * (services/egressLog.js): a summary per destination, the entries, one entry
 * in full, the chain checked, and an export for their own auditor.
 *
 * Owner-only, every route. The log holds the bodies of what was sent, which
 * is the business's data -- the same reason the Data page is the owner's.
 */
import { egressCollection, verify, settled, CATEGORY_LABEL, BODY_DAYS, ENTRY_DAYS } from '../services/egressLog.js';

const CATEGORIES = Object.keys(CATEGORY_LABEL);
const DAY = 86400000;

/** What each destination means, said once, on the page and in the export. */
export const CATEGORY_MEANING = {
  svarg: 'Requests to Svarg itself: signing people in, usage counts, the email digest, and the Zoho connection broker. No customer record is meant to be here; if one is, this is where you will see it.',
  ai: 'Requests to an AI model: through Svarg\'s gateway to the model provider. Each one is the exact prompt that left, so you can see what a model was shown.',
  own: 'Requests to your own systems and vendors, made with your own credentials: your CRM, WhatsApp, your phone provider. Anything that is neither Svarg nor AI is listed here, so nothing goes unaccounted for.',
};

const LIST_FIELDS = { body: 0, headers: 0 };

function sinceOf(req) {
  const days = Math.min(ENTRY_DAYS, Math.max(1, Number(req.query.days) || 30));
  return { days, since: new Date(Date.now() - days * DAY) };
}

/** GET /api/egress/summary?days=30 */
export async function summary(req, res) {
  try {
    await settled();
    const { days, since } = sinceOf(req);
    const rows = await egressCollection().aggregate([
      { $match: { at: { $gte: since } } },
      { $group: {
        _id: { category: '$category', purpose: '$purpose', host: '$host' },
        count: { $sum: 1 }, bytes: { $sum: { $ifNull: ['$requestBytes', 0] } }, last: { $max: '$at' },
        failed: { $sum: { $cond: [{ $or: [{ $eq: ['$status', 0] }, { $gte: ['$status', 400] }] }, 1, 0] } },
      } },
      { $sort: { count: -1 } },
    ]).toArray();
    const categories = {};
    for (const c of CATEGORIES) categories[c] = { label: CATEGORY_LABEL[c], meaning: CATEGORY_MEANING[c], count: 0, bytes: 0, last: null, destinations: [] };
    for (const r of rows) {
      const c = categories[r._id.category] || categories.own;
      c.count += r.count;
      c.bytes += r.bytes;
      if (!c.last || r.last > c.last) c.last = r.last;
      c.destinations.push({ purpose: r._id.purpose, host: r._id.host, count: r.count, bytes: r.bytes, last: r.last, failed: r.failed });
    }
    res.json({ days, since, categories, chain: await verify(), keeps: { bodyDays: BODY_DAYS, entryDays: ENTRY_DAYS } });
  } catch (err) {
    res.status(500).json({ error: 'The log could not be read: ' + err.message });
  }
}

/** GET /api/egress?category=ai&before=<seq>&limit=50 */
export async function list(req, res) {
  try {
    await settled();
    const { since } = sinceOf(req);
    const q = { at: { $gte: since } };
    if (CATEGORIES.includes(req.query.category)) q.category = req.query.category;
    if (Number(req.query.before)) q.seq = { $lt: Number(req.query.before) };
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
    const entries = await egressCollection().find(q, { projection: LIST_FIELDS }).sort({ seq: -1 }).limit(limit).toArray();
    res.json({ entries: entries.map(({ _id, ...e }) => e), more: entries.length === limit });
  } catch (err) {
    res.status(500).json({ error: 'The log could not be read: ' + err.message });
  }
}

/** GET /api/egress/entry/:seq -- one entry, with its body and headers. */
export async function entry(req, res) {
  try {
    const e = await egressCollection().findOne({ seq: Number(req.params.seq) });
    if (!e) return res.status(404).json({ error: 'No entry with that number.' });
    const { _id, ...rest } = e;
    res.json({ entry: rest });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

/** GET /api/egress/verify */
export async function check(req, res) {
  try {
    await settled();
    res.json(await verify());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

const CSV_COLUMNS = ['seq', 'at', 'category', 'purpose', 'method', 'url', 'sender', 'status', 'requestBytes',
  'bodySha256', 'model', 'durationMs', 'error', 'unrecordedBefore', 'prevHash', 'hash'];

function csvCell(v) {
  const s = v instanceof Date ? v.toISOString() : v == null ? '' : String(v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

/**
 * GET /api/egress/export?format=json|csv&days=30
 *
 * JSON carries every field, bodies included, and the chain's verdict; CSV is
 * one row per request for a spreadsheet, without bodies. Both carry the hash
 * of the last entry, which is what a later copy is compared against to show
 * nothing was taken off the end.
 */
export async function exportLog(req, res) {
  try {
    await settled();
    const { days, since } = sinceOf(req);
    const entries = (await egressCollection().find({ at: { $gte: since } }).sort({ seq: 1 }).toArray())
      .map(({ _id, ...e }) => e);
    const chain = await verify();
    const stamp = new Date().toISOString().slice(0, 10);
    if (req.query.format === 'csv') {
      const lines = [CSV_COLUMNS.join(',')].concat(entries.map((e) => CSV_COLUMNS.map((c) => csvCell(e[c])).join(',')));
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="what-left-this-application-${stamp}.csv"`);
      return res.send(lines.join('\n') + '\n');
    }
    res.setHeader('Content-Disposition', `attachment; filename="what-left-this-application-${stamp}.json"`);
    res.json({
      exportedAt: new Date(), days, since,
      meaning: CATEGORY_MEANING,
      chain,
      howToCheck: 'Each entry\'s hash is SHA-256 over its fields (sorted keys, JSON) including prevHash, the hash of the entry before it. Bodies are covered by storedSha256; bodySha256 is the hash of the full body as sent.',
      entries,
    });
  } catch (err) {
    res.status(500).json({ error: 'The log could not be exported: ' + err.message });
  }
}
