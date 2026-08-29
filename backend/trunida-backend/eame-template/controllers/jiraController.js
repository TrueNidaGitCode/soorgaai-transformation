/**
 * Jira integration — OAuth connect + issue import into DefectRecord.
 * See JIRA_INTEGRATION.md for setup. Optional: the app runs fine without
 * this configured, you'd just seed DefectRecords manually instead
 * (npm run seed) or add your own source.
 *
 * GET  /api/jira/connect            → { url } to redirect to Atlassian
 * GET  /api/jira/callback           → OAuth callback (public — Atlassian calls this)
 * GET  /api/jira/status             → { connected, siteName }
 * POST /api/jira/disconnect         → hard-delete the connection
 * GET  /api/jira/projects           → list projects
 * GET  /api/jira/projects/:key/issues → list issues in a project
 * POST /api/jira/link               → fetch + redact + structure selected issues into DefectRecords
 * GET  /api/jira/linked             → list DefectRecords sourced from Jira
 */

import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import JiraConnection from '../models/JiraConnection.js';
import DefectRecord from '../models/DefectRecord.js';
import { encryptSecret } from '../utils/encryption.js';
import {
  isAtlassianOAuthConfigured,
  buildAuthorizeUrl,
  exchangeCodeForTokens,
  getAccessibleResources,
  getValidAccessToken,
  JIRA_SCOPES,
} from '../services/atlassianAuthService.js';
import { listProjects, listIssues, getIssueDetail } from '../services/jiraApiService.js';
import { adfToText, regexRedact, structureDefectFromIssue, hashText } from '../services/jiraContentService.js';
import { syncDefectRecordToChunk } from '../services/hybridRetrievalService.js';

const JWT_SECRET   = process.env.JWT_SECRET;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5500';

// Records created through this integration are tagged with these — adjust
// to your own organization, or pull from req.body if you need per-request
// values.
const ORG_NAME  = process.env.DEFECT_ORG_NAME  || 'My Organization';
const INDUSTRY  = process.env.DEFECT_INDUSTRY  || 'General';
const SYSTEM    = process.env.DEFECT_SYSTEM    || '';

const MAX_ISSUES_PER_LINK_REQUEST = 30;

function jiraErrorDetail(err) {
  const data = err.response?.data;
  return data?.errorMessages?.[0] || (data?.errors && JSON.stringify(data.errors)) || err.message;
}

// ── OAuth handshake ─────────────────────────────────────────────────────

export async function connect(req, res) {
  if (!isAtlassianOAuthConfigured()) {
    return res.status(503).json({ error: 'Jira integration is not configured — see JIRA_INTEGRATION.md.' });
  }
  const state = jwt.sign(
    { nonce: crypto.randomBytes(16).toString('hex'), userId: req.user._id },
    JWT_SECRET,
    { expiresIn: '10m' }
  );
  return res.json({ url: buildAuthorizeUrl(state, JIRA_SCOPES) });
}

export async function callback(req, res) {
  const { code, state, error } = req.query;

  let statePayload = null;
  try { statePayload = jwt.verify(state, JWT_SECRET); } catch { /* handled below */ }

  if (error) return res.redirect(`${FRONTEND_URL}/index.html?error=${encodeURIComponent('Jira authorization failed.')}`);
  if (!code || !statePayload) return res.redirect(`${FRONTEND_URL}/index.html?error=${encodeURIComponent('Invalid or expired security state — try connecting again.')}`);

  try {
    const tokens = await exchangeCodeForTokens(code);
    const resources = await getAccessibleResources(tokens.access_token);
    if (!resources.length) {
      return res.redirect(`${FRONTEND_URL}/index.html?error=${encodeURIComponent('No accessible Jira sites found for this account.')}`);
    }
    const site = resources[0];

    await JiraConnection.findOneAndUpdate(
      { userId: statePayload.userId },
      {
        $set: {
          userId: statePayload.userId,
          cloudId: site.id,
          siteUrl: site.url,
          siteName: site.name,
          encryptedAccessToken: encryptSecret(tokens.access_token),
          encryptedRefreshToken: encryptSecret(tokens.refresh_token),
          accessTokenExpiresAt: new Date(Date.now() + (tokens.expires_in || 3600) * 1000),
          scopes: (tokens.scope || '').split(' ').filter(Boolean),
          connectedAt: new Date(),
        },
      },
      { upsert: true }
    );

    return res.redirect(`${FRONTEND_URL}/index.html?jiraConnected=1`);
  } catch (err) {
    console.error('[Jira] callback error:', err.response?.data || err.message);
    return res.redirect(`${FRONTEND_URL}/index.html?error=${encodeURIComponent('Jira connection failed. Please try again.')}`);
  }
}

export async function status(req, res) {
  const connection = await JiraConnection.findOne({ userId: req.user._id }).lean();
  if (!connection) return res.json({ connected: false });
  const jiraScopeGranted = JIRA_SCOPES.every(s => (connection.scopes || []).includes(s));
  return res.json({ connected: true, siteName: connection.siteName, jiraScopeGranted });
}

