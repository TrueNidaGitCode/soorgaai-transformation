/**
 * Exotel's call records, fetched rather than waited for.
 *
 * ── Why this exists beside the webhook ─────────────────────────────────────
 *
 * The phone connector is a letterbox: the provider posts when a call ends and
 * the row lands. That is the right shape for liveness and the wrong shape for
 * getting started, for two reasons.
 *
 * It needs work in someone else's console. Somebody has to find the call-end
 * callback in Exotel, paste an address into it, and get it right — and until
 * they do, a connected source shows nothing and the only honest thing the
 * card can say is "nothing will appear until you do".
 *
 * And it has no past. A webhook configured this morning knows nothing about
 * yesterday, so the first week of a new connection is a business asking what
 * this is for. Exotel keeps six months; there is no reason to start empty.
 *
 * So where the owner has given credentials, calls are PULLED the way a CRM
 * module is pulled — paste three values, press Test, and the history is
 * there. The webhook still works and is still worth setting up, because a
 * pull happens on the schedule and a webhook happens immediately. Both land
 * through the same keep(), keyed on the call id, so a call that arrives twice
 * is one row.
 *
 * ── What is Exotel's and what is ours ──────────────────────────────────────
 *
 * Only the fetching is here: the address, the credential, the paging and the
 * date window. Reading a call OUT of what comes back is phoneProviders.js,
 * unchanged and shared with the webhook — because Exotel names the fields the
 * same way in both, and two parsers for one provider is how they drift.
 */
import axios from 'axios';

/**
 * Exotel runs separate clusters and an account lives in exactly one. The
 * wrong one answers 404, which reads as "no such account" and sends somebody
 * to check a SID that was right all along.
 */
export const REGIONS = [
  { id: 'sg', host: 'api.exotel.com', label: 'Singapore (api.exotel.com)' },
  { id: 'in', host: 'api.in.exotel.com', label: 'Mumbai (api.in.exotel.com)' },
];

export const REGION_IDS = REGIONS.map((r) => r.id);

export const hostFor = (region) =>
  (REGIONS.find((r) => r.id === String(region || '').trim()) || REGIONS[0]).host;

/** Exotel's own ceiling. Asking for more is refused, not truncated. */
const PAGE_SIZE = 100;

/**
 * Exotel answers at most one month per request and holds six.
 *
 * Not a tuning choice — the API refuses a wider range. A caller asking for
 * ninety days is asking for three requests, and it is this module's job to
 * know that rather than the connector's.
 */
const WINDOW_DAYS = 30;
export const MAX_HISTORY_DAYS = 180;

/** Stops one sync walking a whole account. Cost, and the row ceiling above. */
const MAX_PAGES = 50;

const pad = (n) => String(n).padStart(2, '0');

/**
 * Exotel's date format: 'YYYY-MM-DD HH:MM:SS', in the account's own timezone.
 *
 * Sent as local time deliberately. Exotel compares this against DateCreated
 * as it stored it, and an ISO string with a Z on the end is not read as UTC —
 * it is read as malformed, and a malformed range is silently the whole
 * account.
 */
export function stamp(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} `
    + `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/**
 * The month-wide slices one request each, oldest first.
 *
 * Oldest first so a run that stops early — the page cap, the row ceiling —
 * has fetched a contiguous stretch ending at the present, rather than a hole
 * in the middle that the next sync has no way to know about.
 */
export function windowsFor(days, now = new Date()) {
  const want = Math.min(Math.max(1, Math.round(days)), MAX_HISTORY_DAYS);
  const out = [];
  let end = new Date(now);
  let left = want;
  while (left > 0) {
    const span = Math.min(left, WINDOW_DAYS);
    const start = new Date(end.getTime() - span * 24 * 60 * 60 * 1000);
    out.unshift({ from: start, to: end });
    end = start;
    left -= span;
  }
  return out;
}

/**
 * What Exotel said, as a sentence somebody can act on.
 *
 * A connector that reports "Request failed with status code 401" has told the
 * owner nothing about which of the four things they pasted is wrong.
 */
