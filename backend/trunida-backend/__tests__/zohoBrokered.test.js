/**
 * Zoho in one click, brokered by Svarg.
 *
 * ── Why this exists beside the manual path ────────────────────────────────
 *
 * The connector already works on credentials a customer makes themselves: a
 * Self Client, a refresh token, five fields. That path stays — it is the only
 * one available to somebody self-hosting, and it needs nothing from Svarg.
 *
 * It also costs ten minutes in an API console, which is ten minutes a
 * customer being shown the product spends reading Zoho's documentation. So
 * Svarg registers one Zoho client and a customer consents to it, exactly as
 * Atlassian works in the control plane.
 *
 * ── What that moves, and what it must not ─────────────────────────────────
 *
 * Svarg holds the client id and secret. The customer's refresh token is still
 * stored, encrypted, in the customer's own container. Svarg brokered the
 * permission; it did not take custody of the data — and the consequence is
 * that a container holding only a refresh token cannot mint an access token,
 * so it asks over the gateway token it already has.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

describe('the handoff, which carries a secret past a browser', () => {
  let zoho;
  beforeEach(async () => {
    vi.resetModules();
    process.env.ZOHO_OAUTH_CLIENT_ID = '1000.TEST';
    process.env.ZOHO_OAUTH_CLIENT_SECRET = 'shh';
    process.env.ZOHO_OAUTH_CALLBACK_URL = 'https://svarg.example/api/oauth/zoho/callback';
    zoho = await import('../services/zohoOAuthService.js');
  });

  it('never puts the token in anything the browser can read', () => {
    /*
     * The browser carries an opaque id and nothing else. The refresh token
     * goes from Svarg to the container over the gateway token, so it reaches
     * no URL, no address bar and no server log on the way.
     */
    const state = zoho.openHandoff({ deploymentId: 'd1', region: 'in', back: 'https://app/x' });
    expect(state).toMatch(/^[A-Za-z0-9_-]{20,}$/);
    expect(zoho.readHandoff(state).refreshToken).toBe('');
    expect(zoho.authorizeEntryUrl(state)).toBe(
      `https://svarg.example/api/oauth/zoho/authorize?state=${encodeURIComponent(state)}`);
  });

  it('is claimed once, so a replayed URL hands nothing out twice', () => {
    const state = zoho.openHandoff({ deploymentId: 'd1', region: 'in', back: '' });
    zoho.readHandoff(state).refreshToken = '1000.rrr';
    expect(zoho.claimHandoff(state, 'd1')).toMatchObject({ ok: true, refreshToken: '1000.rrr' });
    expect(zoho.claimHandoff(state, 'd1').ok).toBe(false);
  });

  it('is claimed only by the application that opened it', () => {
    // Otherwise one tenant could take another's consent by guessing an id.
    const state = zoho.openHandoff({ deploymentId: 'd1', region: 'in', back: '' });
    zoho.readHandoff(state).refreshToken = '1000.rrr';
    const other = zoho.claimHandoff(state, 'd2');
    expect(other.ok).toBe(false);
    expect(other.reason).toMatch(/another application/);
    // And the real owner can still have it: a refused attempt must not
    // consume the handoff.
    expect(zoho.claimHandoff(state, 'd1').ok).toBe(true);
  });

  it('refuses to hand over a consent that never finished', () => {
    const state = zoho.openHandoff({ deploymentId: 'd1', region: 'in', back: '' });
    expect(zoho.claimHandoff(state, 'd1')).toMatchObject({ ok: false });
  });
});

