/**
 * Svarg — Screen Chat Service
 *
 * Conversational chat for the Cob (opportunity selection), Aria (data
 * connections), Arth (model & infrastructure) and Eame (the application)
 * screens. Unlike advisorService (structured 5-field report,
 * capability-scoped) or conversationService (mutates DomainCanvas), this
 * returns plain conversational text scoped to a blueprint and a screen,
 * so the user feels they are talking to Cob or Aria directly.
 *
 * ACTIONS — the model may PROPOSE one action per reply, but never performs
 * it. The proposal is validated here against a per-screen whitelist AND
 * against current state (no proposing an approval that already happened,
 * or a connection that already exists). The frontend renders the survivor
 * as a button the user must click; the click calls the existing, separately
 * authorised endpoint. So a hallucinated or malicious action name cannot
 * cause a side effect — worst case it is dropped and the reply stands alone.
 */

import { generate } from './llmService.js';

// Per-screen whitelist. Anything the model proposes outside this is dropped.
const ALLOWED_ACTIONS = {
  cob:  ['approve_opportunity'],
  aria: ['connect_confluence', 'connect_jira'],
  // Arth's actions only move the selection on the screen — the commit stays
  // behind its own Confirm & Continue button, so chat never writes a choice.
  arth: ['choose_frontier', 'choose_open_weight', 'choose_auto'],
  // Eame proposes nothing. Pushing to a repository and deploying are both
  // irreversible enough that they should be deliberate clicks on the screen,
  // not something a conversation offers.
  eame: [],
  // Same for Yusu, more so: going live is the single most consequential
  // button in the product.
  yusu: [],
};

const ACTION_LABELS = {
  approve_opportunity: 'Approve this use case',
  connect_confluence:  'Connect Confluence',
  connect_jira:        'Connect Jira',
  choose_frontier:     'Select Frontier',
  choose_open_weight:  'Select Open Weight',
  choose_auto:         'Select Auto',
};

const PERSONAS = {
  cob: {
    name: 'Cob',
    role: 'the AI strategist who identifies and prioritises AI opportunities',
    focus: 'which AI use case to start with and why, the trade-offs between the options, and what makes one a better first step than another',
  },
  aria: {
    name: 'Aria',
    role: 'the data architect who connects the sources an AI initiative needs',
    focus: 'which datasets the chosen use case needs, which are connected, what is still missing, and what happens to data with no connector',
  },
  arth: {
    name: 'Arth',
    role: 'the engineer who decides what an AI use case actually runs on',
    focus: 'the trade-off between frontier, open-weight and auto model classes — quality against cost, and cloud against keeping data in the customer\'s own environment — and where the application itself will run',
  },
  eame: {
    name: 'Eame',
    role: 'the engineer who builds the application and hands it over as working code',
    focus: 'what is in the delivered project, how to run it, what it needs configured, and what happens when it is deployed',
  },
  yusu: {
    name: 'Yusu',
    role: 'the one who puts the application live and hands it to the business',
    focus: 'what is still outstanding before it can go live, what happens at go-live, and where the line falls between what the customer owns and what Svarg runs for them',
  },
};

function buildSystemPrompt(screen) {
  const p = PERSONAS[screen];
  const actions = ALLOWED_ACTIONS[screen];

  return `You are ${p.name}, ${p.role}, speaking directly with a project or product manager inside the Svarg platform.

VOICE
- Speak in first person as ${p.name}. You are a colleague, not a chatbot.
- Be concise and concrete: 2-4 short paragraphs at most, usually less.
- Delivery-focused language. No C-suite buzzwords, no "leverage synergies".
- Never invent data. If the context below does not contain something, say you
  do not have it rather than guessing.

SCOPE
- Stay on ${p.focus}.
- If asked about something outside your scope, say so briefly and point them to
  the right stage of the journey (Cob = opportunities, Aria = data, Arth =
  models and infrastructure, Eame = building the application, Yusu = rolling it
  into the business).

ACTIONS
You may offer at most ONE action when it genuinely follows from the
conversation. Never claim you have performed it — the user must confirm it
themselves. Available actions: ${actions.length ? actions.join(', ') : 'none'}.

RESPONSE FORMAT
Reply with plain conversational prose. If — and only if — you want to offer an
action, put this on the VERY LAST line, alone:
ACTION: <action_name>
Do not mention the ACTION line itself in your prose, and do not use it for
anything not in the list above.`;
}

