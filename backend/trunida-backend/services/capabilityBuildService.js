/**
 * Svarg — building a capability the customer never asked us to build
 *
 * Phase 4. Takes a planned CapabilityRequest, rebuilds the application with
 * that capability added, and leaves the request ready to be announced.
 *
 * ── The failure this file is mostly written to prevent ────────────────────
 *
 * Eame generates the application whole. The generator rewrites the authored
 * tree from one brief, every time — there is no patching. So a rebuild whose
 * brief mentions only the newest requirement produces an application that does
 * only the newest thing.
 *
 * Nothing errors. The build passes verification, the deploy succeeds, and the
 * violin teacher opens an application that sends WhatsApp messages and has
 * forgotten every student she ever entered. Under unattended building she
 * finds out before we do.
 *
 * So every capability ever added travels with every build. That is what
 * capabilitiesToCarry is for, and why it is pure and tested separately from
 * everything that needs a database.
 *
 * ── Claiming, not checking ────────────────────────────────────────────────
 *
 * Two builds rewriting one authored tree is a corrupted application. The
 * decision pass already refuses to plan while one is in flight, but that is a
 * check with a gap between read and write. Here the request is claimed with a
 * conditional update — status must still be 'planned' for the claim to land —
 * so two callers racing produce one build and one no-op.
 */

import CapabilityRequest from '../models/CapabilityRequest.js';
import GeneratedApplication from '../models/GeneratedApplication.js';
import TransformationBlueprint from '../models/TransformationBlueprint.js';
import { buildApplication } from './eameBuildService.js';

/** A build older than this is assumed dead — the same window the manual build
 *  path uses to reclaim a lock left behind by a restart. */
const STALE_AFTER_MINUTES = 20;

/** Statuses whose capability is part of the application as it stands today. */
const IN_THE_APPLICATION = ['ready', 'live'];

/**
 * Everything the next build has to include.
 *
 * The capability being built, plus every capability already in the
 * application, oldest first so the brief reads in the order the customer grew
 * it. Anything without a title is dropped: an unnamed capability in the brief
 * is noise the generator would have to guess at.
 *
 * Pure and exported because this is the guard against silently deleting
 * working features, and proving it should not need a database.
 */
export function capabilitiesToCarry(existing = [], current = null) {
  const ordered = existing
    .filter(r => r && IN_THE_APPLICATION.includes(r.status))
    .filter(r => r.plan?.title)
    .sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0))
    .map(r => r.plan);

  if (current?.plan?.title) {
    // Guarded against a request that is somehow already in the list, so a
    // retry of a build cannot describe the same capability twice.
    const already = ordered.some(p => p.title === current.plan.title);
    if (!already) ordered.push(current.plan);
  }
  return ordered;
}

/** Is a generation already running for this application? Mirrors the manual
 *  build path, including its treatment of a lock nobody is holding any more. */
export async function generationInFlight(blueprintId) {
  const running = await GeneratedApplication.findOne({ blueprintId, status: 'building' }).lean();
  if (!running) return false;

  const startedAt = running.progress?.startedAt || running.updatedAt;
  const ageMinutes = startedAt ? (Date.now() - new Date(startedAt).getTime()) / 60000 : Infinity;
  return ageMinutes < STALE_AFTER_MINUTES;
}

/**
 * Build one planned capability into the application.
 *
 * Returns a report rather than throwing; every caller is a background pass.
 * The request is left in 'ready' when the application built and verified, and
 * 'failed' with the reason when it did not. Announcing it is a separate step —
 * a build that succeeded and a customer who was told are different facts, and
 * a notification that fails must not cost the build.
 */
