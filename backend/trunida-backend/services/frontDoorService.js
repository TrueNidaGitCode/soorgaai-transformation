/**
 * Svarg — the front door of the application Eame builds
 *
 * The page a customer's users see first. It used to be a centred card with
 * the use case as a tagline and three bullets about asking questions -- a
 * product page for Svarg, on the customer's product. The customer showed us
 * what they wanted instead: their brand, a line that speaks to their people
 * ("Your Cricket Journey, Simplified."), a photo of their world, and a
 * glimpse of the application itself. That is what this writes.
 *
 * Everything here is generated ONCE per blueprint and kept on it
 * (bp.frontDoor), so a rebuild ships the same door and the customer can
 * come to know it. The words come from the model, grounded in the
 * objective, the use case and the datasets; the photo comes from a search
 * for the model's own description of the scene, from Pexels when a key is
 * set and otherwise from Wikimedia Commons, which needs none; and when
 * neither answers, the page draws its own scene in CSS. Nothing here can
 * fail a build: every step has a plain fallback.
 */
import TransformationBlueprint from '../models/TransformationBlueprint.js';
import { resolveUseCase } from './blueprintUseCase.js';
import { generate } from './llmService.js';
import { parseLooseJson } from '../utils/looseJson.js';

const DEFAULT_ACCENT = '#F2C94C';

// ── What the door says ──────────────────────────────────────────────────────

function datasetsOf(bp) {
  const domain = (bp?.domains || []).find(d => d.domainId === 'data-readiness');
  for (const cap of domain?.capabilities || []) {
    for (const section of cap.sections || []) {
      const rows = section.brief?.datasets;
      if (Array.isArray(rows) && rows.length) return rows.map(d => String(d.name || '').trim()).filter(Boolean);
    }
  }
  return [];
}

const str = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

/** Only the shape the page expects, whatever the model returned. */
export function normaliseDoor(raw, fallback) {
  const d = raw && typeof raw === 'object' ? raw : {};
  const eyebrow = (Array.isArray(d.eyebrow) ? d.eyebrow : String(d.eyebrow || '').split(/[•·,|]/))
    .map(w => str(w, 14)).filter(Boolean).slice(0, 3);
  const nav = (Array.isArray(d.nav) ? d.nav : []).map(n => str(n, 18)).filter(Boolean).slice(0, 6);
  const stats = (Array.isArray(d.stats) ? d.stats : []).map(s => ({
    label: str(s?.label, 22), value: str(s?.value, 8), note: str(s?.note, 28),
  })).filter(s => s.label && s.value).slice(0, 4);
  const rows = (Array.isArray(d.list?.rows) ? d.list.rows : []).map(r => ({
    time: str(r?.time, 10), title: str(r?.title, 28), meta: str(r?.meta, 30), tag: str(r?.tag, 12),
  })).filter(r => r.title).slice(0, 3);
  const accentColor = /^#[0-9a-f]{6}$/i.test(String(d.accentColor || '')) ? d.accentColor : fallback.accentColor;
  return {
    eyebrow: eyebrow.length === 3 ? eyebrow : fallback.eyebrow,
    headline: str(d.headline, 40) || fallback.headline,
    accent: str(d.accent, 20) || fallback.accent,
    sub: str(d.sub, 110) || fallback.sub,
    photoQuery: str(d.photoQuery, 60) || fallback.photoQuery,
    accentColor,
    greeting: str(d.greeting, 24) || fallback.greeting,
    role: str(d.role, 14) || fallback.role,
    nav: nav.length >= 4 ? (nav[0].toLowerCase() === 'home' ? nav : ['Home', ...nav].slice(0, 6)) : fallback.nav,
    stats: stats.length === 4 ? stats : fallback.stats,
    list: { title: str(d.list?.title, 26) || fallback.list.title, rows: rows.length === 3 ? rows : fallback.list.rows },
  };
}

