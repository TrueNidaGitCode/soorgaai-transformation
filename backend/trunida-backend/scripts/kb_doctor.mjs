/**
 * Is the knowledge base actually reaching Cob?
 *
 * The knowledge base is written by people and read by a parser, and the parser
 * fails quietly. A researcher can spend a day interviewing an academy owner,
 * write an excellent file, commit it, and have none of it reach a single
 * prompt — with nothing anywhere saying so. That has already happened:
 *
 *   - the Automotive overlay, the most iterated in the base, matches none of
 *     its Core pillars, because someone restructured its headings into
 *     audience segments and the matcher looks for the capability name;
 *   - four capability files sit on disk that no capability table lists, so
 *     nothing can ever read them;
 *   - content past the word cap is dropped without a word.
 *
 * This is the feedback loop that makes writing knowledge worth doing. Run it
 * after editing the base, and before committing.
 *
 *   node scripts/kb_doctor.mjs                     # every grounded industry
 *   node scripts/kb_doctor.mjs "Sports Academies"  # one
 *   node scripts/kb_doctor.mjs --strict            # exit 1 on any problem
 */
import fs from 'fs';
import path from 'path';
import {
  KB_ENTERPRISE_ROOT, getDomainCapabilities, getDomainCapabilityBlueprint, toFilename,
  INDUSTRY_WORD_CAP,
} from '../services/strategyCanvasService.js';
import { DOMAINS, enabledDomains } from '../config/domainRegistry.js';

const args = process.argv.slice(2);
const strict = args.includes('--strict');
const only = args.filter(a => !a.startsWith('--')).join(' ').trim();

const RED = (s) => `\x1b[31m${s}\x1b[0m`;
const YEL = (s) => `\x1b[33m${s}\x1b[0m`;
const DIM = (s) => `\x1b[2m${s}\x1b[0m`;
const OK = (s) => `\x1b[32m${s}\x1b[0m`;

const problems = [];
const note = (level, where, what, fix) => problems.push({ level, where, what, fix });

const words = (t) => String(t || '').split(/\s+/).filter(Boolean).length;

/** Industries with at least one markdown file somewhere — the same rule the product uses. */
function groundedIndustries() {
  const found = new Set();
  for (const d of DOMAINS) {
    const dir = path.join(KB_ENTERPRISE_ROOT, d.kbPath);
    if (!fs.existsSync(dir)) continue;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      if (['Core', 'Templates'].includes(entry.name)) continue;
      const files = fs.readdirSync(path.join(dir, entry.name)).filter(f => f.endsWith('.md'));
      if (files.length) found.add(entry.name);
    }
  }
  return [...found].sort();
}

// ── Files nothing can ever read ──────────────────────────────────────────────

function checkOrphans() {
  for (const d of DOMAINS) {
    let declared;
    try {
      declared = new Set(getDomainCapabilities(d.kbPath).map(c => toFilename(c.name) + '.md'));
    } catch (err) {
      note('error', d.kbPath, `the capability table could not be read: ${err.message}`,
        `check the "Knowledge Architecture" table in Core/${d.kbPath}_Intelligence_Specification.md`);
      continue;
    }

    const coreDir = path.join(KB_ENTERPRISE_ROOT, d.kbPath, 'Core');
    if (!fs.existsSync(coreDir)) continue;
    for (const f of fs.readdirSync(coreDir)) {
      // A README is documentation for whoever opens the folder, not content.
      if (!f.endsWith('.md') || f.includes('Intelligence_Specification') || f === 'README.md') continue;
      if (!declared.has(f)) {
        note('warn', `${d.kbPath}/Core/${f}`, 'no capability table lists this file, so nothing reads it',
          'add a row to the Knowledge Architecture table, or delete the file');
      }
    }
  }
}

// ── What actually reaches a prompt, per capability ───────────────────────────

