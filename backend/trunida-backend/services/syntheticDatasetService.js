/**
 * Svarg — sample data for a dataset the customer does not have yet
 *
 * Aria asks for datasets a business ought to have. A company before launch has
 * not collected most of them, so the row sits at "In your own systems — upload
 * an export" and nobody can export something that does not exist. The blueprint
 * is then shaped by a dataset nobody has ever seen.
 *
 * This generates a small, representative sample so the shape is at least real:
 * the right columns, plausible values, the right cardinality. It is evidence of
 * STRUCTURE, never of fact.
 *
 * ── Why this does not contradict Eame's rule 7 ─────────────────────────────
 *
 * eameCodeGenerator.js tells the generator "Do not invent data. A seed script
 * must read a file the customer supplies, not fabricate records." That rule is
 * about the application Svarg delivers, and it stays. This is Aria's grounding
 * evidence, it is asked for explicitly, and it is labelled at every layer that
 * touches it — the `_source` column below, the `synthetic` sourceType on the
 * document, the prompt preamble in connectedKnowledgeService, and the Aria row
 * that refuses to count it as available.
 *
 * The failure this design exists to prevent is someone reading a generated
 * figure as their own number. Every decision here is aimed at that.
 */

import { generate } from './llmService.js';

/** Marker column on every row. Survives being copied into a spreadsheet. */
export const SAMPLE_COLUMN = '_source';
export const SAMPLE_VALUE = 'sample';

/** Small on purpose: enough to show shape, too few to look like a real export. */
const TARGET_ROWS = 25;
const MAX_CHARS = 20000;

function systemPrompt() {
  return [
    'You generate small, realistic SAMPLE datasets so a product team can see the shape of data',
    'they have not collected yet. You are not describing anything that exists.',
    '',
    'RULES',
    `1. Output CSV only. A header row, then data rows. No prose, no markdown fences.`,
    `2. The FIRST column must be named ${SAMPLE_COLUMN} and every data row must carry the`,
    `   value "${SAMPLE_VALUE}" in it. This marks the file as generated wherever it ends up.`,
    `3. Between 15 and ${TARGET_ROWS} data rows. Enough to show variation, not enough to`,
    '   be mistaken for a real export.',
    '4. Use column names a practitioner in this industry would recognise. The column names are',
    '   the most useful part of the output — they are what the design gets built against.',
    '5. Vary the rows. Realistic spread of dates, statuses and magnitudes; include the awkward',
    '   cases (a null, an outlier, a cancellation) because those are what break a design.',
    '6. Invent no real people, companies, emails or phone numbers. Use obviously placeholder',
    '   names. A sample that looks like leaked personal data is worse than no sample.',
  ].join('\n');
}

function userPrompt({ dataset, objective, industry, companyName, context, existingKeys = [] }) {
  return [
    `Dataset: ${dataset.name}`,
    dataset.purpose ? `What it is for: ${dataset.purpose}` : '',
    dataset.typicalSource ? `Where this normally lives: ${dataset.typicalSource}` : '',
    '',
    companyName ? `Company: ${companyName}` : '',
    industry ? `Industry: ${industry}` : '',
    objective ? `What they are trying to do: ${objective}` : '',
    // What the customer told us about their own data. Last, and marked as
    // theirs, because it is the most specific thing in the prompt — scale,
    // seasonality, naming conventions — and the part worth honouring when it
    // contradicts a generic assumption about the industry.
    ...(context
      ? ['', 'WHAT THE CUSTOMER SAYS ABOUT THIS DATA (prefer this over any general', 'assumption):', context]
      : []),
    '',
    // Identifiers the other sample datasets for this company already use.
    //
    // Each dataset was generated in its own model call and invented its own
    // scheme, so enrollment held STU-9901 while attendance held stu_88201 and
    // invoices held stu_1092. Nothing joined - zero rows out of twenty - and
    // the application built on them scored every student identically, because
    // every signal it looked up was missing. The samples have to describe one
    // world, not six unrelated tables.
    ...(existingKeys.length
      ? [
          '',
          'THESE ENTITIES ALREADY EXIST in the other sample datasets for this company.',
          'Where your dataset refers to the same thing, use THESE EXACT VALUES under',
          'this exact column name. A new identifier scheme makes the datasets',
          'unjoinable, and anything built on them cannot work:',
          ...existingKeys.map(k => '  ' + k.column + ': ' + k.values.join(', ') + (k.more ? ', ...' : '')),
          'Not every row needs one, and the same entity may appear more than once.',
        ]
      : []),
    'Generate the sample CSV.',
  ].filter(Boolean).join('\n');
}