function buildContext(screen, ctx) {
  const lines = [];

  if (ctx.businessObjective) lines.push(`Business objective: ${ctx.businessObjective}`);

  if (screen === 'cob') {
    if (ctx.recommendedStartingPoint) lines.push(`\nYour recommendation: ${ctx.recommendedStartingPoint}`);
    if (ctx.opportunities?.length) {
      lines.push(`\nAll identified opportunities:`);
      ctx.opportunities.forEach(o => lines.push(`  - ${o}`));
    }
    lines.push(`\nApproved by the user yet: ${ctx.approved ? 'yes' : 'no'}`);
  }

  if (screen === 'aria') {
    if (ctx.selectedUseCase) lines.push(`\nSelected use case: ${ctx.selectedUseCase}`);
    if (ctx.datasets?.length) {
      lines.push(`\nRequired datasets (name — why it is needed — where it typically lives — current status):`);
      ctx.datasets.forEach(d => {
        lines.push(`  - ${d.name} — ${d.purpose || 'n/a'} — ${d.typicalSource || 'n/a'} — ${d.status}`);
      });
    }
    lines.push(`\nConnectors Svarg supports today: Confluence and Jira only.`);
    lines.push(`Confluence connected: ${ctx.confluenceConnected ? 'yes' : 'no'} (${ctx.confluenceCount || 0} pages linked)`);
    lines.push(`Jira connected: ${ctx.jiraConnected ? 'yes' : 'no'} (${ctx.jiraCount || 0} issues linked)`);
    lines.push(`Datasets whose source has no connector are completed from Svarg's own analysis rather than the user's documents.`);
  }

  if (screen === 'arth') {
    if (ctx.selectedUseCase) lines.push(`\nSelected use case: ${ctx.selectedUseCase}`);

    if (ctx.options?.length) {
      lines.push(`\nModel classes available (class — resolved model — quality — cost — performance — why):`);
      ctx.options.forEach(o => {
        lines.push(`  - ${o.id} — ${o.displayName} — ${o.quality} — ${o.cost} — ${o.performance} — ${o.rationale}`);
      });

      // The class names alone are ambiguous: read "frontier" without this and
      // a model takes it to mean experimental, then recommends the cloud
      // option to someone who has just said their data cannot leave the
      // building. These are the trade-offs the cards state, so the chat and
      // the screen give the same answer.
      lines.push(`\nWhat each class means for deployment — usually the deciding factor, not the name:`);
      lines.push(`  - frontier: a cloud API. Best quality, priced per call. The data leaves the customer's environment.`);
      lines.push(`  - open-weight: runs on the customer's own hardware. Fixed cost, some quality traded away. The data never leaves.`);
      lines.push(`  - auto: the resilient chain across several cloud providers, so no single outage blocks a request. Data still leaves the environment.`);
      lines.push(`If the user says their data cannot leave their network, or must stay on-premise, open-weight is the only class that satisfies that.`);
    }

    lines.push(`\nCurrently selected: ${ctx.currentPreference ? `${ctx.currentPreference} (${ctx.currentDisplayName})` : 'nothing yet'}`);

    if (ctx.infra?.length) {
      lines.push(`\nInfrastructure this blueprint calls for:`);
      ctx.infra.forEach(i => lines.push(`  - ${i.label}: ${i.value}`));
    } else {
      lines.push(`\nThis blueprint's Technology & Infrastructure domain has not finished generating, so you do not have its infrastructure detail. Say so rather than inventing a stack.`);
    }
  }

  if (screen === 'eame') {
    if (ctx.selectedUseCase) lines.push(`\nSelected use case: ${ctx.selectedUseCase}`);

    lines.push(`\nWhat the delivered project is: a Node/Express application with its own`);
    lines.push(`API, a MongoDB database using Atlas Vector Search for retrieval, and an`);
    lines.push(`OpenAI-compatible client for the model. It is working code copied from`);
    lines.push(`Svarg's own engine, not a generated sample.`);
    if (ctx.fileCount) lines.push(`It is ${ctx.fileCount} files.`);

    lines.push(`\nGitHub connected: ${ctx.githubConnected ? `yes (${ctx.githubUser || 'account linked'})` : 'no'}`);
    lines.push(`Pushed to a repository: ${ctx.repo ? `yes — ${ctx.repo}` : 'not yet'}`);

    if (ctx.hosting === 'self') {
      lines.push(`\nThis customer chose to run it in their own environment. Svarg prepares`);
      lines.push(`nothing; they need their own hosting, database and model API key.`);
    } else if (ctx.deploymentStatus) {
      lines.push(`\nSvarg environment: ${ctx.deploymentStatus}`);
      if (ctx.deploymentUrl) lines.push(`Running at: ${ctx.deploymentUrl}`);
      if (ctx.model) lines.push(`Configured to use ${ctx.model}, reached through Svarg's gateway — the API key stays on Svarg's side and never reaches the application.`);
    } else {
      lines.push(`\nNo environment has been prepared yet. That happens on the Arth screen.`);
    }

    lines.push(`\nYou do not perform actions. Pushing to GitHub and deploying are buttons`);
    lines.push(`on this screen; describe them rather than offering to do them.`);
  }

  if (screen === 'yusu') {
    if (ctx.selectedUseCase) lines.push(`\nSelected use case: ${ctx.selectedUseCase}`);

    lines.push(`\nReadiness — everything that must hold before this can go live:`);
    (ctx.checks || []).forEach(c => {
      lines.push(`  - ${c.title}: ${c.ok ? 'done' : 'NOT DONE — ' + c.fix}`);
    });

    if (ctx.hosting === 'self') {
      lines.push(`\nThis customer runs it in their own environment. There is nothing for`);
      lines.push(`Svarg to turn on — the repository from Eame is the handover.`);
    } else if (ctx.live) {
      lines.push(`\nIt is LIVE${ctx.url ? ` at ${ctx.url}` : ''}, running ${ctx.model || 'the chosen model'} through Svarg's gateway.`);
      lines.push(`Spent $${(ctx.costUsd || 0).toFixed(2)} of a $${ctx.capUsd || 0} monthly limit across ${ctx.requests || 0} requests.`);
    } else {
      lines.push(`\nNot live yet.`);
    }

    lines.push(`\nWhere the line falls, and be exact about this when asked:`);
    lines.push(`  The customer owns the source code in their own GitHub repository, and`);
    lines.push(`  the data in the database — their documents and whatever the application`);
    lines.push(`  produces. They can move it elsewhere at any time; nothing is locked in.`);
    lines.push(`  Svarg runs the container, the database, and the model gateway, and holds`);
    lines.push(`  the provider account behind it. Past the spend limit requests are refused`);
    lines.push(`  rather than billed on.`);

    lines.push(`\nYou do not perform actions. Going Live is a button on this screen.`);
  }

  return lines.join('\n');
}

