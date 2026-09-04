/**
 * Svarg — Codebase Profile
 *
 * Reads a customer's repository and works out how their product is built, so
 * the rest of the pipeline stops guessing.
 *
 * Cob writes dataset requirements like "Class Attendance Logs — PostgreSQL /
 * Core Application DB" from inference alone. The authoritative answer is in the
 * repository: migrations name the tables, ORM models name the fields, the
 * manifest names the stack. A product company's code describes their data
 * better than any inference can.
 *
 * ── Bounded on purpose ─────────────────────────────────────────────────────
 *
 * Selection happens against the file TREE, before anything is fetched, so a
 * monorepo costs one API call to reject rather than a thousand to read. Files
 * are capped, bytes are capped, and exceeding either produces a partial
 * profile that says so — never an unbounded run against someone's API quota.
 */

import crypto from 'crypto';
import { generateForProduct, productProviderName } from './productLlm.js';
import { regexRedact } from './jiraContentService.js';
import { embedBatch, EMBEDDING_PROVIDER, EMBEDDING_MODEL } from './embeddingService.js';
import { readTree, readFile } from './githubReadService.js';
import CustomerCodeChunk from '../models/CustomerCodeChunk.js';

/** Never read from these, whatever they contain. */
const SKIP_DIRS = [
  'node_modules/', 'vendor/', 'dist/', 'build/', 'out/', 'target/',
  '.git/', '.next/', 'coverage/', '__pycache__/', 'venv/', '.venv/',
  'bower_components/', 'Pods/',
];

/** Lockfiles are enormous, entirely mechanical, and say nothing about design. */
const SKIP_FILES = [
  'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'composer.lock',
  'Gemfile.lock', 'poetry.lock', 'Cargo.lock',
];

const BINARY_EXT = /\.(png|jpe?g|gif|svg|ico|webp|mp4|mp3|pdf|zip|gz|tar|jar|war|class|so|dll|exe|woff2?|ttf|eot|min\.js|min\.css)$/i;

/**
 * What each category is for. Order matters: when the file budget runs out, the
 * categories earlier in this list have already been taken.
 *
 * Stack first because it is two or three files and decides how everything else
 * is read. Data next because it is the question Aria actually asks. Structure
 * last because it is the most useful to Eame later and the least useful now.
 */
const CATEGORIES = [
  {
    name: 'stack',
    max: 6,
    match: p => /(^|\/)(package\.json|requirements\.txt|pyproject\.toml|Gemfile|go\.mod|pom\.xml|build\.gradle|composer\.json|[^/]+\.csproj)$/i.test(p),
  },
  {
    name: 'data',
    max: 30,
    match: p =>
      /(^|\/)(prisma\/schema\.prisma|schema\.rb|structure\.sql)$/i.test(p)
      || /(^|\/)(db\/migrate|migrations|alembic\/versions)\//i.test(p)
      || /(^|\/)(models|entities|schemas)\/[^/]+\.(js|ts|py|rb|go|java|cs|php)$/i.test(p)
      || /\.sql$/i.test(p),
  },
  {
    name: 'structure',
    max: 24,
    match: p =>
      /(^|\/)(server|app|main|index)\.(js|ts|py|rb|go|java|cs|php)$/i.test(p)
      || /(^|\/)(routes|controllers|api|handlers)\/[^/]+\.(js|ts|py|rb|go|java|cs|php)$/i.test(p)
      || /(^|\/)(docker-compose\.ya?ml|Dockerfile|README\.md)$/i.test(p),
  },
];

const MAX_FILES = 60;
const MAX_TOTAL_BYTES = 600_000;
const CHUNK_CHARS = 4_000;

function isSkipped(path) {
  if (SKIP_DIRS.some(d => path.startsWith(d) || path.includes('/' + d))) return true;
  if (SKIP_FILES.includes(path.split('/').pop())) return true;
  if (BINARY_EXT.test(path)) return true;
  return false;
}

/**
 * Which files are worth reading, decided from the tree alone.
 *
 * @returns {{ selected: Array<{path, bytes, category}>, skipped: number, capped: boolean }}
 */
export function selectFiles(treeFiles) {
  const candidates = treeFiles.filter(f => !isSkipped(f.path));
  const selected = [];
  let bytes = 0;
  let capped = false;

  for (const category of CATEGORIES) {
    const matching = candidates.filter(f =>
      category.match(f.path) && !selected.some(s => s.path === f.path));

    // Hitting a category's own budget means matching files were left unread,
    // which makes the profile partial just as surely as the global cap does.
    // Reporting only the global cap let a repository with 500 model files
    // produce a profile built from 30 of them and call itself complete.
    if (matching.length > category.max) capped = true;

    let taken = 0;
    for (const f of matching) {
      if (taken >= category.max) break;
      if (selected.length >= MAX_FILES) { capped = true; break; }
      if (bytes + f.bytes > MAX_TOTAL_BYTES) { capped = true; continue; }

      selected.push({ ...f, category: category.name });
      bytes += f.bytes;
      taken++;
    }
  }

  return { selected, skipped: treeFiles.length - selected.length, capped };
}

