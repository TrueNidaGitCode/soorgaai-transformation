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

/**
 * Shape A. Not yet wired: it needs RAILWAY_API_TOKEN, and a token that can
 * create and delete anything in the account it belongs to should point at a
 * Railway team holding only tenant deployments, never the one running Svarg.
 */
export const railwayTarget = {
  name: 'railway',

  configured() {
    return !!process.env.RAILWAY_API_TOKEN;
  },

  async provision() {
    throw new Error('The Railway deploy target is not configured. Set RAILWAY_API_TOKEN.');
  },
  async status() {
    throw new Error('The Railway deploy target is not configured. Set RAILWAY_API_TOKEN.');
  },
  async destroy() {
    throw new Error('The Railway deploy target is not configured. Set RAILWAY_API_TOKEN.');
  },
};

export function getDeployTarget() {
  return railwayTarget;
}