function explain(err, sid) {
  const status = err?.response?.status;
  const body = err?.response?.data;
  const said = typeof body === 'string' ? body
    : String(body?.RestException?.Message || body?.message || '').trim();

  if (status === 401 || status === 403) {
    return new Error('Exotel refused the API key and token. They are on the API Settings page '
      + 'of your Exotel dashboard, and they are not the same as the sign-in password.');
  }
  if (status === 404) {
    return new Error(`Exotel has no account "${sid}" in this region. Check the SID on the API `
      + 'Settings page, and check the region — an account in Mumbai is not reachable in Singapore.');
  }
  if (status === 429) {
    return new Error('Exotel is rate limiting this account. The next sync will pick up where '
      + 'this one stopped.');
  }
  if (err?.code === 'ECONNABORTED') return new Error('Exotel did not answer in time.');
  return new Error(said ? `Exotel said: ${said}` : String(err?.message || err));
}

/**
 * One page. Exotel's cursor is a path, so it is resolved against the host
 * rather than trusted as a whole address.
 */
async function page(host, auth, uri, params, timeout) {
  const url = uri ? new URL(uri, `https://${host}`).toString()
    : `https://${host}/v1/Accounts/${encodeURIComponent(auth.sid)}/Calls.json`;
  const res = await axios.get(url, {
    auth: { username: auth.key, password: auth.token },
    params: uri ? undefined : params,
    timeout,
    // A refusal is an answer this module explains, not a throw to swallow.
    validateStatus: (s) => s >= 200 && s < 300,
  });
  const data = res.data || {};
  return {
    calls: Array.isArray(data.Calls) ? data.Calls : [],
    next: data.Metadata?.NextPageUri || '',
    total: Number(data.Metadata?.Total || 0),
  };
}

/**
 * Every call in the window, as Exotel returned it.
 *
 * Raw on purpose: phoneProviders.readCall turns these into the shape the rest
 * of the application holds, and it is the same function the webhook uses.
 */
export async function fetchCalls({
  key, token, sid, region = 'sg', days = 30, maxRows = 5000,
  timeout = Number(process.env.EXOTEL_TIMEOUT_MS || 30000),
  now = new Date(),
} = {}) {
  if (!key || !token || !sid) {
    throw new Error('Exotel needs the API key, the API token and the Account SID.');
  }
  const host = hostFor(region);
  const auth = { key: String(key).trim(), token: String(token).trim(), sid: String(sid).trim() };

  const out = [];
  let pages = 0;
  let total = 0;

  for (const w of windowsFor(days, now)) {
    let next = '';
    do {
      if (pages >= MAX_PAGES || out.length >= maxRows) return { calls: out.slice(0, maxRows), total, capped: true };
      let got;
      try {
        got = await page(host, auth, next, {
          DateCreated: `gte:${stamp(w.from)};lte:${stamp(w.to)}`,
          PageSize: PAGE_SIZE,
          SortBy: 'DateCreated:asc',
        }, timeout);
      } catch (err) {
        /*
         * A rate limit part way through is not a failed sync.
         *
         * Everything already fetched is real and the next run resumes from
         * the same window, so throwing away a thousand calls because the
         * thousand-and-first was throttled would be the connector punishing
         * the owner for its own pace.
         */
        if (err?.response?.status === 429 && out.length) {
          return { calls: out, total, capped: true, throttled: true };
        }
        throw explain(err, auth.sid);
      }
      pages += 1;
      total = Math.max(total, got.total);
      out.push(...got.calls);
      next = got.next;
    } while (next);
  }

  return { calls: out.slice(0, maxRows), total, capped: out.length > maxRows };
}

/**
 * Can this credential read this account? One page, one call's worth.
 *
 * Deliberately a real request rather than a shape check. The whole point of
 * pulling instead of waiting is that the owner finds out now, on the card,
 * rather than tomorrow when nothing has arrived.
 */
export async function ping({ key, token, sid, region = 'sg', timeout = 15000, now = new Date() } = {}) {
  if (!key || !token || !sid) {
    throw new Error('Exotel needs the API key, the API token and the Account SID.');
  }
  const host = hostFor(region);
  const to = new Date(now);
  const from = new Date(to.getTime() - WINDOW_DAYS * 24 * 60 * 60 * 1000);
  try {
    const got = await page(host, { key: String(key).trim(), token: String(token).trim(), sid: String(sid).trim() }, '', {
      DateCreated: `gte:${stamp(from)};lte:${stamp(to)}`,
      PageSize: 1,
      SortBy: 'DateCreated:desc',
    }, timeout);
    return { ok: true, total: got.total, host };
  } catch (err) {
    throw explain(err, sid);
  }
}
