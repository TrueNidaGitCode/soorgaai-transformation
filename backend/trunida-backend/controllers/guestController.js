/**
 * SoorgaAI — Guest (try-before-login) Controller
 *
 * Lets anonymous visitors generate a preview blueprint — the AI Use Cases
 * domain only — straight from the landing-page prompt box, no account needed.
 * The other domains are seeded as pending; signing in and claiming the
 * blueprint (claimGuestBlueprint in strategyCanvasController) unlocks them
 * through the existing per-domain Generate flow.
 *
 * No auth on these routes, so access is bounded instead by:
 *   - server-generated unguessable guestId (crypto.randomUUID) as the key
 *   - per-IP rate limit on generation (in-memory — resets on deploy, which
 *     is acceptable for abuse protection, not billing-grade quota)
 *   - objective length cap
 */

import crypto from 'crypto';
import TransformationBlueprint from '../models/TransformationBlueprint.js';
import { enabledDomains } from '../config/domainRegistry.js';
import { getDomainCapabilities } from '../services/strategyCanvasService.js';
import { generateSpecificDomainsAsync } from '../services/blueprintGenerationService.js';

const GUEST_PREVIEW_DOMAIN_IDS = ['ai-use-cases'];
const MAX_OBJECTIVE_LENGTH = 2000;

// ── Per-IP rate limit: N guest generations per rolling 24h ────────────────────
const RATE_LIMIT_MAX  = 5;
const RATE_WINDOW_MS  = 24 * 60 * 60 * 1000;
const _ipHits = new Map();

function isRateLimited(ip) {
  const now  = Date.now();
  const hits = (_ipHits.get(ip) || []).filter(t => now - t < RATE_WINDOW_MS);
  if (hits.length >= RATE_LIMIT_MAX) { _ipHits.set(ip, hits); return true; }
  hits.push(now);
  _ipHits.set(ip, hits);
  return false;
}

/**
 * POST /api/guest/generate-blueprint
 * Body: { businessObjective }
 * Creates a guest blueprint (all domains seeded, AI Use Cases generating)
 * and returns { guestId, transformationId } immediately.
 */
export async function startGuestGeneration(req, res) {
  try {
    const { businessObjective } = req.body;
    const objective = businessObjective?.trim();

    if (!objective) {
      return res.status(400).json({ error: 'businessObjective is required.' });
    }
    if (objective.length > MAX_OBJECTIVE_LENGTH) {
      return res.status(400).json({ error: `Objective is too long (max ${MAX_OBJECTIVE_LENGTH} characters).` });
    }
    if (isRateLimited(req.ip)) {
      return res.status(429).json({ error: 'Preview limit reached for today. Sign in to keep generating.' });
    }

    const guestId = crypto.randomUUID();

    // Seed every enabled domain (pending) so the claimed blueprint slots
    // straight into the existing workspace per-domain Generate flow.
    const domainDocs = enabledDomains().map(domain => {
      const caps = getDomainCapabilities(domain.kbPath);
      return {
        domainId:   domain.id,
        domainName: domain.name,
        status:     'pending',
        capabilities: caps.map(c => ({
          capabilityId:   c.id,
          capabilityName: c.name,
          status:         'pending',
          sections:       [],
        })),
      };
    });

    const blueprint = await TransformationBlueprint.create({
      guestId,
      businessObjective: objective,
      industry: 'Automotive',
      companyName: '',
      status: 'generating',
      domains: domainDocs,
    });

    // Guest generation has no user profile — loadCompanyProfile(null) falls
    // back to sensible defaults ("Your Organisation", Automotive).
    generateSpecificDomainsAsync(blueprint._id, null, objective, GUEST_PREVIEW_DOMAIN_IDS)
      .catch(err => console.error('[startGuestGeneration] async error:', err));

    return res.json({ guestId, transformationId: blueprint._id });

  } catch (err) {
    console.error('startGuestGeneration error:', err);
    res.status(500).json({ error: 'Failed to start preview generation.' });
  }
}

/**
 * GET /api/guest/blueprint/:guestId
 * Returns the guest's blueprint (most recent if somehow multiple).
 */
export async function getGuestBlueprint(req, res) {
  try {
    const bp = await TransformationBlueprint
      .findOne({ guestId: req.params.guestId })
      .sort({ createdAt: -1 })
      .lean();

    if (!bp) return res.status(404).json({ error: 'No preview blueprint found.' });
    return res.json(bp);
  } catch (err) {
    console.error('getGuestBlueprint error:', err);
    res.status(500).json({ error: 'Failed to load preview blueprint.' });
  }
}

/**
 * GET /api/guest/blueprint/:guestId/stream
 * SSE — same shape as the authenticated transformation stream.
 */
export async function streamGuestProgress(req, res) {
  const { guestId } = req.params;

  res.setHeader('Content-Type',  'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection',    'keep-alive');
  res.flushHeaders();

  const send = (data) => { if (!res.writableEnded) res.write(`data: ${JSON.stringify(data)}\n\n`); };
  const heartbeat = setInterval(() => { if (!res.writableEnded) res.write(': heartbeat\n\n'); }, 15000);

  const poll = setInterval(async () => {
    try {
      const bp = await TransformationBlueprint.findOne({ guestId }).lean();
      if (!bp) { send({ error: 'Preview not found.' }); clearInterval(poll); clearInterval(heartbeat); res.end(); return; }

      const domainStatuses = bp.domains.map(d => ({
        domainId:   d.domainId,
        domainName: d.domainName,
        status:     d.status,
        capabilities: (d.capabilities || []).map(c => ({ id: c.capabilityId, name: c.capabilityName, status: c.status })),
      }));

      send({ domains: domainStatuses, overallStatus: bp.status });

      if (bp.status === 'completed' || bp.status === 'error') {
        send({ done: true });
        clearInterval(poll); clearInterval(heartbeat); res.end();
      }
    } catch (err) {
      send({ error: 'Stream error.' });
      clearInterval(poll); clearInterval(heartbeat); res.end();
    }
  }, 1500);

  req.on('close', () => { clearInterval(poll); clearInterval(heartbeat); });
}
