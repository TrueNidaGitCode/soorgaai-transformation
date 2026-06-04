/**
 * Unit tests — frontend/index.js
 *
 * Tests renderStages() and wirePrimaryCta() in isolation using a jsdom DOM.
 * Neither function makes any network calls.
 */

import { MATURITY_STAGES } from '../data/maturityStages.js';
import { renderStages, wirePrimaryCta } from '../index.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeStagesList() {
  const ol = document.createElement('ol');
  ol.className = 'stages';
  document.body.appendChild(ol);
  return ol;
}

function makePrimaryCtaLink(href = '/dynamic-assessment/start.html') {
  const a = document.createElement('a');
  a.id   = 'primaryCta';
  a.href = href;
  a.setAttribute('data-cta', 'generate-roadmap');
  document.body.appendChild(a);
  return a;
}

// ── renderStages ──────────────────────────────────────────────────────────────

describe('renderStages', () => {
  it('renders exactly 5 list items when given the full MATURITY_STAGES array', () => {
    const container = makeStagesList();

    renderStages(MATURITY_STAGES, container);

    expect(container.querySelectorAll('.stage-item')).toHaveLength(5);
  });

  it('each rendered item contains the stage name', () => {
    const container = makeStagesList();

    renderStages(MATURITY_STAGES, container);

    const names = [...container.querySelectorAll('.stage-item__name')].map(el => el.textContent.trim());
    MATURITY_STAGES.forEach(stage => {
      expect(names).toContain(stage.name);
    });
  });

  it('each rendered item contains the stage descriptor', () => {
    const container = makeStagesList();

    renderStages(MATURITY_STAGES, container);

    const descs = [...container.querySelectorAll('.stage-item__desc')].map(el => el.textContent.trim());
    MATURITY_STAGES.forEach(stage => {
      expect(descs).toContain(stage.descriptor);
    });
  });

  it('renders stages in descending id order (5 at top, 1 at bottom)', () => {
    const container = makeStagesList();

    renderStages(MATURITY_STAGES, container);

    const stageIds = [...container.querySelectorAll('.stage-item')]
      .map(li => Number(li.getAttribute('data-stage-id')));

    expect(stageIds).toEqual([5, 4, 3, 2, 1]);
  });

  it('sets the --stage-color CSS custom property on each item', () => {
    const container = makeStagesList();

    renderStages(MATURITY_STAGES, container);

    container.querySelectorAll('.stage-item').forEach(li => {
      const color = li.style.getPropertyValue('--stage-color');
      expect(color.trim().length).toBeGreaterThan(0);
    });
  });

  it('returns early without throwing when container is null', () => {
    expect(() => renderStages(MATURITY_STAGES, null)).not.toThrow();
  });

  it('returns early without throwing when container is undefined', () => {
    expect(() => renderStages(MATURITY_STAGES, undefined)).not.toThrow();
  });

  it('produces no list items when given an empty stages array', () => {
    const container = makeStagesList();

    renderStages([], container);

    expect(container.querySelectorAll('.stage-item')).toHaveLength(0);
  });

  it('is idempotent — calling twice does not produce duplicate items', () => {
    const container = makeStagesList();

    renderStages(MATURITY_STAGES, container);
    renderStages(MATURITY_STAGES, container);

    expect(container.querySelectorAll('.stage-item')).toHaveLength(5);
  });

  it('renders a stage with missing name as an empty string without throwing', () => {
    const container  = makeStagesList();
    const badStage   = [{ id: 9, descriptor: 'some desc', color: '#fff' }];

    expect(() => renderStages(badStage, container)).not.toThrow();

    const name = container.querySelector('.stage-item__name').textContent.trim();
    expect(name).toBe('');
  });

  it('falls back to the default color when stage.color is absent', () => {
    const container = makeStagesList();
    const stageWithoutColor = [{ id: 1, name: 'X', descriptor: 'y' }]; // no color

    renderStages(stageWithoutColor, container);

    const color = container.querySelector('.stage-item').style.getPropertyValue('--stage-color');
    expect(color).toBe('#5CC5A7');
  });

  it('uses empty string for data-stage-id when stage.id is null', () => {
    const container = makeStagesList();
    const stageWithoutId = [{ name: 'X', descriptor: 'y', color: '#fff' }]; // no id

    renderStages(stageWithoutId, container);

    const id = container.querySelector('.stage-item').getAttribute('data-stage-id');
    expect(id).toBe('');
  });

  it('renders a stage with missing descriptor as an empty string without throwing', () => {
    const container = makeStagesList();
    const badStage  = [{ id: 9, name: 'Some Stage', color: '#fff' }];

    expect(() => renderStages(badStage, container)).not.toThrow();

    const desc = container.querySelector('.stage-item__desc').textContent.trim();
    expect(desc).toBe('');
  });
});

// ── wirePrimaryCta ────────────────────────────────────────────────────────────

describe('wirePrimaryCta', () => {
  it('returns early without throwing when #primaryCta element is absent', () => {
    // No CTA in DOM (document.body is empty from setup.js)

    expect(() => wirePrimaryCta()).not.toThrow();
  });

  it('sets the primaryCta href from window.SoorgaAuth.getRoadmapHref when the helper is present', () => {
    const cta = makePrimaryCtaLink('/old-href.html');
    window.SoorgaAuth = { getRoadmapHref: () => '/dynamic-assessment/start.html' };

    wirePrimaryCta();

    expect(cta.getAttribute('href')).toContain('/dynamic-assessment/start.html');
  });

  it('leaves the primaryCta href unchanged when window.SoorgaAuth is not defined', () => {
    window.SoorgaAuth = undefined;
    const cta = makePrimaryCtaLink('/fallback.html');

    wirePrimaryCta();

    expect(cta.getAttribute('href')).toContain('/fallback.html');
  });

  it('attaches a click listener to every [data-cta] element without throwing', () => {
    makePrimaryCtaLink();
    const secondary = document.createElement('a');
    secondary.setAttribute('data-cta', 'explore-framework');
    secondary.href = '/framework/framework.html';
    document.body.appendChild(secondary);

    expect(() => wirePrimaryCta()).not.toThrow();
  });

  it('logs the data-cta value to console when a [data-cta] element is clicked', () => {
    const cta = makePrimaryCtaLink();
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});

    wirePrimaryCta();
    cta.click();

    expect(spy).toHaveBeenCalledWith('[CTA] generate-roadmap clicked');
  });

  it('does not throw when a [data-cta] element has no data-cta attribute value', () => {
    const el = document.createElement('a');
    el.setAttribute('data-cta', '');
    document.body.appendChild(el);
    makePrimaryCtaLink();

    expect(() => wirePrimaryCta()).not.toThrow();
  });
});