// Strips the ACTION line off the end and returns it separately, so the
// protocol marker never leaks into what the user reads.
// Exported for tests — this and validateAction are the whole safety barrier
// between model output and a real side effect, so they are worth asserting on.
export function splitAction(text) {
  const lines = String(text || '').trimEnd().split('\n');
  const last = lines[lines.length - 1]?.trim() || '';
  const m = last.match(/^ACTION:\s*([a-z_]+)$/i);
  if (!m) return { reply: String(text || '').trim(), action: null };
  lines.pop();
  return { reply: lines.join('\n').trim(), action: m[1].toLowerCase() };
}

// An action only survives if it is whitelisted for this screen AND still
// makes sense given current state. Both checks are server-side; the client
// is not trusted to decide what is offerable.
export function validateAction(action, screen, ctx) {
  if (!action) return null;
  if (!(ALLOWED_ACTIONS[screen] || []).includes(action)) return null;

  if (action === 'approve_opportunity' && ctx.approved) return null;
  if (action === 'connect_confluence' && ctx.confluenceConnected) return null;
  if (action === 'connect_jira' && ctx.jiraConnected) return null;
  if (action.startsWith('choose_') && ctx.currentPreference
      && action === `choose_${ctx.currentPreference.replace('-', '_')}`) return null;

  return { type: action, label: ACTION_LABELS[action] };
}

const MAX_HISTORY_TURNS = 12;

export async function askScreenChat({ screen, context, message, conversationHistory = [] }) {
  const systemPrompt = buildSystemPrompt(screen);

  const history = conversationHistory
    .slice(-MAX_HISTORY_TURNS)
    .map(t => `${t.role === 'user' ? 'User' : PERSONAS[screen].name}: ${t.content}`)
    .join('\n');

  const userMessage = [
    `CURRENT CONTEXT`,
    buildContext(screen, context),
    history ? `\nCONVERSATION SO FAR\n${history}` : '',
    `\nUser: ${message}`,
  ].filter(Boolean).join('\n');

  const { text } = await generate({ systemPrompt, userMessage, maxTokens: 700, label: `chat:${screen}` });

  const { reply, action } = splitAction(text);
  return {
    reply: reply || "Sorry — I couldn't put a response together just then. Try asking again.",
    action: validateAction(action, screen, context),
  };
}
