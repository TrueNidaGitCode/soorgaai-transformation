/**
 * The follow-up, written but never sent.
 *
 * ── Why drafting and sending are different products ────────────────────────
 *
 * Finding something and doing something about it are two steps, and only the
 * first one is safe to automate today. This application holds no mail
 * credentials and no provider key by design: a container that can send mail is
 * a container worth stealing, and the one thing it must never gain is the
 * ability to address a stranger.
 *
 * So this writes the message and stops. A person reads it, decides whether it
 * is right, and sends it themselves from wherever they already talk to that
 * customer. That is not a limitation dressed up as a feature — sending without
 * a human in the loop is a trust purchase nobody has made yet, and the first
 * wrong message sent in a customer's name costs more than every right one
 * saved.
 *
 * ── The rule the prompt enforces ───────────────────────────────────────────
 *
 * The model writes the sentence. It does not supply a single fact.
 *
 * Every name, date, number and record in the draft comes from the finding's
 * stored evidence, which was computed in code by the answer pipeline and
 * validated before it was written down. The model is given those facts and
 * told plainly that it may not add another — because a follow-up containing an
 * invented figure is worse than no follow-up, and it goes out over the
 * customer's name rather than ours.
 */
import { generate } from './llmService.js';

const MAX = 1200;

/**
 * The facts, as lines the model may use and may not exceed.
 *
 * Built here rather than handed the raw document so that what reaches the
 * prompt is a short, closed list. A model given a whole record will use all of
 * it; a model given six lines will use six lines.
 */
export function factsFor(finding) {
  const ev = finding?.evidence || {};
  const lines = [];
  lines.push(`Subject: ${finding?.title || finding?.key || 'unknown'}`);
  if (finding?.agentName) lines.push(`Noticed by: ${finding.agentName}`);
  if (ev.rule) lines.push(`Why it was flagged: ${ev.rule}`);
  if (ev.window) lines.push(`Period considered: ${ev.window}`);
  if (ev.dataset) lines.push(`Source records: ${ev.dataset}`);
  if (ev.rows) lines.push(`Records for this subject: ${ev.rows}`);
  if (finding?.firstSeenAt) {
    const days = Math.floor((Date.now() - new Date(finding.firstSeenAt).getTime()) / 86400000);
    lines.push(`Open for: ${days} day${days === 1 ? '' : 's'}`);
  }
  // The actual cells, capped by the pipeline at six when the finding was
  // stored. These are what make a draft specific rather than generic.
  for (const row of (ev.lines || []).slice(0, 6)) {
    lines.push(`Record: ${(row || []).join(' | ')}`);
  }
  return lines;
}

const SYSTEM = `You write one short follow-up message for a small business to send.

You are given a list of FACTS. Write the message using only those facts.

Rules, in order of importance:
1. Do not state any number, date, name or detail that is not in the FACTS. If a
   fact you would like is missing, write the message without it.
2. Do not promise anything, offer anything, apologise for anything specific, or
   claim to know why something happened.
3. Plain and warm. No marketing language, no exclamation marks, no emoji.
4. Six sentences at most. No subject line, no signature block — the person
   sending it will add those.
5. If the facts are too thin to write something specific, write a short message
   that asks rather than assumes.

Return only the message.`;

/**
 * Draft a follow-up for one finding.
 *
 * Never throws for a model problem: a drafting failure must not look like a
 * broken finding. The caller shows the reason and the finding stays intact.
 */
export async function draftFollowUp(finding) {
  const facts = factsFor(finding);
  if (facts.length <= 1) {
    throw new Error('This finding has no evidence stored yet, so there is nothing to write from.');
  }

  const result = await generate({
    systemPrompt: SYSTEM,
    userMessage: `FACTS\n${facts.join('\n')}`,
    maxTokens: 400,
    label: 'finding-draft',
  });

  const text = String(result?.text || '').trim();
  if (!text) throw new Error('Nothing came back. Try again in a moment.');
  return text.slice(0, MAX);
}
