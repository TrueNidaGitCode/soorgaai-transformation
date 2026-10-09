/**
 * Where the business's own app sends what its users do, and the two lines
 * its developers need to do it.
 *
 * The app proves itself with this application's own key: derived from its
 * secret, so it is the same after a restart, is never stored, and is shown
 * only to the owner on the Data page. It goes in an Authorization header,
 * as a Bearer token or as Segment sends a write key (Basic, key as the
 * username), so an app already sending to Segment needs no code change.
 *
 * Senders retry what is not answered quickly, so the answer goes first and
 * the keeping and landing follow; landing is gathered into one sync every
 * few seconds rather than one per request, so a busy app does not rebuild
 * the dataset on every click its users make.
 */
import crypto from 'crypto';
import { openConnectorsOfKind, syncConnector } from '../services/connectorService.js';
import { eventsIn, keep, kind as KIND, MAX_PER_REQUEST } from '../services/connectors/appevents.js';

/** This application's ingest key. */
export function ingestKey() {
  return 'sk_app_' + crypto.createHash('sha256').update('app-events:' + (process.env.JWT_SECRET || 'your_secret_key')).digest('hex').slice(0, 40);
}

/** The key a request carries, as Bearer or as Segment's Basic write key. */
export function keyFrom(header) {
  const h = String(header || '').trim();
  if (/^bearer\s+/i.test(h)) return h.replace(/^bearer\s+/i, '').trim();
  if (/^basic\s+/i.test(h)) {
    try { return Buffer.from(h.replace(/^basic\s+/i, ''), 'base64').toString('utf8').split(':')[0].trim(); } catch { return ''; }
  }
  return '';
}

export function keyOk(given) {
  const want = ingestKey();
  const g = String(given || '');
  return g.length === want.length && crypto.timingSafeEqual(Buffer.from(g), Buffer.from(want));
}

function ownOrigin(req) {
  if (process.env.APP_PUBLIC_URL) return String(process.env.APP_PUBLIC_URL).replace(/\/+$/, '');
  return `${req.protocol}://${req.get('host')}`;
}

/** GET /api/app-events/setup (owner): what the developers need. */
export function setup(req, res) {
  const url = `${ownOrigin(req)}/api/app-events`;
  res.json({
    url,
    key: ingestKey(),
    maxPerRequest: MAX_PER_REQUEST,
    example: `curl -X POST ${url} \\\n  -H "Authorization: Bearer ${ingestKey()}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"type":"track","userId":"user-104","event":"Lesson Created","properties":{"customer":"Hillview School"}}'`,
  });
}

// ── Landing, gathered ───────────────────────────────────────────────────────

const GATHER_MS = Number(process.env.APP_EVENTS_GATHER_MS || 5000);
let landing = null;

function landSoon() {
  if (landing) return;
  landing = setTimeout(async () => {
    landing = null;
    try {
      for (const c of await openConnectorsOfKind(KIND)) {
        await syncConnector(String(c._id), { by: 'app-events' })
          // Already syncing: what arrived meanwhile is read on the next one.
          .catch(err => { if (!/already syncing/i.test(err.message)) console.warn('[app-events] landing failed —', err.message); });
      }
    } catch (err) {
      console.warn('[app-events] landing failed —', err.message);
    }
  }, GATHER_MS);
  landing.unref?.();
}

/** POST /api/app-events (and /batch, /track, /identify): events, kept and landed. */
export function receiver(defaultType = '') {
  return async function receive(req, res) {
    if (!keyOk(keyFrom(req.get('Authorization')))) {
      return res.status(401).json({ success: false, error: 'That is not this application\'s key.' });
    }
    const list = Array.isArray(req.body) ? req.body : Array.isArray(req.body?.batch) ? req.body.batch : null;
    if (list && list.length > MAX_PER_REQUEST) {
      return res.status(413).json({ success: false, error: `At most ${MAX_PER_REQUEST} events in one request.` });
    }
    const parsed = eventsIn(req.body, defaultType);
    // Answered now: the sender has done its part once the request is read.
    res.status(200).json({
      success: true,
      accepted: parsed.events.length + parsed.identities.length,
      rejected: parsed.rejected,
    });
    try {
      const kept = await keep(parsed);
      if (kept || parsed.identities.length) landSoon();
    } catch (err) {
      console.error('[app-events] could not keep what arrived —', err.message);
    }
  };
}
