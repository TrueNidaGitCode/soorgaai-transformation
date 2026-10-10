/**
 * What leaves a delivered application (eame-template/services/egressLog.js).
 *
 * The log is the customer's evidence, so the tests that matter are the ones a
 * sceptical auditor would ask for: every request is sorted to the right
 * destination, credentials never land in the log, a recording is described
 * rather than copied, an edited entry no longer matches its seal, and there is
 * no way out of the application that does not pass through the recorder.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  classify, purposeOf, maskUrl, maskHeaders, describeBody, senderFromStack, requestUrl, entryHash, BODY_KEEP,
} from '../eame-template/services/egressLog.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const T = path.join(here, '..', 'eame-template');

const ENV = {
  SELFHOSTED_BASE_URL: 'https://svarg.example/api/gateway/v1',
  SVARG_SIGNALS_URL: 'https://svarg.example/api/gateway/v1/signals',
  SVARG_NOTIFY_URL: 'https://svarg.example/api/gateway/v1/notify',
  SVARG_AUTH_URL: 'https://svarg.example/api/auth/oauth/google?tenant=1',
};
let saved;
beforeEach(() => { saved = {}; for (const k of Object.keys(ENV)) { saved[k] = process.env[k]; process.env[k] = ENV[k]; } });
afterEach(() => { for (const k of Object.keys(ENV)) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } });

describe('where a request went', () => {
  it('sorts model calls through Svarg\'s gateway as AI, not as Svarg', () => {
    expect(classify('https://svarg.example/api/gateway/v1/chat/completions')).toBe('ai');
    expect(classify('https://svarg.example/api/gateway/v1/embeddings')).toBe('ai');
    expect(classify('https://svarg.example/api/gateway/v1/audio/transcriptions')).toBe('ai');
  });

  it('sorts everything else on Svarg as Svarg', () => {
    expect(classify('https://svarg.example/api/gateway/v1/signals')).toBe('svarg');
    expect(classify('https://svarg.example/api/gateway/v1/notify')).toBe('svarg');
    expect(classify('https://svarg.example/api/auth/exchange')).toBe('svarg');
  });

  it('sorts a model provider reached directly as AI', () => {
    expect(classify('https://generativelanguage.googleapis.com/v1beta/models/x:generateContent')).toBe('ai');
    expect(classify('https://api.openai.com/v1/chat/completions')).toBe('ai');
    expect(classify('https://api.sarvam.ai/speech-to-text')).toBe('ai');
  });

  it('sorts the customer\'s own vendors as their own systems', () => {
    expect(classify('https://www.zohoapis.in/crm/v2/Contacts')).toBe('own');
    expect(classify('https://graph.facebook.com/v21.0/123')).toBe('own');
    expect(classify('not a url')).toBe('own');
  });

  it('says what each was for', () => {
    expect(purposeOf('https://svarg.example/api/gateway/v1/notify', 'svarg')).toBe('Email digest');
    expect(purposeOf('https://svarg.example/api/gateway/v1/signals', 'svarg')).toBe('Usage signals');
    expect(purposeOf('https://svarg.example/api/gateway/v1/chat/completions', 'ai')).toBe('Model call');
    expect(purposeOf('https://svarg.example/api/gateway/v1/audio/transcriptions', 'ai')).toBe('Transcribe a recording');
    expect(purposeOf('https://www.zohoapis.in/crm/v2/Contacts', 'own')).toBe('Request to www.zohoapis.in');
  });
});

describe('the log is not a place to steal a key', () => {
  it('masks credentials in headers, whatever shape they come in', () => {
    const asObject = maskHeaders({ Authorization: 'Bearer sk-live-123', 'Content-Type': 'application/json', 'api-subscription-key': 'abc' });
    expect(asObject.authorization).not.toContain('sk-live-123');
    expect(asObject.authorization).toMatch(/hidden/);
    expect(asObject['api-subscription-key']).toMatch(/hidden/);
    expect(asObject['content-type']).toBe('application/json');
    const asHeaders = maskHeaders(new Headers({ 'x-api-key': 'k', Accept: 'json' }));
    expect(asHeaders['x-api-key']).toMatch(/hidden/);
    expect(asHeaders.accept).toBe('json');
    expect(maskHeaders([['Cookie', 's=1']]).cookie).toMatch(/hidden/);
  });

  it('masks credentials in the address', () => {
    const u = maskUrl('https://graph.facebook.com/x?access_token=EAAB123&fields=name');
    expect(u).not.toContain('EAAB123');
    expect(u).toContain('fields=name');
    expect(maskUrl('https://u:secretpw@host.example/p')).not.toContain('secretpw');
  });
});

describe('what is kept of a body', () => {
  it('keeps text whole, with the fingerprint of all of it', () => {
    const body = Buffer.from(JSON.stringify({ messages: [{ role: 'user', content: 'How many customers went quiet?' }] }));
    const d = describeBody(body, 'application/json');
    expect(d.body).toContain('went quiet');
    expect(d.requestBytes).toBe(body.length);
    expect(d.bodySha256).toMatch(/^[0-9a-f]{64}$/);
    expect(d.truncated).toBe(false);
  });

  it('says a recording left, without keeping a second copy of it', () => {
    const audio = Buffer.alloc(30000, 7).toString('base64');
    const d = describeBody(Buffer.from(JSON.stringify({ audio, mime_type: 'audio/ogg' })), 'application/json');
    expect(d.body).not.toContain(audio.slice(0, 100));
    expect(d.body).toMatch(/\[encoded file: [\d,]+ bytes, not kept in this log\]/);
    expect(d.body).toContain('audio/ogg');
  });

  it('keeps only size and fingerprint of a binary body', () => {
    const d = describeBody(Buffer.from([0, 1, 2, 3, 0, 255]), 'application/octet-stream');
    expect(d.body).toBe('');
    expect(d.requestBytes).toBe(6);
  });

  it('cuts a long body at 64 KB and says so', () => {
    const d = describeBody(Buffer.from('word '.repeat(30000)), 'text/plain');
    expect(d.body.length).toBe(BODY_KEEP);
    expect(d.truncated).toBe(true);
  });
});

describe('which part of the application sent it', () => {
  it('names the first file of the application\'s own on the stack', () => {
    const stack = 'Error\n    at senderFromStack (file:///app/services/egressLog.js:10:3)\n'
      + '    at fetch (file:///app/services/egressLog.js:20:3)\n'
      + '    at Object.create (file:///app/node_modules/openai/client.js:1:1)\n'
      + '    at generate (file:///app/services/llmCore.js:5:5)\n'
      + '    at answer (file:///app/services/answerService.js:42:9)';
    expect(senderFromStack(stack)).toBe('answerService.js');
    expect(senderFromStack('Error\n    at node:internal/x:1:1')).toBe('the application');
  });

  it('reads every argument shape http.request takes', () => {
    expect(requestUrl(['https://a.example/x?y=1'], 'https:').url).toBe('https://a.example/x?y=1');
    expect(requestUrl([{ protocol: 'https:', hostname: 'b.example', port: 8443, path: '/p' }], 'http:').url).toBe('https://b.example:8443/p');
    expect(requestUrl([{ host: 'c.example', path: '/q' }], 'http:').url).toBe('http://c.example/q');
    expect(requestUrl([new URL('https://d.example/'), { path: '/r?s=1' }], 'https:').url).toBe('https://d.example/r?s=1');
  });
});

describe('the chain', () => {
  const e = {
    seq: 7, at: new Date('2026-10-10T08:00:00Z'), category: 'ai', purpose: 'Model call', method: 'POST',
    url: 'https://svarg.example/api/gateway/v1/chat/completions', host: 'svarg.example', headers: { 'content-type': 'application/json' },
    sender: 'answerService.js', status: 200, error: '', durationMs: 900, requestBytes: 120, bodySha256: 'a'.repeat(64),
    storedSha256: 'b'.repeat(64), bodyKind: 'application/json', truncated: false, responseBytes: null, model: 'gemini',
    unrecordedBefore: 0, prevHash: 'c'.repeat(64),
  };

  it('is the same seal for the same entry, whatever the key order', () => {
    const reordered = Object.fromEntries(Object.entries(e).reverse());
    expect(entryHash(reordered)).toBe(entryHash(e));
  });

  it('no longer matches once anything sealed is changed', () => {
    const seal = entryHash(e);
    expect(entryHash({ ...e, url: e.url + '?x' })).not.toBe(seal);
    expect(entryHash({ ...e, prevHash: 'd'.repeat(64) })).not.toBe(seal);
    expect(entryHash({ ...e, headers: { 'content-type': 'text/plain' } })).not.toBe(seal);
  });

  it('does not seal the body itself, so a body can be pruned after 30 days', () => {
    expect(entryHash({ ...e, body: 'anything' })).toBe(entryHash(e));
  });
});

describe('there is no way out but through the recorder', () => {
  const files = [];
  const walk = (dir) => {
    for (const f of readdirSync(dir)) {
      const p = path.join(dir, f);
      if (f === 'node_modules' || f === 'frontend') continue;
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.m?js$/.test(f)) files.push(p);
    }
  };
  walk(T);

  it('opens no raw socket and starts no other process', () => {
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      expect(src, path.relative(T, f)).not.toMatch(/from ['"](node:)?(net|tls|dgram|child_process|http2|worker_threads)['"]/);
      expect(src, path.relative(T, f)).not.toMatch(/require\(['"](node:)?(net|tls|dgram|child_process|http2)['"]\)/);
      expect(src, path.relative(T, f)).not.toMatch(/new WebSocket\(/);
    }
  });

  it('is the first thing the server imports', () => {
    const server = readFileSync(path.join(T, 'server.js'), 'utf8');
    const firstImport = server.match(/^import .*$/m)[0];
    expect(firstImport).toBe("import './services/egressLog.js';");
  });

  it('records the global fetch and both http modules', () => {
    const src = readFileSync(path.join(T, 'services', 'egressLog.js'), 'utf8');
    expect(src).toContain('globalThis.fetch = wrapped;');
    expect(src).toContain("patchModule(http, 'http:');");
    expect(src).toContain("patchModule(https, 'https:');");
    expect(src).toContain('syncBuiltinESMExports()');
  });
});

describe('the owner\'s page', () => {
  const routes = readFileSync(path.join(T, 'routes', 'egressRoutes.js'), 'utf8');
  const shell = readFileSync(path.join(T, 'frontend', 'index.html'), 'utf8');

  it('is the owner\'s alone, every route', () => {
    for (const line of routes.split('\n').filter((l) => l.startsWith('router.'))) {
      expect(line).toContain('protect, requireOwner');
    }
  });

  it('has the three destinations, and goes through the one switcher', () => {
    const ui = readFileSync(path.join(T, 'frontend', 'egress.js'), 'utf8');
    expect(ui).toContain("var ORDER = ['svarg', 'ai', 'own'];");
    expect(shell).toContain("'ch-reports', 'ch-egress'];");
    expect(shell).toContain("egress: 'ch-egress'");
    expect(shell).toContain('<script src="egress.js" defer></script>');
    expect(ui).toContain("window.svargShowPanel('egress')");
  });
});
