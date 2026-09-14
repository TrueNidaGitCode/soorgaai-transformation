/**
 * WhatsApp Business through the owner's own Meta app: the webhook reads
 * Meta's payload, checks Meta's signature, answers the verification, and
 * replies are read the way an export's are.
 */
import { describe, it, expect } from 'vitest';
import crypto from 'crypto';

const T = '../eame-template/';
// Meta's documented delivery shape, two messages and a status update.
const PAYLOAD = { object: 'whatsapp_business_account', entry: [{ id: '1', changes: [
  { field: 'messages', value: { metadata: { phone_number_id: '111' }, contacts: [{ wa_id: '919800000001', profile: { name: 'Priya' } }],
    messages: [
      { id: 'wamid.1', from: '919800000001', timestamp: '1789600000', type: 'text', text: { body: 'Yes coach' } },
      { id: 'wamid.2', from: '919800000002', timestamp: '1789600100', type: 'button', button: { text: 'Not coming' } },
    ] } },
  { field: 'messages', value: { statuses: [{ id: 'wamid.1', status: 'read' }] } },
] }] };

describe('the webhook', () => {
  it('flattens what Meta delivers, names the sender, and skips status updates', async () => {
    const { messagesIn } = await import(T + 'services/connectors/whatsapp.js');
    const m = messagesIn(PAYLOAD);
    expect(m.map(x => [x.name || x.phone, x.text, x.phoneNumberId])).toEqual([['Priya', 'Yes coach', '111'], ['919800000002', 'Not coming', '111']]);
    expect(m[0].at.toISOString()).toBe(new Date(1789600000 * 1000).toISOString());
    expect(messagesIn({})).toEqual([]);
  });

  it('accepts only a payload Meta signed with the app secret, and any payload when none was given', async () => {
    const { signatureOk } = await import(T + 'controllers/whatsappController.js');
    const raw = Buffer.from(JSON.stringify(PAYLOAD));
    const sig = 'sha256=' + crypto.createHmac('sha256', 'app-secret').update(raw).digest('hex');
    expect(signatureOk(raw, sig, 'app-secret')).toBe(true);
    expect(signatureOk(raw, 'sha256=' + '0'.repeat(64), 'app-secret')).toBe(false);
    expect(signatureOk(raw, '', 'app-secret')).toBe(false);
    expect(signatureOk(raw, '', '')).toBe(true);
  });

  it('answers the verification with the challenge only for its own token', async () => {
    process.env.JWT_SECRET = 'app-secret';
    const { verify, verifyToken } = await import(T + 'controllers/whatsappController.js');
    const res = () => ({ code: 0, body: '', status(c) { this.code = c; return this; }, send(b) { this.body = b; return this; } });
    let r = res(); verify({ query: { 'hub.mode': 'subscribe', 'hub.verify_token': verifyToken(), 'hub.challenge': '4242' } }, r);
    expect([r.code, r.body]).toEqual([200, '4242']);
    r = res(); verify({ query: { 'hub.mode': 'subscribe', 'hub.verify_token': 'wrong', 'hub.challenge': '4242' } }, r);
    expect(r.code).toBe(403);
    expect(verifyToken()).toHaveLength(32);
  });

  it('reads replies the way the export does', async () => {
    const { classifyReply, fields, provides, kind } = await import(T + 'services/connectors/whatsapp.js');
    expect(kind).toBe('whatsapp-business');
    expect(classifyReply('Yes coach')).toBe('present');
    expect(classifyReply('Not coming, fever')).toBe('absent');
    expect(classifyReply('Is there practice tomorrow?')).toBe('');
    expect(fields.map(f => f.name)).toEqual(['phoneNumberId', 'accessToken', 'appSecret', 'mode']);
    expect(provides).toContain('status');
  });

  it('ships with an application whose industry names WhatsApp, and not otherwise', async () => {
    const { sourcesForBlueprint, connectorKindsFor } = await import('../services/sourceCatalogService.js');
    const { buildRuntime } = await import('../services/eameProjectBuilder.js');
    const sports = sourcesForBlueprint({ industryFit: { industry: 'Sports Academies' } });
    expect(connectorKindsFor(sports)).toEqual(['whatsapp']);
    const paths = buildRuntime({ appName: 'x', connectors: connectorKindsFor(sports) }).map(f => f.path);
    expect(paths).toContain('services/connectors/whatsapp.js');
    expect(paths).toContain('routes/whatsappRoutes.js');
    expect(paths).not.toContain('services/connectors/jira.js');
    const none = buildRuntime({ appName: 'x', connectors: [] }).map(f => f.path);
    expect(none).not.toContain('services/connectors/whatsapp.js');
  });
});

/**
 * The field said optional and the gate refused without it, so connecting
 * failed with "App secret (optional, checks that messages really come from
 * Meta) is needed" — a label written as an explanation, read back as an error.
 */
describe('a field that says optional is optional', () => {
  it('lets a business number connect without an app secret', async () => {
    const wa = await import('../eame-template/services/connectors/whatsapp.js');
    const appSecret = wa.fields.find(f => f.name === 'appSecret');
    expect(appSecret.required).toBe(false);
    // Short enough that "<label> is needed" reads as a sentence.
    expect(appSecret.label).toBe('App secret');
    expect(appSecret.hint).toMatch(/webhook address/);
  });

  it('keeps the fields that genuinely are needed', async () => {
    const wa = await import('../eame-template/services/connectors/whatsapp.js');
    for (const name of ['phoneNumberId', 'accessToken']) {
      expect(wa.fields.find(f => f.name === name).required).not.toBe(false);
    }
  });

  it('never leaves an explanation stranded in a label', async () => {
    // The label is what an error says; anything parenthetical belongs in hint.
    const wa = await import('../eame-template/services/connectors/whatsapp.js');
    for (const f of wa.fields) expect(f.label).not.toMatch(/\(optional/i);
  });
});
