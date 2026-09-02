/**
 * Svarg — Deploy Target
 *
 * Where a customer's delivered application runs. Shape A is one container per
 * tenant on Railway with its own database on the shared Atlas cluster, which
 * is logical isolation — enough for the startup tier it is aimed at. Shape B
 * (a namespace per tenant) and shape C (a dedicated cloud project) become new
 * implementations of the same three calls rather than a rewrite.
 *
 * buildTenantEnv is the seam between the two halves of the journey: Arth
 * decides WHICH MODEL, this turns that decision into the environment the
 * application runs with. Nothing else crosses between them, which is what
 * lets a customer change model without redeploying and move the app without
 * rechoosing the model.
 */

import crypto from 'crypto';
import { ADVISORY_CATALOG } from '../config/modelCatalog.js';

/** Mongo database names are limited; derive a legal, collision-free one. */
export function tenantDbName(blueprintId) {
  const id = String(blueprintId).replace(/[^a-zA-Z0-9]/g, '').slice(-16);
  return `tenant_${id}`;
}

/**
 * Point the tenant's MONGO_URI at its own database on the shared cluster.
 * The path segment is the database; anything already there is replaced rather
 * than appended, or two tenants could end up in one database.
 */
export function tenantMongoUri(clusterUri, dbName) {
  if (!clusterUri) throw new Error('No cluster URI configured for tenant databases.');
  const [head, query] = String(clusterUri).split('?');
  // Match scheme + authority explicitly. Trimming the last path segment with
  // a regex instead eats the HOST when the URI has no trailing slash, which
  // points every tenant at a database that does not exist.
  const m = head.match(/^(mongodb(?:\+srv)?:\/\/[^/]+)(?:\/.*)?$/);
  if (!m) throw new Error(`Unrecognised MongoDB cluster URI: ${head.slice(0, 24)}…`);
  return `${m[1]}/${dbName}${query ? '?' + query : ''}`;
}

/**
 * The environment a hosted application runs with.
 *
 * Note what is NOT here: no provider API key. The app reaches models only
 * through Svarg's gateway, which is the whole basis for metering it — see
 * services/gatewayService.js. `SELFHOSTED_*` is not a self-hosted model in
 * this context; it is the delivered app's generic OpenAI-compatible client
 * pointed at the gateway, which is why hosting needs no code change.
 */
export function buildTenantEnv({ deployment, gatewayToken, gatewayBaseUrl, clusterUri, jwtSecret }) {
  const catalog = ADVISORY_CATALOG.find(m => m.id === deployment.model?.modelId);
  if (!catalog) throw new Error('This deployment has no model from the catalog.');
  if (catalog.type !== 'frontier') {
    throw new Error(`${catalog.displayName} is an open-weight model. Svarg does not host GPUs for tenants, so this application must run against your own inference endpoint.`);
  }
  if (!gatewayToken) throw new Error('A gateway token is required.');

  const dbName = deployment.dbName || tenantDbName(deployment.blueprintId);

  return {
    PORT: '3000',
    MONGO_URI: tenantMongoUri(clusterUri, dbName),
    JWT_SECRET: jwtSecret || crypto.randomBytes(32).toString('hex'),

    // Generation: the app's 'selfhosted' provider is a plain OpenAI client
    // against an arbitrary base URL, so pointing it at the gateway is enough.
    PROVIDER_CHAIN: 'selfhosted',
    SELFHOSTED_BASE_URL: `${gatewayBaseUrl}/v1`,
    SELFHOSTED_API_KEY: gatewayToken,
    SELFHOSTED_MODEL: catalog.apiModel,

    // Embeddings through the same gateway. The dimension MUST be pinned:
    // EMBEDDING_DIMENSIONS defaults to 768 in selfhosted mode, the vector
    // index is built from that constant, and the gateway returns 1536-wide
    // vectors from text-embedding-3-small. A mismatch here builds an index
    // no query can ever match.
    EMBEDDING_PROVIDER: 'selfhosted',
    SELFHOSTED_EMBEDDING_BASE_URL: `${gatewayBaseUrl}/v1`,
    SELFHOSTED_EMBEDDING_DIMENSIONS: '1536',
    EMBEDDING_MODEL: 'text-embedding-3-small',
  };
}

// ── Targets ─────────────────────────────────────────────────────────────────

const RAILWAY_API = 'https://backboard.railway.com/graphql/v2';

/**
 * Every tenant project carries this prefix, and destroy refuses anything
 * without it. Account tokens can delete any project in the workspace,
 * including the one running Svarg — a name check is cheap and catches the
 * case a wrong id would otherwise make catastrophic.
 */
export const TENANT_PREFIX = 'svarg-tenant-';

export function tenantProjectName(blueprintId) {
  return TENANT_PREFIX + String(blueprintId).slice(-12);
}

/**
 * Project ids that must never be touched, whatever is asked. Svarg's own
 * project belongs here — a provisioning bug should fail loudly rather than
 * tear down production.
 */
