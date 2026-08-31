/**
 * Svarg — Screen Chat Controller
 *
 * POST /api/strategy-canvas/screen-chat
 * Conversational chat with Cob (opportunity selection) or Aria (data
 * connections). See services/screenChatService.js.
 *
 * The client sends only { blueprintId, screen, message, conversationHistory }.
 * Every fact the model is given — the opportunities, the datasets, what is
 * actually connected — is read here from the database, never accepted from
 * the request body. That keeps the model's context honest even if the client
 * is tampered with, and is what makes the action whitelist meaningful.
 */

import TransformationBlueprint from '../models/TransformationBlueprint.js';
import LinkedProjectDocument from '../models/LinkedProjectDocument.js';
import PersonalConfluenceConnection from '../models/PersonalConfluenceConnection.js';
import { JIRA_SCOPES } from '../services/atlassianAuthService.js';
import { askScreenChat } from '../services/screenChatService.js';

const MAX_MESSAGE_LENGTH = 2000;

// Mirrors findAiUseCasesPrioritizationSection in the frontend — same two
// accepted titles, same 'completed' requirement.
function findOpportunitySection(bp) {
  const domain = (bp.domains || []).find(d => d.domainId === 'ai-use-cases');
  if (!domain || domain.status !== 'completed') return null;
  for (const cap of domain.capabilities || []) {
    for (const section of cap.sections || []) {
      if (section.title === 'AI Implementation Prioritization' || section.title === 'AI Use Case Prioritization') {
        return section;
      }
    }
  }
  return null;
}

function findDatasets(bp) {
  const domain = (bp.domains || []).find(d => d.domainId === 'data-readiness');
  if (!domain) return [];
  for (const cap of domain.capabilities || []) {
    for (const section of cap.sections || []) {
      if (section.title === 'Critical Data Identification') return section.brief?.datasets || [];
    }
  }
  return [];
}

// Same resolution the Aria table shows the user, so the model describes the
// screen the user is actually looking at rather than a different view of it.
function datasetStatus(typicalSource, confCount, jiraCount) {
  const s = String(typicalSource || '').toLowerCase();
  const conf = s.includes('confluence');
  const jira = s.includes('jira');
  if (!conf && !jira) return 'no connector available — filled from Svarg analysis';
  if (conf) return confCount > 0 ? 'connected via Confluence' : 'not connected (Confluence)';
  return jiraCount > 0 ? 'connected via Jira' : 'not connected (Jira)';
}

export async function screenChat(req, res) {
  try {
    const { blueprintId, screen, message, conversationHistory } = req.body;

    if (!['cob', 'aria'].includes(screen)) {
      return res.status(400).json({ error: 'screen must be "cob" or "aria".' });
    }
    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ error: 'message is required.' });
    }
    if (message.length > MAX_MESSAGE_LENGTH) {
      return res.status(400).json({ error: `Message too long (max ${MAX_MESSAGE_LENGTH} characters).` });
    }

    const bp = await TransformationBlueprint.findOne({ _id: blueprintId, userId: req.user._id }).lean();
    if (!bp) return res.status(404).json({ error: 'Blueprint not found or you do not have access to it.' });

    const context = {
      businessObjective: bp.businessObjective || '',
      approved: !!bp.opportunityApproval?.approved,
    };

    const oppSection = findOpportunitySection(bp);
    const brief = oppSection?.brief || {};
    const opportunities = (brief.priorityQuadrants || []).flatMap(q => q.initiatives || []);
    const recommended = brief.recommendedStartingPoint || '';

    if (screen === 'cob') {
      context.opportunities = opportunities;
      context.recommendedStartingPoint = recommended;
    } else {
      const docs = await LinkedProjectDocument.find({ blueprintId }).select('sourceType').lean();
      const confCount = docs.filter(d => (d.sourceType || 'confluence') === 'confluence').length;
      const jiraCount = docs.filter(d => d.sourceType === 'jira').length;

      const connection = await PersonalConfluenceConnection.findOne({ userId: req.user._id }).lean();
      const jiraScope = connection && JIRA_SCOPES.every(s => (connection.scopes || []).includes(s));

      context.selectedUseCase = opportunities.find(n => n && recommended.includes(n)) || recommended;
      context.datasets = findDatasets(bp).map(d => ({
        name: d.name,
        purpose: d.purpose,
        typicalSource: d.typicalSource,
        status: datasetStatus(d.typicalSource, confCount, jiraCount),
      }));
      context.confluenceCount = confCount;
      context.jiraCount = jiraCount;
      // "Connected" here means content is actually linked to THIS blueprint —
      // an OAuth grant with nothing linked still leaves the data unusable, so
      // offering the connect action in that state is correct.
      context.confluenceConnected = confCount > 0;
      context.jiraConnected = jiraCount > 0 && !!jiraScope;
    }

    const result = await askScreenChat({
      screen,
      context,
      message: message.trim(),
      conversationHistory: Array.isArray(conversationHistory) ? conversationHistory : [],
    });

    return res.json(result);

  } catch (err) {
    console.error('[screenChat] error:', err.message);
    const unavailable = err.message?.includes('not configured')
      || err.message?.includes('All LLM providers')
      || err.message?.includes('No valid LLM providers');
    if (unavailable) {
      return res.status(503).json({ error: 'Chat is unavailable right now. Please try again shortly.' });
    }
    return res.status(500).json({ error: 'Failed to generate a reply.' });
  }
}
