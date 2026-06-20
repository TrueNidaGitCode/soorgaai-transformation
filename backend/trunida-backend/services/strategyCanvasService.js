import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Navigate: services/ → trunida-backend/ → backend/ → project root → knowledge_base
const AI_STRATEGY_PATH = path.resolve(
  __dirname, '../../../knowledge_base/automotive/enterprise_ai/AI_Strategy'
);

// ── Filename mapping ──────────────────────────────────────────────────────────

function toFilename(capabilityName) {
  return capabilityName
    .replace(/&/g, '')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

function toCapabilityId(capabilityName) {
  return capabilityName
    .replace(/&/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .toLowerCase()
    .replace(/^-|-$/g, '');
}

// ── Spec parsing ──────────────────────────────────────────────────────────────

function extractCapabilities(specMarkdown) {
  // Find the Knowledge Architecture table (header row starts with "| Domain")
  const tableMatch = specMarkdown.match(
    /\| Domain\s*\|[^\n]+\n\|[-\s|]+\n((?:\|[^\n]+\n?)+)/
  );
  if (!tableMatch) return [];

  return tableMatch[1]
    .trim()
    .split('\n')
    .map(row => {
      const cells = row.split('|').map(c => c.trim()).filter(Boolean);
      return cells.length >= 2 ? { name: cells[0], objective: cells[1] } : null;
    })
    .filter(Boolean);
}

// ── Core doc parsing (numbered h1 pillars) ────────────────────────────────────

function parsePillarSections(markdown) {
  const lines = markdown.split('\n');
  const pillars = [];
  let current = null;
  let currentSub = null;
  let subsections = {};
  let subLines = [];

  function flushSub() {
    if (currentSub !== null) {
      subsections[currentSub] = subLines.join('\n').trim();
      currentSub = null;
      subLines = [];
    }
  }

  function flushPillar() {
    if (current) {
      flushSub();
      pillars.push({ title: current.title, subsections: { ...subsections } });
      current = null;
      subsections = {};
    }
  }

  for (const line of lines) {
    const numberedH1 = line.match(/^# (\d+)\.\s+(.+)/);
    const otherH1    = !numberedH1 && line.match(/^# .+/);
    const h2         = line.match(/^## (.+)/);

    if (numberedH1) {
      flushPillar();
      current = { title: numberedH1[2].trim() };
    } else if (otherH1 && current) {
      flushPillar();
    } else if (h2 && current) {
      flushSub();
      currentSub = h2[1].trim();
    } else if (currentSub !== null) {
      subLines.push(line);
    }
  }
  flushPillar();

  return pillars;
}

// ── Automotive doc parsing (h2 sections) ─────────────────────────────────────

function parseIndustrySections(markdown) {
  const lines = markdown.split('\n');
  const sections = [];
  let current = null;
  let contentLines = [];

  for (const line of lines) {
    const h2 = line.match(/^## (.+)/);
    if (h2) {
      if (current) sections.push({ ...current, content: contentLines.join('\n').trim() });
      current = { title: h2[1].trim() };
      contentLines = [];
    } else if (current) {
      contentLines.push(line);
    }
  }
  if (current) sections.push({ ...current, content: contentLines.join('\n').trim() });
  return sections;
}

// Match a Core pillar to an Automotive section by title containment
function findIndustryMatch(pillarTitle, industrySections) {
  const lower = pillarTitle.toLowerCase();
  return industrySections.find(s => s.title.toLowerCase().includes(lower)) || null;
}

// ── Automotive Blueprint extractor ────────────────────────────────────────────
// Extracts up to maxWords of paragraph prose from a markdown document,
// skipping headings, bullet lists, tables, blockquotes, and metadata lines.
// Used to generate the non-editable AUTOMOTIVE BLUEPRINT card per capability.

function extractParagraphText(markdown, maxWords = 200) {
  if (!markdown) return '';
  const lines = markdown.split('\n');
  const paras = [];
  let count = 0;
  for (const line of lines) {
    const t = line.trim();
    if (!t || t === '---') continue;
    if (t.startsWith('#')) continue;
    if (t.startsWith('> ')) continue;
    if (t.startsWith('|')) continue;
    if (t.startsWith('* ') || t.startsWith('- ')) continue;
    if (t.match(/^\d+\.\s/)) continue;
    // Skip standalone bold metadata labels (e.g. **Layer:** Automotive)
    if (t.match(/^\*\*[^*]+:\*\*/)) continue;
    // Skip pure italic lines (e.g. *Leadership Question text*)
    if (t.match(/^\*[^*].*\*$/)) continue;
    // Strip inline markdown formatting (* ** `)
    const clean = t
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/\*(.+?)\*/g, '$1')
      .replace(/`(.+?)`/g, '$1');
    paras.push(clean);
    count += clean.split(/\s+/).filter(Boolean).length;
    if (count >= maxWords) break;
  }
  return paras.join(' ').trim();
}

// ── Content extractors ────────────────────────────────────────────────────────

function extractBulletList(text) {
  return text
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.startsWith('* ') || l.startsWith('- '))
    .map(l => l.replace(/^[*\-]\s+/, ''));
}

function extractLeadershipQuestion(text) {
  const match = text.match(/\*\*(.+?)\*\*/s);
  return match ? match[1].trim() : text.replace(/\*\*/g, '').trim();
}

// ── In-memory cache for capabilities list ────────────────────────────────────

let _capabilitiesCache = null;

// ── Public API ────────────────────────────────────────────────────────────────

export function getCapabilities() {
  if (_capabilitiesCache) return _capabilitiesCache;

  const specPath = path.join(AI_STRATEGY_PATH, 'Core', 'AI_Strategy_Intelligence_Specification.md');
  const specContent = fs.readFileSync(specPath, 'utf-8');
  const raw = extractCapabilities(specContent);

  _capabilitiesCache = raw.map(({ name, objective }) => ({
    id:        toCapabilityId(name),
    name,
    objective,
  }));

  return _capabilitiesCache;
}

// ── Raw document readers (used by advisorService) ────────────────────────────

export function readCapabilityContent(capabilityId, industry = 'Automotive') {
  const capabilities = getCapabilities();
  const cap = capabilities.find(c => c.id === capabilityId);
  if (!cap) return { coreContent: '', industryContent: '', capabilityName: '' };

  const filename     = toFilename(cap.name);
  const corePath     = path.join(AI_STRATEGY_PATH, 'Core', `${filename}.md`);
  const industryPath = path.join(AI_STRATEGY_PATH, industry, `${industry}_${filename}.md`);

  let coreContent = '', industryContent = '';
  try { coreContent     = fs.readFileSync(corePath, 'utf-8');     } catch { /* missing */ }
  try { industryContent = fs.readFileSync(industryPath, 'utf-8'); } catch { /* missing */ }

  return { coreContent, industryContent, capabilityName: cap.name };
}

export function readSpecContent() {
  const specPath = path.join(AI_STRATEGY_PATH, 'Core', 'AI_Strategy_Intelligence_Specification.md');
  try { return fs.readFileSync(specPath, 'utf-8'); } catch { return ''; }
}

export function readRelatedCapabilityContent(excludeCapabilityId) {
  const capabilities = getCapabilities().filter(c => c.id !== excludeCapabilityId);
  return capabilities.map(cap => {
    const corePath = path.join(AI_STRATEGY_PATH, 'Core', `${toFilename(cap.name)}.md`);
    let content = '';
    try { content = fs.readFileSync(corePath, 'utf-8'); } catch { /* missing */ }
    return content ? { id: cap.id, name: cap.name, content } : null;
  }).filter(Boolean);
}

export function getCapabilityBlueprint(capabilityId, industry = 'Automotive') {
  const capabilities = getCapabilities();
  const cap = capabilities.find(c => c.id === capabilityId);
  if (!cap) throw new Error(`Capability not found: ${capabilityId}`);

  const filename     = toFilename(cap.name);
  const corePath     = path.join(AI_STRATEGY_PATH, 'Core', `${filename}.md`);
  const industryPath = path.join(AI_STRATEGY_PATH, industry, `${industry}_${filename}.md`);

  let coreContent     = '';
  let industryContent = '';

  try { coreContent     = fs.readFileSync(corePath, 'utf-8');     } catch { /* file missing */ }
  try { industryContent = fs.readFileSync(industryPath, 'utf-8'); } catch { /* file missing */ }

  const pillars         = parsePillarSections(coreContent);
  const industrySections = industryContent ? parseIndustrySections(industryContent) : [];

  const sections = pillars.map(pillar => {
    const match = findIndustryMatch(pillar.title, industrySections);
    // automotiveText: clean prose for the per-section Automotive Blueprint UI card.
    // Extracted from the matching industry section content (same source as industryContext)
    // using the shared extractParagraphText helper.
    const automotiveText = match ? extractParagraphText(match.content, 150) : '';
    return {
      title:              pillar.title,
      definition:         pillar.subsections['Definition']        || '',
      keyPrinciples:      extractBulletList(pillar.subsections['Key Principles']    || ''),
      leadershipQuestion: extractLeadershipQuestion(pillar.subsections['Leadership Question'] || ''),
      industryContext:    match ? match.content : null,
      automotiveText,
      source:             match ? 'both' : 'core',
    };
  });

  // Automotive Blueprint: capability-level industry prose (100-200 words).
  // Primary source is the industry doc; fall back to core doc if sparse.
  let automotiveBlueprint = extractParagraphText(industryContent, 200);
  if (automotiveBlueprint.split(/\s+/).filter(Boolean).length < 60) {
    const coreProse = extractParagraphText(coreContent, 150);
    automotiveBlueprint = [automotiveBlueprint, coreProse].filter(Boolean).join(' ').trim();
  }

  return {
    capabilityId,
    capabilityName: cap.name,
    industry,
    automotiveBlueprint,
    sections,
  };
}
