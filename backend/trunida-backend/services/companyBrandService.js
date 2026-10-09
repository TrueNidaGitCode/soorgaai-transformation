/**
 * Svarg — a company's name, website and logo, from a work email address.
 *
 * Somebody signing in with name@tenacrity.com has told us which company they
 * are from. Their own website says the rest: what the company calls itself,
 * a line about what it does, and the icon it uses for itself. Shown back in
 * the sign-in box ("Welcome, Tenacrity"), it tells them they are recognised;
 * kept, it fills their profile, gives Cob the site to read, and puts their
 * logo on the retention application Svarg builds for them.
 *
 * ── The rules it keeps ─────────────────────────────────────────────────────
 *
 * Free mail (gmail, outlook…) says nothing about a company and is skipped.
 *
 * Only the company's own public site is read, through websiteService's guard,
 * which refuses private and internal addresses on every redirect.
 *
 * It never stands between somebody and signing in: anything that fails —
 * an unreachable site, a site that refuses bots, no icon — is simply nothing
 * shown, never an error.
 *
 * The logo is fetched once and kept as a small data URI, so the delivered
 * application does not depend on the company's site staying up, and a
 * domain is read at most once a month.
 */
import mongoose from 'mongoose';
import { assertFetchable, fetchPage } from './websiteService.js';

/** Addresses that belong to a mail provider, not to a company. */
export const FREE_MAIL = new Set([
  'gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'live.com', 'msn.com',
  'yahoo.com', 'yahoo.co.in', 'ymail.com', 'rocketmail.com', 'icloud.com', 'me.com', 'mac.com',
  'aol.com', 'proton.me', 'protonmail.com', 'zoho.com', 'zohomail.in', 'zohomail.com',
  'rediffmail.com', 'rediff.com', 'gmx.com', 'gmx.net', 'mail.com', 'yandex.com', 'yandex.ru',
  'tutanota.com', 'fastmail.com', 'hey.com', 'qq.com', '163.com', 'outlook.in',
]);

const CACHE_DAYS = 30;
const MAX_LOGO_BYTES = 100 * 1024;
const LOGO_TIMEOUT_MS = 8000;

/** The company domain in an email address, or '' for free mail and nonsense. */
export function companyDomain(email) {
  const m = String(email || '').trim().toLowerCase().match(/^[^\s@]+@([a-z0-9.-]+\.[a-z]{2,})$/);
  if (!m) return '';
  const domain = m[1].replace(/^www\./, '');
  return FREE_MAIL.has(domain) ? '' : domain;
}

// ── Reading a home page ─────────────────────────────────────────────────────

