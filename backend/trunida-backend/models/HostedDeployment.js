/**
 * Svarg — Hosted Deployment
 *
 * One customer AI application running on Svarg's infrastructure: the record
 * of where it lives, what it is allowed to spend, and what it has spent.
 *
 * Two things deliberately are NOT stored in plaintext:
 *  - `gatewayTokenHash` — the token the deployed app authenticates with. It
 *    is shown once at provisioning time and only its SHA-256 is kept, so a
 *    database leak cannot be replayed against the gateway.
 *  - provider API keys — they are never handed to the tenant at all. The
 *    deployed app talks to Svarg's gateway, which holds the real keys. That
 *    is what makes `usage` below trustworthy: there is no path from the
 *    tenant to a provider that bypasses this record.
 */

import mongoose from 'mongoose';

const hostedDeploymentSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true,
  },
  blueprintId: {
    type: mongoose.Schema.Types.ObjectId, ref: 'TransformationBlueprint',
    required: true, unique: true, index: true,
  },

  status: {
    type: String,
    enum: ['queued', 'provisioning', 'live', 'failed', 'suspended', 'destroyed'],
    default: 'queued',
    index: true,
  },
  statusMessage: { type: String, default: '' },

  // Where it runs. Empty until the deploy target reports back.
  railway: {
    projectId:     { type: String, default: '' },
    serviceId:     { type: String, default: '' },
    environmentId: { type: String, default: '' },
    url:           { type: String, default: '' },
  },

  // Tenant database on the shared Atlas cluster. Logical isolation — shape A
  // is aimed at startups; physical isolation is what a dedicated project buys.
  dbName: { type: String, default: '' },

  // What Railway deploys from — the repo Eame already pushed to.
  repo: {
    owner: { type: String, default: '' },
    name:  { type: String, default: '' },
  },

  // SHA-256 of the bearer token the deployed app presents to the gateway.
  gatewayTokenHash: { type: String, default: '', index: true },

  // Snapshot of the Arth decision, as env vars were derived from it. Kept
  // because the catalog can change and the deployment should still explain
  // what it was built to run on.
  model: {
    modelId:     { type: String, default: '' },
    displayName: { type: String, default: '' },
    providerId:  { type: String, default: '' },
  },

  // Metered at the gateway, incremented atomically per request.
  usage: {
    requests:     { type: Number, default: 0 },
    inputTokens:  { type: Number, default: 0 },
    outputTokens: { type: Number, default: 0 },
    costUsd:      { type: Number, default: 0 },
    periodStart:  { type: Date,   default: Date.now },
    lastRequestAt:{ type: Date,   default: null },
  },

  // The ceiling. Svarg's own API keys are behind the gateway, so without this
  // a runaway loop in a tenant's app bills Svarg with no limit.
  limits: {
    maxCostUsd:   { type: Number, default: 5 },
    maxRequests:  { type: Number, default: 20000 },
  },

  suspendedAt:     { type: Date,   default: null },
  suspendedReason: { type: String, default: '' },

}, { timestamps: true });

export default mongoose.model('HostedDeployment', hostedDeploymentSchema);
