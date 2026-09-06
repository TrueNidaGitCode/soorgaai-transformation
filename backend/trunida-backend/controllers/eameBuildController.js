/**
 * Svarg — Eame builds the application
 *
 * POST /strategy-canvas/transformation-blueprint/:blueprintId/eame-build
 *      starts a build and returns immediately
 * GET  /strategy-canvas/transformation-blueprint/:blueprintId/eame-build
 *      status, progress, and the manifest once it has passed
 *
 * Asynchronous because a build is a generation plus an npm install plus a boot
 * — tens of seconds at best, minutes when it has to repair. Holding an HTTP
 * request open for that hits every proxy timeout between here and the browser,
 * and the screen would have nothing to show meanwhile.
 */

import TransformationBlueprint from '../models/TransformationBlueprint.js';
import GeneratedApplication from '../models/GeneratedApplication.js';
import { buildApplication } from '../services/eameBuildService.js';
import { buildRuntime } from '../services/eameProjectBuilder.js';
import { tenantMongoUri } from '../services/deployTargetService.js';
import { requireEntitlement } from '../services/entitlements.js';

/**
 * How long a build may sit in "building" before it is assumed dead.
 * Generous: a repair round is a generation plus an install plus a boot, and
 * reclaiming a build that is genuinely still running would start a second one
 * writing to the same record.
 */
const STALE_AFTER_MINUTES = 20;

/**
 * Which model writes the code.
 *
 * Should be the best model on the Engineering benchmark — that is what the
 * table is for. It is not yet, because the models at the top of it are on
 * provider accounts with no credit, and routing to one would fail every build
 * for a reason that has nothing to do with the code. Set EAME_BUILD_PROVIDER
 * to move it once those accounts are funded.
 */
function buildProvider() {
  return (process.env.EAME_BUILD_PROVIDER || 'gemini').trim();
}

/**
 * A throwaway database for the boot gate.
 *
 * Without one the build still runs, but stops after `npm install` and says so
 * — an unverified project reported as verified is the one outcome this whole
 * pipeline exists to prevent.
 */
function scratchUri() {
  const cluster = process.env.TENANT_CLUSTER_URI || process.env.MONGO_URI;
  if (!cluster) return '';
  try { return tenantMongoUri(cluster, 'svarg_build_scratch'); }
  catch { return ''; }
}

async function owned(blueprintId, userId) {
  return TransformationBlueprint.findOne({ _id: blueprintId, userId }).lean().catch(() => null);
}

export async function startBuild(req, res) {
  try {
    const { blueprintId } = req.params;
    const bp = await owned(blueprintId, req.user._id);
    if (!bp) return res.status(404).json({ error: 'Blueprint not found.' });

    // Only when there is nothing to rebuild. A record that already exists has
    // already been counted, so re-running a failed or superseded build must not
    // spend a second slot — the customer would be paying twice for one
    // application because the first attempt did not work.
    const already = await GeneratedApplication.findOne({ blueprintId }).select('_id').lean();
    if (!already && !await requireEntitlement(req, res, 'application')) return;

    // One build at a time per blueprint. Two concurrent generations would race
    // to write the same record, and the loser's files would vanish with no
    // trace of why.
    const running = await GeneratedApplication.findOne({ blueprintId, status: 'building' }).lean();
    if (running) {
      // A build only exists in the process that started it, so a restart
      // during one leaves a record saying "building" with nothing behind it —
      // a lock that never clears and a Build button that never re-enables.
      // Anything older than the longest plausible build is treated as dead.
      const startedAt = running.progress?.startedAt || running.updatedAt;
      const ageMinutes = startedAt ? (Date.now() - new Date(startedAt).getTime()) / 60000 : Infinity;
      if (ageMinutes < STALE_AFTER_MINUTES) {
        return res.status(409).json({ error: 'A build is already running for this blueprint.' });
      }
      console.warn(`[eame-build] reclaiming a build stuck for ${Math.round(ageMinutes)} minutes`);
    }

    const doc = await GeneratedApplication.findOneAndUpdate(
      { blueprintId },
      {
        $set: {
          blueprintId, userId: req.user._id,
          status: 'building',
          progress: { attempt: 0, phase: 'generating', detail: '', startedAt: new Date() },
          files: [], history: [], reason: '', verifiedTo: '', skipped: [],
          provider: buildProvider(),
        },
      },
      { upsert: true, new: true }
    );

    // Deliberately not awaited: the response goes back now and the screen polls.
    runBuild(bp, doc._id).catch(err => {
      console.error('[eame-build] build crashed:', err.message);
      GeneratedApplication.updateOne({ _id: doc._id }, {
        $set: { status: 'failed', reason: 'The build crashed: ' + err.message,
                'progress.phase': 'failed' },
      }).catch(() => {});
    });

    return res.status(202).json({ started: true, status: 'building' });
  } catch (err) {
    console.error('[eame-build] start error:', err.message);
    return res.status(500).json({ error: 'Could not start the build.' });
  }
}

