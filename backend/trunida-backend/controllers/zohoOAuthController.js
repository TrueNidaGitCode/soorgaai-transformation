/**
 * Svarg — the two screens Zoho's consent passes through.
 *
 * Both are reached by a browser and neither carries a session: what
 * authorises them is the handoff, which was opened over a deployment's
 * gateway token and is unguessable. Nothing here reads or writes a user.
 *
 * The order is: the tenant opens a handoff (gateway, authenticated) → the
 * browser visits /authorize with only the opaque state → Zoho consent → Zoho
 * returns to /callback → Svarg exchanges the code and attaches the refresh
 * token to the handoff → the browser is sent back to the application, which
 * claims the token over its own gateway token.
 */
import {
  isZohoOAuthConfigured, buildAuthorizeUrl, exchangeCode, readHandoff, dropHandoff,
} from '../services/zohoOAuthService.js';

/** A plain page, because this is reached by a browser and may go wrong. */
function say(res, status, title, detail, back) {
  const esc = (s) => String(s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  res.status(status).type('html').send(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
  :root { color-scheme: dark; }
  body { margin:0; min-height:100vh; display:grid; place-items:center; background:#070B12;
         color:rgba(255,255,255,0.9); font:15px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; }
  .b { max-width:34rem; padding:32px; text-align:center; }
  h1 { margin:0 0 10px; font-size:22px; letter-spacing:-0.01em; }
  p { margin:0 0 18px; color:rgba(255,255,255,0.58); }
  a { display:inline-block; padding:10px 18px; border-radius:999px; background:#5CC5A7; color:#0B1220;
      font-weight:700; text-decoration:none; }
</style></head>
<body><div class="b"><h1>${esc(title)}</h1><p>${esc(detail)}</p>
${back ? `<a href="${esc(back)}">Back to your application</a>` : ''}</div></body></html>`);
}

/**
 * Step one: send the browser to Zoho.
 *
 * The redirect is built here rather than by the tenant so the client id and
 * the callback never leave this server, and so a tenant cannot be talked into
 * pointing a consent at somebody else's redirect.
 */
export async function zohoAuthorize(req, res) {
  if (!isZohoOAuthConfigured()) {
    return say(res, 503, 'Zoho is not set up here', 'This Svarg server has no Zoho client configured, so a one-click connection is not available. The application can still connect with its own credentials.');
  }
  const h = readHandoff(req.query.state);
  if (!h) {
    return say(res, 400, 'That link has expired', 'A connection attempt lasts ten minutes. Open the Data page and press Connect again.');
  }
  return res.redirect(buildAuthorizeUrl(h.state, h.region));
}

/**
 * Step two: Zoho comes back.
 *
 * The region can change here. Zoho sends the consent to whichever data centre
 * the customer's account actually lives in and names it in `location`, so an
 * owner who picked the wrong one on the form is corrected by Zoho rather than
 * left with a token that will be refused on every sync.
 */
export async function zohoCallback(req, res) {
  const h = readHandoff(req.query.state);
  if (!h) {
    return say(res, 400, 'That connection attempt has expired', 'Open the Data page and press Connect again.');
  }

  if (req.query.error) {
    dropHandoff(h.state);
    const denied = String(req.query.error) === 'access_denied';
    return say(res, 200,
      denied ? 'Connection cancelled' : 'Zoho refused the connection',
      denied ? 'Nothing was connected and nothing was changed.' : `Zoho said: ${req.query.error}`,
      h.back);
  }

  const location = String(req.query.location || '').trim();
  if (location && location !== h.region) h.region = location;

  try {
    const { refreshToken } = await exchangeCode(String(req.query.code || ''), h.region);
    h.refreshToken = refreshToken;
  } catch (err) {
    dropHandoff(h.state);
    return say(res, 502, 'Zoho could not complete the connection', err.message, h.back);
  }

  if (!h.back) {
    /*
     * Reached only when Svarg does not know this application's address,
     * which means the application cannot be sent back to claim the token —
     * so the consent worked and the connection did not. Said as that, rather
     * than as "Connected", which is what it used to say and was not true.
     */
    return say(res, 200, 'Zoho approved, but the connection is not finished',
      'This Svarg server does not know your application\u2019s address, so it could not send you back. '
      + 'Open your application\u2019s Data page and press Connect again.');
  }
  /*
   * The id only — the token is claimed by the application over its own
   * gateway token, so it never reaches a URL, a log or a browser history.
   *
   * Assembled with URL rather than by joining strings, because the address
   * the application asks to come back to ends in a fragment: it wants the
   * Data page, so it sends ".../#data". Appending "?zoho=..." to that put the
   * query INSIDE the fragment —
   *
   *   https://app.example/#data?zoho=STATE   ->  search "" , hash "#data?zoho=STATE"
   *
   * — so location.search was empty, the page never saw the id, and a consent
   * that had worked perfectly landed on a Data page still offering to
   * connect. URL puts the query where a query goes and keeps the fragment
   * last, which is the whole of the fix.
   */
  let to;
  try {
    const u = new URL(h.back);
    u.searchParams.set('zoho', h.state);
    to = u.toString();
  } catch {
    // allowedBack only ever returns '' or an address it parsed, so this is
    // unreachable by design — and a redirect to a string nobody can parse is
    // not a better outcome than saying so.
    return say(res, 200, 'Zoho approved, but the connection is not finished',
      'Your application\u2019s address could not be read, so it could not be sent back. '
      + 'Open the Data page and press Connect again.');
  }
  return res.redirect(to);
}
