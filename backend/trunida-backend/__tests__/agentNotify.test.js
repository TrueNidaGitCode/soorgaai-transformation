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

  it('lets anyone signed in read a finding, and only the owner change a watcher', () => {
    /*
     * ── Why this rule changed ──────────────────────────────────────────────
     *
     * Every route here used to be owner-only, which was right while the
     * screen was a control panel. It stopped being right when findings became
     * the product: the people who would actually chase the parent who stopped
     * coming are the front desk, and they could not see a single finding.
     *
     * The line now sits between deciding and reading. A watcher runs
     * unattended and sends mail in the owner's name, so starting, pausing and
     * deleting one stays theirs. Reading what it found, and drafting a reply
     * to it — which sends nothing — does not.
     */
    const routes = read('../eame-template/routes/agentsRoutes.js');
    const lines = routes.split('\n').filter(l => /^router\./.test(l));
    expect(lines.length).toBeGreaterThan(4);

    /*
     * The line was once "findings, versus everything else". It is really
     * "reading, versus changing", and the two stopped agreeing when the
     * agents screen became a map: a colleague could read every finding and
     * not see one thing that produced it, on a page that told them nothing
     * could be watched until records arrived.
     *
     * Two writes are deliberately not the owner's. Marking a finding opened
     * is telemetry about the reader themselves, and drafting a reply writes
     * a message and sends nothing — the person who would chase the client is
     * the person who should be able to draft to them.
     */
    const READERS_MAY_WRITE = ["'/findings/opened'", "'/findings/:id/draft'"];

    for (const line of lines) {
      expect(line, line).toContain('protect');
      const method = (line.match(/^router\.(\w+)/) || [])[1];
      const readOnly = method === 'get' || READERS_MAY_WRITE.some(p => line.includes(p));
      if (readOnly) expect(line, line).not.toContain('ownerOnly');
      else expect(line, line).toContain('ownerOnly');
    }

    // And every GET really is a read: the ones that changed anything were
    // what made "owner-only" look like the simpler rule in the first place.
    expect(lines.filter(l => /^router\.get/.test(l)).length).toBeGreaterThanOrEqual(3);
  });

  it('tells the screen whether this reader may change anything', () => {
    /*
     * Otherwise the page has to provoke a 403 to find out, which is exactly
     * what it used to do — and it rendered the refusal as "nothing here can
     * be watched until some records arrive".
     */
    const ctl = read('../eame-template/controllers/agentsController.js');
    expect(ctl).toContain('canManage: await isOwner(req),');
    const ui = read('../eame-template/frontend/agents.js');
    expect(ui).toContain('view.canManage = !!body.canManage;');
    // The buttons are drawn from it, and the form that writes is hidden.
    expect(ui).toContain('var acts = !view.canManage');
    expect(ui).toContain('if (els.form) els.form.hidden = !view.canManage;');
    // A refusal says it is one.
    expect(ui).toMatch(/Only the person who created this application can see and change/);
  });

  it('declares /findings/opened before /findings/:id', () => {
    // Otherwise ":id" matches the literal word "opened" and the telemetry
    // call becomes a lookup for a finding that cannot exist.
    const routes = read('../eame-template/routes/agentsRoutes.js');
    expect(routes.indexOf("'/findings/opened'")).toBeLessThan(routes.indexOf("'/findings/:id'"));
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

describe('the board, which is the durable copy', () => {
  const read2 = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

  it('ships with every application', async () => {
    const { buildRuntime } = await import('../services/eameProjectBuilder.js');
    const have = new Set(buildRuntime({ appName: 'Probe', connectors: [] }).map(f => f.path));
    expect(have.has('frontend/agents.js')).toBe(true);
  });

  it('is reachable from the sidebar and loaded by the page', async () => {
    const { buildRuntime } = await import('../services/eameProjectBuilder.js');
    const html = buildRuntime({ appName: 'Probe', connectors: [] })
      .find(f => f.path === 'frontend/index.html').content;
    expect(html).toContain('id="ch-agents"');
    expect(html).toContain('ch-agents-link');
    expect(html).toContain('agents.js');
  });

  it('shows what each agent is holding open, read from the tenant not from a message', () => {
    /*
     * An owner who missed the email, or whose application cannot reach Svarg
     * at all, still sees everything the agents noticed — because a finding is
     * recorded before anything is sent, and this reads the record.
     */
    const ctrl = read2('../eame-template/controllers/agentsController.js');
    expect(ctrl).toContain("state: 'open'");
    expect(ctrl).toContain('openCount');
  });

  it('asks the owner for a sentence, not for a query', () => {
    // The whole ICP is somebody who cannot write one. A screen that looks like
    // a query builder loses them on sight.
    const html = read2('../eame-template/frontend/index.html');
    expect(html).toContain('Tell me when&hellip;');
    expect(html).toContain('a student has not attended for 14 days');
  });

  it('creates the agent in the owner\u2019s own timezone', () => {
    // A morning briefing has to arrive in their morning, not the container's.
    const ui = read2('../eame-template/frontend/agents.js');
    expect(ui).toContain('Intl.DateTimeFormat().resolvedOptions().timeZone');
  });

  it('says plainly when an agent has stopped itself, in both places', () => {
    /*
     * An agent that silently stopped watching is worse than one that never
     * existed, because the owner believes they are covered.
     *
     * So it is said twice: on the watcher's own node, and again at the head
     * of the map, where somebody who is not reading every column still sees
     * it. And the button offered to a stopped watcher restarts it —
     * setAgentEnabled(id, true) clears the failure count, so enabling is
     * the repair, and "Pause" would be the one action that cannot help.
     */
    const ui = read2('../eame-template/frontend/agents.js');
    expect(ui).toMatch(/stopped:\s*\{\s*label:\s*'Stopped'/);
    expect(ui).toContain('stopped after three failures');
    expect(ui).toContain("c.state === 'stopped' ? 'Start it again'");
    // The intent rides on the element, so three labels cannot break it.
    expect(ui).toContain("enabled: t.dataset.enable === '1'");
  });

/*
   * ── The examples on an empty board ───────────────────────────────────────
   *
   * A board with nothing on it is the common case on day one and the one a
   * customer is shown in a demo, and a blank screen cannot be told apart
   * from a broken one. So it shows what a finding will look like.
   *
   * The danger is obvious: an example that reads as a real finding is worse
   * than no example at all, because somebody acts on it or screenshots it.
   * Two rules keep that from happening, and both are tested here — they are
   * never counted, and they invent nothing.
   */
  it('shows examples only when nothing at all is open', () => {
    const ctl = read2('../eame-template/controllers/agentsController.js');
    // One expression, so there is no path on which both exist.
    expect(ctl).toContain('examples: rows.length ? [] : examples()');
    const ui = read2('../eame-template/frontend/findings.js');
    // And not while a chip is filtering: an example under "Cash" with Cash
    // selected would read as a Cash finding.
    expect(ui).toContain('drawExamples(all.length || picked ? [] : body.examples)');
  });

  it('never counts an example anywhere', () => {
    /*
     * counts, the category chips and the digest all read `open`/`rows`.
     * Examples travel under their own key and are never merged in, so the
     * heading can say "0 things need your attention" with five rows on the
     * screen and still be telling the truth.
     */
    const ctl = read2('../eame-template/controllers/agentsController.js');
    const body = ctl.slice(ctl.indexOf('const counts = { high: 0'), ctl.indexOf('everRan:'));
    expect(body).toContain('for (const r of rows) counts[r.severity]');
    expect(body).toMatch(/count: rows\.filter/);
    // Nothing that feeds a number is allowed to mention them.
    expect(body.replace(/examples: rows\.length \? \[\] : examples\(\),/, ''))
      .not.toMatch(/example/i);

    const ui = read2('../eame-template/frontend/findings.js');
    // The board's own list is built from `open`, never from the examples.
    expect(ui).toContain("el.list.innerHTML = open.map(row).join('');");
  });

  it('invents nothing: an example carries only what the catalogue already said', () => {
    /*
     * No person, no number, no date. Those are exactly the parts that would
     * make a screenshot of an example indistinguishable from a screenshot of
     * a real finding — and the one rule this product cannot bend is that it
     * does not make up evidence.
     */
    const ctl = read2('../eame-template/controllers/agentsController.js');
    const fn = ctl.slice(ctl.indexOf('function examples()'), ctl.indexOf('/** One finding, with the evidence'));
    expect(fn).toBeTruthy();
    // Every field is copied off a catalogue entry the application really has.
    for (const field of ['id: e.id', 'watcher: e.name', 'says: e.says', 'question: e.question']) {
      expect(fn).toContain(field);
    }
    // And none of the things a real finding carries because something happened.
    for (const absent of ['firstSeenAt', 'lastSeenAt', 'rows:', 'evidence', 'Math.random', 'new Date']) {
      expect(fn, `an example must not carry ${absent}`).not.toContain(absent);
    }
  });

  it('marks every example on its face, and makes none of them openable', () => {
    const ui = read2('../eame-template/frontend/findings.js');
    const fn = ui.slice(ui.indexOf('function example(e)'), ui.indexOf('function drawExamples'));
    expect(fn).toContain('fn__egtag');
    expect(fn).toContain('Example');
    // A real row is a <button data-open>; an example is a plain div, so the
    // click handler that opens a finding can never match one.
    expect(fn).toContain("'<div class=\"fn__row fn__row--eg");
    expect(fn).not.toContain('data-open');
  });

  it('asks before forgetting what an agent found', () => {
    const ui = read2('../eame-template/frontend/agents.js');
    expect(ui).toContain('window.confirm(');
  });
});

describe('the agents page uses the session the application already has', () => {
  it('reads the same token key as every other screen', () => {
    /*
     * It read 'ch-token', which nothing writes. Every request went out with an
     * empty bearer and the application answered "Access denied. No token
     * provided." — a key invented to match the ch- prefix on the page's own
     * element ids, which have nothing to do with where the session is kept.
     */
    const dir = new URL('../eame-template/frontend/', import.meta.url);
    const keys = new Set();
    for (const f of ['agents.js', 'access.js', 'answer.js']) {
      const text = readFileSync(new URL(f, dir), 'utf8');
      for (const m of text.matchAll(/localStorage\.getItem\('([^']*token[^']*)'\)/g)) keys.add(m[1]);
    }
    // One key across the whole application, whatever it is called.
    expect([...keys]).toEqual(['token']);
  });

  it('takes its API base the same way too', () => {
    const ui = readFileSync(new URL('../eame-template/frontend/agents.js', import.meta.url), 'utf8');
    expect(ui).toContain('(window.CONFIG && window.CONFIG.API_BASE)');
  });
});
