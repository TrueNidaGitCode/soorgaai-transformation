/**
 * SoorgaAI — Personal Jira Connection Controller
 *
 * Reuses the SAME connection/token as personalConfluenceController.js —
 * one Atlassian OAuth grant covers both products (see
 * atlassianAuthService.js's ATLASSIAN_SCOPES). There is no separate
 * connect/callback here; the Confluence connect flow already establishes
 * the PersonalConfluenceConnection this controller reads from.
 *
 * GET  /api/jira/personal/projects                    → list projects
 * GET  /api/jira/personal/projects/:projectKey/issues  → list issues in a project
 * POST /api/jira/personal/link                         → the one-off ORU Pre-analysis demo path: fetch + redact + structure into DefectRecords (KPIT-hardcoded, not blueprint-scoped — see linkIssuesToDefectRecords)
 * GET  /api/jira/personal/linked                       → list real (non-synthetic) DefectRecords linked so far (demo path)
 * POST /api/jira/personal/link-to-blueprint            → the real, generic path: link issues as grounding documents on any blueprint (see linkIssuesToBlueprint)
 */

import PersonalConfluenceConnection from '../models/PersonalConfluenceConnection.js';
import DefectRecord from '../models/DefectRecord.js';
import TransformationBlueprint from '../models/TransformationBlueprint.js';
import LinkedProjectDocument from '../models/LinkedProjectDocument.js';
import { getValidAccessToken } from '../services/confluenceApiService.js';
import { JIRA_SCOPES } from '../services/atlassianAuthService.js';
import { listProjects, listIssues, getIssueDetail, approximateIssueCount } from '../services/jiraApiService.js';
import { adfToText, regexRedact, structureDefectFromIssue, hashText } from '../services/jiraContentService.js';
import { classifyDocument } from '../services/confluenceContentService.js';
import { syncDefectRecordToChunk } from '../services/hybridRetrievalService.js';
import { regenerateTransformationCapabilityAsync } from '../services/blueprintGenerationService.js';

// The ORU Pre-analysis demo path (linkIssuesToDefectRecords /
// getLinkedIssues) exists for the one real demo engagement (KPIT/CARIAD)
// — same conventions as scripts/seed_defect_records.mjs, not a generic
// multi-tenant integration. linkIssuesToBlueprint below is the real,
// blueprint-generic path any user's Aria screen actually calls.
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

    // Opt-in via ?withCounts=1 — one cheap approximate-count call per
    // project, covered by the read:jira-work scope we already hold.
    if (req.query.withCounts === '1') {
      const withCounts = await Promise.all(projects.map(async (p) => {
        const { count, capped } = await approximateIssueCount(connection.cloudId, accessToken, p.key);
        return { ...p, itemCount: count, itemCountCapped: capped };
      }));
      return res.json({ projects: withCounts });
    }

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

// ── POST /api/jira/personal/link-to-blueprint ─────────────────────────────────
// The real, generic path — mirrors personalConfluenceController.js's
// linkDocumentsToBlueprint exactly (same LinkedProjectDocument shape,
// same unchanged-skip via contentHash, same auto-regenerate trigger),
// just sourcing from a Jira issue instead of a Confluence page.

async function verifyBlueprintOwnership(blueprintId, userId) {
  if (!blueprintId) return null;
  return TransformationBlueprint.findOne({ _id: blueprintId, userId }).lean();
}

export async function linkIssuesToBlueprint(req, res) {
  try {
    const { blueprintId, issues } = req.body;
    if (!blueprintId || !Array.isArray(issues) || !issues.length) {
      return res.status(400).json({ error: 'blueprintId and a non-empty issues array are required.' });
    }
    if (issues.length > MAX_ISSUES_PER_LINK_REQUEST) {
      return res.status(400).json({
        error: `Too many issues in one request (${issues.length}, max ${MAX_ISSUES_PER_LINK_REQUEST}).`,
      });
    }

    const blueprint = await verifyBlueprintOwnership(blueprintId, req.user._id);
    if (!blueprint) {
      return res.status(404).json({ error: 'Blueprint not found or you do not have access to it.' });
    }

    const { connection, error } = await getConnectionWithJiraAccess(req.user._id);
    if (error) return res.status(error.status).json(error.body);

    const results = [];
    let changedCount = 0;
    for (const { issueKey } of issues) {
      try {
        const accessToken = await getValidAccessToken(connection);
        const issue = await getIssueDetail(connection.cloudId, accessToken, issueKey);

        const descriptionText = adfToText(issue.description);
        const commentsText = issue.comments.map(adfToText).filter(Boolean).join('\n\n');
        const rawText = [descriptionText, commentsText].filter(Boolean).join('\n\n');
        const contentHash = hashText(rawText);

        const existing = await LinkedProjectDocument.findOne({ blueprintId, sourceId: issueKey }).lean();
        if (existing && existing.contentHash === contentHash && existing.extractionStatus === 'extracted') {
          results.push({ issueKey, title: existing.title, status: 'linked', unchanged: true });
          continue;
        }

        const { redactedText } = regexRedact(rawText);
        const classification = await classifyDocument(issue.summary, redactedText);

        await LinkedProjectDocument.updateOne(
          { blueprintId, sourceId: issueKey },
          {
            $set: {
              blueprintId,
              linkedByUserId: req.user._id,
              sourceType: 'jira',
              sourceId: issueKey,
              projectKey: issueKey.split('-')[0] || '',
              title: issue.summary,
              permalink: `${connection.siteUrl}/browse/${issueKey}`,
              summary: classification.summary,
              keywords: classification.keywords,
              rawText: redactedText,
              contentHash,
              extractionStatus: 'extracted',
              extractionError: '',
            },
          },
          { upsert: true }
        );

        changedCount++;
        results.push({ issueKey, title: issue.summary, status: 'linked', unchanged: false });
      } catch (issueErr) {
        console.error(`[PersonalJira] Failed to link issue ${issueKey} to blueprint:`, issueErr.response?.data || issueErr.message);
        results.push({ issueKey, status: 'error', error: jiraErrorDetail(issueErr) });
      }
    }

    const linkedCount = results.filter(r => r.status === 'linked').length;

    // Same reasoning as linkDocumentsToBlueprint: only cascade a
    // regeneration when something actually changed, and never on top of
    // generation that's still in progress.
    if (changedCount > 0) {
      for (const domain of blueprint.domains || []) {
        for (const cap of domain.capabilities || []) {
          if (cap.status !== 'completed') continue;
          regenerateTransformationCapabilityAsync(blueprintId, domain.domainId, cap.capabilityId, req.user._id, blueprint.businessObjective)
            .catch(err => console.error(`[PersonalJira] auto-regen failed for ${domain.domainId}/${cap.capabilityId}:`, err.message));
        }
      }
    }

    return res.json({ linkedCount, total: issues.length, results });
  } catch (err) {
    console.error('[PersonalJira] POST link-to-blueprint error:', err.message);
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
