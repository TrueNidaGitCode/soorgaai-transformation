/**
 * Svarg — Website knowledge source
 *
 * The third Aria connector, and the only one a newly-founded company can
 * actually use. Confluence and Jira assume an established engineering
 * organisation; a startup has neither, which left Aria with nothing to
 * connect and no way forward.
 *
 * Pages are stored as LinkedProjectDocument rows with sourceType 'website',
 * so everything downstream — redaction, classification, chunking,
 * embedding, retrieval — is reused rather than rebuilt.
 *
 * POST /api/website/link      { blueprintId, url }  → read and link a site
 * GET  /api/website/linked/:blueprintId             → what is linked
 * DELETE /api/website/linked/:blueprintId/:docId    → remove one page
 */

import TransformationBlueprint from '../models/TransformationBlueprint.js';
import LinkedProjectDocument from '../models/LinkedProjectDocument.js';
import CompanyWebsitePage from '../models/CompanyWebsitePage.js';
import UserProfile from '../models/UserProfile.js';
import { readCompanySite } from '../services/websiteService.js';
import { regexRedact, hashText } from '../services/jiraContentService.js';
import { classifyDocument } from '../services/confluenceContentService.js';

function auditLog(action, userId, extra = {}) {
  console.log(JSON.stringify({ audit: 'WebsiteSource', action, userId: String(userId), ts: new Date().toISOString(), ...extra }));
}

/** A blueprintId from a request body proves nothing on its own. */
async function ownedBlueprint(blueprintId, userId) {
  if (!blueprintId) return null;
  return TransformationBlueprint.findOne({ _id: blueprintId, userId }).lean().catch(() => null);
}

// ── POST /api/website/company ────────────────────────────────────────────────

/**
 * Import the company's own website at profile setup, before any blueprint
 * exists. This is what makes Company Context a reading of the company rather
 * than an invention from its name.
 *
 * Returns 200 with per-page results even when some pages fail: a partially
 * imported site is still far better context than none, and profile setup
 * must not be blocked by one unreadable page.
 */
export async function linkCompanyWebsite(req, res) {
  try {
    const { url } = req.body || {};
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'A website address is required.' });
    }

    let site;
    try {
      site = await readCompanySite(url);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
    if (!site.pages.length) {
      return res.status(400).json({ error: 'Nothing readable was found at that address.' });
    }

    const results = [];
    for (const page of site.pages) {
      try {
        const contentHash = hashText(page.text);
        const existing = await CompanyWebsitePage.findOne({ userId: req.user._id, url: page.url });
        if (existing && existing.contentHash === contentHash) {
          results.push({ url: page.url, title: page.title, status: 'unchanged' });
          continue;
        }

        const { redactedText, redactionNotes } = regexRedact(page.text);
        const classified = await classifyDocument(page.title, redactedText);

        await CompanyWebsitePage.updateOne(
          { userId: req.user._id, url: page.url },
          {
            $set: {
              title: page.title,
              rawText: redactedText,
              summary: classified?.summary || '',
              keywords: classified?.keywords || [],
              extractionStatus: classified?.summary ? 'extracted' : 'error',
              extractionError: classified?.summary ? '' : 'Classification returned no summary.',
              redactionApplied: redactionNotes.length > 0,
              redactionCount: redactionNotes.length,
              redactionNotes,
              contentHash,
            },
          },
          { upsert: true }
        );
        results.push({ url: page.url, title: page.title, status: classified?.summary ? 'linked' : 'error' });
      } catch (err) {
        results.push({ url: page.url, title: page.title, status: 'error', error: err.message.slice(0, 160) });
      }
    }

    // Remember the address so the field can be shown filled in on return.
    await UserProfile.updateOne({ userId: req.user._id }, { $set: { websiteUrl: site.origin } })
      .catch(err => console.warn('[website] could not record websiteUrl —', err.message));

    auditLog('COMPANY_LINKED', req.user._id, { origin: site.origin, pages: results.length });
    return res.json({ origin: site.origin, results });
  } catch (err) {
    console.error('[website] company link error:', err.message);
    return res.status(500).json({ error: 'Failed to read that website.' });
  }
}

/** GET /api/website/company — what has been imported for this user. */
export async function getCompanyWebsite(req, res) {
  try {
    const pages = await CompanyWebsitePage
      .find({ userId: req.user._id }, { url: 1, title: 1, summary: 1, keywords: 1, extractionStatus: 1, updatedAt: 1 })
      .sort({ createdAt: 1 }).lean();
    const profile = await UserProfile.findOne({ userId: req.user._id }, { websiteUrl: 1 }).lean();
    return res.json({ websiteUrl: profile?.websiteUrl || '', pages });
  } catch (err) {
    console.error('[website] company get error:', err.message);
    return res.status(500).json({ error: 'Failed to load the company website.' });
  }
}