export async function runCapabilityBuild({ requestId }) {
  if (!requestId) return { built: false, reason: 'missing-id' };

  // Claim it. If this does not match, another pass already has it.
  const request = await CapabilityRequest.findOneAndUpdate(
    { _id: requestId, status: 'planned' },
    { $set: { status: 'building' }, $inc: { attempts: 1 } },
    { new: true }
  ).lean().catch(() => null);

  if (!request) return { built: false, reason: 'not-claimable' };

  const release = async (set) => {
    await CapabilityRequest.updateOne({ _id: requestId }, { $set: set }).catch(() => {});
  };

  try {
    if (await generationInFlight(request.blueprintId)) {
      // Put it back rather than failing it: nothing is wrong with this
      // capability, the application is simply busy. The next pass picks it up.
      await release({ status: 'planned' });
      return { built: false, reason: 'generation-in-flight' };
    }

    const bp = await TransformationBlueprint.findOne({ _id: request.blueprintId }).lean();
    if (!bp) {
      await release({ status: 'failed', error: 'The blueprint this was planned against no longer exists.' });
      return { built: false, reason: 'no-blueprint' };
    }

    const existing = await CapabilityRequest
      .find({ blueprintId: request.blueprintId, status: { $in: IN_THE_APPLICATION } })
      .select('plan status createdAt').lean();

    const addedCapabilities = capabilitiesToCarry(existing, request);

    const doc = await GeneratedApplication.findOneAndUpdate(
      { blueprintId: request.blueprintId },
      {
        $set: {
          blueprintId: request.blueprintId,
          userId: request.userId,
          status: 'building',
          progress: { attempt: 0, phase: 'generating', detail: request.plan?.title || '', startedAt: new Date() },
        },
      },
      { upsert: true, new: true }
    );

    const result = await buildApplication(bp, {
      addedCapabilities,
      onProgress: ({ attempt, phase, detail }) => {
        GeneratedApplication.updateOne({ _id: doc._id }, {
          $set: { 'progress.attempt': attempt, 'progress.phase': phase, 'progress.detail': detail || '' },
        }).catch(() => {});
      },
    });

    await GeneratedApplication.updateOne({ _id: doc._id }, {
      $set: {
        status: result.ok ? 'passed' : 'failed',
        files: result.ok ? (result.files || []).filter(f => (result.generatedPaths || []).includes(f.path)) : [],
        verifiedTo: result.verifiedTo || '',
        skipped: result.skipped || [],
        reason: result.reason || '',
        progress: {
          attempt: (result.history || []).length,
          phase: result.ok ? 'passed' : 'failed',
          detail: result.verifiedTo || result.reason || '',
          startedAt: null,
        },
      },
    }).catch(() => {});

    if (!result.ok) {
      // Kept as failed rather than returned to planned. A capability that
      // cannot be built will not build itself on the next message, and
      // retrying it automatically would spend the month's budget on one
      // requirement that does not work.
      await release({ status: 'failed', error: result.reason || 'The build did not pass verification.' });
      return { built: false, reason: 'build-failed', error: result.reason || '' };
    }

    await release({ status: 'ready', error: '' });
    return { built: true, reason: 'ok', title: request.plan?.title || '', carried: addedCapabilities.length };

  } catch (err) {
    console.error('[capability-build] crashed:', err.message);
    await release({ status: 'failed', error: 'The build crashed: ' + err.message });
    return { built: false, reason: 'error', error: err.message };
  }
}

/**
 * Build whatever is waiting for this application, if anything is.
 *
 * The entry point a background pass calls. One at a time by construction:
 * it takes the oldest planned request and nothing else.
 */
export async function runNextPlannedBuild({ blueprintId }) {
  if (!blueprintId) return { built: false, reason: 'missing-id' };
  try {
    const next = await CapabilityRequest
      .findOne({ blueprintId, status: 'planned' })
      .sort({ createdAt: 1 })
      .select('_id').lean();
    if (!next) return { built: false, reason: 'nothing-planned' };
    return runCapabilityBuild({ requestId: next._id });
  } catch (err) {
    console.error('[capability-build] could not start:', err.message);
    return { built: false, reason: 'error', error: err.message };
  }
}
