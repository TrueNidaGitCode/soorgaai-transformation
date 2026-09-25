/**
 * The Capital page's one request.
 *
 * Reads live and returns counts. Nothing here is cached: the page is opened
 * a handful of times a month, and a stale figure read aloud in a meeting is
 * the exact failure this endpoint exists to prevent.
 */
import { capitalProof } from '../services/capitalProofService.js';

export async function getCapitalProof(req, res) {
  try {
    return res.json(await capitalProof());
  } catch (err) {
    console.error('[capital] proof failed —', err.message);
    /*
     * The page has to say it could not measure, rather than show nothing and
     * let somebody read last week's slide from memory.
     */
    return res.status(500).json({ error: 'Could not measure.' });
  }
}
