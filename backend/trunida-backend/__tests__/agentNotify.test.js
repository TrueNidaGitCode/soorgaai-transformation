/**
 * An agent telling somebody, without the application being able to send mail.
 *
 * A delivered application holds no model key; it must not hold a mail key
 * either, because a container that can send mail is a container worth
 * stealing. So it asks Svarg over the gateway with the per-deployment token it
 * already has, and Svarg sends.
 *
 * ── The property that matters most ─────────────────────────────────────────
 *
 * The application does not name a recipient, and could not. Svarg resolves the
 * owner from the deployment behind the token.
 *
 * An application that could name an address would be an open relay
 * authenticated by a token sitting in a container — and a compromised tenant,
 * or simply a confused agent, would be sending mail to strangers over Svarg's
 * sending domain. Losing that domain takes every sign-in code with it, for
 * every customer.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { composeDigest, composeSubject } from '../eame-template/services/notifyService.js';
import { sentToday, DAILY_CAP } from '../services/tenantNotifyService.js';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

describe('the application cannot choose who to write to', () => {
  const tenant = read('../eame-template/services/notifyService.js');
  const svarg = read('../services/tenantNotifyService.js');

  it('sends no address, anywhere in the request', () => {
    // The body is a subject and lines. Nothing else, and nothing addressable.
    expect(tenant).toContain('{ subject: composeSubject(lines), lines }');
    // Asserted against the code with its comments stripped: the prose here
    // says "the application does not name a recipient", and a naive search
    // would flag that as the very thing it promises not to do.
    const bare = read('../eame-template/services/notifyService.js')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
    expect(bare).not.toMatch(/recipient/i);
    expect(bare).not.toMatch(/email/i);
    expect(bare).not.toMatch(/\bto\s*:/);
  });

  it('resolves the owner on the Svarg side, from the deployment', () => {
    expect(svarg).toContain('export async function ownerEmailFor(deployment)');
    expect(svarg).toContain('User.findById(deployment.userId)');
  });

  it('refuses to send when there is no owner to find', () => {
    expect(svarg).toContain("if (!to) return { sent: false, reason: 'No owner address for this deployment.' };");
  });

  it('takes the recipient from the deployment, never from the request body', () => {
    const ctrl = read('../controllers/gatewayController.js');
    const handler = ctrl.slice(ctrl.indexOf('export async function notify('));
    expect(handler).toContain('subject: req.body?.subject');
    expect(handler).toContain('lines: req.body?.lines');
    // If this ever reads an address off the request, the whole design is gone.
    expect(handler).not.toMatch(/req\.body\??\.?\.?(to|email|recipient)/);
  });

  it('is authenticated by the deployment token like every other gateway route', () => {
    const ctrl = read('../controllers/gatewayController.js');
    const handler = ctrl.slice(ctrl.indexOf('export async function notify('));
    expect(handler).toContain('await authenticate(bearer(req))');
    expect(handler).toContain('401');
  });
});

describe('a loop in a tenant does not become a mailing', () => {
  it('counts against a daily cap held on the deployment, not in memory', () => {
    // A restart must not hand somebody a fresh allowance.
    const today = new Date('2026-09-19T10:00:00Z');
    expect(sentToday({ notify: { day: '2026-09-19', count: 4 } }, today)).toBe(4);
    expect(sentToday({ notify: { day: '2026-09-18', count: 19 } }, today)).toBe(0);
    expect(sentToday({}, today)).toBe(0);
  });

  it('has a cap at all', () => {
    expect(DAILY_CAP).toBeGreaterThan(0);
    expect(DAILY_CAP).toBeLessThanOrEqual(50);
  });

  it('answers a refusal with a reason rather than an error', () => {
    /*
     * A 4xx would have the application retry-looping against its own cap. A
     * refusal is a fact to record and carry on from.
     */
    const ctrl = read('../controllers/gatewayController.js');
    const handler = ctrl.slice(ctrl.indexOf('export async function notify('));
    expect(handler).toContain('return res.json(r);');
  });
});

