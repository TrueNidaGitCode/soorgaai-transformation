/**
 * SoorgaAI — Confluence Extraction Service
 *
 * Orchestrates the fire-and-forget sync: list pages → fetch export_view HTML
 * → normalize to plain text → skip unchanged pages via contentHash → classify
 * via the existing generate() LLM abstraction → upsert KnowledgeDocument.
 *
 * Mirrors the fire-and-forget pattern used by generateTransformationAsync in
 * blueprintGenerationService.js — one bad page never aborts the whole sync.
 */

import crypto from 'crypto';
import ConfluenceConnection from '../models/ConfluenceConnection.js';
import KnowledgeDocument     from '../models/KnowledgeDocument.js';
import { generate } from './llmService.js';
import { getValidAccessToken, listPages, getPageContent } from './confluenceApiService.js';

const MAX_PAGES_PER_SYNC = parseInt(process.env.CONFLUENCE_MAX_PAGES_PER_SYNC || '200', 10);
const MAX_TEXT_CHARS     = 12_000; // truncation cap before the LLM call — no chunking exists in this codebase

// ── HTML → plain text (regex-based; no new dependency added without sign-off) ─

const ENTITIES = {
  '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&apos;': "'",
};

function htmlToText(html) {
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

function hashText(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

// ── LLM classification ────────────────────────────────────────────────────────

function buildKnowledgeExtractionPrompt(title, normalizedText) {
  const systemPrompt = `You are SoorgaAI, classifying an internal company document to ground AI transformation strategy generation.

Given a document's title and text, produce:
1. docType — exactly one of: architecture, requirements, design, presentation, meeting_notes, other
2. summary — 3-5 sentences capturing the concrete, specific content (systems named, decisions made, requirements stated). Do not write a generic description.
3. keywords — 5-10 short keywords/phrases useful for matching this document to a relevant business capability later

OUTPUT — valid JSON only, no markdown fences:
{ "docType": "...", "summary": "...", "keywords": ["...", "..."] }`;

  const userMessage = `TITLE: ${title}\n\nTEXT:\n${normalizedText.slice(0, MAX_TEXT_CHARS)}`;

  return { systemPrompt, userMessage };
}

async function classifyDocument(title, normalizedText) {
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
    console.warn(`[confluenceExtraction] Classification failed for "${title}", falling back to docType:'other' —`, err.message);
    return { docType: 'other', summary: '', keywords: [] };
  }
}

// ── Main orchestration ────────────────────────────────────────────────────────

export async function extractConfluenceKnowledgeAsync(orgName, spaceKeys, userId) {
  const connection = await ConfluenceConnection.findOne({ orgName });
  if (!connection) {
    console.error(`[confluenceExtraction] No connection found for org "${orgName}" — aborting sync`);
    return;
  }

  let sawError = false;
  let processedCount = 0;

  try {
    for (const spaceKey of spaceKeys) {
      if (processedCount >= MAX_PAGES_PER_SYNC) break;

      const accessToken = await getValidAccessToken(connection);
      const pages = await listPages(connection.cloudId, accessToken, spaceKey, {
        maxPages: MAX_PAGES_PER_SYNC - processedCount,
      });

      for (const pageStub of pages) {
        processedCount++;
        try {
          const accessTokenForPage = await getValidAccessToken(connection);
          const page = await getPageContent(connection.cloudId, accessTokenForPage, pageStub.id);
          const normalizedText = htmlToText(page.html);
          const contentHash = hashText(normalizedText);

          const existing = await KnowledgeDocument.findOne({ orgName, sourceId: page.id }).lean();
          if (existing && existing.contentHash === contentHash && existing.extractionStatus === 'extracted') {
            await KnowledgeDocument.updateOne({ _id: existing._id }, { $set: { lastSyncedAt: new Date() } });
            continue; // unchanged — skip the LLM call entirely
          }

          const classification = await classifyDocument(page.title, normalizedText);

          await KnowledgeDocument.updateOne(
            { orgName, sourceId: page.id },
            {
              $set: {
                orgName,
                source: 'confluence',
                sourceId: page.id,
                spaceKey,
                title: page.title,
                permalink: page.permalink,
                docType: classification.docType,
                summary: classification.summary,
                keywords: classification.keywords,
                rawText: normalizedText.slice(0, MAX_TEXT_CHARS),
                contentHash,
                confluenceLastModified: page.lastModified ? new Date(page.lastModified) : null,
                lastSyncedAt: new Date(),
                extractionStatus: 'extracted',
                extractionError: '',
                createdByUserId: userId,
              },
            },
            { upsert: true }
          );
        } catch (pageErr) {
          sawError = true;
          console.error(`[confluenceExtraction] Failed to extract page ${pageStub.id} ("${pageStub.title}") in space ${spaceKey}:`, pageErr.message);
          await KnowledgeDocument.updateOne(
            { orgName, sourceId: pageStub.id },
            {
              $set: {
                orgName, source: 'confluence', sourceId: pageStub.id, spaceKey,
                title: pageStub.title, extractionStatus: 'error', extractionError: pageErr.message,
                lastSyncedAt: new Date(), createdByUserId: userId,
              },
            },
            { upsert: true }
          );
        }
      }
    }

    connection.status = 'active';
    connection.lastSyncStatus = sawError ? 'partial_error' : 'success';
    connection.lastSyncedAt = new Date();
    connection.lastSyncError = '';
    await connection.save();
    console.log(`[confluenceExtraction] Sync complete for org "${orgName}" — ${processedCount} page(s) processed${sawError ? ' (with errors)' : ''}`);
  } catch (err) {
    console.error(`[confluenceExtraction] Sync failed for org "${orgName}":`, err.message);
    connection.status = 'error';
    connection.lastSyncStatus = 'error';
    connection.lastSyncError = err.message;
    connection.lastSyncedAt = new Date();
    await connection.save().catch(() => {});
  }
}

/**
 * Startup recovery — mirrors server.js's recoverStuckBlueprints() for syncs
 * left in 'syncing' by a crashed/redeployed server.
 */
export async function recoverStuckConfluenceSyncs() {
  const result = await ConfluenceConnection.updateMany(
    { lastSyncStatus: 'syncing' },
    { $set: { lastSyncStatus: 'error', lastSyncError: 'Sync interrupted by server restart.' } }
  );
  if (result.modifiedCount > 0) {
    console.log(`[startup] Recovered ${result.modifiedCount} stuck Confluence sync(s)`);
  }
}
