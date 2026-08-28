/**
 * Svarg — Pipeline Wizard (orchestrator)
 *
 * Cob -> Aria -> Arth -> Eame -> Yusu for the real ORU Pre-analysis
 * engagement, as 6 sequential windows. Wizard state persists to
 * sessionStorage — required, not cosmetic, since Windows 1 and 3 involve a
 * real full-page redirect to auth.atlassian.com and back, which would
 * otherwise reset the wizard to Window 1 every time.
 */

import { requireAuth } from '../defect-matching/defect-matching.js';
import { initConfluenceConnector } from './pipeline-wizard-confluence.js';
import { initJiraConnector } from './pipeline-wizard-jira.js';
import { initModelSelection } from './pipeline-wizard-model.js';
import { initChat, revealChatIfNeeded } from './pipeline-wizard-chat.js';

const STATE_KEY = 'svarg.pipelineWizard.v1';
const TOTAL_STEPS = 6;

const DEFAULT_OBJECTIVE = `I am the Project Manager for the ORU Maintenance & Development project for CARIAD.
Our customer wants us to introduce AI into the project, and I have been asked to lead the Pre-analysis initiative.
Today, whenever a test fails, engineers manually perform the pre-analysis. They review test results, perform plausibility checks, analyze logs and traces, compare historical defects, and identify the most likely root cause before the issue is handed over to the engineering teams. This activity is time-consuming and depends heavily on the experience of individual engineers.

The customer expects AI to help improve this process.

Their expectations for the Pre-analysis initiative are:
• Reduce the manual effort required during pre-analysis.
• Perform plausibility checks on failed test results.
• Assist engineers in identifying the likely root cause of failures.
• Analyze logs, traces, and diagnostic information more efficiently.
• Improve the consistency and quality of failure analysis.
• Reuse historical engineering knowledge and previous defects during analysis.
• Capture knowledge generated during pre-analysis so it can later be reused for product stabilization and continuous quality improvement.
• Improve engineering productivity while maintaining high-quality analysis.
• Operate completely within the VW Group ecosystem without relying on external AI services.
• Comply with VW Group security, governance, and intellectual property requirements.`;

function loadState() {
  try {
    const raw = sessionStorage.getItem(STATE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* fall through to default */ }
  return { step: 1, maxReached: 1, objective: DEFAULT_OBJECTIVE };
}

function saveState(state) {
  sessionStorage.setItem(STATE_KEY, JSON.stringify(state));
}

let state = loadState();

// ── Screen navigation ─────────────────────────────────────────────────────

function showScreen(n) {
  for (let i = 1; i <= TOTAL_STEPS; i++) {
    const el = document.getElementById(`pw-screen-${i}`);
    if (el) el.style.display = i === n ? '' : 'none';
  }
  state.step = n;
  state.maxReached = Math.max(state.maxReached, n);
  saveState(state);
  renderSteps();

  if (n === 6) revealChatIfNeeded();
}

function renderSteps() {
  document.querySelectorAll('.pw-step').forEach(btn => {
    const step = parseInt(btn.dataset.step, 10);
    btn.classList.toggle('pw-step--active', step === state.step);
    btn.classList.toggle('pw-step--done', step < state.step);
    btn.classList.toggle('pw-step--locked', step > state.maxReached);
    btn.disabled = step > state.maxReached;
  });
}

function wireStepIndicator() {
  document.querySelectorAll('.pw-step').forEach(btn => {
    btn.addEventListener('click', () => {
      const step = parseInt(btn.dataset.step, 10);
      if (step <= state.maxReached) showScreen(step);
    });
  });
}

function wireBackButtons() {
  document.querySelectorAll('.pw-back-btn').forEach(btn => {
    btn.addEventListener('click', () => showScreen(parseInt(btn.dataset.back, 10)));
  });
}

// ── Window 1: Cob ─────────────────────────────────────────────────────────

function initWindow1() {
  const objectiveEl = document.getElementById('pw-objective');
  objectiveEl.value = state.objective;
  objectiveEl.addEventListener('input', () => {
    state.objective = objectiveEl.value;
    saveState(state);
  });

  document.getElementById('pw-go-btn').addEventListener('click', () => showScreen(2));
}

// ── Window 2: Cob results ────────────────────────────────────────────────

function initWindow2() {
  document.getElementById('pw-approve-btn').addEventListener('click', () => showScreen(3));
}

// ── Window 3: Aria ────────────────────────────────────────────────────────

function initWindow3() {
  // Finalize always advances — Window 3's real Jira linking may not be
  // completable yet (depends on an external Atlassian scope grant), and
  // the rest of the wizard should stay demonstrable either way.
  document.getElementById('pw-finalize-btn').addEventListener('click', () => showScreen(4));
}

// ── Window 4: Arth ────────────────────────────────────────────────────────

function initWindow4() {
  document.getElementById('pw-infra-ready-btn').addEventListener('click', () => showScreen(5));
}

// ── Window 5: Eame ────────────────────────────────────────────────────────

function initWindow5() {
  document.getElementById('pw-deploy-btn').addEventListener('click', () => showScreen(6));
}

// ── Bootstrap ─────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  if (!requireAuth()) return;

  wireStepIndicator();
  wireBackButtons();

  initWindow1();
  initWindow2();
  initConfluenceConnector();
  initWindow3();
  initJiraConnector();
  initWindow4();
  initModelSelection();
  initWindow5();
  initChat();

  showScreen(state.step);
});
