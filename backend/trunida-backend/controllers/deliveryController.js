/**
 * Svarg — delivering the built agent
 *
 * Two ways out of Eame, and they are not alternatives to each other:
 *
 *   publish  → the agent lands in a repository Svarg owns, which is the one
 *              Railway can actually build. This is how it goes live.
 *   download → the customer gets the same file set as a zip, to put in their
 *              own git, read, audit, or run themselves. This is what they own.
 *
 * Both build from the same manifest, so the zip is byte-for-byte what is
 * running — there is no "source we shipped" and "source we deployed".
 */

import TransformationBlueprint from '../models/TransformationBlueprint.js';
import { buildManifest } from '../services/eameProjectBuilder.js';
import { buildZip } from '../services/zipService.js';
import {
  isSvargGithubConfigured, svargRepoName, ensureSvargRepo, publishToSvarg,
} from '../services/svargGithubService.js';

function auditLog(action, userId, extra = {}) {
  console.log(JSON.stringify({ audit: 'Delivery', action, userId: String(userId), ts: new Date().toISOString(), ...extra }));
}

/** Ownership check — a blueprintId from a request body proves nothing. */
async function ownedBlueprint(blueprintId, userId) {
  if (!blueprintId) return null;
  return TransformationBlueprint.findOne({ _id: blueprintId, userId }).lean().catch(() => null);
}

function safeSlug(text) {
  return String(text || 'svarg-agent').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'svarg-agent';
}

// ── POST /api/delivery/publish ────────────────────────────────────────────────

/**
 * Build the agent and publish it to Svarg's GitHub.
 *
 * No customer GitHub connection is involved. Unlike the customer-owned path
 * this replaces what is there on a re-run: the repository is Svarg's, holds
 * this blueprint's agent and nothing else, and a rebuild is exactly how a
 * changed manifest reaches Railway.
 */
export async function publishProject(req, res) {
  try {
    if (!isSvargGithubConfigured()) {
      return res.status(503).json({
        error: 'Publishing is not configured on this server — SVARG_GITHUB_TOKEN and SVARG_GITHUB_OWNER are missing.',
        code: 'not_configured',
      });
    }

    const { blueprintId, slug } = req.body || {};
    const bp = await ownedBlueprint(blueprintId, req.user._id);
    if (!bp) return res.status(404).json({ error: 'Blueprint not found.' });

    const name = svargRepoName(safeSlug(slug || bp.businessObjective), bp._id);
    const files = buildManifest({ includeJira: true });

    const repo = await ensureSvargRepo({
      name,
      description: `Delivered by Svarg (Eame) — ${String(bp.businessObjective || '').slice(0, 180)}`,
    });
    await publishToSvarg({
      repo, files,
      message: repo.created
        ? 'Initial commit — delivered by Svarg (Eame)'
        : 'Rebuild — delivered by Svarg (Eame)',
    });

    await TransformationBlueprint.updateOne(
      { _id: bp._id, userId: req.user._id },
      { $set: { eameDelivery: {
        repoOwner: repo.owner, repoName: repo.name, repoUrl: repo.htmlUrl,
        fileCount: files.length, pushedAt: new Date(),
      } } }
    ).catch(err => console.warn('[Delivery] could not record delivery —', err.message));

    auditLog(repo.created ? 'PUBLISHED' : 'REPUBLISHED', req.user._id,
      { repo: `${repo.owner}/${repo.name}`, fileCount: files.length });

    return res.json({
      owner: repo.owner, name: repo.name, repoUrl: repo.htmlUrl,
      fileCount: files.length, created: repo.created,
    });
  } catch (err) {
    const data = err.response?.data;
    const nested = data?.errors?.map(e => e.message || e.code).filter(Boolean).join('; ');
    const detail = [data?.message, nested].filter(Boolean).join(' — ') || err.message;
    console.error('[Delivery] publish error:', detail);

    // A token that cannot see the owner is the one failure with a real remedy,
    // and it is a Svarg configuration problem, not something the caller did.
    if (err.response?.status === 401 || err.response?.status === 403) {
      return res.status(502).json({ error: 'Svarg\'s GitHub credentials were rejected. The delivery account needs to be reconnected.' });
    }
    return res.status(500).json({ error: `Failed to publish the project: ${detail}` });
  }
}

// ── GET /api/delivery/download?blueprintId=… ─────────────────────────────────

/**
 * The same file set as a zip, for the customer to keep.
 *
 * Ownership-checked like everything else: the zip contains the agent built
 * for one blueprint, and the blueprint id arrives from the client.
 */
export async function downloadProject(req, res) {
  try {
    const bp = await ownedBlueprint(req.query.blueprintId, req.user._id);
    if (!bp) return res.status(404).json({ error: 'Blueprint not found.' });

    const files = buildManifest({ includeJira: true });
    const folder = safeSlug(req.query.slug || bp.businessObjective);
    const zip = buildZip(files, folder);

    auditLog('DOWNLOADED', req.user._id, { blueprintId: String(bp._id), fileCount: files.length, bytes: zip.length });

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${folder}.zip"`);
    res.setHeader('Content-Length', zip.length);
    return res.end(zip);
  } catch (err) {
    console.error('[Delivery] download error:', err.message);
    return res.status(500).json({ error: 'Failed to build the download.' });
  }
}
