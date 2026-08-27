/**
 * SoorgaAI — Personal Jira Connection Controller
 *
 * Window 3 (Aria) of the pipeline wizard. Reuses the SAME connection/token
 * as personalConfluenceController.js — one Atlassian OAuth grant covers
 * both products (see atlassianAuthService.js's ATLASSIAN_SCOPES). There is
 * no separate connect/callback here; Window 1's Confluence connect already
 * establishes the PersonalConfluenceConnection this controller reads from.
 *
 * GET  /api/jira/personal/projects                    → list projects
 * GET  /api/jira/personal/projects/:projectKey/issues  → list issues in a project
 * POST /api/jira/personal/link                         → fetch + redact + structure selected issues into DefectRecords
 * GET  /api/jira/personal/linked                       → list real (non-synthetic) DefectRecords linked so far
 */

import PersonalConfluenceConnection from '../models/PersonalConfluenceConnection.js';
import DefectRecord from '../models/DefectRecord.js';
import { getValidAccessToken } from '../services/confluenceApiService.js';
import { JIRA_SCOPES } from '../services/atlassianAuthService.js';
import { listProjects, listIssues, getIssueDetail } from '../services/jiraApiService.js';
import { adfToText, regexRedact, structureDefectFromIssue, hashText } from '../services/jiraContentService.js';
import { syncDefectRecordToChunk } from '../services/hybridRetrievalService.js';

// This controller exists for the one real demo engagement (ORU Pre-analysis,
// KPIT/CARIAD) — same conventions as scripts/seed_defect_records.mjs, not a
// generic multi-tenant integration.
const ORG_NAME = 'KPIT';
const INDUSTRY = 'Automotive';
const SYSTEM   = 'OTA ECU Flashing';

const MAX_ISSUES_PER_LINK_REQUEST = 30;

// Surfaces Jira's own error detail in the response, not just server logs —
// this is a protect-gated internal tool, not a customer-facing surface, so
// exposing Atlassian's own error text is a diagnosability win, not a leak.
function jiraErrorDetail(err) {
  const data = err.response?.data;
  return data?.errorMessages?.[0] || (data?.errors && JSON.stringify(data.errors)) || err.message;
}

async function getConnectionWithJiraAccess(userId) {
  const connection = await PersonalConfluenceConnection.findOne({ userId });
  if (!connection) {
    return { error: { status: 404, body: { error: 'No Atlassian connection found. Connect in Window 1 first.', code: 'not_connected' } } };
  }
  const hasJiraScope = JIRA_SCOPES.every(s => (connection.scopes || []).includes(s));
  if (!hasJiraScope) {
    return { error: { status: 403, body: { error: 'Jira access not granted on this connection. Reconnect to include Jira.', code: 'jira_scope_missing' } } };
  }
  return { connection };
}

// ── GET /api/jira/personal/projects ───────────────────────────────────────────

export async function getPersonalProjects(req, res) {
  try {
    const { connection, error } = await getConnectionWithJiraAccess(req.user._id);
    if (error) return res.status(error.status).json(error.body);

    const accessToken = await getValidAccessToken(connection);
    const projects = await listProjects(connection.cloudId, accessToken);
    return res.json({ projects });
  } catch (err) {
    console.error('[PersonalJira] GET projects error:', err.response?.data || err.message);
    return res.status(500).json({ error: `Failed to list Jira projects: ${jiraErrorDetail(err)}` });
  }
}

// ── GET /api/jira/personal/projects/:projectKey/issues ────────────────────────

export async function getPersonalProjectIssues(req, res) {
  try {
    const { connection, error } = await getConnectionWithJiraAccess(req.user._id);
    if (error) return res.status(error.status).json(error.body);

    const accessToken = await getValidAccessToken(connection);
    const issues = await listIssues(connection.cloudId, accessToken, req.params.projectKey);
    return res.json({ issues });
  } catch (err) {
    console.error('[PersonalJira] GET issues error:', err.response?.data || err.message);
    return res.status(500).json({ error: `Failed to list Jira issues: ${jiraErrorDetail(err)}` });
  }
}

// ── POST /api/jira/personal/link ──────────────────────────────────────────────
// Synchronous, capped — same shape as personalConfluenceController's
// linkDocumentsToBlueprint, minus the blueprint FK (DefectRecord is global
// by orgName, not blueprint-scoped, so there's nothing to own-check here).

export async function linkIssuesToDefectRecords(req, res) {
  try {
    const { issues } = req.body;
    if (!Array.isArray(issues) || !issues.length) {
      return res.status(400).json({ error: 'A non-empty issues array is required.' });
    }
    if (issues.length > MAX_ISSUES_PER_LINK_REQUEST) {
      return res.status(400).json({
        error: `Too many issues in one request (${issues.length}, max ${MAX_ISSUES_PER_LINK_REQUEST}).`,
      });
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
          sourceSystem: 'Jira Defect Management (real)',
          sourceIssueKey: issueKey,
          sourceContentHash: contentHash,
        };

        await DefectRecord.findOneAndUpdate({ defectId: issueKey }, record, { upsert: true });
        await syncDefectRecordToChunk(record);

        results.push({ issueKey, title: record.title, status: 'linked', unchanged: false, redactionNotes });
      } catch (issueErr) {
        console.error(`[PersonalJira] Failed to link issue ${issueKey}:`, issueErr.response?.data || issueErr.message);
        results.push({ issueKey, status: 'error', error: jiraErrorDetail(issueErr) });
      }
    }

    const linkedCount = results.filter(r => r.status === 'linked').length;
    return res.json({ linkedCount, total: issues.length, results });
  } catch (err) {
    console.error('[PersonalJira] POST link error:', err.message);
    return res.status(500).json({ error: 'Failed to link issues.' });
  }
}

// ── GET /api/jira/personal/linked ─────────────────────────────────────────────

export async function getLinkedIssues(req, res) {
  try {
    const records = await DefectRecord.find({ orgName: ORG_NAME, sourceIssueKey: { $ne: '' } })
      .select('defectId title component severity sourceIssueKey createdAt')
      .lean();
    return res.json({ records });
  } catch (err) {
    console.error('[PersonalJira] GET linked error:', err.message);
    return res.status(500).json({ error: 'Failed to retrieve linked issues.' });
  }
}
