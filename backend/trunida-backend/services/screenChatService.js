/**
 * Svarg — Screen Chat Service
 *
 * Conversational chat for the Cob (opportunity selection) and Aria (data
 * connections) screens. Unlike advisorService (structured 5-field report,
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
};

const ACTION_LABELS = {
  approve_opportunity: 'Approve this use case',
  connect_confluence:  'Connect Confluence',
  connect_jira:        'Connect Jira',
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

  const { text } = await generate({ systemPrompt, userMessage, maxTokens: 700 });

  const { reply, action } = splitAction(text);
  return {
    reply: reply || "Sorry — I couldn't put a response together just then. Try asking again.",
    action: validateAction(action, screen, context),
  };
}