/** True of any application, and never wrong: what stands when the model does not answer. */
export function fallbackDoor(bp) {
  const uc = resolveUseCase(bp);
  const useCase = uc?.source === 'approved-use-case' ? String(uc.name || '') : '';
  const datasets = datasetsOf(bp);
  const nav = ['Home', ...datasets.map(d => d.split(/\s+/).slice(0, 2).join(' ')).slice(0, 5)];
  const stats = (datasets.length ? datasets : ['Records', 'Answers', 'People', 'Updates']).slice(0, 4)
    .map((d, i) => ({ label: d.split(/\s+/).slice(0, 3).join(' '), value: String([48, 12, 92, 5][i] || 7), note: 'this week' }));
  while (stats.length < 4) stats.push({ label: ['Answers', 'People', 'Updates', 'Records'][stats.length], value: String([12, 92, 5, 48][stats.length]), note: 'this week' });
  return {
    eyebrow: ['Ask', 'Know', 'Act'],
    headline: 'Your business,',
    accent: 'answered.',
    sub: useCase || 'Ask in your own words and get answers from your own records.',
    photoQuery: str(bp?.industry || 'modern workplace team', 60),
    accentColor: DEFAULT_ACCENT,
    greeting: 'Welcome back!',
    role: 'Owner',
    nav: nav.length >= 4 ? nav : ['Home', 'Records', 'Questions', 'Reports', 'Settings'],
    stats,
    list: { title: 'Recent activity', rows: [
      { time: '09:00', title: 'Morning review', meta: 'Today', tag: 'Done' },
      { time: '11:30', title: 'New records imported', meta: '48 rows', tag: 'Done' },
      { time: '16:00', title: 'Weekly summary', meta: 'Scheduled', tag: 'Upcoming' },
    ] },
  };
}

const SYSTEM = `You write the landing page of a small business application: its front door, seen by the people who use it every day.
Return ONLY a JSON object with these fields:
{
  "eyebrow": ["three", "single", "words"]            three short verbs or nouns in the business's own spirit, e.g. ["Train","Improve","Achieve"]
  "headline": "Your Cricket Journey,"                 the first line of the headline, at most 5 words, ending with a comma
  "accent": "Simplified."                             the last word or two, the payoff, with its full stop
  "sub": "Manage students, sessions, attendance, communication and invoices — all in one place."   one sentence, at most 16 words, naming what it manages
  "photoQuery": "cricket batsman sunset"                two to four concrete nouns for a photo search of this business in action: the people, the place, the activity; no brand names, no adjectives
  "accentColor": "#F2C94C"                            one hex colour that suits the business, warm and legible on dark navy
  "greeting": "Welcome back!"
  "role": "Coach"                                     the everyday user's role, one word
  "nav": ["Home","Students","Sessions","Attendance","Messages","Invoices"]   5 or 6 sidebar items, the things this business keeps track of, one or two words each
  "stats": [ {"label":"Today's Sessions","value":"6","note":"3 completed · 3 upcoming"}, ... ]   exactly 4 tiles, plausible numbers, short notes
  "list": { "title": "Upcoming Sessions", "rows": [ {"time":"06:00 AM","title":"Advanced Batting","meta":"U16 · Ground 1","tag":"Upcoming"}, ... ] }   exactly 3 rows
}
Rules: everything in the vocabulary of THIS business, never Svarg's. No words like AI, assistant, platform, solution. Plain English. Complete, valid JSON and nothing else.`;

async function suggestDoor(bp) {
  const uc = resolveUseCase(bp);
  const useCase = uc?.source === 'approved-use-case' ? String(uc.name || '') : '';
  const user = [
    bp?.companyName ? `Company: ${bp.companyName}` : '',
    bp?.industry ? `Industry: ${bp.industry}` : '',
    bp?.appName ? `Application name: ${bp.appName}` : '',
    useCase ? `What the application does: ${useCase}` : '',
    `The business objective: ${String(bp?.businessObjective || '').slice(0, 900)}`,
    `The datasets it runs on: ${datasetsOf(bp).join('; ') || 'not listed'}`,
  ].filter(Boolean).join('\n');
  const { text } = await generate({ systemPrompt: SYSTEM, userMessage: user, maxTokens: 900, label: 'eame:front-door' });
  return parseLooseJson(text).value;
}

// ── The photo ───────────────────────────────────────────────────────────────

const UA = 'SvargAI/1.0 (https://www.svargai.com; hello@svargai.com)';

