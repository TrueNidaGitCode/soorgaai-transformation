/**
 * Svarg — Hosted deployments
 *
 * POST   /strategy-canvas/transformation-blueprint/:blueprintId/deploy
 * GET    /strategy-canvas/transformation-blueprint/:blueprintId/deployment
 * DELETE /strategy-canvas/transformation-blueprint/:blueprintId/deployment
 *
 * Standing up the application Eame built, on Svarg's infrastructure. The
 * repository comes from what Eame actually pushed and the model from what Arth
 * actually chose — neither is accepted from the request, so a deployment
 * cannot be pointed at someone else's repo or a model the customer never
 * agreed to.
 *
 * The gateway token is returned exactly once, at provisioning, and only its
 * hash is stored. It is never echoed back by the status endpoint.
 */

import TransformationBlueprint from '../models/TransformationBlueprint.js';
import HostedDeployment from '../models/HostedDeployment.js';
import { issueToken } from '../services/gatewayService.js';
import {
  getDeployTarget, buildTenantEnv, tenantDbName, tenantProjectName,
} from '../services/deployTargetService.js';

/** Never leak the token hash or internal ids to the browser. */
function publicView(d) {
  if (!d) return null;
  return {
    status: d.status,
    statusMessage: d.statusMessage || '',
    url: d.railway?.url || '',
    model: d.model || {},
    dbName: d.dbName || '',
    repo: d.repo || {},
    usage: {
      requests: d.usage?.requests || 0,
      inputTokens: d.usage?.inputTokens || 0,
      outputTokens: d.usage?.outputTokens || 0,
      costUsd: Math.round((d.usage?.costUsd || 0) * 10000) / 10000,
      periodStart: d.usage?.periodStart || null,
    },
    limits: d.limits || {},
    createdAt: d.createdAt,
  };
}

async function ownedBlueprint(req) {
  return TransformationBlueprint.findOne({
    _id: req.params.blueprintId, userId: req.user._id,
  }).lean();
}

export async function getDeployment(req, res) {
  try {
    const bp = await ownedBlueprint(req);
    if (!bp) return res.status(404).json({ error: 'Blueprint not found or you do not have access to it.' });

    const dep = await HostedDeployment.findOne({ blueprintId: bp._id });
    if (!dep) return res.json({ deployment: null });

    // Ask the target for the live URL if provisioning finished without one.
    if (dep.status === 'live' && !dep.railway?.url) {
      try {
        const s = await getDeployTarget().status({ deployment: dep });
        if (s.url && s.url !== dep.railway.url) {
          dep.railway.url = s.url;
          await dep.save();
        }
      } catch (err) {
        console.warn('[deployment] status refresh failed —', err.message);
      }
    }

    return res.json({ deployment: publicView(dep) });
  } catch (err) {
    console.error('[deployment] get error:', err.message);
    return res.status(500).json({ error: 'Failed to read the deployment.' });
  }
}

export async function createDeployment(req, res) {
  try {
    const bp = await ownedBlueprint(req);
    if (!bp) return res.status(404).json({ error: 'Blueprint not found or you do not have access to it.' });

    const existing = await HostedDeployment.findOne({ blueprintId: bp._id });
    if (existing && existing.status !== 'failed' && existing.status !== 'destroyed') {
      return res.status(409).json({
        error: 'This blueprint already has a deployment.',
        deployment: publicView(existing),
      });
    }

    // Preconditions, each with the stage that fixes it — a bare "cannot
    // deploy" would leave the user guessing which screen to go back to.
    if (!bp.arthSelection?.modelId) {
      return res.status(400).json({ error: 'Choose a model on the Arth screen before deploying.' });
    }
    const { owner, name } = req.body?.repo || {};
    if (!owner || !name) {
      return res.status(400).json({ error: 'Push the project to GitHub from Eame before deploying.' });
    }

    const target = getDeployTarget();
    if (!target.configured()) {
      return res.status(503).json({ error: 'Hosting is not available yet — Svarg has no deploy target configured.' });
    }

    const { token, hash } = issueToken();
    const dep = existing || new HostedDeployment({ userId: req.user._id, blueprintId: bp._id });
    dep.status = 'provisioning';
    dep.statusMessage = '';
    dep.gatewayTokenHash = hash;
    dep.dbName = tenantDbName(bp._id);
    dep.repo = { owner: String(owner), name: String(name) };
    dep.model = {
      modelId: bp.arthSelection.modelId,
      displayName: bp.arthSelection.displayName || '',
      providerId: bp.arthSelection.providerId || '',
    };
    // Reset spend when a deployment is stood up again, so a previous run's
    // usage cannot leave the new one capped from the first request.
    dep.usage = { requests: 0, inputTokens: 0, outputTokens: 0, costUsd: 0, periodStart: new Date(), lastRequestAt: null };
    await dep.save();

    try {
      const env = buildTenantEnv({
        deployment: dep,
        gatewayToken: token,
        gatewayBaseUrl: process.env.GATEWAY_BASE_URL || `${req.protocol}://${req.get('host')}/api/gateway`,
        clusterUri: process.env.TENANT_CLUSTER_URI || process.env.MONGO_URI,
      });

      const placed = await target.provision({ deployment: dep, env });
      dep.railway = {
        projectId: placed.projectId,
        projectName: placed.projectName || tenantProjectName(bp._id),
        serviceId: placed.serviceId,
        environmentId: placed.environmentId,
        url: placed.url || '',
      };
      dep.status = 'live';
      await dep.save();

      return res.status(201).json({
        deployment: publicView(dep),
        // Shown once. Only the hash is stored, so it cannot be recovered.
        gatewayToken: token,
      });

    } catch (err) {
      dep.status = 'failed';
      dep.statusMessage = err.message.slice(0, 400);
      await dep.save();
      console.error('[deployment] provision failed:', err.message);
      return res.status(502).json({ error: err.message, deployment: publicView(dep) });
    }

  } catch (err) {
    console.error('[deployment] create error:', err.message);
    return res.status(500).json({ error: 'Failed to start the deployment.' });
  }
}

export async function destroyDeployment(req, res) {
  try {
    const bp = await ownedBlueprint(req);
    if (!bp) return res.status(404).json({ error: 'Blueprint not found or you do not have access to it.' });

    const dep = await HostedDeployment.findOne({ blueprintId: bp._id });
    if (!dep || dep.status === 'destroyed') return res.status(404).json({ error: 'There is no deployment to remove.' });

    try {
      await getDeployTarget().destroy({ deployment: dep });
    } catch (err) {
      // A refusal from the guards is a bug worth surfacing, not swallowing.
      console.error('[deployment] destroy failed:', err.message);
      return res.status(502).json({ error: err.message });
    }

    dep.status = 'destroyed';
    dep.statusMessage = 'Removed.';
    // The token stops working the moment the hash goes, which matters more
    // than the container being gone.
    dep.gatewayTokenHash = '';
    await dep.save();

    return res.json({ deployment: publicView(dep) });
  } catch (err) {
    console.error('[deployment] destroy error:', err.message);
    return res.status(500).json({ error: 'Failed to remove the deployment.' });
  }
}
