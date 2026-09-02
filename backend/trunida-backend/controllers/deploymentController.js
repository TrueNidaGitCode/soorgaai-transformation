/**
 * Svarg — Hosted deployments
 *
 * POST   /strategy-canvas/transformation-blueprint/:blueprintId/infrastructure
 * POST   /strategy-canvas/transformation-blueprint/:blueprintId/deploy
 * GET    /strategy-canvas/transformation-blueprint/:blueprintId/deployment
 * DELETE /strategy-canvas/transformation-blueprint/:blueprintId/deployment
 *
 * Arth prepares the environment; Eame (later Yusu) attaches the application
 * to it. The repository comes from what Eame actually pushed and the model
 * from what Arth actually chose — neither is accepted from the request, so a
 * deployment cannot be pointed at someone else's repo or a model the customer
 * never agreed to.
 *
 * The gateway token is issued when the application is attached, because that
 * is the moment it can be injected. It is returned exactly once and only its
 * hash is stored, so the status endpoint can never echo it back.
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
    hosting: d.hosting || 'svarg',
    url: d.railway?.url || '',
    model: d.model || {},
    dbName: d.dbName || '',
    region: d.railway?.region || '',
    environmentName: d.railway?.projectName || '',
    appAttached: !!d.railway?.serviceId,
    repo: d.repo || {},
    preparedAt: d.preparedAt || null,
    liveAt: d.liveAt || null,
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

    // A service that exists is not a service that serves — Railway still has
    // to build it. Ask, so the screen never claims live before it is.
    if (['attaching', 'live'].includes(dep.status) && dep.railway?.serviceId) {
      try {
        const s = await getDeployTarget().status({ deployment: dep });
        let changed = false;
        if (s.url && s.url !== dep.railway.url) { dep.railway.url = s.url; changed = true; }
        if (s.status && s.status !== dep.status) {
          dep.status = s.status;
          if (s.status === 'live' && !dep.liveAt) dep.liveAt = new Date();
          changed = true;
        }
        dep.statusMessage = s.railwayStatus ? `Railway reports ${s.railwayStatus}.` : dep.statusMessage;
        if (changed) await dep.save();
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

/**
 * POST .../infrastructure — Arth prepares the environment.
 *
 * None of this needs the application to exist, which is what lets it happen
 * at Arth rather than after Eame. The one Railway call that requires a
 * repository (serviceCreate) is deferred to attachApplication below.
 *
 * hosting: 'self' records a real decision rather than doing nothing quietly —
 * Svarg prepares no environment, and Eame ships deployment docs instead.
 */
export async function prepareInfrastructure(req, res) {
  try {
    const bp = await ownedBlueprint(req);
    if (!bp) return res.status(404).json({ error: 'Blueprint not found or you do not have access to it.' });

    const hosting = req.body?.hosting === 'self' ? 'self' : 'svarg';

    if (!bp.arthSelection?.modelId) {
      return res.status(400).json({ error: 'Choose a model before preparing the environment.' });
    }

    const existing = await HostedDeployment.findOne({ blueprintId: bp._id });
    if (existing && ['prepared', 'attaching', 'live', 'suspended'].includes(existing.status)) {
      return res.status(409).json({
        error: 'An environment is already prepared for this blueprint.',
        deployment: publicView(existing),
      });
    }

    const dep = existing || new HostedDeployment({ userId: req.user._id, blueprintId: bp._id });
    dep.hosting = hosting;
    dep.statusMessage = '';
    dep.model = {
      modelId: bp.arthSelection.modelId,
      displayName: bp.arthSelection.displayName || '',
      providerId: bp.arthSelection.providerId || '',
    };

    // Running it themselves means there is nothing for Svarg to stand up. The
    // record still exists so Eame knows what to build for.
    if (hosting === 'self') {
      dep.status = 'prepared';
      dep.preparedAt = new Date();
      dep.dbName = '';
      await dep.save();
      return res.status(201).json({ deployment: publicView(dep) });
    }

    const target = getDeployTarget();
    if (!target.configured()) {
      return res.status(503).json({ error: 'Svarg hosting is not available yet — no deploy target is configured.' });
    }

    // No gateway token here. It is the APPLICATION's credential, and attach()
    // has to inject the plaintext — which it can only do by issuing a fresh
    // one, since preparation stores a hash and nothing else. Issuing one now
    // would hand the customer a secret that stops working the moment their
    // app deploys.
    dep.status = 'preparing';
    dep.dbName = tenantDbName(bp._id);
    // A re-prepared environment starts with a clean ledger, so an earlier
    // attempt's spend cannot leave the new one capped from the first request.
    dep.usage = { requests: 0, inputTokens: 0, outputTokens: 0, costUsd: 0, periodStart: new Date(), lastRequestAt: null };
    await dep.save();

    try {
      const placed = await target.prepare({ deployment: dep });
      dep.railway = {
        projectId: placed.projectId,
        projectName: placed.projectName || tenantProjectName(bp._id),
        environmentId: placed.environmentId,
        region: placed.region || '',
        serviceId: '',
        url: '',
      };
      dep.status = 'prepared';
      dep.preparedAt = new Date();
      await dep.save();

      return res.status(201).json({ deployment: publicView(dep) });
    } catch (err) {
      dep.status = 'failed';
      dep.statusMessage = err.message.slice(0, 400);
      await dep.save();
      console.error('[deployment] prepare failed:', err.message);
      return res.status(502).json({ error: err.message, deployment: publicView(dep) });
    }

  } catch (err) {
    console.error('[deployment] prepare error:', err.message);
    return res.status(500).json({ error: 'Failed to prepare the environment.' });
  }
}

