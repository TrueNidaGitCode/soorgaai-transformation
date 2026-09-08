/**
 * Svarg — where a visitor came from
 *
 * One job: turn an IP into a country, once, at the moment a visit happens.
 *
 * ── Why this is fire-and-forget ─────────────────────────────────────────────
 *
 * A guest preview is the product's first impression and it must not wait on a
 * third party to answer. So callers start this and move on; the country lands
 * on the record a moment later, or it does not, and the board renders either
 * way. An empty country means "not resolved", never "unknown country" — the
 * screen has to say the difference, because a blank that reads as a fact is
 * worse than a blank that reads as a gap.
 *
 * ── Why it is not resolved at render time ───────────────────────────────────
 *
 * Doing the lookup while drawing the funnel would put an external service on
 * the path of a screen someone opens between calls, and would pay for the same
 * answer about the same visit every time the page loads.
 *
 * ── Private addresses ───────────────────────────────────────────────────────
 *
 * Local and RFC1918 addresses are skipped rather than sent to a public API:
 * every developer machine would otherwise be one outbound request answering
 * "no", and the answer is knowable without asking.
 */

const TIMEOUT_MS = 4000;

/** Addresses no public geolocation service can usefully answer for. */
function isPrivate(ip) {
  const s = String(ip || '').replace(/^::ffff:/, '');
  if (!s) return true;
  if (s === '::1' || s.startsWith('127.') || s.startsWith('169.254.')) return true;
  if (s.startsWith('10.') || s.startsWith('192.168.')) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(s)) return true;
  // An IPv6 unique-local or link-local address.
  if (/^f[cd]/i.test(s) || /^fe80:/i.test(s)) return true;
  return false;
}

/** req.ip can be a comma-separated forwarded chain; the client is the first. */
export function normaliseIp(ip) {
  return String(ip || '').split(',')[0].trim().replace(/^::ffff:/, '');
}

/**
 * @param {string} ip
 * @returns {Promise<{country: string, countryName: string} | null>}
 *   null when it could not be resolved, for any reason. Callers must treat
 *   that as "unknown", not as an error worth surfacing.
 */
export async function countryForIp(ip) {
  const clean = normaliseIp(ip);
  if (!clean || isPrivate(clean)) return null;

  try {
    // ipapi.co needs no key for low volume, which suits a handful of previews a
    // day. If this ever runs hot, the fix is a local MaxMind database rather
    // than a paid tier — the data barely changes and the lookup is offline.
    const res = await fetch(`https://ipapi.co/${encodeURIComponent(clean)}/json/`, {
      headers: { 'User-Agent': 'svarg-funnel/1.0' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return null;

    const j = await res.json();
    if (!j || j.error || !j.country_code) return null;

    return {
      country: String(j.country_code).slice(0, 2).toUpperCase(),
      countryName: String(j.country_name || '').slice(0, 80),
    };
  } catch {
    // Timeout, DNS, rate limit, malformed body — all the same to the caller.
    return null;
  }
}

/**
 * Resolve in the background and write it to the record.
 *
 * Deliberately takes the model and id rather than a document: the caller has
 * already responded to the visitor by the time this finishes, so writing
 * through a stale in-memory document would risk clobbering whatever the
 * generation run has written since.
 */
export function resolveCountryInBackground(Model, id, ip) {
  countryForIp(ip)
    .then(geo => {
      if (!geo) return null;
      return Model.updateOne(
        { _id: id },
        { $set: { 'guestMeta.country': geo.country, 'guestMeta.countryName': geo.countryName } }
      );
    })
    .catch(err => console.error('[geo] non-fatal:', err.message));
}
