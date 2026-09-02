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

// Mirrors findInfra in arthScreen.js — the generator puts infraItems or
// techStack on different capabilities depending on what it produced, so
// search rather than assume, and Arth describes the rows the user can see.
function findInfra(bp) {
  const domain = (bp.domains || []).find(d => d.domainId === 'technology-infrastructure');
  if (!domain) return [];
  const rows = [];
  for (const cap of domain.capabilities || []) {
    for (const section of cap.sections || []) {
      const b = section.brief || {};
      // Field names come from infraItemSchema {item, recommendation} and
      // techStackItemSchema {layer, recommendation} in TransformationBlueprint.
      // The alternates are kept only for blueprints written before those
      // schemas settled.
      (b.infraItems || []).forEach(i => rows.push({
        label: i.item || i.label || i.name || i.component || '',
        value: i.recommendation || i.value || i.detail || i.description || '',
      }));
      (b.techStack || []).forEach(t => rows.push({
        label: t.layer || t.category || t.name || '',
        value: t.recommendation || t.technology || t.value || t.tools || t.description || '',
      }));
    }
  }
  return rows.filter(r => r.label && r.value);
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

    if (!['cob', 'aria', 'arth', 'eame', 'yusu'].includes(screen)) {
      return res.status(400).json({ error: 'screen must be one of: cob, aria, arth, eame, yusu.' });
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

    const selectedUseCase = opportunities.find(n => n && recommended.includes(n)) || recommended;

    if (screen === 'cob') {
      context.opportunities = opportunities;
      context.recommendedStartingPoint = recommended;
    } else if (screen === 'arth') {
      // Resolved the same way the Arth cards resolve them — selectModel is
      // rule-based, so the model names Arth talks about are the ones the
      // engine would actually route to, not a description of them.
      const { selectModel } = await import('../services/modelSelectionService.js');
      context.selectedUseCase = selectedUseCase;
      context.options = ['frontier', 'open-weight', 'auto'].map(id => {
        try { return { id, ...selectModel({ preference: id }) }; }
        catch { return null; }
      }).filter(Boolean);
      context.currentPreference  = bp.arthSelection?.preference || '';
      context.currentDisplayName = bp.arthSelection?.displayName || '';
      context.infra = findInfra(bp);

    } else if (screen === 'eame') {
      // Read here rather than taken from the body, so Eame describes what was
      // actually delivered and actually deployed — not what a client claims.
      const { default: HostedDeployment } = await import('../models/HostedDeployment.js');
      const { default: PersonalGithubConnection } = await import('../models/PersonalGithubConnection.js');

      const dep = await HostedDeployment.findOne({ blueprintId }).lean();
      const gh  = await PersonalGithubConnection.findOne({ userId: req.user._id }).lean();

      context.selectedUseCase  = selectedUseCase;
      context.githubConnected  = !!gh;
      context.githubUser       = gh?.githubLogin || '';
      context.repo             = bp.eameDelivery?.repoName
        ? `${bp.eameDelivery.repoOwner}/${bp.eameDelivery.repoName}`
        : '';
      context.fileCount        = bp.eameDelivery?.fileCount || 0;
      context.hosting          = dep?.hosting || '';
      context.deploymentStatus = dep?.status || '';
      context.deploymentUrl    = dep?.railway?.url || '';
      context.model            = dep?.model?.displayName || bp.arthSelection?.displayName || '';

    } else if (screen === 'yusu') {
      const { default: HostedDeployment } = await import('../models/HostedDeployment.js');
      const dep = await HostedDeployment.findOne({ blueprintId }).lean();
      const govDomain = (bp.domains || []).find(d => d.domainId === 'governance-security');
      const govAreas = (govDomain?.capabilities || [])
        .flatMap(c => c.sections || []).map(s => s.title).filter(Boolean);

      // The same gates the screen shows, resolved from the same state,
      // so Yusu can never claim something is outstanding that the screen has
      // already ticked — or the reverse.
      context.selectedUseCase = selectedUseCase;
      context.checks = [
        { title: 'A model is chosen', ok: !!bp.arthSelection?.modelId, fix: 'choose one on Arth' },
        { title: 'An environment is ready',
          ok: ['prepared', 'live'].includes(dep?.status) || dep?.hosting === 'self',
          fix: 'prepare it on Arth' },
        { title: 'The application is built', ok: !!bp.eameDelivery?.repoName, fix: 'build and push it on Eame' },
        { title: 'Governance is accepted',
          ok: govAreas.length === 0 || !!bp.governanceReview?.acknowledged,
          fix: 'read the governance areas on this screen and accept them' },
      ];
      context.governanceAreas = govAreas;
      context.governanceAccepted = !!bp.governanceReview?.acknowledged;
      context.hosting  = dep?.hosting || '';
      context.live     = dep?.status === 'live';
      context.url      = dep?.railway?.url || '';
      context.model    = dep?.model?.displayName || bp.arthSelection?.displayName || '';
      context.costUsd  = dep?.usage?.costUsd || 0;
      context.capUsd   = dep?.limits?.maxCostUsd || 0;
      context.requests = dep?.usage?.requests || 0;

    } else {
      const docs = await LinkedProjectDocument.find({ blueprintId }).select('sourceType').lean();
      const confCount = docs.filter(d => (d.sourceType || 'confluence') === 'confluence').length;
      const jiraCount = docs.filter(d => d.sourceType === 'jira').length;

      const connection = await PersonalConfluenceConnection.findOne({ userId: req.user._id }).lean();
      const jiraScope = connection && JIRA_SCOPES.every(s => (connection.scopes || []).includes(s));

      context.selectedUseCase = selectedUseCase;
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

/**
 * GET /strategy-canvas/arth/models?type=frontier|open-weight&quantization=int4
 * The menu behind a class, so choosing "Frontier" or "Open Weight" leads to
 * a real choice of model. Open-weight rows carry a derived compute profile.
 */
export async function listArthModels(req, res) {
  try {
    const { type, quantization } = req.query;
    if (!['frontier', 'open-weight'].includes(type)) {
      return res.status(400).json({ error: 'type must be "frontier" or "open-weight".' });
    }
    const { listCandidates, withCompute } = await import('../services/modelAdvisorService.js');
    const q = ['int4', 'int8', 'fp16'].includes(quantization) ? quantization : 'int4';
    return res.json({ models: listCandidates(type).map(m => withCompute(m, q)) });
  } catch (err) {
    console.error('[arthModels] error:', err.message);
    return res.status(500).json({ error: 'Failed to load the model catalog.' });
  }
}

/**
 * POST /strategy-canvas/transformation-blueprint/:blueprintId/arth-recommend
 * "Auto" — Arth reads this use case and picks the model that fits it.
 *
 * The use case and objective are read from the blueprint here, not taken
 * from the body, so the reasoning is about the engagement the user is
 * actually in. The client supplies only what it is reasonable for a user to
 * assert: which of cost/quality/performance/privacy matters most, and any
 * constraint in their own words.
 */
export async function recommendArthModel(req, res) {
  try {
    const { blueprintId } = req.params;
    const { priority, constraints } = req.body;

    if (priority && !['quality', 'cost', 'performance', 'privacy'].includes(priority)) {
      return res.status(400).json({ error: 'priority must be quality, cost, performance or privacy.' });
    }
    if (constraints && String(constraints).length > 500) {
      return res.status(400).json({ error: 'constraints must be 500 characters or fewer.' });
    }

    const bp = await TransformationBlueprint.findOne({ _id: blueprintId, userId: req.user._id }).lean();
    if (!bp) return res.status(404).json({ error: 'Blueprint not found or you do not have access to it.' });

    const oppSection = findOpportunitySection(bp);
    const brief = oppSection?.brief || {};
    const opportunities = (brief.priorityQuadrants || []).flatMap(q => q.initiatives || []);
    const recommended = brief.recommendedStartingPoint || '';

    const { recommendModel } = await import('../services/modelAdvisorService.js');
    const result = await recommendModel({
      useCase: opportunities.find(n => n && recommended.includes(n)) || recommended,
      businessObjective: bp.businessObjective || '',
      priority: priority || 'quality',
      constraints: String(constraints || '').trim(),
    });

    return res.json(result);
  } catch (err) {
    console.error('[arthRecommend] error:', err.message);
    return res.status(500).json({ error: 'Failed to produce a recommendation.' });
  }
}

/**
 * PATCH /strategy-canvas/transformation-blueprint/:blueprintId/arth-selection
 * Records the model chosen on the Arth screen.
 *
 * Everything stored is resolved here from the catalog — the client sends a
 * class and a model id, never a display name, provider or compute figure, so
 * it cannot record a model that does not exist or overstate what one needs.
 */
export async function saveArthSelection(req, res) {
  try {
    const { blueprintId } = req.params;
    const { preference, modelId, priority, rationale } = req.body;

    if (!['frontier', 'open-weight', 'auto'].includes(preference)) {
      return res.status(400).json({ error: 'preference must be frontier, open-weight or auto.' });
    }

    const { findModel, computeProfile } = await import('../services/modelAdvisorService.js');
    let selection;

    if (modelId) {
      const model = findModel(modelId);
      if (!model) return res.status(400).json({ error: 'That model is not in the catalog.' });
      // A frontier pick recorded under the open-weight class (or the reverse)
      // would misstate the data-residency decision, which is the whole point
      // of the class. 'auto' may legitimately land on either.
      if (preference !== 'auto' && model.type !== preference) {
        return res.status(400).json({ error: `${model.displayName} is not an ${preference} model.` });
      }
      selection = {
        preference,
        modelId:     model.id,
        providerId:  model.providerId || '',
        displayName: model.displayName,
        vendor:      model.vendor || '',
        rationale:   String(rationale || '').slice(0, 1000),
        priority:    priority || '',
        compute:     computeProfile(model) || undefined,
        selectedAt:  new Date(),
      };
    } else {
      // No model named — the class-only path the screen used before, kept so
      // an older client and a half-finished selection both still work.
      const { selectModel } = await import('../services/modelSelectionService.js');
      const picked = selectModel({ preference });
      selection = {
        preference,
        providerId:  picked.providerId || '',
        displayName: picked.displayName,
        selectedAt:  new Date(),
      };
    }

    const result = await TransformationBlueprint.updateOne(
      { _id: blueprintId, userId: req.user._id },
      { $set: { arthSelection: selection } }
    );
    if (result.matchedCount === 0) {
      return res.status(404).json({ error: 'Blueprint not found.' });
    }

    return res.json({ saved: true, selection });
  } catch (err) {
    console.error('[arthSelection] error:', err.message);
    return res.status(500).json({ error: 'Failed to save the model selection.' });
  }
}