function checkIndustry(industry) {
  console.log(`\n${industry}`);

  for (const domain of DOMAINS) {
    const live = enabledDomains().some(d => d.id === domain.id);
    let caps = [];
    try { caps = getDomainCapabilities(domain.kbPath); } catch { continue; }

    const dir = path.join(KB_ENTERPRISE_ROOT, domain.kbPath, industry);
    const has = fs.existsSync(dir);
    const label = `  ${domain.name}${live ? '' : DIM(' (domain switched off)')}`;

    if (!has) {
      console.log(`${label}  ${DIM('no overlay')}`);
      if (live) {
        note('warn', `${domain.kbPath}/${industry}`, 'no industry overlay at all',
          `a ${industry} customer gets core-only grounding for every capability in this domain`);
      }
      continue;
    }
    console.log(label);

    for (const cap of caps) {
      const file = path.join(dir, `${industry}_${toFilename(cap.name)}.md`);
      const where = `${domain.kbPath}/${industry}/${path.basename(file)}`;

      if (!fs.existsSync(file)) {
        console.log(`    ${DIM('·')} ${cap.name.padEnd(36)} ${DIM('no file')}`);
        if (live) note('warn', where, 'missing', `write it, or this capability grounds on Core only for ${industry}`);
        continue;
      }

      const raw = fs.readFileSync(file, 'utf-8');
      let bp;
      try {
        bp = getDomainCapabilityBlueprint(cap.id, domain.kbPath, industry);
      } catch (err) {
        console.log(`    ${RED('x')} ${cap.name.padEnd(36)} ${RED('does not parse')}`);
        note('error', where, `does not parse: ${err.message}`, 'check the heading style');
        continue;
      }

      const matched = bp.sections.filter(s => s.source === 'both').length;
      const reaching = words(bp.automotiveBlueprint);
      const inFile = words(raw);
      const method = words(bp.sections.map(s => s.consultantGuide).join(' '));

      const flags = [];
      if (!matched) flags.push(RED('no section matched'));
      if (reaching >= INDUSTRY_WORD_CAP) flags.push(YEL(`capped at ${INDUSTRY_WORD_CAP} of ${inFile} words`));
      if (!method) flags.push(YEL('Core carries no method'));

      const mark = flags.length ? (matched ? YEL('!') : RED('x')) : OK('+');
      console.log(`    ${mark} ${cap.name.padEnd(36)} ${String(reaching).padStart(4)}w to the prompt`
        + (flags.length ? `   ${flags.join(', ')}` : ''));

      if (!matched && live) {
        const titles = (raw.match(/^## .*/gm) || []).slice(0, 3).map(t => t.replace(/^## /, ''));
        note('error', where,
          `no "## " section title contains "${cap.name}", so the per-section industry text is empty`,
          `rename a section to contain "${cap.name}" exactly. Found: ${titles.join(' | ') || '(no ## sections)'}`);
      }
      if (reaching >= INDUSTRY_WORD_CAP && live) {
        note('warn', where, `${inFile} words written, ${INDUSTRY_WORD_CAP} reach the prompt`,
          'put what matters most first — the rest is dropped');
      }
    }
  }
}

// ── Run ──────────────────────────────────────────────────────────────────────

const industries = only ? [only] : groundedIndustries();
if (only && !groundedIndustries().includes(only)) {
  console.log(`No overlay folder named "${only}". Known: ${groundedIndustries().join(', ')}`);
  process.exit(1);
}

console.log(`Knowledge base: ${KB_ENTERPRISE_ROOT}`);
console.log(`Industries: ${industries.join(', ')}`);
checkOrphans();
for (const i of industries) checkIndustry(i);

const errors = problems.filter(p => p.level === 'error');
const warns = problems.filter(p => p.level === 'warn');

if (problems.length) {
  console.log(`\n${errors.length} problem(s), ${warns.length} thing(s) worth knowing\n`);
  for (const p of [...errors, ...warns]) {
    console.log(`${p.level === 'error' ? RED('PROBLEM') : YEL('NOTE   ')} ${p.where}`);
    console.log(`        ${p.what}`);
    console.log(`        ${DIM('fix: ' + p.fix)}`);
  }
} else {
  console.log(`\n${OK('Everything in the knowledge base reaches a prompt.')}`);
}

// Non-zero only on a real breakage, and only when asked, so this can be a
// commit hook without blocking work on a capability nobody has written yet.
if (strict && errors.length) process.exit(1);
