/**
 * SoorgaAI — Jira Content Service
 *
 * Normalize (ADF -> text) -> redact -> structure pipeline for the pipeline
 * wizard's Window 3 (Aria) — turns a real Jira issue into a DefectRecord.
 * Mirrors confluenceContentService.js's normalize-then-classify shape;
 * reuses its hashText/truncateForLLM rather than duplicating them.
 */

import { generate } from './llmService.js';
import { hashText, truncateForLLM } from './confluenceContentService.js';

export { hashText, truncateForLLM };

// ── ADF (Atlassian Document Format) → plain text ─────────────────────────────
// Jira descriptions/comments are structured JSON, not HTML — this is a
// generic depth-first walker over ADF's { type, content, text } node shape,
// not a full-spec ADF renderer (marks/media/tables collapse to plain text).

function adfNodeToLines(node, lines) {
  if (!node || typeof node !== 'object') return;

  if (node.type === 'text' && typeof node.text === 'string') {
    lines.push(node.text);
    return;
  }

  const BLOCK_TYPES = new Set(['paragraph', 'heading', 'listItem', 'codeBlock', 'blockquote']);
  const isBlock = BLOCK_TYPES.has(node.type);

  if (Array.isArray(node.content)) {
    const before = lines.length;
    for (const child of node.content) adfNodeToLines(child, lines);
    if (isBlock && lines.length > before) lines.push(''); // blank line after each block
  }
}

export function adfToText(adfDoc) {
  if (!adfDoc || typeof adfDoc !== 'object') return '';
  const lines = [];
  adfNodeToLines(adfDoc, lines);
  return lines.join(lines.length && lines[lines.length - 1] === '' ? '' : '\n')
    .split('\n').map(l => l.trim()).join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ── Redaction (deterministic, before anything reaches the LLM) ──────────────

const REDACTION_PATTERNS = [
  { label: 'email address',      re: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g },
  { label: 'phone number',       re: /\b(?:\+?\d{1,3}[-.\s]?)?\(?\d{3,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}\b/g },
  { label: 'IP address',         re: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g },
  { label: 'VIN-like identifier', re: /\b[A-HJ-NPR-Z0-9]{17}\b/g },
  { label: 'long token/secret',  re: /\b[A-Za-z0-9_-]{32,}\b/g },
];

/**
 * @param {string} text
 * @returns {{ redactedText: string, redactionNotes: string[] }}
 */
export function regexRedact(text) {
  let redactedText = text;
  const redactionNotes = [];

  for (const { label, re } of REDACTION_PATTERNS) {
    const matches = redactedText.match(re);
    if (matches?.length) {
      redactedText = redactedText.replace(re, `[REDACTED ${label.toUpperCase()}]`);
      redactionNotes.push(`${matches.length} ${label}${matches.length > 1 ? 's' : ''} redacted`);
    }
  }

  return { redactedText, redactionNotes };
}

// ── LLM structuring ───────────────────────────────────────────────────────────

function buildStructuringPrompt(issueMeta, redactedText) {
  const systemPrompt = `You are Svarg, structuring a real Jira defect ticket into a standardized record for an AI defect-matching system. Preserve the ticket's own vocabulary — proper nouns, system names, component names — verbatim rather than generalizing them.

Given a Jira issue's metadata and its (already redacted) description/comments, produce:
1. title — a short, specific title (reuse the issue summary if it's already good).
2. symptom — 1-3 sentences describing the observed failure, in language a new similar failure could be matched against. Do not include the root cause here.
3. rootCause — the confirmed or most-likely root cause, based only on what's actually in the ticket. If the issue is still open/unresolved, say so plainly ("Not yet determined — issue still open") rather than inventing one.
4. resolution — what was/would be done to fix it. Same rule: say "Not yet resolved" if the ticket doesn't show one.
5. component — the specific system/subsystem this defect belongs to, in the ticket's own terms.
6. severity — one of: low, medium, high, critical — inferred from the ticket's priority field and content.
7. keywords — 3-8 exact terms copied verbatim from the ticket (system names, error codes, component names).

OUTPUT — valid JSON only, no markdown fences:
{ "title": "...", "symptom": "...", "rootCause": "...", "resolution": "...", "component": "...", "severity": "...", "keywords": ["...", "..."] }`;

  const userMessage = `ISSUE KEY: ${issueMeta.key}
SUMMARY: ${issueMeta.summary}
STATUS: ${issueMeta.status}
PRIORITY: ${issueMeta.priority}
RESOLUTION FIELD: ${issueMeta.resolution || '(none — issue open or unresolved)'}

DESCRIPTION AND COMMENTS (redacted):
${truncateForLLM(redactedText)}`;

  return { systemPrompt, userMessage };
}

const VALID_SEVERITIES = ['low', 'medium', 'high', 'critical'];

export async function structureDefectFromIssue(issueMeta, redactedText) {
  const { systemPrompt, userMessage } = buildStructuringPrompt(issueMeta, redactedText);
  try {
    const result = await generate({ systemPrompt, userMessage, maxTokens: 600, label: 'aria:classify-jira' });
    const cleaned = result.text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    const parsed = JSON.parse(cleaned);
    return {
      title:      typeof parsed.title === 'string' ? parsed.title.trim() : issueMeta.summary,
      symptom:    typeof parsed.symptom === 'string' ? parsed.symptom.trim() : '',
      rootCause:  typeof parsed.rootCause === 'string' ? parsed.rootCause.trim() : 'Not yet determined.',
      resolution: typeof parsed.resolution === 'string' ? parsed.resolution.trim() : 'Not yet resolved.',
      component:  typeof parsed.component === 'string' ? parsed.component.trim() : '',
      severity:   VALID_SEVERITIES.includes(parsed.severity) ? parsed.severity : 'medium',
      keywords:   Array.isArray(parsed.keywords) ? parsed.keywords.filter(k => typeof k === 'string').slice(0, 8) : [],
    };
  } catch (err) {
    console.warn(`[jiraContent] Structuring failed for "${issueMeta.key}", falling back to raw fields —`, err.message);
    return {
      title: issueMeta.summary, symptom: redactedText.slice(0, 500), rootCause: 'Not yet determined.',
      resolution: 'Not yet resolved.', component: '', severity: 'medium', keywords: [],
    };
  }
}