export async function disconnect(req, res) {
  const result = await JiraConnection.deleteOne({ userId: req.user._id });
  if (result.deletedCount === 0) return res.status(404).json({ error: 'No Jira connection found.' });
  return res.json({ success: true });
}

// ── Projects / issues / linking ─────────────────────────────────────────

async function getConnectionWithJiraAccess(userId) {
  const connection = await JiraConnection.findOne({ userId });
  if (!connection) {
    return { error: { status: 404, body: { error: 'No Jira connection found. Connect first.', code: 'not_connected' } } };
  }
  const hasJiraScope = JIRA_SCOPES.every(s => (connection.scopes || []).includes(s));
  if (!hasJiraScope) {
    return { error: { status: 403, body: { error: 'Jira access not granted on this connection. Reconnect.', code: 'jira_scope_missing' } } };
  }
  return { connection };
}

export async function getProjects(req, res) {
  try {
    const { connection, error } = await getConnectionWithJiraAccess(req.user._id);
    if (error) return res.status(error.status).json(error.body);

    const accessToken = await getValidAccessToken(connection);
    const projects = await listProjects(connection.cloudId, accessToken);
    return res.json({ projects });
  } catch (err) {
    console.error('[Jira] GET projects error:', err.response?.data || err.message);
    return res.status(500).json({ error: `Failed to list Jira projects: ${jiraErrorDetail(err)}` });
  }
}

export async function getProjectIssues(req, res) {
  try {
    const { connection, error } = await getConnectionWithJiraAccess(req.user._id);
    if (error) return res.status(error.status).json(error.body);

    const accessToken = await getValidAccessToken(connection);
    const issues = await listIssues(connection.cloudId, accessToken, req.params.projectKey);
    return res.json({ issues });
  } catch (err) {
    console.error('[Jira] GET issues error:', err.response?.data || err.message);
    return res.status(500).json({ error: `Failed to list Jira issues: ${jiraErrorDetail(err)}` });
  }
}

export async function linkIssues(req, res) {
  try {
    const { issues } = req.body;
    if (!Array.isArray(issues) || !issues.length) {
      return res.status(400).json({ error: 'A non-empty issues array is required.' });
    }
    if (issues.length > MAX_ISSUES_PER_LINK_REQUEST) {
      return res.status(400).json({ error: `Too many issues in one request (${issues.length}, max ${MAX_ISSUES_PER_LINK_REQUEST}).` });
    }

    const { connection, error } = await getConnectionWithJiraAccess(req.user._id);
    if (error) return res.status(error.status).json(error.body);

    const results = [];
    for (const { issueKey } of issues) {
      try {
        const accessToken = await getValidAccessToken(connection);
        const issue = await getIssueDetail(connection.cloudId, accessToken, issueKey);

        const descriptionText = adfToText(issue.description);
        const commentsText = issue.comments.map(adfToText).filter(Boolean).join('\n\n');
        const rawText = [descriptionText, commentsText].filter(Boolean).join('\n\n');
        const contentHash = hashText(rawText);

        const existing = await DefectRecord.findOne({ defectId: issueKey }).lean();
        if (existing && existing.sourceContentHash === contentHash) {
          results.push({ issueKey, title: existing.title, status: 'linked', unchanged: true, redactionNotes: [] });
          continue;
        }

        const { redactedText, redactionNotes } = regexRedact(rawText);
        const structured = await structureDefectFromIssue(
          { key: issue.key, summary: issue.summary, status: issue.status, priority: issue.priority, resolution: issue.resolution },
          redactedText
        );

        const record = {
          defectId: issueKey,
          orgName: ORG_NAME,
          industry: INDUSTRY,
          system: SYSTEM,
          ...structured,
          sourceSystem: 'Jira',
          sourceIssueKey: issueKey,
          sourceContentHash: contentHash,
        };

        await DefectRecord.findOneAndUpdate({ defectId: issueKey }, record, { upsert: true });
        await syncDefectRecordToChunk(record);

        results.push({ issueKey, title: record.title, status: 'linked', unchanged: false, redactionNotes });
      } catch (issueErr) {
        console.error(`[Jira] Failed to link issue ${issueKey}:`, issueErr.response?.data || issueErr.message);
        results.push({ issueKey, status: 'error', error: jiraErrorDetail(issueErr) });
      }
    }

    const linkedCount = results.filter(r => r.status === 'linked').length;
    return res.json({ linkedCount, total: issues.length, results });
  } catch (err) {
    console.error('[Jira] POST link error:', err.message);
    return res.status(500).json({ error: 'Failed to link issues.' });
  }
}

export async function getLinked(req, res) {
  const records = await DefectRecord.find({ sourceIssueKey: { $ne: '' } })
    .select('defectId title component severity sourceIssueKey createdAt')
    .lean();
  return res.json({ records });
}
