/**
 * SoorgaAI — Industry Capability Knowledge Service
 *
 * Auto-generates full Industry-overlay KB coverage (one document per
 * capability, across every domain) for an industry that has none yet — so
 * adding a company to the admin Company Research Library never requires a
 * manual industry picker or hand-authored KB files ahead of time. Mirrors
 * industryVerticalKnowledgeService.js's shell -> research -> draft ->
 * admin-approve lifecycle, with one deliberate divergence: approved content
 * here is also written out as a real .md file under knowledge_base/, so
 * strategyCanvasService.js's getDomainCapabilityBlueprint() reads it back
 * with zero further code changes — everywhere else in the codebase reads
 * that folder, nothing else writes to it.
 *
 * Generation is a real, non-trivial OpenAI cost (~16 web-search-grounded
 * calls per new industry) — so it never fires automatically. Creating a
 * company only ever creates the (free) capability shell; an admin must
 * explicitly kick off generation via triggerGeneration, from the "Generate
 * Industry KB" button on industry-kb.html.
 *
 * Public API:
 *   ensureIndustryCoverage(industry, createdByUserId)
 *     Idempotent, cost-free. Returns the existing entry immediately if
 *     status is 'ready' (coverage already exists) or 'generating' (already
 *     in flight). Otherwise builds the capability shell (seeding any
 *     capability that already has a hand-authored file on disk as
 *     'published' for free) and leaves it 'pending' — does NOT start
 *     generation.
 *
 *   triggerGeneration(industryKnowledgeId)
 *     Explicit, admin-initiated. Starts generateIndustryCapabilityKnowledge
 *     in the background for a 'pending' entry; no-op if already generating
 *     or nothing left to generate.
 *
 *   generateIndustryCapabilityKnowledge(industryKnowledgeId)
 *     Fire-and-forget. Serially researches+drafts every 'pending' capability
 *     via companyResearchService.js's researchIndustryCapability, updating
 *     progress as it goes (polled by the SSE stream in the controller).
 *
 *   approveCapability(industryKnowledgeId, capabilityId, updatedByUserId, editedContent?)
 *     Admin review action: draftContent -> content, written to the real .md
 *     file path and marked 'published'.
 *
 *   discardCapabilityDraft(industryKnowledgeId, capabilityId)
 *   getEntry(industryKnowledgeId) / listEntries()
 *
 *   listKnownIndustries() / resolveIndustry(rawIndustry)
 *     Dedup support for companyResearchLibraryService.js's auto-detection —
 *     see resolveIndustry's own comment for why this exists (LLM-detected
 *     industry labels aren't perfectly consistent between calls, e.g.
 *     "Semiconductor" vs "Semiconductors" for two different companies in the
 *     same real industry — left uncaught, that creates a second, fully
 *     wasted ~16-call generation batch for what's really the same industry).
 */

import fs   from 'fs';
import path from 'path';

import IndustryCapabilityKnowledge from '../models/IndustryCapabilityKnowledge.js';
import { DOMAINS } from '../config/domainRegistry.js';
import { getDomainCapabilities, KB_ENTERPRISE_ROOT, toFilename } from './strategyCanvasService.js';
import { researchIndustryCapability, INDUSTRY_KB_SECTION_TITLES } from './companyResearchService.js';

export function normalizeIndustry(industry) {
  return String(industry || '').trim().toLowerCase();
}

function publishedPathFor(domainKbPath, industry, capabilityName) {
  return path.join(KB_ENTERPRISE_ROOT, domainKbPath, industry, `${industry}_${toFilename(capabilityName)}.md`);
}

// ── Shell creation ────────────────────────────────────────────────────────────

function buildCapabilityShell(industry) {
  const capabilities = [];
  for (const domain of DOMAINS) {
    for (const cap of getDomainCapabilities(domain.kbPath)) {
      const entry = {
        capabilityId:   cap.id,
        capabilityName: cap.name,
        domainKbPath:   domain.kbPath,
        status:         'pending',
      };
      // Idempotent with hand-authored KB content: if a file already exists
      // at the path this industry/capability would be published to (e.g.
      // Automotive's hand-written files), seed it as already-published
      // instead of queuing a wasted generation call.
      const existingPath = publishedPathFor(domain.kbPath, industry, cap.name);
      if (fs.existsSync(existingPath)) {
        entry.status        = 'published';
        entry.content        = fs.readFileSync(existingPath, 'utf-8');
        entry.publishedAt    = new Date();
        entry.publishedPath  = existingPath;
      }
      capabilities.push(entry);
    }
  }
  return capabilities;
}

// ── Section assembly — deterministic, not LLM-authored markdown ────────────────
// researchIndustryCapability returns structured { sections: [{title, content}] }
// (see companyResearchService.js's INDUSTRY_KB_SECTION_TITLES) — this maps
// each fixed title to its heading text and assembles the final .md file, so
// parsing behavior downstream stays predictable regardless of what the model
// wrote inside each section.

