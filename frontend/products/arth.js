/**
 * SoorgaAI — Arth (Technology & Infrastructure) product page
 * Shared nav wiring + the capability cards reveal animation.
 */

import { initMarketingNav } from '../shared/marketingNav.js';

document.addEventListener('DOMContentLoaded', () => {
  initMarketingNav();
  wireCapabilitiesReveal();
  wireReachNetwork();
});

// Plays once, the first time the capability grid scrolls into view —
// each card fades/rises in with a stagger (driven by the --i custom
// property set on each card).
function wireCapabilitiesReveal() {
  const grid = document.querySelector('.mkt-product-capabilities__grid');
  if (!grid) return;

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    grid.classList.add('is-visible');
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        grid.classList.add('is-visible');
        observer.unobserve(grid);
      }
    });
  }, { threshold: 0.25 });
  observer.observe(grid);
}

// ── Compute reach network ────────────────────────────────────────────
//
// An abstract, stylised network — four loose regional clusters, each a
// hub with a few satellite nodes, ring-connected to each other — visually
// backing the "24 locations / 5 architectures" proof stats above it.
// Deliberately not a literal map and not sized to match any one partner's
// real footprint numbers, consistent with keeping this page partner-agnostic.
// Reuses the same programmatic SVG + stagger-reveal technique as the
// homepage Stack network and the AI Maturity Journey.
const REACH_NODES = [
  { id: 'a-hub', x: 80,  y: 80,  r: 10, kind: 'hub'  },
  { id: 'a1',    x: 40,  y: 50,  r: 5,  kind: 'node' },
  { id: 'a2',    x: 122, y: 55,  r: 5,  kind: 'node' },
  { id: 'a3',    x: 50,  y: 122, r: 5,  kind: 'node' },
  { id: 'a4',    x: 112, y: 128, r: 5,  kind: 'node' },

  { id: 'b-hub', x: 300, y: 70,  r: 9,  kind: 'hub'  },
  { id: 'b1',    x: 268, y: 40,  r: 5,  kind: 'node' },
  { id: 'b2',    x: 332, y: 45,  r: 5,  kind: 'node' },
  { id: 'b3',    x: 268, y: 106, r: 5,  kind: 'node' },

  { id: 'c-hub', x: 110, y: 245, r: 7,  kind: 'hub'  },
  { id: 'c1',    x: 150, y: 274, r: 5,  kind: 'node' },

  { id: 'd-hub', x: 322, y: 252, r: 7,  kind: 'hub'  },
  { id: 'd1',    x: 358, y: 278, r: 5,  kind: 'node' },
];

const REACH_EDGES = [
  { a: 'a-hub', b: 'a1' }, { a: 'a-hub', b: 'a2' }, { a: 'a-hub', b: 'a3' }, { a: 'a-hub', b: 'a4' },
  { a: 'b-hub', b: 'b1' }, { a: 'b-hub', b: 'b2' }, { a: 'b-hub', b: 'b3' },
  { a: 'c-hub', b: 'c1' },
  { a: 'd-hub', b: 'd1' },
  { a: 'a-hub', b: 'b-hub' }, { a: 'b-hub', b: 'd-hub' }, { a: 'd-hub', b: 'c-hub' }, { a: 'c-hub', b: 'a-hub' },
];

function buildReachNetwork(svg) {
  const svgNS = 'http://www.w3.org/2000/svg';
  const byId = {};
  REACH_NODES.forEach((n) => { byId[n.id] = n; });

  REACH_EDGES.forEach((e, i) => {
    const a = byId[e.a];
    const b = byId[e.b];
    const line = document.createElementNS(svgNS, 'line');
    line.setAttribute('x1', a.x);
    line.setAttribute('y1', a.y);
    line.setAttribute('x2', b.x);
    line.setAttribute('y2', b.y);
    line.setAttribute('class', 'mkt-reach__edge');
    line.style.setProperty('--i', i);
    svg.appendChild(line);
  });

  REACH_NODES.forEach((n, i) => {
    const circle = document.createElementNS(svgNS, 'circle');
    circle.setAttribute('cx', n.x);
    circle.setAttribute('cy', n.y);
    circle.setAttribute('r', n.r);
    circle.setAttribute('class', `mkt-reach__node mkt-reach__node--${n.kind}`);
    circle.style.setProperty('--i', i);
    svg.appendChild(circle);
  });
}

function wireReachNetwork() {
  const svg = document.getElementById('arth-reach-network');
  if (!svg) return;

  buildReachNetwork(svg);

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    svg.classList.add('is-visible', 'is-settled');
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        svg.classList.add('is-visible');
        setTimeout(() => svg.classList.add('is-settled'), 1400);
        observer.unobserve(svg);
      }
    });
  }, { threshold: 0.3 });
  observer.observe(svg);
}
