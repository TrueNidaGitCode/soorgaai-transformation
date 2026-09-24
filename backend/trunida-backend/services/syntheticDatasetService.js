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

/*
 * Per pass, not per dataset. A reply is bounded by output tokens, and a CSV
 * cut off mid-row is what made three of Vesoma's six datasets unreadable —
 * so each pass stays small enough to arrive whole and several are merged.
 */
const TARGET_ROWS = 25;

/*
 * How many passes a dataset gets.
 *
 * Four is about a hundred rows, which is the difference between showing the
 * SHAPE of a dataset and being able to demonstrate anything on top of it: a
 * watcher looking for the client who stopped coming needs enough clients for
 * one of them to have stopped. Settable without a deploy, because the right
 * number is a demo judgement rather than a fact.
 */
export const SAMPLE_PASSES = Math.max(1, Math.min(Number(process.env.SAMPLE_PASSES || 4), 8));

/*
 * Two ceilings, because they guard different things.
 *
 * MAX_PASS_CHARS is one reply. A call capped at 2000 output tokens cannot
 * legitimately produce more than a few thousand characters, so anything past
 * this is a model that has started writing an export rather than a sample —
 * the thing this must never look like — and it is refused rather than
 * stored.
 *
 * MAX_CHARS is the accumulated file across passes. Reaching it is not an
 * error: it is simply enough, and collecting stops.
 */
const MAX_PASS_CHARS = 20000;
const MAX_CHARS = 60000;

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
    '6. Include two or three rows that CONTRADICT THEMSELVES, the way real records do: a status',
    '   that disagrees with the rest of its own row — marked absent with a check-in time and a',
    '   duration filled in, closed with no closing date, paid with a balance still outstanding.',
    '   Do not flag them. They should look exactly like every other row.',
    '7. Invent no real people, companies, emails or phone numbers. Use obviously placeholder',
    '   names. A sample that looks like leaked personal data is worse than no sample.',
  ].join('\n');
}

