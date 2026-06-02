/**
 * SoorgaAI — Landing Page Hydration Module
 * Renders the 5 maturity stages and wires CTA click handlers.
 *
 * Loaded as <script type="module"> — runs after DOM is parsed.
 */

import { MATURITY_STAGES } from './data/maturityStages.js';

document.addEventListener('DOMContentLoaded', () => {
    renderStages();
    wirePrimaryCta();
});

/**
 * Render the 5 maturity stages into <ol class="stages">.
 * Stages are displayed highest → lowest (5 at top = aspirational goal).
 */
function renderStages() {
    const list = document.querySelector('.stages');
    if (!list) return;

    const fragment = document.createDocumentFragment();

    // Reverse so stage 5 appears at the top
    [...MATURITY_STAGES].reverse().forEach(stage => {
        const li = document.createElement('li');
        li.className = 'stage-item';
        li.style.setProperty('--stage-color', stage.color);
        li.setAttribute('data-stage-id', stage.id);

        li.innerHTML = `
            <div class="stage-item__num" aria-hidden="true">${stage.id}</div>
            <div class="stage-item__body">
                <strong class="stage-item__name">${stage.name}</strong>
                <span class="stage-item__desc">${stage.descriptor}</span>
            </div>
        `;

        fragment.appendChild(li);
    });

    list.appendChild(fragment);
}

/**
 * Set the primary CTA href from the shared SoorgaAuth helper.
 * Falls back to the hard-coded href already in the HTML if authState
 * hasn't loaded (e.g., slow network).
 */
function wirePrimaryCta() {
    const cta = document.getElementById('primaryCta');
    if (!cta) return;

    if (window.SoorgaAuth) {
        cta.href = window.SoorgaAuth.getRoadmapHref();
    }

    // Instrument clicks for future analytics EPIC
    document.querySelectorAll('[data-cta]').forEach(el => {
        el.addEventListener('click', () => {
            console.log(`[CTA] ${el.dataset.cta} clicked`);
        });
    });
}
