/**
 * A business's own app, from the first sign-in to the delivered application:
 * the company read from a work email, Cob deciding where its customers show
 * up, the app-events source that follows from it, and the events themselves.
 *
 * Vesoma and Tenacrity are the pair that matters: a clinic whose patients
 * never touch Vesoma's software, and a product whose teachers sign in to it
 * every day. Each must get its own answer, and only the second the app card.
 */
import { describe, it, expect } from 'vitest';
import { companyDomain, brandName, logoCandidates } from '../services/companyBrandService.js';
import { decideCustomerSurface, takesAppEvents, SURFACE_LINE } from '../services/customerSurfaceService.js';
import { sourcesForBlueprint, connectorKindsFor } from '../services/sourceCatalogService.js';
import { buildManifest } from '../services/eameProjectBuilder.js';
import { eventsIn, describeShape, provides, MAX_PER_REQUEST } from '../eame-template/services/connectors/appevents.js';
import { keyFrom, keyOk, ingestKey } from '../eame-template/controllers/appEventsController.js';

describe('the company behind a work email', () => {
  it('skips free mail and nonsense, and keeps the company domain', () => {
    expect(companyDomain('a@gmail.com')).toBe('');
    expect(companyDomain('a@zohomail.in')).toBe('');
    expect(companyDomain('not an email')).toBe('');
    expect(companyDomain('Asha@Tenacrity.com')).toBe('tenacrity.com');
    expect(companyDomain('x@www.vesoma.in')).toBe('vesoma.in');
  });

  it('names the company from its own site, not from a generic page title', () => {
    expect(brandName('<title>Tenacrity — Tools for teachers, students, and schools</title>', 'tenacrity.com')).toBe('Tenacrity');
    expect(brandName('<meta property="og:site_name" content="Hillview &amp; Co">', 'h.com')).toBe('Hillview & Co');
    expect(brandName('<title>Home</title>', 'padhivu.org')).toBe('Padhivu');
  });

  it('prefers a square icon to a banner, and always tries the favicon', () => {
    const html = '<link rel="icon" href="/f-16.png" sizes="16x16"><link rel="icon" href="/f-64.png" sizes="64x64">'
      + '<link rel="apple-touch-icon" href="/touch.png"><meta property="og:image" content="/share.jpg">';
    expect(logoCandidates(html, 'https://t.com/')).toEqual([
      'https://t.com/touch.png', 'https://t.com/f-64.png', 'https://t.com/f-16.png', 'https://t.com/favicon.ico', 'https://t.com/share.jpg',
    ]);
  });
});

describe('where the customers show up', () => {
  it('reads a product business as its own app', () => {
    const d = decideCustomerSurface({
      evidence: 'Tenacrity — Tools for teachers, students, and schools',
      objective: 'Teachers sign up for our classroom apps and many stop using them after the first month.',
    });
    expect(d.surface).toBe('own-app');
    expect(d.userSet).toBe(false);
    expect(d.reason).toMatch(/tools for its users/);
  });

  it('reads a clinic and an academy as the systems they bought', () => {
    expect(decideCustomerSurface({ objective: 'We run a wellness clinic with 3 branches. Patients book an appointment, and many stop coming after two sessions.' }).surface).toBe('bought-systems');
    expect(decideCustomerSurface({ objective: 'We run a cricket academy with 30 coaches. Attendance comes in over WhatsApp.' }).surface).toBe('bought-systems');
  });

  it('says both for an app with a place customers visit', () => {
    const d = decideCustomerSurface({ evidence: 'Download our app on the App Store. Visit us at our studio and book a session.', objective: 'Members stop using the app.' });
    expect(d.surface).toBe('both');
  });

  it('defaults to bought-systems on no evidence, which changes nothing, and says it is unsure', () => {
    const d = decideCustomerSurface({});
    expect(d.surface).toBe('bought-systems');
    expect(d.confidence).toBe('low');
  });

  it('counts Cob\'s product reading as evidence, not as the answer', () => {
    expect(decideCustomerSurface({ engagement: 'product-ai' }).surface).toBe('bought-systems');
    expect(decideCustomerSurface({ engagement: 'product-ai', evidence: 'Start for free with a free trial.' }).surface).toBe('own-app');
  });

  it('has a line for every answer', () => {
    for (const s of ['own-app', 'bought-systems', 'both']) expect(SURFACE_LINE[s]).toMatch(/customers/);
  });
});