// ── POST /api/website/link ───────────────────────────────────────────────────

export async function linkWebsite(req, res) {
  try {
    const { blueprintId, url } = req.body || {};

    const bp = await ownedBlueprint(blueprintId, req.user._id);
    if (!bp) return res.status(404).json({ error: 'Blueprint not found.' });
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'A website address is required.' });
    }

    let site;
    try {
      site = await readCompanySite(url);
    } catch (err) {
      // These messages are written to be shown to the user — they say what
      // is wrong with the address rather than leaking anything about the
      // server's own network.
      return res.status(400).json({ error: err.message });
    }

    if (!site.pages.length) {
      return res.status(400).json({ error: 'Nothing readable was found at that address.' });
    }

    const results = [];
    for (const page of site.pages) {
      try {
        const contentHash = hashText(page.text);
        const existing = await LinkedProjectDocument.findOne({
          blueprintId: bp._id, sourceType: 'website', sourceId: page.url,
        });

        // Unchanged content costs nothing to skip, and classification is the
        // expensive part — one LLM call per page.
        if (existing && existing.contentHash === contentHash) {
          results.push({ url: page.url, title: page.title, status: 'unchanged' });
          continue;
        }

        // A public marketing page rarely contains personal data, but a team
        // or contact page routinely does. Redact on the same path as
        // everything else rather than assuming public means safe.
        const { redactedText, redactionNotes } = regexRedact(page.text);
        const classified = await classifyDocument(page.title, redactedText);

        await LinkedProjectDocument.updateOne(
          { blueprintId: bp._id, sourceType: 'website', sourceId: page.url },
          {
            $set: {
              linkedByUserId: req.user._id,
              title: page.title,
              permalink: page.url,
              rawText: redactedText,
              summary: classified?.summary || '',
              keywords: classified?.keywords || [],
              extractionStatus: classified?.summary ? 'extracted' : 'error',
              extractionError: classified?.summary ? '' : 'Classification returned no summary.',
              redactionApplied: redactionNotes.length > 0,
              redactionCount: redactionNotes.length,
              redactionNotes,
              contentHash,
            },
          },
          { upsert: true }
        );

        results.push({
          url: page.url, title: page.title,
          status: classified?.summary ? 'linked' : 'error',
          keywords: classified?.keywords?.length || 0,
        });
      } catch (err) {
        results.push({ url: page.url, title: page.title, status: 'error', error: err.message.slice(0, 160) });
      }
    }

    const linked = results.filter(r => r.status === 'linked').length;
    auditLog('LINKED', req.user._id, { blueprintId: String(bp._id), origin: site.origin, pages: results.length, linked });

    return res.json({ origin: site.origin, results });
  } catch (err) {
    console.error('[website] link error:', err.message);
    return res.status(500).json({ error: 'Failed to read that website.' });
  }
}

// ── GET /api/website/linked/:blueprintId ─────────────────────────────────────

export async function listLinkedWebsite(req, res) {
  try {
    const bp = await ownedBlueprint(req.params.blueprintId, req.user._id);
    if (!bp) return res.status(404).json({ error: 'Blueprint not found.' });

    const documents = await LinkedProjectDocument
      .find({ blueprintId: bp._id, sourceType: 'website' },
        { title: 1, permalink: 1, summary: 1, keywords: 1, extractionStatus: 1, redactionCount: 1, updatedAt: 1 })
      .sort({ createdAt: 1 })
      .lean();

    return res.json({ documents });
  } catch (err) {
    console.error('[website] list error:', err.message);
    return res.status(500).json({ error: 'Failed to list linked pages.' });
  }
}

// ── DELETE /api/website/linked/:blueprintId/:docId ───────────────────────────

export async function unlinkWebsitePage(req, res) {
  try {
    const bp = await ownedBlueprint(req.params.blueprintId, req.user._id);
    if (!bp) return res.status(404).json({ error: 'Blueprint not found.' });

    const result = await LinkedProjectDocument.deleteOne({
      _id: req.params.docId, blueprintId: bp._id, sourceType: 'website',
    });
    if (!result.deletedCount) return res.status(404).json({ error: 'That page is not linked.' });

    auditLog('UNLINKED', req.user._id, { blueprintId: String(bp._id), docId: req.params.docId });
    return res.json({ success: true });
  } catch (err) {
    console.error('[website] unlink error:', err.message);
    return res.status(500).json({ error: 'Failed to remove that page.' });
  }
}
