/**
 * The WhatsApp webhook: where Meta delivers messages sent to the business
 * number, and the two lines the owner needs to set it up.
 *
 * Meta first calls GET with a verify token and a challenge; the token is
 * this application's own (derived from its secret, shown on the Data page),
 * and the challenge is echoed back. Then every message arrives by POST,
 * signed with the Meta app's secret when the owner gave it; it is kept in
 * this application's database and landed on the dataset the connection
 * feeds. Meta retries what is not answered 200 quickly, so the answer goes
 * first and the landing follows.
 */
import crypto from 'crypto';
import { openConnectorsOfKind, syncConnector } from '../services/connectorService.js';
import { messagesIn, keep, kind as KIND } from '../services/connectors/whatsapp.js';

/** This application's verify token: derived, so it is the same after a restart and never stored. */
export function verifyToken() {
  return crypto.createHash('sha256').update('whatsapp-verify:' + (process.env.JWT_SECRET || 'your_secret_key')).digest('hex').slice(0, 32);
}

function ownOrigin(req) {
  if (process.env.APP_PUBLIC_URL) return String(process.env.APP_PUBLIC_URL).replace(/\/+$/, '');
  return `${req.protocol}://${req.get('host')}`;
}

/** GET /api/whatsapp/setup (owner): what to paste into the Meta app. */
export function setup(req, res) {
  res.json({ webhookUrl: `${ownOrigin(req)}/api/whatsapp/webhook`, verifyToken: verifyToken(), field: 'messages' });
}

/** GET /api/whatsapp/webhook: Meta checking the address. */
export function verify(req, res) {
  const mode = req.query['hub.mode'];
  const token = String(req.query['hub.verify_token'] || '');
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token && token === verifyToken()) return res.status(200).send(String(challenge || ''));
  return res.status(403).send('That is not this application\'s verify token.');
}

/** Meta's signature over the raw body, with the app secret the owner gave. */
export function signatureOk(rawBody, header, appSecret) {
  if (!appSecret) return true;
  const given = String(header || '').replace(/^sha256=/, '');
  if (!given || !rawBody) return false;
  const want = crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');
  return given.length === want.length && crypto.timingSafeEqual(Buffer.from(given), Buffer.from(want));
}

/** POST /api/whatsapp/webhook: messages, kept and landed. */
export async function receive(req, res) {
  try {
    const connections = await openConnectorsOfKind(KIND);
    if (!connections.length) return res.status(200).send('no connection');
    // Any connection with an app secret must vouch for the payload.
    const secrets = connections.map(c => String(c.config?.appSecret || '').trim()).filter(Boolean);
    if (secrets.length && !secrets.some(s => signatureOk(req.rawBody, req.get('X-Hub-Signature-256'), s))) {
      return res.status(403).send('bad signature');
    }
    const messages = messagesIn(req.body);
    // Answer now; Meta gives seconds and retries otherwise.
    res.status(200).send('ok');
    if (!messages.length) return;
    const kept = await keep(messages);
    if (!kept) return;
    for (const c of connections) {
      const mine = messages.some(m => !m.phoneNumberId || m.phoneNumberId === String(c.config?.phoneNumberId || ''));
      if (mine) syncConnector(String(c._id), { by: 'whatsapp' }).catch(err => console.warn('[whatsapp] landing after a message failed —', err.message));
    }
  } catch (err) {
    console.error('[whatsapp] webhook failed —', err.message);
    if (!res.headersSent) res.status(200).send('ok');
  }
}
