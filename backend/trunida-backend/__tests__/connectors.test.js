/**
 * Phase B of "connectors in the application": credentials are sealed with a
 * key the platform never holds, rows from a source map onto a dataset's
 * columns, the schedule knows what is due, each connector reads its source's
 * shape correctly, and the connector files ship as fixed runtime.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

const T = '../eame-template/services/';

describe('sealing credentials', () => {
  const ORIGINAL = process.env.CONNECTOR_ENCRYPTION_KEY;
  beforeEach(() => { process.env.CONNECTOR_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64'); });
  afterEach(() => { process.env.CONNECTOR_ENCRYPTION_KEY = ORIGINAL; });

  it('round-trips a secret and refuses it under another key', async () => {
    const { encryptSecret, decryptSecret } = await import(T + 'connectorService.js');
    const box = encryptSecret('ATATT3x-token');
    expect(box.ciphertext).not.toContain('ATATT');
    expect(decryptSecret(box)).toBe('ATATT3x-token');
    process.env.CONNECTOR_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString('base64');
    expect(() => decryptSecret(box)).toThrow();
  });

  it('still seals when no key is set, deriving one from JWT_SECRET', async () => {
    process.env.CONNECTOR_ENCRYPTION_KEY = '';
    process.env.JWT_SECRET = 'tenant-secret';
    const { encryptSecret, decryptSecret } = await import(T + 'connectorService.js');
    expect(decryptSecret(encryptSecret('x'))).toBe('x');
  });
});

describe('mapping a source onto a dataset', () => {
  it('guesses by name and lets an explicit mapping win', async () => {
    const { guessMapping, mapOntoColumns } = await import(T + 'connectorService.js');
    const columns = ['issue_key', 'title', 'status', 'owner', '_source'];
    const guess = guessMapping(columns, ['key', 'summary', 'status', 'assignee']);
    expect(guess).toEqual({ issue_key: 'key', status: 'status' });

    const rows = mapOntoColumns({ columns }, [{ key: 'AC-1', summary: 'Nets', status: 'Open', assignee: 'Ravi' }], { ...guess, title: 'summary', owner: 'assignee' });
    expect(rows).toEqual([['AC-1', 'Nets', 'Open', 'Ravi']]);
  });
});

describe('the schedule', () => {
  it('knows what is due and never picks an on-demand source', async () => {
    const { dueConnectors } = await import(T + 'connectorService.js');
    const now = Date.parse('2026-09-13T12:00:00Z');
    const h = 60 * 60 * 1000;
    const docs = [
      { kind: 'jira', schedule: 'hourly', lastSyncAt: new Date(now - 2 * h) },
      { kind: 'jira', schedule: 'hourly', lastSyncAt: new Date(now - h / 2) },
      { kind: 'github', schedule: 'daily', lastSyncAt: null },
      { kind: 'confluence', schedule: 'manual', lastSyncAt: null },
    ];
    expect(dueConnectors(docs, now).map(d => d.kind)).toEqual(['jira', 'github']);
  });
});

describe('what each connector reads', () => {
  it('Jira: a project key becomes JQL, and ADF becomes text', async () => {
    const { toJql, adfToText } = await import(T + 'connectors/jira.js');
    expect(toJql('ac')).toBe('project = AC order by created DESC');
    expect(toJql('project = AC AND status != Done')).toBe('project = AC AND status != Done');
    const adf = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Nets ' }, { type: 'text', text: 'flooded' }] }, { type: 'paragraph', content: [{ type: 'text', text: 'again' }] }] };
    expect(adfToText(adf)).toBe('Nets flooded\nagain\n');
  });

  it('Confluence: storage HTML becomes readable text', async () => {
    const { htmlToText } = await import(T + 'connectors/confluence.js');
    expect(htmlToText('<h1>Fees</h1><p>Monthly &amp; quarterly.<br/>Due on the 5th.</p>')).toBe('Fees\nMonthly & quarterly.\nDue on the 5th.');
  });

  it('GitHub: the repository is owner/name, however it was pasted', async () => {
    const { describe: d } = await import(T + 'connectors/github.js');
    expect(d({ repo: 'https://github.com/svarg/academy.git' })).toBe('github.com/svarg/academy · both');
    expect(() => d({ repo: 'just-a-name' })).toThrow(/owner\/name/);
  });

  it('every connector declares the same frame', async () => {
    const { KINDS, catalog } = await import(T + 'connectorService.js');
    for (const k of Object.values(KINDS)) {
      expect(typeof k.test).toBe('function');
      expect(typeof k.pull).toBe('function');
      expect(k.fields.some(f => f.secret)).toBe(true);
      expect(k.provides.length).toBeGreaterThan(3);
    }
    expect(catalog().map(c => c.kind)).toEqual(['jira', 'confluence', 'github']);
    // The catalog never carries a function or a secret.
    expect(JSON.stringify(catalog())).not.toMatch(/function|apiToken":"[^"]+"/);
  });
});

describe('shipping', () => {
  it('the connector runtime is fixed, sourced from the template, and keyed in the tenant env', async () => {
    const { FIXED_PATHS } = await import('../services/eameSpec.js');
    const { buildRuntime } = await import('../services/eameProjectBuilder.js');
    const paths = buildRuntime({ appName: 'X' }).map(f => f.path);
    for (const p of ['services/connectorService.js', 'services/connectors/jira.js', 'services/connectors/confluence.js', 'services/connectors/github.js', 'controllers/connectorController.js', 'routes/connectorsRoutes.js']) {
      expect(FIXED_PATHS).toContain(p);
      expect(paths).toContain(p);
    }
    const { buildTenantEnv } = await import('../services/deployTargetService.js');
    const env = buildTenantEnv({
      deployment: { blueprintId: '000000000000000000000001', model: { modelId: 'gemini-flash' } },
      model: { type: 'frontier', apiModel: 'gemini-3.8-flash', displayName: 'Gemini' },
      gatewayToken: 'svd_x', gatewayBaseUrl: 'https://svarg.example/api/gateway',
      clusterUri: 'mongodb+srv://u:p@cluster.example/svarg?retryWrites=true', appName: 'App', ownerKey: 'sok_a',
    });
    expect(Buffer.from(env.CONNECTOR_ENCRYPTION_KEY, 'base64').length).toBe(32);
  });
});