describe('one message, not six', () => {
  it('combines every agent that found something in the same tick', () => {
    const lines = composeDigest([
      { ran: true, name: 'Dropout Watch', new: ['Ravi', 'Meera'], resolved: [] },
      { ran: true, name: 'Fee Watch', new: ['INV-88'], resolved: ['INV-12'] },
    ]);
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain('Dropout Watch: 2 new');
    expect(lines[2]).toContain('Fee Watch: 1 resolved');
  });

  it('says nothing about what is merely still true', () => {
    /*
     * The rule the feature lives or dies by. An agent spends most of its life
     * looking at something that has not changed, and repeating it every
     * morning is how somebody learns to stop reading.
     */
    const lines = composeDigest([
      { ran: true, name: 'Fee Watch', new: [], stillTrue: ['INV-12', 'INV-13'], resolved: [] },
    ]);
    expect(lines).toEqual([]);
  });

  it('ignores an agent that failed', () => {
    expect(composeDigest([{ ran: false, name: 'Broken', error: 'nope' }])).toEqual([]);
    expect(composeDigest(null)).toEqual([]);
  });

  it('writes a subject worth reading in an inbox list', () => {
    expect(composeSubject(['Dropout Watch: 2 new — Ravi, Meera'])).toBe('Dropout Watch: 2 new');
    expect(composeSubject(['a — x', 'b — y'])).toBe('2 things to look at');
    expect(composeSubject([])).toBe('');
  });

  it('sends nothing at all when nothing changed', () => {
    const tenant = read('../eame-template/services/notifyService.js');
    expect(tenant).toContain("if (!lines.length) return { sent: false, reason: 'nothing new' };");
  });
});

describe('the application never fails, or waits, on its own reporting', () => {
  const tenant = read('../eame-template/services/notifyService.js');

  it('swallows a delivery failure', () => {
    // The finding is already on the board, which is the durable copy.
    expect(tenant).toContain("console.warn('[notify] not delivered —', err.message);");
  });

  it('runs in full with no notify url set', () => {
    // A self-hosted install that wants no contact with Svarg reads the board.
    expect(tenant).toContain("if (!configured()) return { sent: false, reason: 'no notify url' };");
  });

  it('is given the address by the deployment, not hard-coded', () => {
    expect(tenant).toContain('process.env.SVARG_NOTIFY_URL');
    const deploy = read('../services/deployTargetService.js');
    expect(deploy).toContain('SVARG_NOTIFY_URL: `${gatewayBaseUrl}/v1/notify`');
  });
});

describe('the agents are wired into the application', () => {
  it('runs from the application’s own process, beside the connector syncs', () => {
    const server = read('../eame-template/server.js');
    expect(server).toContain('startAgentScheduler(');
    // Handed the pipeline rather than importing it inside the service, so the
    // one place an agent spends money is visible at the call site.
    expect(server).toContain("answer({ question, kind: 'own' })");
  });

  it('watches the owner’s real data, never the simulated rows', () => {
    /*
     * A new application ships with sample rows so it can answer on day one. A
     * morning briefing built on those would be worse than sending nothing.
     */
    const server = read('../eame-template/server.js');
    expect(server).toContain("kind: 'own'");
  });

  it('is owner-only, because an agent sends mail', () => {
    const routes = read('../eame-template/routes/agentsRoutes.js');
    for (const line of routes.split('\n').filter(l => /^router\./.test(l))) {
      expect(line, line).toContain('ownerOnly');
    }
  });

  it('is not mistaken for a conversation by the turn log', () => {
    const log = read('../eame-template/services/turnLog.js');
    expect(log).toMatch(/const SKIP = .*agents/);
  });

  it('reaches a customer’s repository', async () => {
    const { buildManifest } = await import('../services/eameProjectBuilder.js');
    const paths = buildManifest({ appName: 'Probe' }).map(f => f.path);
    for (const p of ['services/agentService.js', 'services/notifyService.js',
      'routes/agentsRoutes.js', 'controllers/agentsController.js']) {
      expect(paths, p).toContain(p);
    }
  });
});