function userPrompt({ dataset, objective, industry, companyName, context, existingKeys = [], more = false }) {
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
    /*
     * A later pass is being asked for MORE of a file that already exists,
     * not for a new one. Without saying so it produces the same twenty rows
     * again with the same identifiers, and the merge throws nearly all of
     * them away — four calls for one call's worth of data.
     */
    ...(more
      ? [
          '',
          'THIS IS A CONTINUATION. A file for this dataset already exists with the',
          'header and identifiers above. Return MORE DATA ROWS FOR THAT SAME FILE:',
          'the identical header, then rows describing entities and events that are',
          'NOT already listed. Do not restate what is there. Keep the same date',
          'range, the same statuses and the same shape, so the two halves read as',
          'one export rather than two.',
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
  const width = fieldCount(lines[0]);
  const rows = lines.slice(1);

  if (header[0] !== SAMPLE_COLUMN) {
    // Prepend rather than reject: the columns are the valuable part, and a
    // missing marker is repairable where a missing dataset is not.
    //
    // Arity is checked against the ORIGINAL width, because these rows have not
    // been given the marker column yet.
    const usable = rows.filter(r => wellFormed(r, width));
    return {
      csv: [
        [SAMPLE_COLUMN, ...header].join(','),
        ...usable.map(r => `${SAMPLE_VALUE},${r}`),
      ].join('\n'),
      rowCount: usable.length,
      columns: header,
      dropped: rows.length - usable.length,
    };
  }

  const fixed = rows.map(r => {
    const cells = r.split(',');
    cells[0] = SAMPLE_VALUE;
    return cells.join(',');
  });

  const kept = fixed.filter(r => wellFormed(r, width));
  return {
    csv: [lines[0], ...kept].join('\n'),
    rowCount: kept.length,
    columns: header.slice(1),
    dropped: fixed.length - kept.length,
  };
}

/**
 * Does this row have exactly as many fields as the header?
 *
 * ── Why a short row is dropped rather than padded ──────────────────────────
 *
 * A physiotherapy centre's attendance log shipped with three rows carrying
 * fourteen fields against a fifteen-column header. Nothing noticed. Every
 * column after the gap shifted left, so `attendance_status` on those rows read
 * `0` instead of `No-Show` — and the No Show watcher reported nothing while
 * the file plainly contained no-shows. The data was wrong in a way that looked
 * exactly like the data being fine.
 *
 * Padding is tempting and is the wrong repair. The missing field is not at the
 * end: those rows were no-shows, so the gap sat among three consecutive blank
 * timestamps, and appending an empty cell would leave every value between the
 * gap and the end still in the wrong column. There is no way to know where the
 * missing comma belonged, and a confidently wrong row is worse than an absent
 * one — it is the sort that reaches a customer as a finding.
 *
 * So a row that does not fit its header is dropped, and `dropped` says how
 * many, so a caller can tell a thin dataset from a clean one.
 *
 * Counted with quotes honoured, not by splitting on every comma. The generator
 * is asked for realistic values and a quoted comma is the normal case, not the
 * edge one — "Cabin B, Electrotherapy" is one field. A naive count would read
 * it as two, call a perfectly good row malformed and drop it, which would trade
 * one kind of silent data loss for another.
 */
function fieldCount(line) {
  let n = 1;
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') i++;
      else if (ch === '"') quoted = false;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') n++;
  }
  return n;
}

function wellFormed(row, columns) {
  return fieldCount(row) === columns;
}

/**
 * Add one pass's rows to what is already there.
 *
 * The header comes from the first pass and never changes: a later pass that
 * invented a different column order would produce a file whose rows do not
 * line up with their own header, which is the failure that dropped three of
 * Vesoma's six datasets. A pass whose header disagrees is discarded whole.
 *
 * Rows are deduplicated on the identifier column when there is one, and on
 * the whole line when there is not. Asking a model four times for more rows
 * of the same thing gets some of the same rows back; a hundred rows of which
 * thirty are the same client twice is not a hundred observations.
 */
export function mergeSample(base, next) {
  const lines = (s) => String(s || '').split('\n').map(l => l.trim()).filter(Boolean);
  const a = lines(base);
  const b = lines(next);
  if (!a.length) return b.join('\n');
  if (b.length < 2) return a.join('\n');

  const header = a[0];
  if (b[0] !== header) return a.join('\n');

  // The first column after the marker is the identifier, when one is there.
  const cols = header.split(',');
  const keyAt = cols.length > 1 && cols[0].trim() === SAMPLE_COLUMN ? 1 : 0;
  const keyOf = (row) => {
    const parts = splitRow(row);
    return (parts[keyAt] ?? row).trim().toLowerCase();
  };

  const seen = new Set(a.slice(1).map(keyOf));
  const out = a.slice();
  for (const row of b.slice(1)) {
    const k = keyOf(row);
    if (k && seen.has(k)) continue;
    seen.add(k);
    out.push(row);
  }
  return out.join('\n');
}

/** One CSV row into fields, respecting quotes. */
function splitRow(row) {
  const out = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < row.length; i++) {
    const ch = row[i];
    if (quoted) {
      if (ch === '"' && row[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

/**
 * Generate a sample export for one dataset.
 *
 * ── Why this asks more than once ───────────────────────────────────────────
 *
 * One call gave about twenty rows, which is enough to show the SHAPE of a
 * dataset and not enough to demonstrate anything on top of it. A watcher
 * looking for the client who stopped coming needs enough clients for one of
 * them to have stopped; a board with three rows on it does not show a
 * business anything about itself.
 *
 * More rows in one call is not the answer: the reply is bounded by output
 * tokens, and a CSV cut off mid-row is exactly what produced the malformed
 * files that made three of Vesoma's datasets unreadable. So it asks several
 * times, each reply small enough to arrive whole, and merges them.
 *
 * @returns {Promise<{csv, rowCount, columns, model, passes}>}
 */
export async function generateSampleDataset({
  dataset, objective = '', industry = '', companyName = '', context = '', existingKeys = [],
  passes = SAMPLE_PASSES,
} = {}) {
  if (!dataset?.name) throw new Error('A dataset name is required.');

  const want = Math.max(1, Math.min(Number(passes) || 1, 8));
  let csv = '';
  let model = '';
  let done = 0;

  for (let i = 0; i < want; i++) {
    // What this dataset has already produced, so a later pass continues the
    // file rather than starting it again with new identifiers.
    const soFar = csv ? sharedKeys([csv]) : [];
    let result;
    try {
      result = await generate({
        systemPrompt: systemPrompt(),
        userMessage: userPrompt({
          dataset, objective, industry, companyName, context,
          existingKeys: existingKeys.concat(soFar),
          more: i > 0,
        }),
        maxTokens: 2000,
        // Prefixed so the usage ledger files it under Cob rather than 'other' —
        // see stageFromLabel in usageLedgerService.js.
        label: 'cob:synthetic-dataset',
      });
    } catch (err) {
      /*
       * A later pass failing is not the dataset failing: what arrived is
       * still a usable sample, and refusing it would trade a smaller file
       * for none at all.
       *
       * try/catch rather than .catch(), because a provider that throws
       * synchronously never returns a promise to hang a handler on — and
       * that failure would take the whole dataset down instead of one pass.
       */
      if (!csv) throw err;
      break;
    }
    if (!result) break;

    const piece = extractCsv(result.text);
    if (!piece) { if (!csv) throw new Error('The model returned nothing usable.'); break; }
    if (piece.length > MAX_PASS_CHARS) throw new Error('The generated sample was implausibly large.');

    model = result.model || model;
    csv = csv ? mergeSample(csv, piece) : piece;
    done++;
    if (csv.length > MAX_CHARS) break;
  }

  if (!csv) throw new Error('The model returned nothing usable.');

  const { csv: marked, rowCount, columns } = enforceMarker(csv);
  return { csv: marked, rowCount, columns, model, passes: done };
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