export function protectedProjectIds() {
  return String(process.env.RAILWAY_PROTECTED_PROJECT_IDS || '')
    .split(',').map(s => s.trim()).filter(Boolean);
}

/**
 * The guard destroy() runs before making any call. Exported because it is the
 * whole safety story for an irreversible operation, and deserves its own tests.
 *
 * `deployment` is the stored record — destroy works from what Svarg wrote down,
 * never from an id supplied by a caller, and never by enumerating the account.
 */
export function assertDestroyable(deployment) {
  const id = deployment?.railway?.projectId;
  if (!id) throw new Error('This deployment has no Railway project recorded, so there is nothing to destroy.');
  if (protectedProjectIds().includes(id)) {
    throw new Error(`Refusing to destroy ${id}: it is on the protected list.`);
  }
  const name = deployment?.railway?.projectName || '';
  if (!name.startsWith(TENANT_PREFIX)) {
    throw new Error(`Refusing to destroy ${id}: "${name}" is not a Svarg tenant project.`);
  }
  return true;
}

async function gql(query, variables) {
  const token = process.env.RAILWAY_API_TOKEN;
  if (!token) throw new Error('The Railway deploy target is not configured. Set RAILWAY_API_TOKEN.');

  const res = await fetch(RAILWAY_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ query, variables }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.errors?.length) {
    const msg = body.errors?.map(e => e.message).join('; ') || `Railway returned ${res.status}`;
    throw new Error(`Railway API: ${msg}`);
  }
  return body.data;
}

/**
 * projectCreate rejects a request with no workspaceId — Railway's own words:
 * "You must specify a workspaceId to create a project". Their docs list the
 * field as optional, so this was found by calling it rather than by reading.
 *
 * Rather than make the operator hunt for the id, ask the token which
 * workspaces it can see. The exact shape of that query is not documented, so
 * a couple of plausible ones are tried and the first that answers wins;
 * RAILWAY_WORKSPACE_ID short-circuits the whole thing when set.
 */
const WORKSPACE_QUERIES = [
  { q: `query { me { workspaces { id name } } }`,
    pick: d => d?.me?.workspaces?.[0] },
  { q: `query { me { teams { edges { node { id name } } } } }`,
    pick: d => d?.me?.teams?.edges?.[0]?.node },
  { q: `query { me { workspaces { edges { node { id name } } } } }`,
    pick: d => d?.me?.workspaces?.edges?.[0]?.node },
];

let _workspaceCache = null;

export async function resolveWorkspaceId() {
  if (process.env.RAILWAY_WORKSPACE_ID) return process.env.RAILWAY_WORKSPACE_ID;
  if (_workspaceCache) return _workspaceCache;

  const tried = [];
  for (const { q, pick } of WORKSPACE_QUERIES) {
    try {
      const found = pick(await gql(q, {}));
      if (found?.id) {
        console.log(`[railway] using workspace "${found.name || found.id}"`);
        _workspaceCache = found.id;
        return found.id;
      }
      tried.push('query returned no workspace');
    } catch (err) {
      tried.push(err.message.replace('Railway API: ', ''));
    }
  }

  throw new Error(
    'Could not work out which Railway workspace to create the project in. '
    + 'Set RAILWAY_WORKSPACE_ID — you can get it by running `query { me { workspaces { id name } } }` '
    + 'at railway.com/graphiql. Tried: ' + tried.join(' | ')
  );
}

