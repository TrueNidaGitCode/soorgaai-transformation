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
import { FIXED_PATHS } from '../services/eameSpec.js';
import GeneratedApplication from '../models/GeneratedApplication.js';
import crypto from 'crypto';
import { generatedManifest } from './eameBuildController.js';
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

/**
 * What to deliver: the application Eame wrote and verified, if there is one.
 *
 * Falls back to the fixed manifest only when no build has passed — a customer
 * who has not pressed Build still gets something rather than an error, and the
 * caller is told which they got so the screen cannot describe a defect matcher
 * as their application.
 */
async function projectFor(bp) {
  const generated = await generatedManifest(bp._id, { appName: bp.appName });
  if (generated) return { files: generated, source: 'generated' };
  return { files: buildManifest({ includeJira: true, appName: bp.appName }), source: 'template' };
}

/**
 * A stable fingerprint of exactly what would be written.
 *
 * Path and content, both, in a fixed order — a file moved between directories
 * is a different delivery, and so is one whose bytes changed.
 *
 * Line endings are normalised first. Several fixed files are copied from
 * Svarg's own checkout, which is CRLF on a Windows working copy and LF on
 * Railway, so the same delivery hashed differently depending on where the
 * process happened to run — and every publish from the other platform looked
 * like a change, pushing a new commit and rebuilding the customer's
 * application to deliver nothing.
 */
function manifestHash(files) {
  const h = crypto.createHash('sha256');
  for (const f of [...files].sort((a, b) => a.path.localeCompare(b.path))) {
    const content = String(f.content || '').split('\r\n').join('\n');
    h.update(f.path).update('\u0000').update(content).update('\u0000');
  }
  return h.digest('hex');
}

/**
 * The few things about a delivered project that a filename cannot answer.
 *
 * Yusu's security check used to require a credential-encryption file in every
 * project. That made sense when Eame shipped one application, which stored
 * Atlassian OAuth tokens. It makes no sense for an application that holds
 * student records and reaches its model through a gateway: there is nothing to
 * encrypt, and demanding the file only teaches people that a red check is
 * normal.
 *
 * So the question becomes conditional, and answering it means reading the code.
 * Only what Eame wrote is considered — the runtime mentions provider API keys
 * because it reads them from the environment, which is the opposite of storing
 * one.
 */