const decode = (s) => String(s || '')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#x27;/g, "'")
  .replace(/&#(\d+);/g, (_m, d) => String.fromCharCode(Number(d)))
  .replace(/\s+/g, ' ').trim();

/** Every tag of one name, as attribute maps. */
function tags(html, name) {
  const out = [];
  const re = new RegExp(`<${name}\\b([^>]*)>`, 'gi');
  let m;
  while ((m = re.exec(html))) {
    const attrs = {};
    const ar = /([a-zA-Z:_-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/g;
    let a;
    while ((a = ar.exec(m[1]))) attrs[a[1].toLowerCase()] = a[3] ?? a[4] ?? a[5] ?? '';
    out.push(attrs);
  }
  return out;
}

function meta(html, key) {
  const t = tags(html, 'meta').find((m) => (m.property || m.name || '').toLowerCase() === key);
  return t ? decode(t.content) : '';
}

const GENERIC = /^(home|homepage|welcome|index|official site|official website|website)$/i;

/** What the company calls itself, from its own home page. */
export function brandName(html, domain) {
  const site = meta(html, 'og:site_name') || meta(html, 'application-name');
  if (site && site.length <= 48) return site;
  const title = decode((String(html).match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '');
  // "Tenacrity | Tools for teachers" → "Tenacrity": the shortest real part.
  const parts = title.split(/\s+[|–—:·•-]\s+/).map((s) => s.trim()).filter((s) => s && !GENERIC.test(s));
  const best = parts.sort((a, b) => a.length - b.length)[0];
  if (best && best.length <= 48) return best;
  const label = domain.split('.')[0];
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/**
 * The icon the company uses for itself, best first: an apple-touch-icon
 * (square and large), then the largest declared icon, then the site's
 * favicon. A share image (og:image) is a banner, not a logo, and is used
 * only when there is nothing else.
 */
export function logoCandidates(html, base) {
  const abs = (href) => { try { return new URL(decode(href), base).href; } catch { return ''; } };
  const size = (s) => {
    const n = String(s || '').split(/\s+/).map((x) => Number(x.split('x')[0]) || 0);
    return n.length ? Math.max(...n) : 0;
  };
  const links = tags(html, 'link').filter((l) => /icon/i.test(l.rel || '') && !/mask-icon/i.test(l.rel || '') && l.href);
  const touch = links.filter((l) => /apple-touch-icon/i.test(l.rel)).sort((a, b) => size(b.sizes) - size(a.sizes));
  const icons = links.filter((l) => !/apple-touch-icon/i.test(l.rel)).sort((a, b) => size(b.sizes) - size(a.sizes));
  const og = meta(html, 'og:image');
  const list = [...touch, ...icons].map((l) => abs(l.href));
  list.push(abs('/favicon.ico'));
  if (og) list.push(abs(og));
  return [...new Set(list.filter(Boolean))];
}

/** One image, through the same guard as a page, kept only if small and really an image. */
async function fetchImage(rawUrl) {
  let url = await assertFetchable(rawUrl);
  for (let hop = 0; hop < 4; hop++) {
    const res = await fetch(url.href, {
      redirect: 'manual',
      signal: AbortSignal.timeout(LOGO_TIMEOUT_MS),
      headers: { 'User-Agent': 'SvargBot/1.0 (+https://svarg.ai; company logo)', Accept: 'image/*' },
    });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location');
      if (!loc) return null;
      url = await assertFetchable(new URL(loc, url).href);
      continue;
    }
    if (!res.ok) return null;
    const type = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (!/^image\/(png|jpeg|jpg|gif|webp|svg\+xml|x-icon|vnd\.microsoft\.icon)$/.test(type)) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length || buf.length > MAX_LOGO_BYTES) return null;
    return `data:${type};base64,${buf.toString('base64')}`;
  }
  return null;
}

/** Read a company's home page and pick out its brand. Never throws. */
export async function readBrand(domain) {
  const empty = { domain, name: '', website: '', description: '', logo: '' };
  for (const start of [`https://${domain}`, `https://www.${domain}`]) {
    try {
      const { html, finalUrl } = await fetchPage(await assertFetchable(start));
      const out = {
        domain,
        name: brandName(html, domain),
        website: finalUrl.origin,
        description: (meta(html, 'og:description') || meta(html, 'description')).slice(0, 240),
        logo: '',
      };
      for (const cand of logoCandidates(html, finalUrl.href).slice(0, 5)) {
        try {
          const logo = await fetchImage(cand);
          if (logo) { out.logo = logo; break; }
        } catch { /* the next candidate */ }
      }
      return out;
    } catch { /* try www., then give up quietly */ }
  }
  return empty;
}

function brandsCollection() {
  return mongoose.connection.collection('svarg_company_brands');
}

/**
 * The brand for a domain, read once and kept for a month. An unreadable site
 * is remembered too, so a domain that refuses us is not asked on every
 * keystroke of every sign-in.
 */
export async function brandForDomain(domain, { read = readBrand } = {}) {
  if (!domain) return null;
  try {
    const held = await brandsCollection().findOne({ _id: domain });
    if (held && Date.now() - new Date(held.readAt).getTime() < CACHE_DAYS * 86400000) {
      return held.name || held.logo ? strip(held) : null;
    }
  } catch { /* no database: read without keeping */ }
  const fresh = await read(domain);
  try {
    await brandsCollection().updateOne({ _id: domain }, { $set: { ...fresh, readAt: new Date() } }, { upsert: true });
  } catch { /* keeping it is a nicety */ }
  return fresh.name || fresh.logo ? strip(fresh) : null;
}

function strip(b) {
  return { domain: b.domain || b._id, name: b.name || '', website: b.website || '', description: b.description || '', logo: b.logo || '' };
}

export async function brandForEmail(email, opts) {
  return brandForDomain(companyDomain(email), opts);
}
