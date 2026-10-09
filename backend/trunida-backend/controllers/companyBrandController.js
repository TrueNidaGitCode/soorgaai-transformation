/**
 * GET /api/guest/company-brand?email=… — the company behind a work email,
 * for the sign-in box to recognise them before the code arrives.
 *
 * Public, because it is asked before anybody is signed in, and bounded the
 * way the other guest endpoints are: a per-IP limit in memory. It returns
 * only what the company publishes about itself on its own home page.
 * See services/companyBrandService.js.
 */
import { brandForEmail, companyDomain } from '../services/companyBrandService.js';

const MAX_PER_WINDOW = 30;
const WINDOW_MS = 60 * 60 * 1000;
const hits = new Map();

function tooMany(ip) {
  const now = Date.now();
  const mine = (hits.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  if (mine.length >= MAX_PER_WINDOW) { hits.set(ip, mine); return true; }
  mine.push(now);
  hits.set(ip, mine);
  return false;
}

export async function companyBrand(req, res) {
  const email = String(req.query?.email || '').slice(0, 254);
  // Free mail and malformed addresses are answered without reading anything.
  if (!companyDomain(email)) return res.json({ brand: null });
  if (tooMany(req.ip || '')) return res.json({ brand: null });
  try {
    return res.json({ brand: await brandForEmail(email) });
  } catch {
    // Never an error in front of somebody signing in: nothing is shown instead.
    return res.json({ brand: null });
  }
}