function projectFacts(files) {
  const fixed = new Set(FIXED_PATHS);
  const authored = files.filter(f => !fixed.has(f.path) && /\.m?js$/.test(f.path));
  const code = authored.map(f => f.content || '').join(String.fromCharCode(10));

  // A schema field or an assignment that puts a secret somewhere it persists.
  // Reading process.env is not storing; writing a token onto a document is.
  const storesCredentials =
    /(access|refresh|api|client|bearer)[_-]?(token|key|secret)\s*:/i.test(code)
    || /\b(password|passwordHash|clientSecret|privateKey|credential)\s*:/i.test(code)
    || /encryptSecret|decryptSecret/.test(code);

  return {
    storesCredentials,
    // Reported rather than judged: the screen decides what is required, this
    // only says what is there.
    hasAuthMiddleware: files.some(f => /authMiddleware/i.test(f.path)),
    hasEncryption: files.some(f => /encryption|crypto/i.test(f.path)),
    hasEnvExample: files.some(f => /\.env\.example$/.test(f.path)),
    committedEnv: files.some(f => /(^|\/)\.env$/.test(f.path)),
  };
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

    // Is what we would push any different from what is already there?
    //
    // Yusu used to answer this by checking whether a repository existed at all
    // and skipping the push if it did — correct while a blueprint produced its
    // application exactly once, and wrong the moment Eame could rebuild one.
    // A regenerated application then sat in the database while Railway went on
    // building the previous push, and the screen reported a successful deploy
    // of code nobody had shipped.
    //
    // Decided here rather than on the screen because both timestamps live on
    // this side, and answered BEFORE any GitHub call, so an up-to-date project
    // costs one database read and nothing else.
    // Hashed, not dated. Timestamps answer "is the generated code newer?",
    // which misses a fixed runtime file changing under a build that is
    // otherwise current — and an undelivered runtime fix is exactly as
    // undelivered as an unpushed build. Comparing what would be written costs
    // one compose and is right in both cases.
    const { files: candidate, source: candidateSource } = await projectFor(bp);
    const hash = manifestHash(candidate);
    if (!req.body?.force && bp.eameDelivery?.repoName && bp.eameDelivery?.manifestHash === hash) {
      auditLog('PUBLISH_SKIPPED', req.user._id, { repo: bp.eameDelivery.repoName, reason: 'identical manifest' });
      return res.json({
        owner: bp.eameDelivery.repoOwner, name: bp.eameDelivery.repoName,
        repoUrl: bp.eameDelivery.repoUrl, fileCount: bp.eameDelivery.fileCount || 0,
        created: false, upToDate: true,
      });
    }

    // The name the customer chose on Eame drives both the repository and what
    // the running application calls itself.
    const name = svargRepoName(safeSlug(bp.appName || slug || bp.businessObjective), bp._id);
    const files = candidate;
    const source = candidateSource;

    const repo = await ensureSvargRepo({
      name,
      description: `Delivered by Svarg (Eame) — ${String(bp.businessObjective || '').slice(0, 180)}`,
    });
    const pushed = await publishToSvarg({
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
        commitSha: pushed?.commitSha || '',
        manifestHash: hash,
      } } }
    ).catch(err => console.warn('[Delivery] could not record delivery —', err.message));

    auditLog(repo.created ? 'PUBLISHED' : 'REPUBLISHED', req.user._id,
      { repo: `${repo.owner}/${repo.name}`, source, fileCount: files.length });

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

    const { files, source } = await projectFor(bp);
    const folder = safeSlug(bp.appName || req.query.slug || bp.businessObjective);
    const zip = buildZip(files, folder);

    auditLog('DOWNLOADED', req.user._id, { blueprintId: String(bp._id), source, fileCount: files.length, bytes: zip.length });

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${folder}.zip"`);
    res.setHeader('Content-Length', zip.length);
    return res.end(zip);
  } catch (err) {
    console.error('[Delivery] download error:', err.message);
    return res.status(500).json({ error: 'Failed to build the download.' });
  }
}

// ── GET /api/delivery/manifest ───────────────────────────────────────────────

/**
 * The file list a delivery would contain — paths and sizes, no content.
 *
 * Feeds Yusu's governance checks and the Eame screen's file list, so what is
 * shown comes from the same builder the delivery uses rather than a
 * hand-maintained list that could drift from it.
 *
 * Lived under /api/github/personal while delivery went to the customer's own
 * repository. It never had anything to do with that connection — it reads no
 * token and calls GitHub not at all — and leaving it there implied Svarg still
 * pushes to customer accounts.
 */
export async function projectManifest(req, res) {
  try {
    // With a blueprint, this is THE PROJECT — the same files projectFor would
    // hand to a push or a zip. Without one it is the fixed template, which is
    // all an unbuilt blueprint has.
    //
    // It used to be the template either way, and Yusu's governance checks ran
    // against it: the screen was validating files the customer was never going
    // to receive and passing them, while the application it actually shipped
    // went unchecked. A check that cannot fail on the thing being delivered is
    // not a check.
    const bp = req.query.blueprintId
      ? await ownedBlueprint(req.query.blueprintId, req.user._id)
      : null;
    if (req.query.blueprintId && !bp) {
      return res.status(404).json({ error: 'Blueprint not found.' });
    }

    const { files, source } = bp
      ? await projectFor(bp)
      : { files: buildManifest({ includeJira: req.query.includeJira !== '0' }), source: 'template' };

    return res.json({
      source,
      fileCount: files.length,
      totalBytes: files.reduce((n, f) => n + Buffer.byteLength(f.content || '', 'utf8'), 0),
      // What the screen cannot work out from a list of paths. A governance
      // check that asks "does this project need credential encryption" has to
      // read the code; the screen only has filenames, and inferring it from
      // those is guessing.
      facts: projectFacts(files),
      files: files.map(f => ({
        path: f.path,
        bytes: Buffer.byteLength(f.content || '', 'utf8'),
      })),
    });
  } catch (err) {
    console.error('[Delivery] manifest error:', err.message);
    return res.status(500).json({ error: 'Failed to build the project manifest.' });
  }
}