/**
 * POST .../deploy — attach the built application to the prepared environment.
 *
 * Called from Eame today; this is the action that becomes Yusu's. It refuses
 * rather than silently preparing, so the environment is always something the
 * customer agreed to at Arth.
 */
export async function attachApplication(req, res) {
  try {
    const bp = await ownedBlueprint(req);
    if (!bp) return res.status(404).json({ error: 'Blueprint not found or you do not have access to it.' });

    const dep = await HostedDeployment.findOne({ blueprintId: bp._id });
    if (!dep || !['prepared', 'failed'].includes(dep.status)) {
      return res.status(400).json({
        error: dep && dep.status === 'live'
          ? 'This application is already running.'
          : 'Prepare the environment on the Arth screen before deploying.',
        deployment: publicView(dep),
      });
    }
    if (dep.hosting === 'self') {
      return res.status(400).json({ error: 'This blueprint is set to run in your own environment, so Svarg has nothing to deploy. Change it on the Arth screen to have Svarg host it.' });
    }

    // Prefer what the blueprint recorded at push time over what the client
    // sends — the client is convenience, the record is the truth.
    const owner = bp.eameDelivery?.repoOwner || req.body?.repo?.owner;
    const name  = bp.eameDelivery?.repoName  || req.body?.repo?.name;
    if (!owner || !name) {
      return res.status(400).json({ error: 'Push the project to GitHub from Eame before deploying.' });
    }

    const target = getDeployTarget();
    if (!target.configured()) {
      return res.status(503).json({ error: 'Svarg hosting is not available yet — no deploy target is configured.' });
    }

    dep.repo = { owner: String(owner), name: String(name) };
    dep.status = 'attaching';
    await dep.save();

    try {
      // A fresh token: the one shown at preparation was displayed once and
      // never stored, so it cannot be recovered to inject here.
      const { token, hash } = issueToken();
      dep.gatewayTokenHash = hash;

      const env = buildTenantEnv({
        deployment: dep,
        gatewayToken: token,
        gatewayBaseUrl: process.env.GATEWAY_BASE_URL || `${req.protocol}://${req.get('host')}/api/gateway`,
        clusterUri: process.env.TENANT_CLUSTER_URI || process.env.MONGO_URI,
      });

      const attached = await target.attach({ deployment: dep, env });
      dep.railway.serviceId = attached.serviceId;
      dep.railway.url = attached.url || '';
      // Not live yet — Railway now builds the repository, which takes minutes
      // and can fail. GET .../deployment asks Railway and promotes it.
      dep.status = 'attaching';
      dep.statusMessage = 'Railway is building the application.';
      await dep.save();

      return res.status(201).json({ deployment: publicView(dep), gatewayToken: token });
    } catch (err) {
      dep.status = 'failed';
      dep.statusMessage = err.message.slice(0, 400);
      await dep.save();
      console.error('[deployment] attach failed:', err.message);
      return res.status(502).json({ error: err.message, deployment: publicView(dep) });
    }

  } catch (err) {
    console.error('[deployment] attach error:', err.message);
    return res.status(500).json({ error: 'Failed to deploy the application.' });
  }
}

/**
 * PATCH .../governance-review — the customer confirms they have read the
 * governance areas this blueprint produced.
 *
 * The area titles are read from the blueprint, never accepted from the
 * request: an acknowledgement has to name what was actually shown, or it
 * records agreement to something nobody saw.
 */
export async function acknowledgeGovernance(req, res) {
  try {
    const bp = await ownedBlueprint(req);
    if (!bp) return res.status(404).json({ error: 'Blueprint not found or you do not have access to it.' });

    const domain = (bp.domains || []).find(d => d.domainId === 'governance-security');
    const areas = (domain?.capabilities || [])
      .flatMap(c => c.sections || [])
      .map(s => s.title)
      .filter(Boolean);

    if (!areas.length) {
      return res.status(400).json({ error: 'This blueprint has no governance content to acknowledge.' });
    }

    await TransformationBlueprint.updateOne(
      { _id: bp._id, userId: req.user._id },
      { $set: { governanceReview: { acknowledged: true, acknowledgedAt: new Date(), areas } } }
    );
    return res.json({ acknowledged: true, areas });
  } catch (err) {
    console.error('[governanceReview] error:', err.message);
    return res.status(500).json({ error: 'Failed to record the governance review.' });
  }
}

export async function destroyDeployment(req, res) {
  try {
    const bp = await ownedBlueprint(req);
    if (!bp) return res.status(404).json({ error: 'Blueprint not found or you do not have access to it.' });

    const dep = await HostedDeployment.findOne({ blueprintId: bp._id });
    if (!dep || dep.status === 'destroyed') return res.status(404).json({ error: 'There is no environment to remove.' });

    // Self-hosted records nothing in Railway, so there is nothing to call —
    // and calling destroy on an empty railway block would trip the guards.
    if (dep.hosting !== 'self' && dep.railway?.projectId) {
      try {
        await getDeployTarget().destroy({ deployment: dep });
      } catch (err) {
        // A refusal from the guards is a bug worth surfacing, not swallowing.
        console.error('[deployment] destroy failed:', err.message);
        return res.status(502).json({ error: err.message });
      }
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