const PROFILE_PROMPT =
`You are reading excerpts of a company's own source code to describe how their
product is built. Report only what the files actually show.

Return ONLY compact JSON:
{"languages":["..."],"frameworks":["..."],"database":"<name or empty>",
 "entities":[{"name":"<table or model name as it appears in the code>","definedIn":"<file path from the excerpts>","fields":["..."],"describes":"<what this data is, under 12 words>"}],
 "conventions":"<how this codebase is organised, under 40 words>",
 "summary":"<what this product does, under 40 words>"}

Rules:
- entities must be things you SAW defined — a table in a migration, a model, a
  schema. definedIn must be one of the file paths given to you, exactly.
- Never invent an entity that would make sense for this kind of product. An
  incomplete list of real tables is worth more than a plausible list of
  imagined ones.
- Empty arrays are correct answers when the excerpts do not show them.`;

/**
 * How much source to put in front of the model per call.
 *
 * This is a CONTEXT limit, not a cost one, and getting it wrong is silent.
 * Ollama truncates an oversized prompt rather than refusing it, so a corpus
 * larger than the model's window produces a confident profile derived from
 * whatever fragment survived — indistinguishable from a real one.
 *
 * A locally served 7B is commonly loaded with a 4k window (Ollama's own
 * default is smaller still), which is about 12k characters once the system
 * prompt and the reply are accounted for. Hosted models have far more room.
 * Anything above one batch is split and merged rather than truncated.
 */
const PROFILE_BATCH_CHARS = Number(process.env.PROFILE_BATCH_CHARS)
  || (productProviderName() ? 10_000 : 100_000);
const PER_FILE_CHARS = Math.min(6_000, Math.floor(PROFILE_BATCH_CHARS / 2));

/** Split files so no single call exceeds the model's window. */
function batchFiles(files) {
  const batches = [];
  let current = [];
  let size = 0;

  for (const f of files) {
    const text = f.content.slice(0, PER_FILE_CHARS);
    if (size + text.length > PROFILE_BATCH_CHARS && current.length) {
      batches.push(current);
      current = [];
      size = 0;
    }
    current.push({ ...f, content: text });
    size += text.length;
  }
  if (current.length) batches.push(current);
  return batches;
}

/**
 * What the code says about itself.
 *
 * Batched, because a local model's context is small and exceeding it fails
 * silently. Each batch is profiled independently and the results merged: a
 * failed batch costs its own files, not the whole profile.
 */
export async function deriveProfile(files) {
  if (!files.length) {
    return { languages: [], frameworks: [], database: '', entities: [], conventions: '', summary: '', ok: false };
  }

  const batches = batchFiles(files);
  if (batches.length > 1) {
    console.log(`[codebaseProfile] ${files.length} files exceed the ${PROFILE_BATCH_CHARS}-char window — profiling in ${batches.length} batches`);
  }

  const results = [];
  for (const [i, batch] of batches.entries()) {
    const one = await profileBatch(batch, i + 1, batches.length);
    if (one) results.push(one);
  }
  if (!results.length) {
    return { languages: [], frameworks: [], database: '', entities: [], conventions: '', summary: '', ok: false };
  }

  // Union the descriptive fields; concatenate entities, which are the point.
  // The first successful batch supplies the prose — later batches see only a
  // slice of the codebase and describe it as if it were the whole thing.
  const uniq = (xs) => [...new Set(xs.filter(Boolean))];
  return {
    languages:   uniq(results.flatMap(r => r.languages)).slice(0, 10),
    frameworks:  uniq(results.flatMap(r => r.frameworks)).slice(0, 15),
    database:    results.find(r => r.database)?.database || '',
    entities:    results.flatMap(r => r.entities),
    conventions: results[0].conventions,
    summary:     results[0].summary,
    ok: true,
  };
}

