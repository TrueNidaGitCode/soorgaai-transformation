/**
 * Svarg — deciding which dataset an uploaded file serves
 *
 * The Upload tab used to ask the user to attach one file per required dataset.
 * That assumed a tidiness nobody has: real customers have a folder of exports
 * with names like "att_2024_q1.csv" and "billing dump FINAL.json", not one
 * clean file per line item in a blueprint.
 *
 * So they hand over the folder and this works out what is in it.
 *
 * ── Same discipline as the codebase matcher ────────────────────────────────
 *
 * A match is only kept when both ends check out: the dataset must be one the
 * blueprint actually asked for, and the file must be one that was actually
 * uploaded. A file that matches nothing is left unclassified rather than
 * pushed into the nearest dataset — a wrong match sends generation at the
 * wrong data, which is worse than admitting the file was not understood.
 */

import { generateForProduct, productProviderName } from './productLlm.js';

/**
 * How much to put in front of the model at once. A local model's context is
 * small, and exceeding it truncates silently — see codebaseProfileService.
 */
const BATCH_CHARS = Number(process.env.CLASSIFY_BATCH_CHARS)
  || (productProviderName() ? 8_000 : 60_000);

/** Enough of a file to tell what it is. Headers and the first rows do it. */
const PREVIEW_CHARS = 700;

const PROMPT =
`You match uploaded files to the datasets a project requires.

Return ONLY compact JSON:
{"matches":[{"file":"<exact file path as given>","dataset":"<exact dataset name as given>","confidence":<0-1>}]}

Rules:
- Judge by what the file's name and contents actually show — column headers and
  the first rows say more than the filename does.
- A file that does not clearly serve any listed dataset must be LEFT OUT. It
  will be kept as unclassified, which is the correct outcome. Guessing sends
  the project at the wrong data.
- One file may serve at most one dataset. Two files may serve the same dataset.
- file and dataset must both be copied exactly from the lists given to you.`;

function batch(files) {
  const out = [];
  let current = [];
  let size = 0;
  for (const f of files) {
    const cost = f.path.length + PREVIEW_CHARS;
    if (size + cost > BATCH_CHARS && current.length) { out.push(current); current = []; size = 0; }
    current.push(f);
    size += cost;
  }
  if (current.length) out.push(current);
  return out;
}

/**
 * @param {Array<{path: string, content: string}>} files
 * @param {Array<{name: string, purpose?: string}>} datasets
 * @returns {Promise<Array<{file: string, dataset: string, confidence: number}>>}
 */
export async function classifyUploads(files, datasets) {
  if (!files.length || !datasets.length) return [];

  const validFiles = new Set(files.map(f => f.path));
  const validSets = new Set(datasets.map(d => d.name));
  const datasetList = datasets.map(d => `- ${d.name}${d.purpose ? `: ${d.purpose}` : ''}`).join('\n');

  const results = [];
  const batches = batch(files);
  if (batches.length > 1) {
    console.log(`[uploadClassifier] ${files.length} files in ${batches.length} batches`);
  }

  for (const [i, group] of batches.entries()) {
    const fileList = group
      .map(f => `--- ${f.path} ---\n${f.content.slice(0, PREVIEW_CHARS)}`)
      .join('\n\n');

    try {
      const result = await generateForProduct({
        systemPrompt: PROMPT,
        userMessage: `REQUIRED DATASETS:\n${datasetList}\n\nUPLOADED FILES:\n${fileList}`,
        maxTokens: 900,
        label: `aria:classify-uploads${batches.length > 1 ? ` (${i + 1}/${batches.length})` : ''}`,
      });

      const m = result.text.match(/\{[\s\S]*\}/);
      if (!m) continue;

      for (const x of (JSON.parse(m[0]).matches || [])) {
        // Both ends verified against what we actually have, so a hallucinated
        // filename or dataset cannot reach the database.
        if (!validFiles.has(x.file) || !validSets.has(x.dataset)) continue;
        if (results.some(r => r.file === x.file)) continue;   // one dataset per file
        results.push({
          file: x.file,
          dataset: x.dataset,
          confidence: Math.min(1, Math.max(0, Number(x.confidence) || 0)),
        });
      }
    } catch (err) {
      // A failed batch costs its files, not the whole upload. They stay
      // unclassified, which is a state the product already handles.
      console.error(`[uploadClassifier] batch ${i + 1} failed:`, err.message);
    }
  }

  return results;
}
