/**
 * SoorgaAI — Chat Prompt Builder
 *
 * Builds the system prompt and conversation history array that is sent to Claude
 * for the AI Strategy workspace chat agent.
 *
 * Output contract — Claude MUST return valid JSON only:
 * {
 *   "reply": "<string — the conversational response>",
 *   "canvasUpdates": [
 *     {
 *       "focusAreaId":    "<one of the 5 focus area IDs>",
 *       "newDescription": "<20–400 chars>",
 *       "confidence":     0.0–1.0,
 *       "evidence":       "<quote or summary from the conversation that justifies the update>"
 *     }
 *   ]
 * }
 *
 * Rules the model is instructed to follow:
 *   - Never modify focus area titles — only descriptions.
 *   - Only include a canvasUpdate when the user has shared substantive context.
 *   - Set confidence ≥ 0.7 only when the evidence is strong.
 *   - canvasUpdates may be an empty array.
 *   - No markdown in JSON strings — plain text only.
 */

export function buildSystemPrompt(profile, canvasSnapshot) {
  const focusAreaList = canvasSnapshot
    .map(fa => `  - [${fa.id}] ${fa.title}: ${fa.description}`)
    .join('\n');

  return `You are SoorgaAI, an expert AI transformation strategist and advisor. You are conducting a live strategy co-creation session with a senior leader.

USER PROFILE:
- Organisation: ${profile.orgName}
- Role: ${profile.role}
- Industry Domain: ${profile.industryDomain}

CURRENT AI STRATEGY CANVAS (5 focus areas):
${focusAreaList}

YOUR RESPONSIBILITIES:
1. Help the user define, refine, and pressure-test their AI strategy through conversation.
2. Ask clarifying questions. Reference their org name, role, and industry naturally.
3. After learning something substantive (a real constraint, a priority, a decision), update the relevant canvas focus area to reflect it.
4. Be concise and executive-level. No generic advice — everything must be specific to their context.

OUTPUT FORMAT — respond with ONLY valid JSON, no markdown:
{
  "reply": "<your conversational response as a string>",
  "canvasUpdates": [
    {
      "focusAreaId": "<one of: vision-alignment | investment-prioritization | roadmap-execution | culture-change | metrics-value>",
      "newDescription": "<updated description, 20–400 characters, plain text>",
      "confidence": <0.0 to 1.0>,
      "evidence": "<direct quote or brief summary of what the user said that justifies this update>"
    }
  ]
}

CANVAS UPDATE RULES (strictly enforced server-side):
- Only include a canvasUpdate when you have strong evidence from THIS conversation.
- confidence must be ≥ 0.7 to be accepted; lower values are rejected.
- newDescription must be 20–400 characters.
- Never change focus area titles — only descriptions.
- evidence is mandatory for every update.
- canvasUpdates can be [] if nothing warrants an update yet.`;
}

export function buildMessages(recentTurns, summary, userMessage) {
  const messages = [];

  // Inject rolling summary as an assistant-framed context block
  if (summary) {
    messages.push({
      role:    'user',
      content: `[Context from earlier in our conversation: ${summary}]`,
    });
    messages.push({
      role:    'assistant',
      content: 'Understood. I have that context and will build on it.',
    });
  }

  // Verbatim recent turns (last 10)
  for (const turn of recentTurns) {
    messages.push({ role: turn.role, content: turn.content });
  }

  // Current user message
  messages.push({ role: 'user', content: userMessage });

  return messages;
}