async function runBuild(bp, docId) {
  const result = await buildApplication(bp, {
    provider: buildProvider(),
    mongoUri: scratchUri(),
    onProgress: ({ attempt, phase, detail }) => {
      // Fire and forget: a progress write that fails must not fail the build.
      GeneratedApplication.updateOne({ _id: docId }, {
        $set: { 'progress.attempt': attempt, 'progress.phase': phase, 'progress.detail': detail || '' },
      }).catch(() => {});
    },
  });

  await GeneratedApplication.updateOne({ _id: docId }, {
    $set: {
      status: result.ok ? 'passed' : 'failed',
      files: result.ok ? result.files.filter(f => (result.generatedPaths || []).includes(f.path)) : [],
      verifiedTo: result.verifiedTo || '',
      skipped: result.skipped || [],
      history: (result.history || []).map(h => ({
        attempt: h.attempt, stage: h.stage, failures: h.failures || [], wrote: h.wrote || [],
      })),
      reason: result.reason || '',
      useCase: result.spec?.useCase?.name || '',
      warnings: result.spec?.warnings || [],
      progress: { attempt: (result.history || []).length, phase: result.ok ? 'passed' : 'failed',
                  detail: result.verifiedTo || result.reason || '', startedAt: null },
    },
  });
}

/**
 * The whole project: the runtime composed with what Eame wrote.
 *
 * Exported because delivery needs exactly this — the zip and the GitHub push
 * must be the same bytes that were verified, or "verified" describes something
 * nobody shipped.
 */
export async function generatedManifest(blueprintId, { appName = '' } = {}) {
  const app = await GeneratedApplication.findOne({ blueprintId, status: 'passed' }).lean();
  if (!app || !app.files?.length) return null;

  const runtime = buildRuntime({ appName });
  const fixed = new Set(runtime.map(f => f.path));
  return [...runtime, ...app.files.filter(f => !fixed.has(f.path))];
}

export async function getBuild(req, res) {
  try {
    const { blueprintId } = req.params;
    const bp = await owned(blueprintId, req.user._id);
    if (!bp) return res.status(404).json({ error: 'Blueprint not found.' });

    const app = await GeneratedApplication.findOne({ blueprintId }).lean();
    if (!app) return res.json({ status: 'none' });

    const files = app.status === 'passed'
      ? await generatedManifest(blueprintId, { appName: bp.appName })
      : null;

    return res.json({
      status: app.status,
      progress: app.progress || {},
      verifiedTo: app.verifiedTo,
      skipped: app.skipped || [],
      reason: app.reason,
      useCase: app.useCase,
      provider: app.provider,
      warnings: app.warnings || [],
      // Only the last attempt's failures — the earlier ones were repaired, and
      // showing them all reads as a build that failed six times.
      failures: (app.history || []).slice(-1)[0]?.failures || [],
      attempts: (app.history || []).length,
      generatedPaths: (app.files || []).map(f => f.path),
      files: files
        ? files.map(f => ({ path: f.path, bytes: Buffer.byteLength(f.content || '', 'utf8') }))
        : [],
      fileCount: files ? files.length : 0,
      totalBytes: files ? files.reduce((n, f) => n + Buffer.byteLength(f.content || '', 'utf8'), 0) : 0,
    });
  } catch (err) {
    console.error('[eame-build] status error:', err.message);
    return res.status(500).json({ error: 'Could not read the build.' });
  }
}