/** One batch. Returns null rather than throwing — see deriveProfile. */
async function profileBatch(files, index, total) {
  const corpus = files
    .map(f => `--- ${f.path} ---\n${f.content}`)
    .join('\n\n');

  try {
    const result = await generateForProduct({
      systemPrompt: PROFILE_PROMPT,
      userMessage: corpus,
      maxTokens: 1500,
      label: `aria:codebase-profile${total > 1 ? ` (${index}/${total})` : ''}`,
    });
    const match = result.text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('No JSON in profile response');
    const parsed = JSON.parse(match[0]);

    // Every entity must cite a file we actually read. A model naming a
    // plausible path it never saw is exactly the fabrication this feature
    // exists to remove, and it is cheap to check.
    const readPaths = new Set(files.map(f => f.path));
    const entities = (parsed.entities || [])
      .filter(e => e?.name && readPaths.has(e.definedIn))
      .map(e => ({
        name:      String(e.name).slice(0, 120),
        definedIn: String(e.definedIn).slice(0, 300),
        fields:    (e.fields || []).slice(0, 40).map(f => String(f).slice(0, 80)),
        describes: String(e.describes || '').slice(0, 120),
      }));

    const dropped = (parsed.entities || []).length - entities.length;
    if (dropped > 0) console.warn(`[codebaseProfile] dropped ${dropped} entit${dropped === 1 ? 'y' : 'ies'} citing a file that was not read`);

    return {
      languages:   (parsed.languages  || []).slice(0, 10).map(String),
      frameworks:  (parsed.frameworks || []).slice(0, 15).map(String),
      database:    String(parsed.database || '').slice(0, 80),
      entities,
      conventions: String(parsed.conventions || '').slice(0, 600),
      summary:     String(parsed.summary || '').slice(0, 600),
    };
  } catch (err) {
    // Null, not an empty profile: deriveProfile counts successful batches to
    // decide whether it got anything at all, and an empty-but-present result
    // would look like a codebase with no entities in it.
    console.error(`[codebaseProfile] batch ${index}/${total} failed:`, err.message);
    return null;
  }
}

const MATCH_PROMPT =
`Match each required dataset to an entity found in this company's codebase, or
to nothing.

Return ONLY compact JSON:
{"matches":[{"dataset":"<dataset name exactly as given>","entity":"<entity name>","definedIn":"<file path>","confidence":<0-1>}]}

Rules:
- Only match when the entity plainly holds that data. A dataset with no
  matching entity must be LEFT OUT — a wrong match sends the build at the wrong
  table, which is worse than admitting we did not find it.
- entity and definedIn must come from the entity list given to you, verbatim.`;

/**
 * Which required datasets exist in the customer's own schema, with evidence.
 *
 * A match without a file to point at is not reported. That is the whole
 * difference between this and the inference it replaces.
 */
export async function matchDatasets(datasets, entities) {
  if (!datasets.length || !entities.length) return [];

  try {
    const result = await generateForProduct({
      systemPrompt: MATCH_PROMPT,
      userMessage:
        `REQUIRED DATASETS:\n${datasets.map(d => `- ${d.name}: ${d.purpose || ''}`).join('\n')}\n\n`
        + `ENTITIES FOUND IN THE CODEBASE:\n${entities.map(e => `- ${e.name} (${e.definedIn}): ${e.describes} [${e.fields.slice(0, 12).join(', ')}]`).join('\n')}`,
      maxTokens: 1200,
      label: 'aria:dataset-match',
    });
    const m = result.text.match(/\{[\s\S]*\}/);
    if (!m) return [];

    const byName = new Map(entities.map(e => [e.name, e]));
    const wanted = new Set(datasets.map(d => d.name));

    return (JSON.parse(m[0]).matches || [])
      // Both ends verified against what we actually have, so a hallucinated
      // dataset name or entity cannot reach the screen.
      .filter(x => wanted.has(x.dataset) && byName.has(x.entity))
      .map(x => ({
        dataset:    x.dataset,
        entity:     x.entity,
        definedIn:  byName.get(x.entity).definedIn,
        confidence: Math.min(1, Math.max(0, Number(x.confidence) || 0)),
      }));
  } catch (err) {
    console.error('[codebaseProfile] dataset matching failed:', err.message);
    return [];
  }
}

function chunkText(text) {
  const out = [];
  for (let i = 0; i < text.length; i += CHUNK_CHARS) out.push(text.slice(i, i + CHUNK_CHARS));
  return out;
}

/**
 * Store the read files as retrievable chunks, scoped to one user and blueprint.
 *
 * Replaces this blueprint's chunks rather than adding to them: re-analysing a
 * repository should reflect the repository, not accumulate every version of it
 * ever read.
 */
