/**
 * Svarg — Website Knowledge Source
 *
 * The one source every company has, including one founded last month.
 * Confluence and Jira assume an established engineering organisation; a
 * startup has neither, and without a third option Aria has nothing to
 * connect and the journey stops.
 *
 * Fetches a small, bounded set of pages from a company's public site and
 * extracts readable text. What it produces is COMPANY CONTEXT — who they
 * are, what they sell, who they serve. It is deliberately not a substitute
 * for operational data: a marketing site contains no attendance records or
 * defect history, and pretending otherwise would make the data-readiness
 * picture dishonest.
 *
 * ── Fetching a user-supplied URL is the dangerous part ──────────────────────
 *
 * A URL typed by a user and fetched by the server is a server-side request
 * forgery primitive: it can be pointed at cloud metadata endpoints, internal
 * admin panels, or anything else reachable from the container but not from
 * the internet. Every hostname is therefore resolved and checked against
 * private address ranges BEFORE the request, and redirects are followed
 * manually so each hop is checked too — a public host that 302s to
 * 169.254.169.254 defeats a check that only looks at the original URL.
 */

import dns from 'dns/promises';
import net from 'net';

const MAX_PAGES = 5;
const MAX_BYTES = 1_500_000;          // per page; marketing pages are far smaller
const FETCH_TIMEOUT_MS = 12_000;
const MAX_REDIRECTS = 3;

/** Pages worth reading beyond the homepage, in priority order. */
const INTERESTING = [
  /about/i, /product/i, /solution/i, /service/i, /feature/i,
  /pricing/i, /platform/i, /how-it-works/i, /customers?/i, /use-cases?/i,
];

// ── Address safety ──────────────────────────────────────────────────────────

/** Ranges that must never be reachable through a user-supplied URL. */
function isPrivateAddress(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    if (a === 10) return true;                        // 10.0.0.0/8
    if (a === 127) return true;                       // loopback
    if (a === 0) return true;                         // this network
    if (a === 169 && b === 254) return true;          // link-local + cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 192 && b === 168) return true;          // 192.168.0.0/16
    if (a === 100 && b >= 64 && b <= 127) return true;// carrier-grade NAT
    if (a >= 224) return true;                        // multicast + reserved
    return false;
  }
  if (net.isIPv6(ip)) {
    const s = ip.toLowerCase();
    if (s === '::1' || s === '::') return true;
    if (s.startsWith('fc') || s.startsWith('fd')) return true;  // unique local
    if (s.startsWith('fe80')) return true;                      // link-local
    // IPv4-mapped (::ffff:10.0.0.1) — check the embedded address too.
    const mapped = s.match(/::ffff:(\d+\.\d+\.\d+\.\d+)/);
    if (mapped) return isPrivateAddress(mapped[1]);
    return false;
  }
  return true;   // unparseable — refuse rather than guess
}

/**
 * Validate a URL and confirm every address its hostname resolves to is
 * public. Returns the parsed URL, or throws with a message safe to show.
 */
export async function assertFetchable(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    throw new Error('That does not look like a valid web address.');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Only http and https addresses can be read.');
  }

  let addresses;
  try {
    addresses = await dns.lookup(url.hostname, { all: true });
  } catch {
    throw new Error(`Could not find a site at ${url.hostname}.`);
  }

  // ALL resolved addresses must be public — a hostname resolving to both a
  // public and a private address would otherwise slip through.
  if (addresses.some(a => isPrivateAddress(a.address))) {
    throw new Error('That address points to a private network and cannot be read.');
  }

  return url;
}

// ── Fetch ───────────────────────────────────────────────────────────────────

/**
 * Fetch one page, validating every redirect hop. Node follows redirects
 * automatically, which would bypass the address check — so redirects are
 * handled manually here.
 */
async function fetchPage(url) {
  let current = url;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let res;
    try {
      res = await fetch(current.href, {
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          // Identify honestly. A site that wishes to refuse us should be able to.
          'User-Agent': 'SvargBot/1.0 (+https://svarg.ai; company knowledge import)',
          'Accept': 'text/html,application/xhtml+xml',
        },
      });
    } finally {
      clearTimeout(timer);
    }

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location');
      if (!location) throw new Error(`Redirect without a destination (${res.status}).`);
      current = await assertFetchable(new URL(location, current).href);
      continue;
    }

    if (!res.ok) throw new Error(`The site returned HTTP ${res.status}.`);

    const type = res.headers.get('content-type') || '';
    if (!/text\/html|application\/xhtml/i.test(type)) {
      throw new Error(`That address returned ${type.split(';')[0] || 'a non-HTML response'}.`);
    }

    // Bound the read — a hostile or misconfigured server can stream forever.
    const buf = await res.arrayBuffer();
    if (buf.byteLength > MAX_BYTES) throw new Error('That page is too large to read.');

    return { html: Buffer.from(buf).toString('utf8'), finalUrl: current };
  }

  throw new Error('Too many redirects.');
}

// ── Extraction ──────────────────────────────────────────────────────────────

function decodeEntities(s) {
  return s
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_m, d) => String.fromCharCode(Number(d)));
}

/** Readable text, with the furniture removed. */
export function extractText(html) {
  const body = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    // Block-level tags become newlines so sentences do not run together.
    .replace(/<\/(p|div|section|article|h[1-6]|li|tr|br)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');

  return decodeEntities(body)
    .replace(/[ \t ]+/g, ' ')
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .split('\n').map(l => l.trim()).filter(Boolean).join('\n')
    .trim();
}

export function extractTitle(html) {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? decodeEntities(m[1]).replace(/\s+/g, ' ').trim().slice(0, 200) : '';
}

/** Same-origin links worth following, most interesting first. */
function discoverLinks(html, base) {
  const found = new Map();
  for (const m of html.matchAll(/<a\b[^>]*href=["']([^"'#]+)["']/gi)) {
    let u;
    try { u = new URL(m[1], base); } catch { continue; }
    if (u.origin !== base.origin) continue;
    if (!/^https?:$/.test(u.protocol)) continue;
    if (/\.(pdf|jpe?g|png|gif|svg|zip|mp4|webp|ico|css|js)$/i.test(u.pathname)) continue;
    u.hash = '';
    if (u.href === base.href) continue;
    const rank = INTERESTING.findIndex(re => re.test(u.pathname));
    if (rank === -1) continue;
    if (!found.has(u.href)) found.set(u.href, rank);
  }
  return [...found.entries()].sort((a, b) => a[1] - b[1]).map(([href]) => href);
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Read a company's public site: the given page plus a few obviously
 * informative ones from the same origin.
 *
 * @returns {Promise<{pages: {url:string,title:string,text:string}[], origin:string}>}
 */
export async function readCompanySite(rawUrl) {
  const start = await assertFetchable(rawUrl);
  const { html, finalUrl } = await fetchPage(start);

  const pages = [{
    url: finalUrl.href,
    title: extractTitle(html) || finalUrl.hostname,
    text: extractText(html),
  }];

  for (const href of discoverLinks(html, finalUrl)) {
    if (pages.length >= MAX_PAGES) break;
    try {
      const link = await assertFetchable(href);
      const sub = await fetchPage(link);
      const text = extractText(sub.html);
      // A page with almost no text is navigation furniture, not content.
      if (text.length < 200) continue;
      pages.push({ url: sub.finalUrl.href, title: extractTitle(sub.html) || href, text });
    } catch {
      // One unreadable page must not fail the import.
      continue;
    }
  }

  return { pages, origin: finalUrl.origin };
}
