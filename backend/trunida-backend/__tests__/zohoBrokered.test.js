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

  it('asks for the CRM and nothing else', () => {
    expect(zoho.ZOHO_SCOPES).toEqual(['ZohoCRM.modules.ALL', 'ZohoCRM.settings.modules.READ']);
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
    expect(controller).toContain('new URL(w).origin === new URL(home).origin ? w : home');
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

  it('keeps the dataset and module out of Zoho’s hands', () => {
    /*
     * They go in sessionStorage across the redirect rather than through
     * Zoho: they are no business of Zoho's, and a value that leaves through
     * a redirect comes back changeable.
     */
    expect(ui).toContain('sessionStorage.setItem(ZOHO_PENDING');
    expect(ui).toContain('sessionStorage.removeItem(ZOHO_PENDING)');
  });

  it('clears the id from the address whatever happens', () => {
    // A reload that re-claimed a spent handoff would report a failure for a
    // connection that had already worked.
    const fn = ui.slice(ui.indexOf('async function finishZoho()'), ui.indexOf('async function submitConnector'));
    expect(fn).toContain('history.replaceState');
    expect(fn.indexOf('history.replaceState')).toBeLessThan(fn.indexOf('/api/connectors/zoho/finish'));
  });
});