/**
 * Strip anything that is not the CSV.
 *
 * Models wrap output in fences despite being told not to, and losing a whole
 * generation to a stray ``` is a bad trade for strictness.
 */
function extractCsv(text) {
  let out = String(text || '').trim();
  const fence = out.match(/```(?:csv)?\s*\n([\s\S]*?)```/i);
  if (fence) out = fence[1].trim();
  return out;
}

/**
 * Check the marker actually made it into every row, and add it if not.
 *
 * The prompt asks for it; a model that ignores the instruction would produce a
 * file indistinguishable from a real export, which is the one outcome that
 * matters. So it is verified here rather than trusted.
 *
 * @returns {{csv: string, rowCount: number, columns: string[]}}
 */
export function enforceMarker(csv) {
  const lines = String(csv || '').split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) throw new Error('The generated sample had no data rows.');

  const header = lines[0].split(',').map(c => c.trim());
  const rows = lines.slice(1);

  if (header[0] !== SAMPLE_COLUMN) {
    // Prepend rather than reject: the columns are the valuable part, and a
    // missing marker is repairable where a missing dataset is not.
    return {
      csv: [
        [SAMPLE_COLUMN, ...header].join(','),
        ...rows.map(r => `${SAMPLE_VALUE},${r}`),
      ].join('\n'),
      rowCount: rows.length,
      columns: header,
    };
  }

  const fixed = rows.map(r => {
    const cells = r.split(',');
    cells[0] = SAMPLE_VALUE;
    return cells.join(',');
  });

  return {
    csv: [lines[0], ...fixed].join('\n'),
    rowCount: fixed.length,
    columns: header.slice(1),
  };
}

/**
 * Generate a sample export for one dataset.
 *
 * @returns {Promise<{csv, rowCount, columns, model}>}
 */
export async function generateSampleDataset({ dataset, objective = '', industry = '', companyName = '', context = '', existingKeys = [] }) {
  if (!dataset?.name) throw new Error('A dataset name is required.');

  const result = await generate({
    systemPrompt: systemPrompt(),
    userMessage: userPrompt({ dataset, objective, industry, companyName, context, existingKeys }),
    maxTokens: 2000,
    // Prefixed so the usage ledger files it under Cob rather than 'other' —
    // see stageFromLabel in usageLedgerService.js.
    label: 'cob:synthetic-dataset',
  });

  const csv = extractCsv(result.text);
  if (!csv) throw new Error('The model returned nothing usable.');
  if (csv.length > MAX_CHARS) throw new Error('The generated sample was implausibly large.');

  const { csv: marked, rowCount, columns } = enforceMarker(csv);
  return { csv: marked, rowCount, columns, model: result.model || '' };
}


/**
 * The identifier columns a set of already-generated CSVs share.
 *
 * Only key-shaped columns, only their distinct values, capped: this goes into
 * a prompt, and the point is to pin the naming, not to restate the data.
 */
export function sharedKeys(csvTexts, { maxColumns = 4, maxValues = 12 } = {}) {
  const byColumn = new Map();

  for (const text of csvTexts) {
    const lines = String(text || '').split(String.fromCharCode(10)).filter(l => l.trim());
    if (lines.length < 2) continue;
    const headers = lines[0].split(',').map(h => h.trim());

    headers.forEach((header, i) => {
      if (!/(^|_)id$/i.test(header)) return;
      const values = byColumn.get(header) || new Set();
      for (const line of lines.slice(1)) {
        const cell = (line.split(',')[i] || '').trim();
        if (cell) values.add(cell);
      }
      byColumn.set(header, values);
    });
  }

  return [...byColumn.entries()]
    .sort((a, b) => b[1].size - a[1].size)
    .slice(0, maxColumns)
    .map(([column, set]) => {
      const all = [...set];
      return { column, values: all.slice(0, maxValues), more: all.length > maxValues };
    });
}