describe('the consent Zoho is asked for', () => {
  let zoho;
  beforeEach(async () => {
    vi.resetModules();
    process.env.ZOHO_OAUTH_CLIENT_ID = '1000.TEST';
    process.env.ZOHO_OAUTH_CLIENT_SECRET = 'shh';
    process.env.ZOHO_OAUTH_CALLBACK_URL = 'https://svarg.example/api/oauth/zoho/callback';
    zoho = await import('../services/zohoOAuthService.js');
  });

  it('asks for a refresh token, and for a NEW one', () => {
    /*
     * The failure this prevents is the nastiest kind: it works.
     *
     * Without access_type=offline there is no refresh token at all. Without
     * prompt=consent a customer who has approved before is sent back with an
     * access token and no refresh token — so the connection tests green,
     * syncs once, and stops an hour later with no obvious cause.
     */
    const url = zoho.buildAuthorizeUrl('st', 'in');
    expect(url).toMatch(/access_type=offline/);
    expect(url).toMatch(/prompt=consent/);
  });

  it('goes to the data centre the connection named', () => {
    expect(zoho.buildAuthorizeUrl('st', 'in')).toMatch(/^https:\/\/accounts\.zoho\.in\//);
    expect(zoho.buildAuthorizeUrl('st', 'eu')).toMatch(/^https:\/\/accounts\.zoho\.eu\//);
    // Anything Zoho does not run falls back rather than building a URL at a
    // domain somebody else could register.
    expect(zoho.buildAuthorizeUrl('st', 'evil.test')).toMatch(/^https:\/\/accounts\.zoho\.com\//);
  });

  it('asks to read the CRM, and not to change it', () => {
    /*
     * ZohoCRM.modules.ALL is read AND write. This asked for it first, on the
     * wrong belief that no read-only module scope existed.
     *
     * The consent screen is the whole basis on which a customer decides, and
     * a product that watches asking for permission to change records is
     * asking for something it never uses. If a write ever appears in this
     * codebase, this line is where the argument starts.
     */
    expect(zoho.ZOHO_SCOPES).toEqual([
      'ZohoCRM.modules.READ',
      // Which modules this customer has, so nobody types an API name.
      'ZohoCRM.settings.modules.READ',
      // And which fields each has, so the dataset is the module's own shape.
      'ZohoCRM.settings.fields.READ',
    ]);
    expect(zoho.ZOHO_SCOPES.join(' ')).not.toMatch(/modules\.ALL|CREATE|UPDATE|DELETE|WRITE/);
  });

  it('uses the data centre’s own secret when there is one', async () => {
    /*
     * Zoho mints a separate secret per data centre a client is enabled in.
     * Sharing one is allowed but is a choice made in the console, so the
     * default arrangement has to work — and the failure if it does not is
     * "invalid_client", which reads as a bad secret rather than as the wrong
     * one of two correct ones.
     */
    process.env.ZOHO_OAUTH_CLIENT_SECRET_IN = 'in-secret';
    expect(zoho.clientSecretFor('in')).toBe('in-secret');
    // Anything without its own falls back to the shared secret.
    expect(zoho.clientSecretFor('eu')).toBe('shh');
    // And a dotted data centre becomes a legal variable name.
    process.env.ZOHO_OAUTH_CLIENT_SECRET_COM_AU = 'au-secret';
    expect(zoho.clientSecretFor('com.au')).toBe('au-secret');
    delete process.env.ZOHO_OAUTH_CLIENT_SECRET_IN;
    delete process.env.ZOHO_OAUTH_CLIENT_SECRET_COM_AU;
  });

  it('counts a per-data-centre secret as being configured', async () => {
    vi.resetModules();
    delete process.env.ZOHO_OAUTH_CLIENT_SECRET;
    process.env.ZOHO_OAUTH_CLIENT_SECRET_IN = 'in-only';
    const only = await import('../services/zohoOAuthService.js');
    expect(only.isZohoOAuthConfigured()).toBe(true);
    delete process.env.ZOHO_OAUTH_CLIENT_SECRET_IN;
    process.env.ZOHO_OAUTH_CLIENT_SECRET = 'shh';
  });

  it('is off until a client is configured, so the manual fields stay', async () => {
    vi.resetModules();
    delete process.env.ZOHO_OAUTH_CLIENT_ID;
    const bare = await import('../services/zohoOAuthService.js');
    expect(bare.isZohoOAuthConfigured()).toBe(false);
  });
});

describe('where the line between Svarg and a container is', () => {
  const connector = read('../eame-template/services/connectors/zohocrm.js');
  const broker = read('../eame-template/services/svargZohoService.js');
  const controller = read('../controllers/gatewayZohoController.js');

  it('asks Svarg for an access token only on a brokered connection', () => {
    /*
     * A connection the owner made themselves must never take this path: it
     * has its own client secret and Svarg's has nothing to do with it.
     */
    expect(connector).toContain('if (isBrokered(config)) {');
    expect(connector).toContain("export const isBrokered = (config) => String(config.brokered || '') === 'yes';");
  });

  it('keeps the customer’s refresh token in the customer’s own container', () => {
    // The token is claimed, stored here and sent to Svarg only to be
    // exchanged. Svarg holds the client halves; it does not keep this.
    expect(broker).toContain('export async function brokeredAccessToken({ refreshToken, region })');
    expect(connector).toContain("{ name: 'refreshToken', label: 'Refresh token', secret: true }");
  });

  it('says which shape is incomplete rather than failing at Zoho', () => {
    // A manual connection missing its client halves used to reach Zoho and
    // come back "invalid_client", which reads as a bad secret.
    expect(connector).toContain('This connection has no Zoho client. Connect through Svarg, or fill in the Client ID and secret.');
  });

  it('will not redirect a browser anywhere but that application', () => {
    /*
     * `back` arrives in a request body. An open redirect on the domain
     * registered with Zoho as a redirect URI is worth more to somebody than
     * the connection is, so it is checked against the address Svarg itself
     * recorded for the deployment.
     */
    expect(controller).toContain('function allowedBack(deployment, wanted)');
    // The behaviour itself is tested below, against the record shape a
    // real deployment has; this only holds the check in place.
    expect(controller).toContain('new URL(w).origin === new URL(full).origin ? w : full');
  });

  it('authenticates every one of the three on the deployment token', () => {
    const calls = controller.match(/export async function zoho\w+/g) || [];
    expect(calls.length).toBe(4);
    for (const c of calls) {
      const body = controller.slice(controller.indexOf(c), controller.indexOf(c) + 400);
      expect(body).toContain('deploymentOr401(req, res)');
    }
  });
});

describe('what the Data page does with it', () => {
  const ui = read('../eame-template/frontend/data.js');

  it('asks whether one click is available rather than assuming', () => {
    // It is a fact about the Svarg server today, not about this application
    // on the day it was built: a server that gains a client starts offering
    // the shorter path without anything being rebuilt.
    expect(ui).toContain("ownerJson('/api/connectors/zoho/status')");
    expect(ui).toContain('var zohoOneClick = false;');
  });

  it('falls back to the fields, never to a dead end', () => {
    expect(ui).toContain("if (kindName === 'zoho-crm' && zohoOneClick) { openZoho(k); return; }");
    // And the owner can choose the long way even when the short one works.
    expect(ui).toContain('data-zoho-manual');
  });

  it('carries nothing across the redirect, because nothing needs to be', () => {
    /*
     * The module used to be chosen before the consent and stashed in
     * sessionStorage to survive the round trip. It is chosen AFTER now, from
     * the customer's own list, so there is nothing to stash and nothing to
     * go stale — and a browser that loses its session storage mid-consent no
     * longer loses the connection with it.
     */
    expect(ui).not.toContain('ZOHO_PENDING');
    const back = ui.slice(ui.indexOf('async function finishZoho()'), ui.indexOf('async function finishZohoModule'));
    expect(back).toContain("ownerJson('/api/connectors/zoho/modules'");
  });

  it('asks the CRM what it holds, rather than asking the owner', () => {
    /*
     * The whole point of the reorder. Before the consent the only question
     * left is the data centre, which decides where the consent is SENT and
     * so cannot be asked afterwards.
     */
    const form = ui.slice(ui.indexOf('function openZoho(k)'), ui.indexOf('function pickModule'));
    expect(form).not.toMatch(/name="module"|__dataset/);
    expect(form).toContain('name="region"');
    // And afterwards, their own labels — a custom module is marked as theirs
    // because that is the one whose API name is not what the screen says.
    expect(ui).toContain("esc(m.label) + (m.custom ? ' — your own' : '')");
  });

  it('clears the id from the address whatever happens', () => {
    // A reload that re-claimed a spent handoff would report a failure for a
    // connection that had already worked.
    const fn = ui.slice(ui.indexOf('async function finishZoho()'), ui.indexOf('async function submitConnector'));
    expect(fn).toContain('history.replaceState');
    expect(fn.indexOf('history.replaceState')).toBeLessThan(fn.indexOf('/api/connectors/zoho/finish'));
  });
});

describe('where the browser is sent back to', () => {
  /*
   * ── The bug this exists for ──────────────────────────────────────────────
   *
   * A delivered application's address is kept at deployment.railway.url.
   * This read deployment.url, which HostedDeployment does not have — so the
   * allow-list was empty, `back` was empty, and the consent ended on a Svarg
   * page with nowhere to go.
   *
   * The customer saw the word "Connected" and was connected to nothing: the
   * refresh token sat in the handoff until it expired, because the
   * application was never sent back to claim it. Both halves of that were
   * reported from a real attempt — a dead-end page, and no connection
   * afterwards.
   *
   * Railway stores a host with no scheme, which is the second half: new URL()
   * needs one, so every origin comparison threw and fell back to the bare
   * host even when the address WAS known.
   */
  const dep = { railway: { url: 'app-production-2ca2.up.railway.app' } };

  it('finds the address where deployments actually keep it', async () => {
    const { allowedBack } = await import('../controllers/gatewayZohoController.js');
    expect(allowedBack(dep, '')).toBe('https://app-production-2ca2.up.railway.app');
  });

  it('keeps a return address on the application’s own origin', async () => {
    const { allowedBack } = await import('../controllers/gatewayZohoController.js');
    expect(allowedBack(dep, 'https://app-production-2ca2.up.railway.app/#data'))
      .toBe('https://app-production-2ca2.up.railway.app/#data');
  });

  it('refuses one that is not, rather than trusting the request body', async () => {
    /*
     * `back` arrives in a request body. An open redirect on the domain
     * registered with Zoho as a redirect URI is worth more to somebody than
     * the connection is.
     */
    const { allowedBack } = await import('../controllers/gatewayZohoController.js');
    expect(allowedBack(dep, 'https://evil.test/steal'))
      .toBe('https://app-production-2ca2.up.railway.app');
  });

  it('returns nothing when there is no address, so the page says so', async () => {
    // And the callback then tells the customer the connection is NOT
    // finished, rather than the word "Connected" over a token nobody claimed.
    const { allowedBack } = await import('../controllers/gatewayZohoController.js');
    expect(allowedBack({ railway: {} }, 'https://x/y')).toBe('');

    const ctl = read('../controllers/zohoOAuthController.js');
    expect(ctl).toContain('Zoho approved, but the connection is not finished');
    expect(ctl).not.toContain("say(res, 200, 'Connected'");
  });
});
