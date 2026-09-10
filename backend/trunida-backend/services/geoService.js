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
 * The address with its last octet removed — 152.233.15.120 → 152.233.15.0
 *
 * ── Why anything is dropped at all ──────────────────────────────────────────
 *
 * A full IP address identifies one machine, which makes it personal data under
 * GDPR and under India's DPDP Act. The site now records every visitor, not just
 * the handful who generate a blueprint, so keeping exact addresses would mean
 * holding identifying data on every stranger who arrives from a search result.
 *
 * ── Why this loses nothing that was wanted ──────────────────────────────────
 *
 * The reason to keep an address was to tell one company returning several times
 * from several unrelated visitors. A /24 answers that as well as a full address
 * does — everyone behind one office router shares it — and the per-browser
 * visitor id already separates individuals better than an IP ever could.
 *
 * Country resolution is unaffected: geolocation is assigned by network block,
 * and a /24 sits inside one.
 *
 * IPv6 keeps its first four groups, which is the same idea: the network, not
 * the interface. A /64 is a single customer and often a single device.
 *
 * ── Where the full address is still used ────────────────────────────────────
 *
 * Rate limiting, in memory, for the length of a window. That is a transient
 * security control rather than a record, and truncating it there would let one
 * abusive host spend a whole neighbourhood's quota.
 */
export function truncateIp(ip) {
  const s = normaliseIp(ip);
  if (!s) return '';
  if (s.includes(':')) {
    const groups = s.split(':').filter(Boolean).slice(0, 4);
    return groups.length ? `${groups.join(':')}::` : '';
  }
  const parts = s.split('.');
  if (parts.length !== 4) return s;
  return `${parts[0]}.${parts[1]}.${parts[2]}.0`;
}

/**
 * @param {string} ip
 * @returns {Promise<{country: string, countryName: string} | null>}
 *   null when it could not be resolved, for any reason. Callers must treat
 *   that as "unknown", not as an error worth surfacing.
 */
export async function countryForIp(ip) {
  const full = normaliseIp(ip);
  if (!full || isPrivate(full)) return null;

  /**
   * The block, not the address.
   *
   * ipapi.co is a third party with no contract behind it — a free, keyless
   * endpoint. Sending it every visitor's exact address would be disclosing
   * personal data to a processor nobody has agreed to, for a country code that
   * a /24 answers identically. So it is told the network and never the machine.
   */
  const clean = truncateIp(full);
  if (!clean) return null;

  try {
    // Keyless and free, which suits this volume. If it ever runs hot the fix is
    // a local MaxMind database rather than a paid tier — the data barely
    // changes and the lookup is then offline, which is better on both counts.
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
/**
 * The same lookup, for a record that keeps country at the top level.
 *
 * A blueprint nests this under guestMeta because the whole visitor record is
 * nested there; a SiteVisit IS the visitor record, so it does not. Rather than
 * teach one function about two shapes, there are two functions — the important
 * part being that neither writes to a path the model does not have, which fails
 * silently in Mongoose and would leave every country blank with nothing said.
 */
export function resolveVisitCountry(Model, id, ip) {
  countryForIp(ip)
    .then(geo => {
      if (!geo) return null;
      return Model.updateOne({ _id: id }, { $set: { country: geo.country, countryName: geo.countryName } });
    })
    .catch(err => console.error('[geo] non-fatal:', err.message));
}

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