describe('the sources that follow', () => {
  const academy = { industryFit: { industry: 'Sports Academies' } };

  it('adds your app, first, only where the customers use it', () => {
    expect(takesAppEvents(academy)).toBe(false);
    expect(sourcesForBlueprint(academy).some((s) => s.kind === 'app-events')).toBe(false);
    const product = { ...academy, customerSurface: { surface: 'own-app' } };
    const list = sourcesForBlueprint(product);
    expect(list[0]).toMatchObject({ kind: 'app-events', surface: 'own-app' });
    expect(list.some((s) => s.kind === 'database')).toBe(true);
    expect(connectorKindsFor(list)).toContain('app-events');
    expect(sourcesForBlueprint({ customerSurface: { surface: 'both' } })[0].surface).toBe('both');
  });

  it('ships the connector, its controller and its route in every application', () => {
    const paths = buildManifest({ appName: 'X' }).map((f) => f.path);
    for (const p of ['services/connectors/appevents.js', 'controllers/appEventsController.js', 'routes/appEventsRoutes.js']) {
      expect(paths).toContain(p);
    }
  });

  it('puts the owner\'s logo in the application, and nothing when there is none', () => {
    const logo = 'data:image/png;base64,iVBORw0KGgo=';
    const page = (copy) => buildManifest({ appName: 'X', copy }).find((f) => f.path === 'frontend/index.html').content;
    expect(page({ __APP_LOGO__: logo })).toContain(`<meta name="app-logo" content="${logo}">`);
    expect(page({})).toContain('<meta name="app-logo" content="">');
  });
});

describe('your app\'s events', () => {
  it('reads Segment\'s track and identify, one or a batch', () => {
    const { events, identities, rejected } = eventsIn({ batch: [
      { type: 'identify', userId: 't-1', traits: { firstName: 'Asha', lastName: 'Rao', email: 'asha@h.edu', company: { name: 'Hillview' } } },
      { type: 'track', userId: 't-1', event: 'Subscription Cancelled', messageId: 'm1', timestamp: '2026-10-02T08:00:00Z', properties: { status: 'cancelled', plan: 'pro', revenue: 499 } },
      { type: 'track', anonymousId: 'a-9', event: 'Lesson Created', properties: { school: 'Hillview' } },
    ] });
    expect(rejected).toBe(0);
    expect(identities[0]).toMatchObject({ userId: 't-1', name: 'Asha Rao', email: 'asha@h.edu', customer: 'Hillview' });
    expect(events[0]).toMatchObject({ eventId: 'm1', status: 'cancelled', plan: 'pro', amount: '499' });
    // No status from the app: the event itself is what an agent counts.
    expect(events[1]).toMatchObject({ userId: 'a-9', status: 'Lesson Created', customer: 'Hillview' });
    expect(events[1].eventId).toMatch(/^h_[0-9a-f]{32}$/);
  });

  it('refuses what has no user, or a track with no event', () => {
    expect(eventsIn([{ event: 'X' }, { type: 'track', userId: 'u' }, null, 'x']).rejected).toBe(4);
  });

  it('gives the same id to the same event sent twice without one', () => {
    const one = { userId: 'u', event: 'Opened', timestamp: '2026-10-01T00:00:00Z' };
    expect(eventsIn(one).events[0].eventId).toBe(eventsIn({ ...one }).events[0].eventId);
  });

  it('takes the type from the path for /track and /identify', () => {
    expect(eventsIn({ userId: 'u', traits: {} }, 'identify').identities).toHaveLength(1);
    expect(eventsIn({ userId: 'u', event: 'E' }, 'track').events).toHaveLength(1);
  });

  it('stops at Segment\'s batch limit', () => {
    const many = Array.from({ length: MAX_PER_REQUEST + 3 }, (_, i) => ({ userId: 'u', event: 'E', messageId: String(i) }));
    const r = eventsIn({ batch: many });
    expect(r.events).toHaveLength(MAX_PER_REQUEST);
    expect(r.rejected).toBe(3);
  });

  it('defines its own dataset, keyed by the event id', () => {
    const s = describeShape({});
    expect(s).toMatchObject({ name: 'App Activity', key: 'event_id' });
    expect(s.columns).toEqual(provides);
    expect(describeShape({ appName: 'Posto' }).name).toBe('App Activity (Posto)');
  });

  it('takes the key as Bearer or as Segment\'s Basic write key, and nothing else', () => {
    const key = ingestKey();
    expect(key).toMatch(/^sk_app_[0-9a-f]{40}$/);
    expect(keyOk(keyFrom('Bearer ' + key))).toBe(true);
    expect(keyOk(keyFrom('Basic ' + Buffer.from(key + ':').toString('base64')))).toBe(true);
    expect(keyOk(keyFrom('Bearer sk_app_wrong'))).toBe(false);
    expect(keyOk(keyFrom(''))).toBe(false);
  });
});