async function pexelsPhoto(query) {
  const key = process.env.PEXELS_API_KEY;
  if (!key) return null;
  const r = await fetch(`https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&orientation=landscape&size=large&per_page=1`, {
    headers: { Authorization: key }, signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) return null;
  const p = (await r.json()).photos?.[0];
  if (!p?.src?.landscape) return null;
  return { url: p.src.landscape, credit: `Photo by ${p.photographer} on Pexels`, creditUrl: p.url, source: 'pexels' };
}

/** No key needed. Free-licensed, so the credit line under the hero is part of the deal. */
async function commonsPhoto(query) {
  const params = new URLSearchParams({
    action: 'query', generator: 'search', gsrnamespace: '6', gsrlimit: '8',
    gsrsearch: `${query} filemime:image/jpeg`,
    prop: 'imageinfo', iiprop: 'url|size|extmetadata', iiurlwidth: '1800', format: 'json',
  });
  const r = await fetch(`https://commons.wikimedia.org/w/api.php?${params}`, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(8000) });
  if (!r.ok) return null;
  const pages = Object.values((await r.json()).query?.pages || {});
  const pick = pages
    .map(p => ({ p, info: p.imageinfo?.[0] }))
    .filter(({ info }) => info && info.width >= 1200 && info.width > info.height)
    .sort((a, b) => (a.p.index || 99) - (b.p.index || 99))[0];
  if (!pick) return null;
  const meta = pick.info.extmetadata || {};
  const artist = String(meta.Artist?.value || '').replace(/<[^>]+>/g, '').trim();
  return {
    url: String(pick.info.thumburl || pick.info.url).split('?')[0],
    credit: `Photo: ${artist ? artist + ', ' : ''}Wikimedia Commons${meta.LicenseShortName?.value ? ' (' + meta.LicenseShortName.value + ')' : ''}`,
    creditUrl: pick.info.descriptionurl || '',
    source: 'commons',
  };
}

/**
 * The model's scene first, then shorter and shorter versions of it: Commons
 * matches words in titles and descriptions, and a ten-word scene finds
 * nothing where its first three words find a good photograph.
 */
export async function findHeroPhoto(query) {
  if (!query || process.env.VITEST || process.env.FRONT_DOOR_PHOTOS === '0') return null;
  try {
    const byPexels = await pexelsPhoto(query);
    if (byPexels) return byPexels;
    const words = String(query).split(/\s+/).filter(w => w.length > 2 && !/^(at|on|in|the|a|an|of|with|and)$/i.test(w));
    for (const n of [words.length, 4, 3, 2]) {
      if (n > words.length || n < 1) continue;
      const found = await commonsPhoto(words.slice(0, n).join(' '));
      if (found) return found;
    }
    return null;
  } catch (err) { console.warn('[front-door] no photo —', err.message); return null; }
}

// ── The door, kept on the blueprint ─────────────────────────────────────────

export async function ensureFrontDoor(bp) {
  if (bp?.frontDoor?.headline) return bp.frontDoor;
  const fallback = fallbackDoor(bp);
  let door;
  try { door = normaliseDoor(await suggestDoor(bp), fallback); }
  catch (err) { console.warn('[front-door] the model did not answer —', err.message); door = fallback; }
  door.photo = await findHeroPhoto(door.photoQuery);
  door.generatedAt = new Date();
  if (bp?._id) {
    await TransformationBlueprint.updateOne({ _id: bp._id }, { $set: { frontDoor: door } }).catch(() => {});
    bp.frontDoor = door;
  }
  return door;
}

/** The template's tokens, from the door. Text tokens are escaped by the builder; the JSON one is raw. */
export function frontDoorCopy(bp) {
  const d = bp?.frontDoor?.headline ? bp.frontDoor : fallbackDoor(bp);
  const name = String(bp?.appName || '').trim();
  const photo = d.photo?.url && /^https:\/\//.test(d.photo.url) ? d.photo : null;
  return {
    __APP_TAGLINE__: d.sub,
    __APP_EYEBROW__: d.eyebrow.join(' • '),
    __APP_HEADLINE__: d.headline,
    __APP_ACCENT__: d.accent,
    __APP_ACCENT_COLOR__: d.accentColor || DEFAULT_ACCENT,
    __APP_INITIAL__: (name || 'A').charAt(0).toUpperCase(),
    // Single quotes: this lands inside a double-quoted style attribute.
    __APP_HERO_IMAGE__: photo ? `url('${photo.url.replace(/'/g, '%27')}')` : 'none',
    __APP_HERO_CREDIT__: photo ? photo.credit : '',
    __APP_HERO_CREDIT_URL__: photo?.creditUrl || '',
    __APP_PREVIEW_JSON__: JSON.stringify({ greeting: d.greeting, role: d.role, nav: d.nav, stats: d.stats, list: d.list }),
  };
}