const SECTION_HEADINGS = (industry) => ({
  'Purpose':                        '# Purpose',
  'Business Context':               `# ${industry} Business Context`,
  'Business Challenges':            `# Typical ${industry} Business Challenges`,
  'Workflows':                      `# Typical ${industry} Workflows`,
  'Common High-Effort Activities':  '# Common High-Effort Activities',
  'Typical Opportunities':          '# Typical AI Opportunities',
  'Principles':                     `# ${industry} Principles`,
  'Leadership Question':            '# Leadership Question',
});

function assembleMarkdown({ industry, capabilityName, filename, sections }) {
  const headings = SECTION_HEADINGS(industry);
  const byTitle   = new Map(sections.map(s => [s.title, s.content]));

  const body = INDUSTRY_KB_SECTION_TITLES
    .filter(title => byTitle.has(title))
    .map(title => `${headings[title]}\n\n${byTitle.get(title)}`)
    .join('\n\n---\n\n');

  return `# ${industry} ${capabilityName}
**Layer:** ${industry}
**Extends:** Core/${filename}.md
**Version:** 1.0

---

${body}
`;
}

// ── Coverage check ───────────────────────────────────────────────────────────

export async function ensureIndustryCoverage(industry, createdByUserId) {
  const industryNormalized = normalizeIndustry(industry);
  if (!industryNormalized) throw new Error('industry is required.');

  const existing = await IndustryCapabilityKnowledge.findOne({ industryNormalized });
  if (existing && (existing.status === 'ready' || existing.status === 'generating')) {
    return existing; // already covered, or already being generated — skip
  }

  let doc = existing;
  if (!doc) {
    const capabilities = buildCapabilityShell(industry);
    const allPublished = capabilities.every(c => c.status === 'published');
    doc = await IndustryCapabilityKnowledge.create({
      industry,
      industryNormalized,
      status: allPublished ? 'ready' : 'pending',
      progress: { total: capabilities.length, completed: capabilities.filter(c => c.status === 'published').length, currentCapability: '' },
      createdByUserId,
      capabilities,
    });
    console.log(`[IndustryCapabilityKnowledge] Shell created for "${industry}" (${capabilities.length} capabilities, ${capabilities.filter(c => c.status === 'published').length} already published)`);
  }

  // Deliberately does NOT auto-fire generation: a new industry means a ~16-call
  // web-search-grounded generation batch (real, non-trivial OpenAI cost), so
  // it stays 'pending' until an admin explicitly kicks it off via
  // triggerGeneration — see industry-kb.html's "Generate Industry KB" button.
  // Company creation itself still completes instantly either way.
  return doc;
}

/**
 * Explicit, admin-triggered start of the generation batch for a 'pending'
 * industry entry. Separate from ensureIndustryCoverage on purpose — that
 * function only ever creates the shell; a human decides when to actually
 * spend the ~16 web-search-grounded calls.
 */
export async function triggerGeneration(industryKnowledgeId) {
  const doc = await IndustryCapabilityKnowledge.findById(industryKnowledgeId);
  if (!doc) throw new Error('Industry capability knowledge entry not found.');
  if (doc.status === 'generating') return doc; // already running, no-op

  const hasPending = doc.capabilities.some(c => c.status === 'pending');
  if (!hasPending) return doc; // nothing left to generate

  generateIndustryCapabilityKnowledge(doc._id)
    .catch(err => console.error(`[IndustryCapabilityKnowledge] Generation failed for "${doc.industry}" (non-fatal):`, err.message));

  doc.status = 'generating';
  await doc.save();
  return doc;
}

// ── Generation job ────────────────────────────────────────────────────────────

export async function generateIndustryCapabilityKnowledge(industryKnowledgeId) {
  const doc = await IndustryCapabilityKnowledge.findById(industryKnowledgeId);
  if (!doc) throw new Error('Industry capability knowledge entry not found.');

  doc.status = 'generating';
  await doc.save();

  const now = new Date();

  // Serial, not parallel — progress is a load-mutate-save on this one Mongo
  // document per capability; concurrent saves would race and clobber
  // progress.completed/currentCapability.
  for (const cap of doc.capabilities) {
    if (cap.status !== 'pending') continue;

    doc.progress.currentCapability = cap.capabilityName;
    await doc.save();

    const domainName = DOMAINS.find(d => d.kbPath === cap.domainKbPath)?.name || cap.domainKbPath;

    let coreDefinition = '';
    try {
      const kbCap = getDomainCapabilities(cap.domainKbPath).find(c => c.id === cap.capabilityId);
      coreDefinition = kbCap?.objective || '';
    } catch {
      // best-effort context only — generation still proceeds without it
    }

    // Backstop on top of researchIndustryCapability's own SDK-level timeout
    // (companyResearchService.js): this loop is serial by design (see the
    // comment on generateIndustryCapabilityKnowledge above), so a single
    // hung call would otherwise stall every remaining capability behind it
    // indefinitely, not just fail the one it belongs to.
    const result = await Promise.race([
      researchIndustryCapability({ industry: doc.industry, capabilityName: cap.capabilityName, domainName, objective: coreDefinition }),
      new Promise(resolve => setTimeout(() => resolve(null), 150_000)),
    ]).catch(() => null);

    if (result?.sections?.length) {
      cap.draftContent = assembleMarkdown({
        industry:       doc.industry,
        capabilityName: cap.capabilityName,
        filename:       toFilename(cap.capabilityName),
        sections:       result.sections,
      });
      cap.draftSource = result.confidence === 'high' ? 'external-research' : 'external-research-limited';
      cap.draftedAt   = now;
      cap.status      = 'draft';
    } else {
      cap.status = 'failed';
      cap.error  = 'Generation returned no usable content.';
    }

    doc.progress.completed += 1;
    await doc.save();
  }

  doc.progress.currentCapability = '';
  const anyDraftOrPublished = doc.capabilities.some(c => c.status === 'draft' || c.status === 'published');
  doc.status = anyDraftOrPublished ? 'partial' : 'error';
  await doc.save();

  console.log(`[IndustryCapabilityKnowledge] Generation finished for "${doc.industry}" — status: ${doc.status}`);
  return doc;
}