export async function storeCodeChunks({ userId, blueprintId, repoFullName, files }) {
  await CustomerCodeChunk.deleteMany({ userId, blueprintId });
  if (!files.length) return { stored: 0 };

  const rows = [];
  for (const f of files) {
    chunkText(f.content).forEach((content, chunkIndex) => {
      rows.push({
        // userId is in the hash, which is what makes two customers sharing a
        // path impossible to collide rather than merely unlikely.
        chunkId: crypto.createHash('sha256')
          .update(`${userId}:${repoFullName}:${f.path}:${chunkIndex}`).digest('hex'),
        userId, blueprintId, repoFullName, path: f.path, chunkIndex, content,
      });
    });
  }

  // Embedding is the expensive part and nothing reads code yet — retrieveCode
  // arrives with Eame. Off by default: store the redacted text now (it is the
  // costly half to obtain, and it came from a customer's repository), embed
  // when there is something to retrieve for.
  //
  // Not merely a cost switch. Embedding sends every selected file's full text
  // to the embedding provider, which for a customer's source is the largest
  // thing this feature would send anywhere.
  const embed = process.env.CODE_CHUNK_EMBEDDING === '1';

  let vectors = null;
  if (embed) {
    vectors = await embedBatch(rows.map(r => r.content));
  } else {
    console.log(`[codebaseProfile] stored ${rows.length} chunk(s) without vectors `
      + `(set CODE_CHUNK_EMBEDDING=1 to embed)`);
  }

  await CustomerCodeChunk.bulkWrite(rows.map((r, i) => ({
    updateOne: {
      filter: { chunkId: r.chunkId },
      update: { $set: {
        ...r,
        ...(embed
          ? { embedding: vectors[i], embeddingProvider: EMBEDDING_PROVIDER, embeddingModel: EMBEDDING_MODEL }
          : { embedding: [], embeddingProvider: '', embeddingModel: '' }),
      } },
      upsert: true,
    },
  })));

  return { stored: rows.length, embedded: embed };
}

/**
 * Retrieve a customer's own code by relevance.
 *
 * userId is required and refused when missing rather than defaulted. A
 * retrieval that silently ran unscoped would return another company's source,
 * so this fails loudly instead.
 */
export async function retrieveCode({ userId, blueprintId, queryText, topK = 6 }) {
  if (!userId) throw new Error('retrieveCode requires a userId — refusing to search unscoped.');
  if (!queryText) return [];

  const rows = await CustomerCodeChunk.find(
    { userId, ...(blueprintId ? { blueprintId } : {}), embeddingProvider: EMBEDDING_PROVIDER, embeddingModel: EMBEDDING_MODEL },
    { path: 1, content: 1, embedding: 1 }
  ).lean();
  if (!rows.length) {
    // Distinguish "no code stored" from "code stored but never embedded" —
    // the second looks identical from here and is fixed by a backfill, not by
    // re-reading the repository.
    const unembedded = await CustomerCodeChunk.countDocuments({ userId, ...(blueprintId ? { blueprintId } : {}) });
    if (unembedded) {
      console.warn(`[codebaseProfile] ${unembedded} chunk(s) stored without vectors — `
        + `set CODE_CHUNK_EMBEDDING=1 and re-analyse to make them retrievable.`);
    }
    return [];
  }

  const [queryVector] = await embedBatch([queryText]);
  const score = (v) => {
    let dot = 0, a = 0, b = 0;
    for (let i = 0; i < v.length; i++) { dot += v[i] * queryVector[i]; a += v[i] * v[i]; b += queryVector[i] * queryVector[i]; }
    return dot / (Math.sqrt(a) * Math.sqrt(b));
  };

  return rows
    .map(r => ({ path: r.path, content: r.content, score: score(r.embedding) }))
    .sort((x, y) => y.score - x.score)
    .slice(0, topK);
}

/**
 * Read a repository and describe it. Returns the profile and the matches; the
 * caller persists them.
 */
export async function analyzeRepository({ access, repoFullName, userId, blueprintId, datasets = [] }) {
  const tree = await readTree(access, repoFullName);
  const { selected, capped } = selectFiles(tree.files);

  const files = [];
  for (const f of selected) {
    const raw = await readFile(access, repoFullName, f.path);
    if (!raw) continue;
    // Source carries connection strings, seed data and credentials far more
    // often than a wiki page does. "They gave us access" is not an exemption.
    const { redactedText } = regexRedact(raw);
    files.push({ path: f.path, category: f.category, content: redactedText });
  }

  const profile = await deriveProfile(files);
  const matches = await matchDatasets(datasets, profile.entities);
  const { stored } = await storeCodeChunks({ userId, blueprintId, repoFullName, files });

  return {
    profile,
    matches,
    stats: {
      filesInRepo: tree.files.length,
      filesRead:   files.length,
      chunks:      stored,
      // Both mean "this profile describes part of the repository, not all of
      // it", and the screen should be able to say so.
      partial:     capped || tree.truncated,
    },
  };
}
