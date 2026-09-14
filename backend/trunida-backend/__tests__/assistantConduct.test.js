/**
 * How every application speaks.
 *
 * The conduct is a product standard, not a per-build decision: it is applied
 * to every model call the application makes, so a build that forgot it — or
 * that predates it — is still held to it. These tests are what stops a later
 * edit from quietly dropping a rule the customer would notice.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

const T = '../eame-template/services/';

describe('the conduct', () => {
  it('answers first, cites its evidence, and admits what it cannot tell', async () => {
    const { conduct } = await import(T + 'assistant.js');
    const c = conduct({ appName: 'Six Cricket', purpose: 'take the roll call from WhatsApp' });
    expect(c).toMatch(/Answer the question first/i);
    expect(c).toMatch(/Say where it came from/i);
    expect(c).toMatch(/cannot tell that from the connected data/i);
    expect(c).toMatch(/Never invent a record/i);
    expect(c).toContain('Six Cricket');
    expect(c).toContain('take the roll call from WhatsApp');
  });

  it('forbids the openings and the machinery a customer should never meet', async () => {
    const { conduct } = await import(T + 'assistant.js');
    const c = conduct({ appName: 'X' });
    // The support-bot tells.
    expect(c).toMatch(/How can I assist you today/);
    expect(c).toMatch(/Absolutely/);
    expect(c).toMatch(/No emoji/);
    // Svarg's stages are how the application came to exist, not people the
    // customer works with.
    expect(c).toMatch(/NEVER NAME THE MACHINERY/);
    expect(c).toMatch(/internal stages, agents, pipelines/);
  });

  it('says plain text, because the page has no Markdown renderer', async () => {
    const { conduct } = await import(T + 'assistant.js');
    const c = conduct({});
    expect(c).toMatch(/Plain sentences/);
    expect(c).toMatch(/no bullet characters/i);
  });

  it('frames the application\'s own prompt rather than replacing it', async () => {
    const { frame } = await import(T + 'assistant.js');
    const own = 'Roll calls are one row per session per player. status is present or absent.';
    const out = frame(own, { appName: 'Six Cricket' });
    // The subject survives, and comes last so it is freshest.
    expect(out).toContain(own);
    expect(out.indexOf('Answer the question first')).toBeLessThan(out.indexOf(own));
    expect(out).toMatch(/WHAT THIS APPLICATION IS ABOUT/);
    // A call with no prompt of its own is still held to the conduct.
    expect(frame('', { appName: 'X' })).toMatch(/Answer the question first/);
    expect(frame(null)).toMatch(/Answer the question first/);
  });
});

describe('the model call every application makes', () => {
  // The wrapper is tested as the file an application actually receives:
  // composed by the builder into a real directory, with llmCore replaced by a
  // recorder. Mocking the template copy would test a file that never ships —
  // llmCore.js does not exist in the template, only in a composed project.
  let dir;
  const compose = async () => {
    const { buildRuntime } = await import('../services/eameProjectBuilder.js');
    // Inside the backend so node_modules still resolves for the composed files.
    dir = path.join(process.cwd(), '.tmp-conduct-' + Date.now());
    fs.mkdirSync(path.join(dir, 'services'), { recursive: true });
    for (const f of buildRuntime({ appName: 'Six Cricket' })) {
      if (f.path === 'services/llmService.js' || f.path === 'services/assistant.js') {
        fs.writeFileSync(path.join(dir, f.path), f.content);
      }
    }
    // The recorder stands in for the provider module the wrapper delegates to.
    fs.writeFileSync(path.join(dir, 'services/llmCore.js'),
      'export const seen = [];\n' +
      'export async function generate(opts) { seen.push(opts); return { text: "ok" }; }\n');
    return import(pathToFileURL(path.join(dir, 'services/llmService.js')).href);
  };

  beforeEach(() => { process.env.APP_NAME = 'Six Cricket'; });
  afterEach(() => {
    delete process.env.APP_NAME;
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
    dir = null;
  });

  it('applies the conduct to a prompt written by generated code, and passes the rest through', async () => {
    const mod = await compose();
    const core = await import(pathToFileURL(path.join(dir, 'services/llmCore.js')).href);
    await mod.generate({ systemPrompt: 'Roll calls are one row per session.', userMessage: 'who is absent tomorrow?', maxTokens: 250 });
    const sent = core.seen[0];
    expect(sent.systemPrompt).toMatch(/Answer the question first/);
    expect(sent.systemPrompt).toContain('Roll calls are one row per session.');
    expect(sent.systemPrompt).toContain('Six Cricket');
    expect(sent.userMessage).toBe('who is absent tomorrow?');
    expect(sent.maxTokens).toBe(250);
  });

  it('leaves a call that is not an answer to a person alone', async () => {
    const mod = await compose();
    const core = await import(pathToFileURL(path.join(dir, 'services/llmCore.js')).href);
    await mod.generateRaw({ systemPrompt: 'Classify: record or question.', userMessage: 'z' });
    expect(core.seen[0].systemPrompt).toBe('Classify: record or question.');
  });
});

describe('what every application ships with', () => {
  it('ships the conduct, the wrapper and the provider module it wraps', async () => {
    const { buildRuntime } = await import('../services/eameProjectBuilder.js');
    const paths = buildRuntime({ appName: 'Six Cricket' }).map(f => f.path);
    expect(paths).toContain('services/assistant.js');
    expect(paths).toContain('services/llmService.js');
    expect(paths).toContain('services/llmCore.js');
  });

  it('gives the application the wrapper, not Svarg\'s own provider module, as llmService', async () => {
    const { buildRuntime } = await import('../services/eameProjectBuilder.js');
    const files = buildRuntime({ appName: 'Six Cricket' });
    const wrapper = files.find(f => f.path === 'services/llmService.js');
    const core = files.find(f => f.path === 'services/llmCore.js');
    // The wrapper is the small one that imports the other.
    expect(wrapper.content).toContain("from './llmCore.js'");
    expect(wrapper.content).toContain("from './assistant.js'");
    // The provider module is the real one, unchanged.
    expect(core.content).toMatch(/PROVIDER_CHAIN/);
    expect(core.content).not.toContain("from './assistant.js'");
  });
});