// ── Review — approve or discard a draft ────────────────────────────────────────

function recomputeStatus(doc) {
  if (doc.capabilities.every(c => c.status === 'published')) {
    doc.status = 'ready';
  } else if (doc.capabilities.some(c => c.status === 'draft' || c.status === 'published')) {
    doc.status = 'partial';
  }
}

export async function approveCapability(industryKnowledgeId, capabilityId, updatedByUserId, editedContent) {
  const doc = await IndustryCapabilityKnowledge.findById(industryKnowledgeId);
  if (!doc) throw new Error('Industry capability knowledge entry not found.');

  const cap = doc.capabilities.find(c => c.capabilityId === capabilityId);
  if (!cap) throw new Error('Capability not found.');
  if (!cap.draftContent) throw new Error('No draft content to approve.');

  const content = (editedContent ?? cap.draftContent).trim();
  const targetPath = publishedPathFor(cap.domainKbPath, doc.industry, cap.capabilityName);

  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, content, 'utf-8');

  cap.content       = content;
  cap.status        = 'published';
  cap.publishedAt   = new Date();
  cap.publishedPath = targetPath;
  cap.draftContent  = '';
  cap.draftSource   = '';
  cap.draftedAt     = null;
  cap.updatedAt     = new Date();
  cap.updatedBy     = updatedByUserId;

  recomputeStatus(doc);
  await doc.save();

  console.log(`[IndustryCapabilityKnowledge] Published "${cap.capabilityName}" for "${doc.industry}" -> ${targetPath}`);
  return doc;
}

export async function discardCapabilityDraft(industryKnowledgeId, capabilityId) {
  const doc = await IndustryCapabilityKnowledge.findById(industryKnowledgeId);
  if (!doc) throw new Error('Industry capability knowledge entry not found.');

  const cap = doc.capabilities.find(c => c.capabilityId === capabilityId);
  if (!cap) throw new Error('Capability not found.');

  cap.draftContent = '';
  cap.draftSource   = '';
  cap.draftedAt     = null;
  cap.status        = cap.content ? 'published' : 'pending'; // allow retry via generation

  await doc.save();
  return doc;
}

// ── Reads ─────────────────────────────────────────────────────────────────────

export async function getEntry(industryKnowledgeId) {
  const doc = await IndustryCapabilityKnowledge.findById(industryKnowledgeId).lean();
  if (!doc) throw new Error('Industry capability knowledge entry not found.');
  return doc;
}

export async function listEntries() {
  return IndustryCapabilityKnowledge.find({})
    .select('industry status progress createdAt')
    .sort({ createdAt: -1 })
    .lean();
}

// ── Dedup support ─────────────────────────────────────────────────────────────

export async function listKnownIndustries() {
  const docs = await IndustryCapabilityKnowledge.find({}).select('industry').lean();
  return docs.map(d => d.industry);
}

function stripTrailingS(s) {
  return s.length > 1 && s.endsWith('s') ? s.slice(0, -1) : s;
}

/**
 * Deterministic, zero-cost backstop against near-duplicate industry labels
 * that detectCompanyIndustry might still produce despite being shown the
 * known-industries list (e.g. "Semiconductor" vs "Semiconductors" — a plain
 * exact-string match wouldn't catch that, and each would otherwise get its
 * own full, wasted ~16-call generation batch for the same real industry).
 *
 * Exact match first, then a simple singular/plural-tolerant comparison.
 * Returns the EXISTING canonical label if a match is found, so the caller
 * (companyResearchLibraryService.js's createLibraryEntry) stores and
 * generates against the same industry every existing company already uses
 * — otherwise returns the input unchanged (a genuinely new industry).
 */
export async function resolveIndustry(rawIndustry) {
  const raw = String(rawIndustry || '').trim();
  if (!raw) return raw;

  const known   = await listKnownIndustries();
  const rawNorm = normalizeIndustry(raw);

  for (const candidate of known) {
    const candNorm = normalizeIndustry(candidate);
    if (candNorm === rawNorm || stripTrailingS(candNorm) === stripTrailingS(rawNorm)) {
      return candidate;
    }
  }
  return raw;
}
