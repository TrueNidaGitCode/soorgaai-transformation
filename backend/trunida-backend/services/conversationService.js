/**
 * SoorgaAI — Conversation Service
 *
 * Core orchestrator for one chat turn in the AI Strategy workspace.
 *
 * handleTurn(userId, domainId, message):
 *   1. Load context (profile, canvas, recent turns, summary)
 *   2. Build prompt via chatPrompt helpers
 *   3. Call Claude (claude-sonnet-4-6)
 *   4. Parse JSON envelope { reply, canvasUpdates[] }
 *   5. On parse failure → text-only reply, no canvas update, turn still persisted
 *   6. Persist user turn + agent turn (with token counts)
 *   7. If > 10 turns since last summarization → trigger rolling summary
 *   8. Return { reply, parsedUpdates, conversationId }
 *
 * On Claude API error:
 *   - User turn is persisted with error: false (the user's message was valid)
 *   - A sentinel assistant turn is persisted with error: true
 *   - Error is re-thrown so the controller can return 503
 */

import Anthropic  from '@anthropic-ai/sdk';
import dotenv     from 'dotenv';
import Conversation from '../models/Conversation.js';
import { loadContext }     from './contextMemoryService.js';
import { buildSystemPrompt, buildMessages } from './promptTemplates/chatPrompt.js';

dotenv.config();

const anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

const MODEL          = 'claude-sonnet-4-6';
const MAX_TOKENS     = 1500;
const SUMMARY_EVERY  = 10;   // summarize when this many new turns have accumulated

// ── Main entry point ──────────────────────────────────────────────────────────

export async function handleTurn(userId, domainId, userMessage) {
  const { profile, canvasSnapshot, recentTurns, summary } = await loadContext(userId, domainId);

  const systemPrompt = buildSystemPrompt(profile, canvasSnapshot);
  const messages     = buildMessages(recentTurns, summary, userMessage);

  // ── Call Claude ────────────────────────────────────────────────────────────

  let rawText, inputTokens = 0, outputTokens = 0;

  try {
    if (!anthropic) throw new Error('ANTHROPIC_API_KEY is not configured.');

    const response = await anthropic.messages.create({
      model:      MODEL,
      max_tokens: MAX_TOKENS,
      system:     systemPrompt,
      messages,
    });

    rawText      = response.content[0]?.text || '';
    inputTokens  = response.usage?.input_tokens  || 0;
    outputTokens = response.usage?.output_tokens || 0;

  } catch (claudeErr) {
    console.error('Claude API error:', claudeErr.message);

    // Persist both turns before re-throwing
    await appendTurns(userId, domainId, userMessage, null, 0, 0, true);

    throw claudeErr;
  }

  // ── Parse JSON envelope ────────────────────────────────────────────────────

  let reply               = rawText;
  let parsedUpdates       = [];
  let rawKnowledgeSuggs   = [];

  try {
    const envelope = JSON.parse(rawText);
    if (typeof envelope.reply === 'string')        reply              = envelope.reply;
    if (Array.isArray(envelope.canvasUpdates))     parsedUpdates      = envelope.canvasUpdates;
    if (Array.isArray(envelope.knowledgeSuggestions)) rawKnowledgeSuggs = envelope.knowledgeSuggestions;
  } catch {
    // Malformed JSON — use raw text as reply, no canvas update
    console.warn('[conversation] LLM returned non-JSON; using raw text as reply.');
    reply         = rawText;
    parsedUpdates = [];
  }

  // ── Persist turns ──────────────────────────────────────────────────────────

  const conversationId = await appendTurns(
    userId, domainId, userMessage, reply, inputTokens, outputTokens, false
  );

  // ── Rolling summarization ──────────────────────────────────────────────────

  await maybeSummarize(userId, domainId, profile, conversationId);

  return { reply, parsedUpdates, rawKnowledgeSuggs, conversationId };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function appendTurns(userId, domainId, userMessage, agentReply, inputTokens, outputTokens, agentError) {
  const now = new Date();

  const userTurn = { role: 'user', content: userMessage, createdAt: now };

  const conversation = await Conversation.findOneAndUpdate(
    { userId, domainId },
    {
      $push: { turns: userTurn },
      $set:  { lastActivityAt: now },
      $setOnInsert: { userId, domainId, summary: '', summaryUpToTurn: 0 },
    },
    { upsert: true, new: true }
  );

  if (agentReply !== null) {
    conversation.turns.push({
      role:         'assistant',
      content:      agentReply,
      inputTokens,
      outputTokens,
      error:        agentError,
      createdAt:    now,
    });
    await conversation.save();
  }

  return conversation._id;
}

async function maybeSummarize(userId, domainId, profile, conversationId) {
  const conversation = await Conversation.findOne({ userId, domainId });
  if (!conversation) return;

  const newTurnsSinceSummary = conversation.turns.length - conversation.summaryUpToTurn;
  if (newTurnsSinceSummary < SUMMARY_EVERY) return;

  // Turns to summarize: everything except the last 10
  const turnsToSummarize = conversation.turns.slice(0, conversation.turns.length - 10);
  if (turnsToSummarize.length === 0) return;

  const historyText = turnsToSummarize
    .map(t => `${t.role === 'user' ? 'User' : 'Advisor'}: ${t.content}`)
    .join('\n');

  const summaryPrompt = `Summarize the following AI strategy conversation in 3–5 sentences. Focus on what the user has shared about their organisation, priorities, and constraints. Be factual — do not add information not present in the transcript.\n\n${historyText}`;

  try {
    if (!anthropic) return;

    const resp = await anthropic.messages.create({
      model:      MODEL,
      max_tokens: 400,
      messages:   [{ role: 'user', content: summaryPrompt }],
    });

    const newSummary = resp.content[0]?.text?.trim() || '';
    if (newSummary) {
      conversation.summary          = newSummary;
      conversation.summaryUpToTurn  = conversation.turns.length - 10;
      await conversation.save();
      console.log(`[conversation] summarized turns 0–${conversation.summaryUpToTurn} for userId=${userId}`);
    }
  } catch (err) {
    // Non-fatal — summarization failure does not interrupt the user flow
    console.warn('[conversation] summarization failed:', err.message);
  }
}
