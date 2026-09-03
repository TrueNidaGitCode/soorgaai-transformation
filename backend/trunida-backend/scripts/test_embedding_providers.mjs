/**
 * Proves the embedding layer is provider-agnostic.
 *
 * Provider switching is tested in CHILD PROCESSES with different env vars,
 * because that is what a real switch is: change one line, restart. Doing it
 * with in-process re-imports gives false results — a cache-busted import of
 * one module still reuses its cached dependencies, which made an earlier
 * version of this test report a failure that did not exist.
 *
 *   node scripts/test_embedding_providers.mjs
 */

import 'dotenv/config';
import { execFileSync } from 'child_process';

let pass = true;
const check = (label, ok, detail = '') => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ' — ' + detail : ''}`);
  if (!ok) pass = false;
};

/** Run a snippet in a fresh node process under the given env. */
function inProcess(env, code) {
  try {
    const out = execFileSync(process.execPath, ['-e', code], {
      env: { ...process.env, ...env },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { ok: true, out: out.trim() };
  } catch (err) {
    return { ok: false, out: ((err.stdout || '') + (err.stderr || '')).trim() };
  }
}

// ── 1. Unknown provider ─────────────────────────────────────────────────────
console.log('1. an unknown provider is rejected, not silently defaulted');
{
  const r = inProcess(
    { EMBEDDING_PROVIDER: 'definitely-not-real' },
    `import('./services/embeddingService.js').then(()=>console.log('LOADED')).catch(e=>console.log('THREW:'+e.message))`
  );
  check('throws on unknown provider', /THREW:.*not a known provider/.test(r.out), r.out.slice(0, 80));
}

// ── 2. Index naming per width, in real processes ────────────────────────────
console.log('\n2. the vector index name cannot collide across widths');
{
  const name = env => inProcess(env,
    `import('./services/hybridRetrievalService.js').then(m=>console.log(m.VECTOR_INDEX_NAME))`).out;

  const a = name({ EMBEDDING_PROVIDER: 'gemini', EMBEDDING_DIMENSIONS: '1536' });
  const b = name({ EMBEDDING_PROVIDER: 'selfhosted', EMBEDDING_DIMENSIONS: '768' });
  const c = name({ EMBEDDING_PROVIDER: 'openai', EMBEDDING_DIMENSIONS: '3072' });

  check('1536 keeps the existing production index', a === 'knowledge_chunk_vector_index', a);
  check('768 gets its own index', b === 'knowledge_chunk_vector_index_768', b);
  check('3072 gets its own index', c === 'knowledge_chunk_vector_index_3072', c);
  check('no two widths share an index', new Set([a, b, c]).size === 3);
}

// ── 3. The width guard ──────────────────────────────────────────────────────
console.log('\n3. a wrong-width vector is refused rather than stored');
{
  const { assertWidth, EMBEDDING_DIMENSIONS } = await import('../services/embeddingService.js');
  try {
    assertWidth([new Array(EMBEDDING_DIMENSIONS).fill(0)]);
    check('accepts a correctly-sized vector', true, `${EMBEDDING_DIMENSIONS} dims`);
  } catch (err) {
    check('accepts a correctly-sized vector', false, err.message.slice(0, 80));
  }
  try {
    assertWidth([new Array(EMBEDDING_DIMENSIONS).fill(0), new Array(7).fill(0)]);
    check('rejects a wrong-sized vector', false, 'it was accepted');
  } catch (err) {
    check('rejects a wrong-sized vector', /incomparable/.test(err.message), err.message.slice(0, 100));
  }
}

// ── 4. Gemini, live, at the production width ────────────────────────────────
console.log('\n4. Gemini works at the width the production index uses');
if (!process.env.GOOGLE_API_KEY) {
  check('gemini live check', false, 'GOOGLE_API_KEY not set — skipped');
} else {
  const r = inProcess(
    { EMBEDDING_PROVIDER: 'gemini', EMBEDDING_DIMENSIONS: '1536', EMBEDDING_MODEL: '' },
    `import('./services/embeddingService.js').then(async m => {
       const v = await m.embedBatch(['checksum verification failed during ECU flash','second text']);
       const u = await m.embedBatchWithUsage(['token accounting']);
       console.log(JSON.stringify({
         dims: m.EMBEDDING_DIMENSIONS, model: m.EMBEDDING_MODEL,
         prov: m.EMBEDDING_PROVENANCE, widths: v.map(x=>x.length), tokens: u.promptTokens,
       }));
     }).catch(e=>console.log('ERR:'+e.message))`
  );
  try {
    const d = JSON.parse(r.out);
    check('reports 1536', d.dims === 1536, String(d.dims));
    check('returns 1536-wide vectors', d.widths.every(w => w === 1536), d.widths.join(','));
    check('batches more than one', d.widths.length === 2);
    check('stamps provenance', d.prov.embeddingProvider === 'gemini', JSON.stringify(d.prov));
    check('meters non-zero tokens', d.tokens > 0, `${d.tokens} tokens`);
  } catch {
    check('gemini live check', false, r.out.slice(0, 140));
  }
}

// ── 5. Retrieval only compares matching provenance ──────────────────────────
console.log('\n5. retrieval refuses to compare across embedding spaces');
{
  const src = await import('fs').then(fs =>
    fs.readFileSync('./services/hybridRetrievalService.js', 'utf8'));
  check('semantic query filters on provider', /embeddingProvider:\s*EMBEDDING_PROVIDER/.test(src));
  check('semantic query filters on model', /embeddingModel:\s*EMBEDDING_MODEL/.test(src));
  check('writes stamp provenance', /\.\.\.EMBEDDING_PROVENANCE/.test(src));
  check('re-embeds when provenance changed',
    /prev\.embeddingProvider !== EMBEDDING_PROVIDER/.test(src));
}

console.log(pass ? '\nPASS — providers switch by configuration alone, with no silent cross-space comparison'
                 : '\nFAILED');
process.exit(pass ? 0 : 1);
