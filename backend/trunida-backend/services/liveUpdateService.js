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
import { ensureAppName } from './appNameService.js';
import { tenantAuthEnv } from './tenantAuthService.js';

export const SWEEP_MS = 6 * 60 * 60 * 1000;
export const BOOT_DELAY_MS = 45 * 1000;

let running = false;

/**
 * The gateway address as Go Live records it. When it is not set outright,
 * the origin Google calls back on is the one the API is public at, which is
 * the origin the sign-in must be reached on too.
 */
function gatewayBaseUrl() {
  if (process.env.GATEWAY_BASE_URL) return process.env.GATEWAY_BASE_URL;
  for (const u of [process.env.GOOGLE_OAUTH_CALLBACK_URL, process.env.FRONTEND_URL]) {
    try { if (u) return new URL(u).origin + '/api/gateway'; } catch { /* next */ }
  }
  return '';
}

/** One live application: compose, compare, and if it differs, push and rebuild. */
export async function updateOne(dep, { reason = 'sweep' } = {}) {
  const bp = await TransformationBlueprint.findById(dep.blueprintId).lean();
  if (!bp) return { skipped: 'no blueprint' };
  if (!bp.eameDelivery?.repoName) return { skipped: 'never published' };

  // Named the way a fresh build is named: an application built before
  // naming existed still carries its use case sentence as a title.
  await ensureAppName(bp).catch(() => {});
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

  // The variables a newer runtime needs, added to an environment created
  // before they existed: the sign-in through Svarg is the current one.
  await getDeployTarget().redeploy({
    deployment: dep,
    commitSha: pushed?.commitSha || '',
    env: {
      APP_NAME: bp.appName || 'AI Assistant', APP_PUBLIC_ACCESS: 'true',
      ...tenantAuthEnv({ deployment: dep, gatewayBaseUrl: gatewayBaseUrl() }),
    },
  });
  await HostedDeployment.updateOne({ _id: dep._id }, { $set: { status: 'attaching', statusMessage: 'Updating the application to the latest Svarg runtime.' } });
  return { updated: true, source, commitSha: pushed?.commitSha || '', fileCount: files.length };
}

/**
 * Deployments left 'attaching' -- by an update here, or by a Go Live nobody
 * came back to look at -- are promoted the way the Yusu screen promotes
 * them: by asking Railway. Otherwise an application updated by one sweep
 * would never be seen by the next.
 */
export async function refreshAttaching() {
  const deps = await HostedDeployment.find({ status: { $in: ['attaching', 'degraded'] }, hosting: 'svarg', 'railway.serviceId': { $nin: ['', null] } });
  for (const dep of deps) {
    try {
      const st = await getDeployTarget().status({ deployment: dep });
      if (st.url && st.url !== dep.railway.url) dep.railway.url = st.url;
      if (st.status && st.status !== dep.status) { dep.status = st.status; if (st.status === 'live' && !dep.liveAt) dep.liveAt = new Date(); }
      if (st.detail) dep.statusMessage = st.detail;
      await dep.save();
    } catch (err) {
      console.warn(`[live-update] status of ${dep.blueprintId} —`, err.message);
    }
  }
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
    await refreshAttaching();
    /*
     * 'attaching' is included, and that is the whole point.
     *
     * An application that crashes on boot never answers, so refreshAttaching
     * never promotes it back to 'live' — and a sweep that only looked at
     * 'live' could never push it the runtime that would fix it. Arthi's
     * application sat broken for a week inside that gap: every fix shipped,
     * and none of them reached the one deployment that needed them.
     *
     * Sweeping it costs nothing when there is nothing to do: updateOne
     * compares the manifest hash first and skips when it is current.
     */
    const deps = await HostedDeployment.find({
      // 'degraded' included deliberately: an application reporting that it is
      // unwell is the one that most needs the next runtime, and excluding it is
      // how a broken deployment gets locked out of its own repair.
      status: { $in: ['live', 'attaching', 'degraded'] },
      hosting: 'svarg',
      'railway.serviceId': { $nin: ['', null] },
    }).sort({ updatedAt: 1 }).limit(limit);
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
