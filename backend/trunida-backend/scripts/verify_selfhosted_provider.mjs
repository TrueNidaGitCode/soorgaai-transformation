/**
 * Verify the selfhosted provider path end to end WITHOUT needing a real
 * model server.
 *
 * Stands up a tiny OpenAI-compatible endpoint, points SELFHOSTED_BASE_URL
 * at it, and runs the real classifyDocument() through the real llmService
 * chain. If this passes, the wiring is correct and pointing
 * SELFHOSTED_BASE_URL at Ollama is the only remaining step.
 *
 * Run from backend/trunida-backend:
 *   node scripts/verify_selfhosted_provider.mjs
 */
import 'dotenv/config';
import http from 'http';

const PORT = 11555;

// Minimal OpenAI-compatible /chat/completions. Echoes back the JSON shape
// classifyDocument expects, so we are testing OUR plumbing, not a model.
const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', c => (body += c));
  req.on('end', () => {
    const payload = JSON.parse(body || '{}');
    const seenSystem = (payload.messages || []).some(m => m.role === 'system');
    const reply = JSON.stringify({
      docType: 'other',
      summary: 'Stub summary proving the selfhosted transport works.',
      keywords: ['OTA flash', 'signature verification', 'ECU', 'bootloader', 'CAN bus'],
    });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      id: 'stub', object: 'chat.completion', model: payload.model,
      choices: [{ index: 0, message: { role: 'assistant', content: reply }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
      _sawSystemPrompt: seenSystem,
    }));
  });
});

await new Promise(r => server.listen(PORT, r));
console.log(`stub OpenAI-compatible server on http://localhost:${PORT}/v1\n`);

// Configure exactly as SELFHOSTED_MODEL_SETUP.md instructs.
process.env.SELFHOSTED_BASE_URL = `http://localhost:${PORT}/v1`;
process.env.SELFHOSTED_MODEL = 'llama3.2:3b';
process.env.PROVIDER_CHAIN = 'selfhosted';

// Imported AFTER the env is set, since the module reads it at call time.
const { generate } = await import('../services/llmService.js');
const { classifyDocument } = await import('../services/confluenceContentService.js');

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
  if (!ok) failures++;
};

// 1. Raw generate() through the chain.
try {
  const { text } = await generate({ systemPrompt: 'sys', userMessage: 'hello', maxTokens: 200 });
  check('generate() routes to selfhosted', text.includes('Stub summary'));
} catch (err) {
  check('generate() routes to selfhosted', false, err.message);
}

// 2. The real classification the linking code calls.
try {
  const r = await classifyDocument('OTA flash aborted', 'Signature verification failed on the ECU bootloader.');
  check('classifyDocument parses the response', !r.failed, r.failed ? r.error : '');
  check('  keywords extracted', r.keywords.length === 5, JSON.stringify(r.keywords.slice(0, 3)));
  check('  summary extracted', !!r.summary, r.summary.slice(0, 40));
} catch (err) {
  check('classifyDocument parses the response', false, err.message);
}

// 3. A failing server must be reported, not silently swallowed as empty.
process.env.SELFHOSTED_BASE_URL = 'http://localhost:1/v1';
try {
  const r = await classifyDocument('t', 'x');
  check('unreachable server -> failed:true', r.failed === true, r.error ? r.error.slice(0, 60) : '');
} catch (err) {
  check('unreachable server -> failed:true', false, err.message);
}

server.close();
console.log(`\n${failures ? failures + ' failed' : 'all checks passed'}`);
process.exit(failures ? 1 : 0);