/** Shape A: one project, one service from the tenant's repo, one domain. */
export const railwayTarget = {
  name: 'railway',

  configured() {
    return !!process.env.RAILWAY_API_TOKEN;
  },

  /**
   * Arth's half: the environment, with no application in it.
   *
   * Nothing here needs the code to exist, which is exactly why this can run
   * at Arth — before Eame has written anything. Railway's serviceCreate is
   * the one call that requires a repository, so it belongs in attach().
   */
  async prepare({ deployment }) {
    const name = tenantProjectName(deployment.blueprintId);
    const workspaceId = await resolveWorkspaceId();

    const project = (await gql(`
      mutation projectCreate($input: ProjectCreateInput!) {
        projectCreate(input: $input) { id name environments { edges { node { id name } } } }
      }`, {
      input: {
        name,
        description: `Svarg environment for blueprint ${deployment.blueprintId}`,
        isPublic: false,
        workspaceId,
      },
    })).projectCreate;

    const envNode = project.environments?.edges?.[0]?.node;
    if (!envNode) throw new Error('Railway created the project but reported no environment.');

    return {
      projectId: project.id,
      projectName: project.name,
      environmentId: envNode.id,
      region: process.env.RAILWAY_REGION || 'us-west',
    };
  },

  /**
   * Attaching the application to an environment Arth already prepared.
   * Needs the repository, so it cannot run before Eame has pushed.
   */
  async attach({ deployment, env }) {
    if (!deployment.repo?.owner || !deployment.repo?.name) {
      throw new Error('This deployment has no repository recorded. Push the project from Eame first.');
    }
    if (!deployment.railway?.projectId) {
      throw new Error('No environment has been prepared for this blueprint. Prepare it on the Arth screen first.');
    }
    const repo = `${deployment.repo.owner}/${deployment.repo.name}`;

    const service = (await gql(`
      mutation serviceCreate($input: ServiceCreateInput!) {
        serviceCreate(input: $input) { id name }
      }`, {
      input: { projectId: deployment.railway.projectId, name: 'app', source: { repo }, variables: env },
    })).serviceCreate;

    // serviceCreate links the repository but does not reliably start a build.
    // Asking explicitly is harmless when one is already running and is the
    // difference between a service that deploys and one that sits offline.
    try {
      await gql(`
        mutation environmentTriggersDeploy($input: EnvironmentTriggersDeployInput!) {
          environmentTriggersDeploy(input: $input)
        }`, {
        input: {
          projectId: deployment.railway.projectId,
          environmentId: deployment.railway.environmentId,
          serviceId: service.id,
        },
      });
    } catch (err) {
      console.warn('[railway] explicit deploy trigger failed —', err.message);
    }

    // A domain is what makes it reachable, but a service without one is still
    // attached — report it rather than unwinding the whole thing.
    let url = '';
    try {
      const domain = (await gql(`
        mutation serviceDomainCreate($input: ServiceDomainCreateInput!) {
          serviceDomainCreate(input: $input) { id domain }
        }`, {
        input: { serviceId: service.id, environmentId: deployment.railway.environmentId, targetPort: 3000 },
      })).serviceDomainCreate;
      url = domain?.domain ? `https://${domain.domain}` : '';
    } catch (err) {
      console.warn('[railway] domain creation failed —', err.message);
    }

    return { serviceId: service.id, url };
  },

  /**
   * Whether the service is actually serving.
   *
   * Creating a service is not deploying one: Railway then builds the repo,
   * which takes minutes and can fail. Reporting "live" the moment
   * serviceCreate returns hands the customer a domain that answers Railway's
   * "train has not arrived at the station" page, so the build state is what
   * this reports.
   *
   * The deployment query's shape is undocumented, so a couple of plausible
   * ones are tried; if none answer, the URL is still returned and the caller
   * keeps whatever status it already had rather than inventing one.
   */
  async status({ deployment }) {
    const { projectId, serviceId, environmentId } = deployment.railway || {};
    if (!projectId || !serviceId) return { status: 'unknown', url: deployment.railway?.url || '' };

    let url = deployment.railway?.url || '';
    try {
      const data = await gql(`
        query domains($projectId: String!, $environmentId: String!, $serviceId: String!) {
          domains(projectId: $projectId, environmentId: $environmentId, serviceId: $serviceId) {
            serviceDomains { domain }
          }
        }`, { projectId, environmentId, serviceId });
      const domain = data?.domains?.serviceDomains?.[0]?.domain;
      if (domain) url = `https://${domain}`;
    } catch (err) {
      console.warn('[railway] domain lookup failed —', err.message);
    }

    // Ask the application itself rather than the platform.
    //
    // Railway's deployment-status query is undocumented and two plausible
    // shapes for it were wrong, which left deployments reported as live when
    // nothing was serving. Whether the URL answers is the thing that actually
    // matters, needs no schema guesswork, and stays true if the deploy target
    // is ever swapped.
    if (!url) return { status: 'attaching', url, detail: 'No web address yet.' };

    try {
      const ctl = AbortSignal.timeout(4000);
      const res = await fetch(url, { method: 'GET', redirect: 'manual', signal: ctl });

      // Railway serves its own 404 page for a domain with nothing behind it —
      // no deployment, a failed build, or a crashed process.
      if (res.status === 404) {
        return { status: 'attaching', url, detail: 'Nothing is answering at the address yet.' };
      }
      // Anything else means something is listening. 401/403 counts: the app
      // requires a token, which is a running app refusing an anonymous caller.
      return { status: 'live', url, detail: `Responding with HTTP ${res.status}.` };
    } catch (err) {
      return { status: 'attaching', url, detail: `The address is not responding yet (${err.name}).` };
    }
  },

  /** Ask Railway to build and start the service again. */
  async redeploy({ deployment }) {
    const { projectId, environmentId, serviceId } = deployment.railway || {};
    if (!serviceId) throw new Error('This deployment has no service to redeploy.');
    await gql(`
      mutation environmentTriggersDeploy($input: EnvironmentTriggersDeployInput!) {
        environmentTriggersDeploy(input: $input)
      }`, { input: { projectId, environmentId, serviceId } });
    return { triggered: true };
  },

  async destroy({ deployment }) {
    assertDestroyable(deployment);
    await gql(`mutation projectDelete($id: String!) { projectDelete(id: $id) }`,
      { id: deployment.railway.projectId });
    return { destroyed: true };
  },
};

export function getDeployTarget() {
  return railwayTarget;
}
