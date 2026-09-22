/**
 * Svarg — where a customer's data lives, by industry
 *
 * A sports academy runs on a folder of spreadsheets and WhatsApp; a software
 * team on Jira and Confluence. That is knowledge, and it sits in the industry
 * overlay: each Critical Data Identification document may carry a
 * ```json sources``` block naming the sources in the order they should be
 * connected. Two things read it:
 *
 *   - Cob, when it writes the blueprint: typicalSource on each dataset names
 *     one of these, not a tool that is common somewhere else (see
 *     datasetSourceGuidance in blueprintGenerationService).
 *   - Eame, when it builds the application: the Data page opens on these
 *     sources (data/sources.json), and only the connector modules they call
 *     for are shipped. The connector code itself is Svarg's, in
 *     eame-template/services/connectors/, one file per kind; this is the
 *     catalog that says which of them an application gets.
 *
 * An industry with no block gets sources derived from the blueprint's own
 * typicalSource strings, and failing that a folder and a file -- true of
 * every business.
 */
import fs from 'fs';
import path from 'path';
import { KB_ENTERPRISE_ROOT } from './strategyCanvasService.js';
import { readDatasets } from './eameSpec.js';

/** Kinds the Data page knows how to draw. Anything else in a block is dropped. */
export const SOURCE_KINDS = ['folder', 'whatsapp', 'form', 'jira', 'confluence', 'github', 'file', 'database'];

/**
 * The connector modules, by the source kind that needs them. A kind with no
 * module (folder, whatsapp export, form) is handled on the Data page itself.
 * Paths are inside the template; the builder ships exactly these.
 */
export const CONNECTOR_MODULES = {
  jira:       'services/connectors/jira.js',
  confluence: 'services/connectors/confluence.js',
  github:     'services/connectors/github.js',
  // The Business account, through the owner's own Meta app; the export is
  // parsed on the Data page and needs no module.
  whatsapp:   'services/connectors/whatsapp.js',
  // Svarg's own operations, for the one tenant Svarg runs itself on. Named
  // here so it can be asked for; not in ALWAYS_SHIPPED, so no customer's
  // application is offered a source it will only ever be refused.
  svarg:      'services/connectors/svarg.js',
  // Every business keeps its records somewhere, and for most of them that
  // somewhere is a database another vendor's software writes to. So this
  // kind is not chosen per industry: it is in ALWAYS_SHIPPED, and the card
  // is added to every application's list by sourcesForBlueprint.
  database:   'services/connectors/database.js',
};

function normalise(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const s of list) {
    const kind = String(s?.kind || '').toLowerCase().trim();
    if (!SOURCE_KINDS.includes(kind) || out.some(o => o.kind === kind)) continue;
    out.push({
      kind,
      label: String(s.label || kind).slice(0, 80),
      providers: Array.isArray(s.providers) ? s.providers.map(p => String(p).toLowerCase()).slice(0, 6) : [],
      holds: Array.isArray(s.holds) ? s.holds.map(h => String(h).toLowerCase()).slice(0, 12) : [],
      note: String(s.note || '').slice(0, 600),
    });
  }
  return out;
}

/** The overlay's sources block for an industry, or [] when it has none. */
export function industrySources(industry) {
  const name = String(industry || '').trim();
  if (!name) return [];
  const dir = path.join(KB_ENTERPRISE_ROOT, 'Data_Readiness', name);
  let files = [];
  try { files = fs.readdirSync(dir).filter(f => /Critical_Data_Identification\.md$/i.test(f)); } catch { return []; }
  for (const f of files) {
    let text = '';
    try { text = fs.readFileSync(path.join(dir, f), 'utf8'); } catch { continue; }
    const m = text.match(/```json\s+sources\s*\n([\s\S]*?)\n```/i);
    if (!m) continue;
    try { return normalise(JSON.parse(m[1])); } catch (err) {
      console.warn(`[sources] ${name}: the sources block is not valid JSON — ${err.message}`);
    }
  }
  return [];
}

/**
 * Sources read off the blueprint's own datasets when the industry says
 * nothing: what each typicalSource string names, in the order the datasets
 * come. "Excel", "Google Sheet", "spreadsheet", "Drive" all mean a folder.
 */
export function sourcesFromDatasets(datasets = []) {
  const found = [];
  const add = (kind, label, note) => { if (!found.some(f => f.kind === kind)) found.push({ kind, label, providers: kind === 'whatsapp' ? ['export'] : ['upload'], holds: [], note }); };
  for (const d of datasets) {
    const t = String(d?.typicalSource || '').toLowerCase();
    if (!t) continue;
    if (/whatsapp/.test(t)) add('whatsapp', 'WhatsApp', 'Export the chat, without media, and import it here.');
    if (/excel|xlsx|spreadsheet|google sheet|sheets|drive|onedrive|csv|folder/.test(t)) add('folder', 'Your folder of spreadsheets', 'Upload the folder; each sheet is matched to what the application expects.');
    if (/jira/.test(t)) add('jira', 'Jira', '');
    if (/confluence/.test(t)) add('confluence', 'Confluence', '');
    if (/github|gitlab|bitbucket/.test(t)) add('github', 'GitHub', '');
    if (/form/.test(t)) add('form', 'A form', 'Its responses sheet belongs in your folder.');
  }
  return found;
}

/** Offered by every application, whatever its industry says. */
const DATABASE_SOURCE = {
  kind: 'database', label: 'Your database', providers: ['connect'], holds: [],
  note: 'Read straight from the database your software already writes to.',
};

const DEFAULT_SOURCES = [
  { kind: 'folder', label: 'Your folder of spreadsheets', providers: ['upload'], holds: [], note: 'Upload the folder your records are kept in; each sheet is matched to what the application expects.' },
];

/**
 * The sources for one blueprint: the industry's, else the datasets', else
 * the default. When the industry has a block, the block is the list: it is
 * knowledge of how the industry works, and a dataset whose typicalSource
 * happens to say "repository" does not put a GitHub card in front of a
 * cricket academy.
 */
export function sourcesForBlueprint(bp) {
  const industry = bp?.industryFit?.industry || '';
  const fromIndustry = industrySources(industry);
  const list = fromIndustry.length ? [...fromIndustry] : sourcesFromDatasets(readDatasets(bp));
  const out = list.length ? list : DEFAULT_SOURCES.map(s => ({ ...s }));
  // The system of record, last: the industry's own sources are what a
  // customer recognises first, and the database is the answer for the one
  // who says "it is all in our practice software".
  if (!out.some(s => s.kind === 'database')) out.push({ ...DATABASE_SOURCE });
  return out;
}

/** Which connector modules an application with these sources ships. */
export function connectorKindsFor(sources) {
  return (sources || []).map(s => s.kind).filter(k => CONNECTOR_MODULES[k]);
}

/** The file the Data page reads. */
export function sourcesFile(sources) {
  return { path: 'data/sources.json', content: JSON.stringify(sources, null, 2) + '\n' };
}

/** What Cob is told, so typicalSource names these. '' when the industry says nothing. */
export function sourceGuidanceFor(industry) {
  const list = industrySources(industry);
  if (!list.length) return '';
  return '\nINDUSTRY SOURCES (where this industry keeps its data; typicalSource must name one of these, in these words, wherever one fits):\n'
    + list.map(s => `- ${s.label}${s.holds.length ? ` — usually holds: ${s.holds.join(', ')}` : ''}${s.note ? `. ${s.note.split('. ')[0]}.` : ''}`).join('\n')
    + '\n';
}
