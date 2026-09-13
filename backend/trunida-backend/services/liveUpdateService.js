/**
 * Svarg — keeping live applications current
 *
 * The runtime every delivered application sits on -- the front door, the
 * welcome, the Data page, the connectors, the chat shell -- is Svarg's to
 * improve, and it improves often. Until now an improvement reached a
 * customer's running application only if someone went back to Yusu and
 * pressed Go Live again, which a customer has no reason to do: from where
 * they stand the application is live and nothing has changed.
 *
 * So Eame keeps them current itself. After Svarg starts (which is after
 * every deploy of Svarg), and every few hours after that, every live
 * application is composed again the way delivery composes it and compared,
 * by hash, with what was last pushed. A difference -- a runtime file that
 * changed, a build that was regenerated, a front door that did not exist
 * yet -- is pushed to the application's own repository and Railway is asked
 * to build that commit. The customer's data, credentials, key and
 * environment are untouched: only the code moves.
 *
 * One application at a time, and nothing here throws past its own
 * application: an update that fails is logged and the next one runs.
 */
import HostedDeployment from '../models/HostedDeployment.js';
import TransformationBlueprint from '../models/TransformationBlueprint.js';
import { projectFor, manifestHash } from '../controllers/deliveryController.js';
import { isSvargGithubConfigured, ensureSvargRepo, publishToSvarg, repoDescription } from './svargGithubService.js';
import { getDeployTarget } from './deployTargetService.js';

export const SWEEP_MS = 6 * 60 * 60 * 1000;
export const BOOT_DELAY_MS = 45 * 1000;

let running = false;

/** One live application: compose, compare, and if it differs, push and rebuild. */
export async function updateOne(dep, { reason = 'sweep' } = {}) {
  const bp = await TransformationBlueprint.findById(dep.blueprintId).lean();
  if (!bp) return { skipped: 'no blueprint' };
  if (!bp.eameDelivery?.repoName) return { skipped: 'never published' };

  const { files, source } = await projectFor(bp);
  const hash = manifestHash(files);
  if (hash === bp.eameDelivery.manifestHash) return { skipped: 'current' };

  const repo = await ensureSvargRepo({
    name: bp.eameDelivery.repoName,
    description: repoDescription(`Delivered by Svarg (Eame) — ${bp.businessObjective || ''}`),
  });
  const pushed = await publishToSvarg({ repo, files, message: `Update — Svarg runtime changed (${reason})` });

  await TransformationBlueprint.updateOne({ _id: bp._id }, { $set: { eameDelivery: {
    ...bp.eameDelivery,
    repoOwner: repo.owner, repoName: repo.name, repoUrl: repo.htmlUrl,
    fileCount: files.length, pushedAt: new Date(),
    commitSha: pushed?.commitSha || '', manifestHash: hash,
  } } });

  await getDeployTarget().redeploy({
    deployment: dep,
    commitSha: pushed?.commitSha || '',
    env: { APP_NAME: bp.appName || 'AI Assistant', APP_PUBLIC_ACCESS: 'true' },
  });
  await HostedDeployment.updateOne({ _id: dep._id }, { $set: { status: 'attaching', statusMessage: 'Updating the application to the latest Svarg runtime.' } });
  return { updated: true, source, commitSha: pushed?.commitSha || '', fileCount: files.length };
}

/**
 * Every live, Svarg-hosted application. Returns what happened to each so the
 * log can say so; never throws.
 */
export async function updateLiveApplications({ reason = 'sweep', limit = 50 } = {}) {
  if (process.env.LIVE_UPDATE_DISABLED === 'true') return { skipped: 'disabled' };
  if (!isSvargGithubConfigured()) return { skipped: 'github not configured' };
  if (!getDeployTarget().configured()) return { skipped: 'deploy target not configured' };
  if (running) return { skipped: 'already running' };
  running = true;
  const report = { reason, updated: [], current: 0, failed: [] };
  try {
    const deps = await HostedDeployment.find({ status: 'live', hosting: 'svarg', 'railway.serviceId': { $nin: ['', null] } })
      .sort({ updatedAt: 1 }).limit(limit);
    for (const dep of deps) {
      try {
        const r = await updateOne(dep, { reason });
        if (r.updated) { report.updated.push(String(dep.blueprintId)); console.log(`[live-update] ${dep.blueprintId}: pushed ${r.fileCount} files (${r.commitSha.slice(0, 7)}), rebuilding`); }
        else report.current++;
      } catch (err) {
        report.failed.push({ blueprintId: String(dep.blueprintId), error: err.message });
        console.error(`[live-update] ${dep.blueprintId} failed —`, err.message);
      }
    }
    if (report.updated.length || report.failed.length) {
      console.log(`[live-update] ${reason}: ${report.updated.length} updated, ${report.current} current, ${report.failed.length} failed`);
    }
  } catch (err) {
    console.error('[live-update] sweep failed —', err.message);
  } finally {
    running = false;
  }
  return report;
}

/** After boot (a deploy of Svarg is the usual reason a runtime changed), then every few hours. */
export function startLiveUpdates() {
  if (process.env.LIVE_UPDATE_DISABLED === 'true') { console.log('[live-update] disabled by LIVE_UPDATE_DISABLED'); return; }
  setTimeout(() => updateLiveApplications({ reason: 'boot' }), BOOT_DELAY_MS).unref?.();
  setInterval(() => updateLiveApplications({ reason: 'sweep' }), SWEEP_MS).unref?.();
  console.log(`[live-update] on: after boot, then every ${SWEEP_MS / 3600000} h`);
}
