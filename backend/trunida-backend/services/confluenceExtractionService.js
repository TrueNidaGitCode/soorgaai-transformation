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

import ConfluenceConnection from '../models/ConfluenceConnection.js';
import KnowledgeDocument     from '../models/KnowledgeDocument.js';
import { getValidAccessToken, listPages, getPageContent } from './confluenceApiService.js';
import { htmlToText, hashText, truncateForLLM, classifyDocument } from './confluenceContentService.js';
import { syncConfluenceDocToChunk } from './hybridRetrievalService.js';

const MAX_PAGES_PER_SYNC = parseInt(process.env.CONFLUENCE_MAX_PAGES_PER_SYNC || '200', 10);

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
                rawText: truncateForLLM(normalizedText),
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

          // Non-blocking: an embedding hiccup should never fail a Confluence sync.
          syncConfluenceDocToChunk({
            orgName, sourceId: page.id, title: page.title,
            docType: classification.docType, summary: classification.summary, keywords: classification.keywords,
          }).catch(err => console.error(`[confluenceExtraction] Chunk sync failed for page ${page.id} (non-fatal):`, err.message));
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
