/**
 * The phone webhook: where a cloud telephony provider posts a finished call,
 * and the address the owner pastes into their provider account.
 *
 * Every one of these services does the same thing at the end of a call — POST
 * the details, usually including a link to the recording. They disagree only
 * about spelling, which services/phoneProviders.js resolves.
 *
 * ── Why there is no signature check ────────────────────────────────────────
 *
 * The WhatsApp webhook verifies Meta's HMAC, because Meta signs. Most of these
 * providers do not sign at all, and the ones that do each do it differently.
 * A check that silently passed whenever a provider did not sign would be worse
 * than none: it would read like security in the code and be nothing in fact.
 *
 * So the address itself is the secret. It carries a token derived from this
 * application's own secret — the same derivation the WhatsApp verify token
 * uses, so it survives a restart and is never stored — and a POST without it
 * is refused. That is genuinely weaker than a signature and is said plainly
 * here rather than implied away: anyone who learns the address can post calls
 * into this application.
 */
import crypto from 'crypto';
import { openConnectorsOfKind, syncConnector } from '../services/connectorService.js';
import { callsIn } from '../services/phoneProviders.js';
import { keep, kind as KIND } from '../services/connectors/phone.js';

/** The token in the webhook address. Derived, so a restart does not change it. */
export function hookToken() {
  return crypto.createHash('sha256')
    .update('phone-hook:' + (process.env.JWT_SECRET || 'your_secret_key'))
    .digest('hex').slice(0, 32);
}

function ownOrigin(req) {
  if (process.env.APP_PUBLIC_URL) return String(process.env.APP_PUBLIC_URL).replace(/\/+$/, '');
  return `${req.protocol}://${req.get('host')}`;
}

/** GET /api/phone/setup (owner): the address to paste into the provider. */
export function setup(req, res) {
  res.json({
    webhookUrl: `${ownOrigin(req)}/api/phone/webhook/${hookToken()}`,
    method: 'POST',
    note: 'Put this in your provider\'s call-end or recording-ready callback. '
      + 'Anyone who knows this address can post calls into this application, so treat it '
      + 'as a credential. Switch on the "this call is being recorded" announcement in your '
      + 'provider account before you start.',
  });
}

/**
 * POST /api/phone/webhook/:token — a finished call, kept and landed.
 *
 * Answered immediately. These providers retry anything that is not answered
 * quickly, and fetching a recording and listening to it takes far longer than
 * any of them will wait — so the call is kept, the answer goes, and the
 * transcription happens on the sync that follows.
 */
export async function receive(req, res) {
  try {
    const given = String(req.params.token || '');
    const want = hookToken();
    if (given.length !== want.length
      || !crypto.timingSafeEqual(Buffer.from(given), Buffer.from(want))) {
      return res.status(403).send('not this application\'s webhook address');
    }

    const connections = await openConnectorsOfKind(KIND);
    if (!connections.length) return res.status(200).send('no connection');

    /*
     * The provider is the owner's answer, not the payload's.
     *
     * Nothing in these webhooks reliably says who sent it, and guessing from
     * the shape would pick wrongly the first time two of them agreed about a
     * field name. The connection says which service it is; "other" reads
     * every spelling any of them uses.
     */
    const provider = String(connections[0].config?.provider || 'other');
    const calls = callsIn(req.body, provider);

    res.status(200).send('ok');
    if (!calls.length) return;

    /*
     * A call nobody could identify is logged rather than dropped silently.
     *
     * It still lands — who rang and when is most of what a watcher needs —
     * but a provider whose payload this cannot read produces a run of these,
     * and that has to be visible in the logs of an application somebody is
     * debugging at four in the afternoon.
     */
    const blind = calls.filter((c) => c.missing?.length);
    if (blind.length) {
      console.warn(`[phone] ${blind.length} call(s) arrived without `
        + `${[...new Set(blind.flatMap((c) => c.missing))].join(', ')} — `
        + `provider "${provider}" may be sending a shape this does not know.`);
    }

    const kept = await keep(calls);
    if (!kept) return;
    for (const c of connections) {
      syncConnector(String(c._id), { by: 'phone' })
        .catch((err) => console.warn('[phone] landing after a call failed —', err.message));
    }
  } catch (err) {
    console.error('[phone] webhook failed —', err.message);
    if (!res.headersSent) res.status(200).send('ok');
  }
}
