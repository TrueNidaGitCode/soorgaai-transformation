/**
 * SoorgaAI — Confluence Content Service
 *
 * Shared normalize-then-classify step used by both the org-wide sync
 * (confluenceExtractionService.js) and the personal per-blueprint link flow
 * (personalConfluenceController.js) — kept in one place so the LLM
 * classification prompt can't drift between the two call sites.
 */

import crypto from 'crypto';
import { generate } from './llmService.js';

const MAX_TEXT_CHARS = 12_000; // truncation cap before the LLM call — no chunking exists in this codebase

// ── HTML → plain text (regex-based; no new dependency added without sign-off) ─

const ENTITIES = {
  '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&apos;': "'",
};

export function htmlToText(html) {
  if (!html) return '';
  let text = html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<(br|\/p|\/div|\/li|\/tr|\/h[1-6])\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '\n- ')
    .replace(/<[^>]+>/g, ' ');

  text = text.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)));
  for (const [entity, char] of Object.entries(ENTITIES)) {
    text = text.split(entity).join(char);
  }

  return text
    .split('\n').map(line => line.replace(/[ \t]+/g, ' ').trim()).filter(Boolean).join('\n')
    .trim();
}

export function hashText(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

export function truncateForLLM(text) {
  return text.slice(0, MAX_TEXT_CHARS);
}

// ── LLM classification ────────────────────────────────────────────────────────

function buildKnowledgeExtractionPrompt(title, normalizedText) {
  const systemPrompt = `You are SoorgaAI, classifying an internal company document to ground AI transformation strategy generation.

The whole point of this document is to make later generation sound like it was written by someone who actually read it — not a generic industry description. That means preserving the source's own vocabulary, not translating it into more common synonyms.

Given a document's title and text, produce:
1. docType — exactly one of: architecture, requirements, design, presentation, meeting_notes, other
2. summary — 3-5 sentences capturing the concrete, specific content (systems named, decisions made, requirements stated). REJECT any summary that would read the same if you swapped in a different company's document — it must be impossible to write without having read this exact text. Use the document's own proper nouns, system names, tool names, and process names verbatim (e.g. if the source says "Flash Execution Logs", write "Flash Execution Logs" — do not generalize it to "diagnostic logs"; if it says "OTA Manifest", keep "OTA Manifest" — do not write "configuration file"). Do not write a generic description.
3. keywords — 5-10 exact terms and phrases copied verbatim from the source text (system names, tool names, document names, process names) — not generic category labels. These are used later to ground generation in this document's actual vocabulary, so invented or generalized terms defeat the purpose.

OUTPUT — valid JSON only, no markdown fences:
{ "docType": "...", "summary": "...", "keywords": ["...", "..."] }`;

  const userMessage = `TITLE: ${title}\n\nTEXT:\n${truncateForLLM(normalizedText)}`;

  return { systemPrompt, userMessage };
}

export async function classifyDocument(title, normalizedText) {
  const { systemPrompt, userMessage } = buildKnowledgeExtractionPrompt(title, normalizedText);
  try {
    const result = await generate({ systemPrompt, userMessage, maxTokens: 600 });
    const cleaned = result.text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    const parsed  = JSON.parse(cleaned);
    const validTypes = ['architecture', 'requirements', 'design', 'presentation', 'meeting_notes', 'other'];
    return {
      docType:  validTypes.includes(parsed.docType) ? parsed.docType : 'other',
      summary:  typeof parsed.summary === 'string' ? parsed.summary.trim() : '',
      keywords: Array.isArray(parsed.keywords) ? parsed.keywords.filter(k => typeof k === 'string').slice(0, 10) : [],
    };
  } catch (err) {
    // Report the failure rather than absorbing it. Callers previously
    // could not tell an empty classification from a failed LLM call, and
    // stored the document as successfully extracted either way — which
    // then made the unchanged-skip refuse to ever retry it.
    console.warn(`[confluenceContent] Classification failed for "${title}" —`, err.message);
    return { docType: 'other', summary: '', keywords: [], failed: true, error: err.message };
  }
}
