/**
 * Svarg — screen check
 *
 * Renders every pipeline screen in a real browser against stubbed APIs and
 * asserts that it actually looks right. Written because "HTTP 200 and the
 * braces balance" has twice passed a screen that rendered completely broken —
 * once when a stray `*​/` in a CSS comment silently discarded 8,590 lines of
 * stylesheet, and once when a portrait painted over the content beneath it.
 * The only way to catch that class of bug is to render the page and measure it.
 *
 *   node scripts/check_screens.mjs            check every screen
 *   node scripts/check_screens.mjs arth yusu  check some of them
 *
 * Screenshots land in scripts/.screens/ for eyeballing. Exit code is non-zero
 * if anything failed, so this can gate a deploy.
 *
 * The stub fakes auth and window.fetch so the REAL modules run their real
 * code paths — it is deliberately strict about URLs, because a stub that
 * matches too loosely hides malformed requests (a `/apiconfluence/...` bug
 * once survived exactly that way).
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const FRONTEND = path.join(ROOT, 'frontend');
const SHOTS = path.join(ROOT, 'scripts', '.screens');
const PORT = Number(process.env.CHECK_PORT || 8399);

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find(p => fs.existsSync(p));

// ── Fixtures ────────────────────────────────────────────────────────────────
// Shaped like the real responses. Where a screen derives something (Eame's
// file counts, Arth's compute figures), the fixture supplies inputs and the
// page does the arithmetic — so the check exercises the real logic.

const GOV_SECTIONS = [
  ['Data Privacy & Security',       'All AI systems operate natively within the customer environment.', 'In Review'],
  ['Ethical AI Guidelines',         'Recommendations are consistent, explainable and fair.',            'Approved'],
  ['Model Validation & Monitoring', 'Every model is validated before launch and monitored after.',      'Not Yet Validated'],
  ['Regulatory Compliance',         'Delivered with embedded compliance for data privacy obligations.', 'In Review'],
  ['Trust & Adoption',              'Trusted and adopted by engineering teams, transparently.',         'Approved'],
].map(([title, strategicPosition, status]) => ({
  title, brief: { strategicPosition, leadershipValidation: { status } },
}));

const BLUEPRINT = {
  _id: '000000000000000000000001',
  status: 'completed',
  businessObjective: 'Reduce OTA flashing defect pre-analysis effort',
  opportunityApproval: { approved: true, approvedAt: new Date().toISOString() },
  // Present so the Cob screen renders its engagement note. An absent
  // engagement hides the note entirely, which would leave this check passing
  // without ever having drawn the thing it is meant to be checking.
  engagement: {
    checked: true, category: 'workflow-automation', subArea: 'support',
    maturity: 'enterprise', confidence: 0.9, reason: 'Automates internal defect triage.', userSet: false,
  },
  // A read repository, matching the one dataset no connector can reach. Without
  // this the "in your code" state never renders and the check passes without
  // having drawn it — the same trap the engagement note fell into.
  codebaseProfile: {
    checked: true, repoFullName: 'acme/flashing-tools', filesRead: 24, chunks: 61, partial: false,
    languages: ['JavaScript'], frameworks: ['Express'], database: 'PostgreSQL',
    entities: [{ name: 'flashing_logs', definedIn: 'db/migrate/20240110_create_flashing_logs.sql', fields: ['ecu_id', 'result'], describes: 'OTA flashing attempts' }],
    datasetMatches: [{ dataset: 'Flashing Logs', entity: 'flashing_logs', definedIn: 'db/migrate/20240110_create_flashing_logs.sql', confidence: 0.9 }],
  },
  // A model the catalog still offers, so the selected state is actually
  // exercised. Pointing this at a retired model left 'selected nothing', which
  // is a real state but not the one worth asserting.
  arthSelection: { preference: 'frontier', modelId: 'gemini-3-8-flash', displayName: 'Gemini 3.8 Flash' },
  eameDelivery: { repoOwner: 'acme', repoName: 'svarg-defect-matching', fileCount: 32 },
  governanceReview: { acknowledged: false },
  domains: [
    { domainId: 'governance-security', status: 'completed',
      capabilities: [{ capabilityId: 'ai-governance-ethics', status: 'error', sections: GOV_SECTIONS }] },
    { domainId: 'ai-use-cases', status: 'completed',
      capabilities: [{ capabilityId: 'opportunity-discovery', status: 'completed', sections: [{
        title: 'AI Implementation Prioritization',
        brief: {
          recommendedStartingPoint: 'Start with Retrieval-Augmented Semantic Matching for Defects.',
          priorityQuadrants: [{ initiatives: ['Retrieval-Augmented Semantic Matching for Defects', 'Automated Log Plausibility Checks'] }],
        },
      }] }] },
    { domainId: 'data-readiness', status: 'completed',
      capabilities: [{ capabilityId: 'critical-data', status: 'completed', sections: [{
        title: 'Critical Data Identification',
        brief: { datasets: [
          { name: 'Pre-analysis Business Objectives', purpose: 'Frame AI reasoning with project KPIs', typicalSource: 'Confluence' },
          { name: 'Test Execution and Defect Records', purpose: 'Correlate failures with defect history', typicalSource: 'Jira' },
          { name: 'Flashing Logs', purpose: 'Enable automated plausibility checks', typicalSource: 'Internal log repositories' },
          // Nothing covers this one, on purpose: it is what makes the partial
          // path render — the collection plan, and a nav button that continues
          // with less than everything. A fixture where all data is present
          // would leave both untested.
          { name: 'Field Telemetry Feed', purpose: 'Correlate faults with real-world driving', typicalSource: 'Vehicle telemetry platform', priority: 'HIGH' },
          // Backed only by generated sample data. The readiness figure must
          // NOT count it — a customer able to generate their way to "5 of 5
          // available" while having none of it is the failure this guards.
          { name: 'Driver Behaviour Scores', purpose: 'Rank risk by driving style', typicalSource: 'Telematics scoring service', priority: 'MEDIUM' },
        ] },
      }] }] },
  ],
};

const DEPLOYMENT = {
  status: 'prepared', hosting: 'svarg', environmentName: 'svarg-tenant-000001',
  region: 'us-west', dbName: 'tenant_000001', appAttached: false, url: '',
  model: { modelId: 'gemini-3-8-flash', displayName: 'Gemini 3.8 Flash' },
  usage: { requests: 0, costUsd: 0 }, limits: { maxCostUsd: 5 },
  preparedAt: new Date().toISOString(),
};

// The real paths the project builder emits. Generic names would let the
// security check fail for the wrong reason — it looks for specific files.
const MANIFEST_FILES = [
  'models/DefectRecord.js', 'models/KnowledgeChunk.js', 'models/JiraConnection.js',
  'services/hybridRetrievalService.js', 'services/embeddingService.js', 'services/llmService.js',
  'services/modelSelectionService.js', 'services/defectMatchingService.js',
  'services/atlassianAuthService.js', 'services/jiraApiService.js',
  'services/jiraContentService.js', 'services/confluenceContentService.js',
  'controllers/defectMatchingController.js', 'controllers/jiraController.js',
  'routes/defectMatchingRoutes.js', 'routes/jiraRoutes.js',
  'middleware/authMiddleware.js', 'utils/encryption.js', 'config/modelCatalog.js',
  'frontend/defect-matching.js', 'frontend/defect-matching.css', 'frontend/base.css',
  'frontend/config.js', 'frontend/index.html',
  'scripts/seed_defect_records.mjs', 'scripts/mint-token.mjs',
  'README.md', 'JIRA_INTEGRATION.md', 'package.json', 'server.js',
  '.env.example', '.gitignore',
].map(path => ({ path, bytes: 4096 }));

// ── The page stub ───────────────────────────────────────────────────────────

function stubScript(screen) {
  return `<script>
localStorage.setItem('token','stub');
localStorage.setItem('userId','stub');
localStorage.setItem('userEmail','check@svarg.ai');
localStorage.removeItem('soorgaai_guest_id');
sessionStorage.clear();
window.handleSessionExpired = function(){};
window.__errs = [];
window.addEventListener('error', function(e){ window.__errs.push('JSERR: ' + e.message); });
window.addEventListener('unhandledrejection', function(e){
  window.__errs.push('REJECT: ' + ((e.reason && e.reason.message) || e.reason));
});

const BP = ${JSON.stringify(BLUEPRINT)};
const DEP = ${JSON.stringify(
  // Arth freezes every control once an environment is prepared — correctly, since
  // the gateway is wired to the chosen model and the container sized for it. That
  // makes the model-class row untestable on a prepared fixture: the buttons carry
  // `disabled`, and a disabled button dispatches no click at all, so a check that
  // clicks one cannot tell a working lock from a broken one. Arth therefore gets
  // an unprepared environment, which is the state the choice is actually made in.
  screen === 'arth' ? { ...DEPLOYMENT, status: 'none', preparedAt: '' } : DEPLOYMENT
)};
const BUILD_STATE = ${JSON.stringify(process.env.EAME_BUILD_STATE || "passed")};
const MANIFEST = ${JSON.stringify({ fileCount: MANIFEST_FILES.length, totalBytes: MANIFEST_FILES.reduce((n, f) => n + f.bytes, 0), files: MANIFEST_FILES })};
const RECOMMENDED = ${JSON.stringify([
  { modelId: 'gemini-3-8-flash', displayName: 'Gemini 3.8 Flash', vendor: 'Google',    type: 'frontier', providerId: 'gemini', apiModel: 'gemini-3.8-flash', focusScore: 48, cost: 0.56, inBand: true, confidenceLabel: 'Medium Confidence' },
  { modelId: 'claude-opus-5',    displayName: 'Claude Opus 5',    vendor: 'Anthropic', type: 'frontier', providerId: 'claude', apiModel: 'claude-opus-5',    focusScore: 48, cost: 0.89, inBand: true, confidenceLabel: 'Medium Confidence' },
  { modelId: 'gpt-5-6-sol',      displayName: 'GPT-5.6 Sol',      vendor: 'OpenAI',    type: 'frontier', providerId: 'openai', apiModel: 'gpt-5.6-sol',      focusScore: 49, cost: 0.95, inBand: true, confidenceLabel: 'Medium Confidence' },
  { modelId: 'claude-fable-5-1', displayName: 'Claude Fable 5.1', vendor: 'Anthropic', type: 'frontier', providerId: 'claude', apiModel: 'claude-fable-5-1', focusScore: 48, cost: 0.99, inBand: true, confidenceLabel: 'Medium Confidence' },
  { modelId: 'gpt-6-astra',      displayName: 'GPT-6 Astra',      vendor: 'OpenAI',    type: 'frontier', providerId: 'openai', apiModel: 'gpt-6-astra',      focusScore: 49, cost: 1.47, inBand: true, confidenceLabel: 'Medium Confidence' },
])};

const RUNNABLE = ${JSON.stringify([
  { id: 'claude-opus',   displayName: 'Claude Opus',   vendor: 'Anthropic', type: 'frontier', providerId: 'claude', quality: 'best', cost: 'high',   performance: 'high' },
  { id: 'claude-sonnet', displayName: 'Claude Sonnet', vendor: 'Anthropic', type: 'frontier', providerId: 'claude', quality: 'best', cost: 'medium', performance: 'high' },
  { id: 'gpt-5',         displayName: 'GPT-5',         vendor: 'OpenAI',    type: 'frontier', providerId: 'openai', quality: 'best', cost: 'high',   performance: 'high' },
  { id: 'gemini-pro',    displayName: 'Gemini Pro',    vendor: 'Google',    type: 'frontier', providerId: 'gemini', quality: 'good', cost: 'medium', performance: 'high' },
  { id: 'gemini-flash',  displayName: 'Gemini Flash',  vendor: 'Google',    type: 'frontier', providerId: 'gemini', quality: 'fair', cost: 'low',    performance: 'high' },
])};

const CATALOG = ${JSON.stringify({
  frontier: [
    { id:'claude-opus', displayName:'Claude Opus', vendor:'Anthropic', type:'frontier', quality:'best', cost:'high', performance:'high', strengths:'Long-context reasoning.' },
    { id:'claude-sonnet', displayName:'Claude Sonnet', vendor:'Anthropic', type:'frontier', quality:'best', cost:'medium', performance:'high', strengths:'Close to Opus, cheaper.' },
    { id:'gemini-flash', displayName:'Gemini Flash', vendor:'Google', type:'frontier', quality:'fair', cost:'low', performance:'high', strengths:'Fastest and cheapest.' },
  ],
  'open-weight': [
    { id:'llama-3-3-70b', displayName:'Llama 3.3 70B Instruct', vendor:'Meta', type:'open-weight', quality:'good', cost:'low', performance:'medium', license:'Llama 3.3 Community License', strengths:'Strongest open-weight model at this size.',
      compute:{ quantization:'int4', vramGb:44, gpuCount:1, gpu:'NVIDIA L40S / RTX A6000 (48GB)', note:'44GB VRAM at int4.' } },
  ],
})};

function J(body, ms) {
  const res = new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
  return ms ? new Promise(r => setTimeout(() => r(res), ms)) : Promise.resolve(res);
}

window.fetch = function (url, opts) {
  const u = String(url);
  // A path that lost its leading slash concatenates into ".../apiconfluence/…"
  // and must fail here exactly as it would in production.
  if (/\\/api[a-z]/.test(u)) return Promise.resolve(new Response('{"error":"malformed URL"}', { status: 404 }));

  if (u.includes('/arth/models')) {
    const type = (u.match(/type=([a-z-]+)/) || [])[1] || 'frontier';
    return J({ models: CATALOG[type] || [] });
  }
  if (u.includes('/recommend-models')) {
    // Honours the limit, because Auto asks for one and Frontier for five, and
    // a stub that ignored it would let a broken Auto pass as working.
    const limit = (JSON.parse(opts && opts.body || '{}').limit) || 5;
    window.__lastRecommend = { limit: limit };
    return J({
      picks: RECOMMENDED.slice(0, limit).map(function (m) { return Object.assign({}, m, { adviceOnly: false }); }),
      // Empty because every pick can be run. RUNNABLE is kept as the fixture
      // for the fallback path, so the split can still be exercised.
      runnable: [],
      autoPick: RECOMMENDED[0].modelId,
      rule: 'cheapest-in-confidence-band',
      focus: 'strategyOps', confidence: 'very-high', requestedConfidence: 'very-high',
      widened: false, filled: limit > 3,
      band: { focus: 'strategyOps', min: 54.7, max: 58, label: 'Very High Confidence' },
      catalogSize: 24,
    });
  }
  if (u.includes('/arth-recommend'))    return J({ ...CATALOG.frontier[1], why: 'Best balance for this use case.', priority: 'quality' }, 200);
  if (u.includes('/eame-build')) {
    // A blueprint nobody has built yet is a real state and the FIRST one every
    // customer sees, so it has to be renderable here too.
    //   EAME_BUILD_STATE=none node scripts/check_screens.mjs eame
    if (BUILD_STATE === 'none') return J({ status: 'none' });
    return J({
      status: 'passed', verifiedTo: 'smoke', skipped: [], reason: '',
      useCase: 'Predictive Analytics for Student Churn', provider: 'gemini',
      warnings: [], failures: [], attempts: 1,
      progress: { attempt: 1, phase: 'passed', detail: 'smoke' },
      generatedPaths: ['models/StudentChurnProfile.js', 'services/churnAnalyticsService.js',
                       'controllers/churnController.js', 'routes/churnRoutes.js',
                       'scripts/seedChurnData.js', 'frontend/app.js'],
      files: MANIFEST.files, fileCount: MANIFEST.fileCount,
      totalBytes: MANIFEST.totalBytes,
    });
  }
  if (u.includes('/arth-selection'))    return J({ saved: true, selection: { displayName: 'Gemini 3.8 Flash' } });
  if (u.includes('/governance-review')) return J({ acknowledged: true });
  if (u.includes('/infrastructure'))    return J({ deployment: DEP }, 200);
  if (u.includes('/deployment'))        return J({ deployment: DEP });
  if (u.includes('/deploy'))            return J({ deployment: { ...DEP, status: 'live', url: 'https://svarg-tenant-000001.up.railway.app', appAttached: true, liveAt: new Date().toISOString() }, gatewayToken: 'svd_' + '0'.repeat(48) }, 200);
  if (u.includes('/transformation-blueprint')) return J(BP);
  if (u.includes('/project-manifest'))  return J(MANIFEST);
  if (u.includes('/github/personal/status')) return J({ connected: true, githubLogin: 'acme' });
  if (u.includes('/confluence/personal/status')) return J({ connected: true, siteName: 'acme.atlassian.net', jiraScopeGranted: true });
  if (u.includes('/confluence/personal/linked/')) return J({ documents: [
    { sourceId: 'p1', title: 'Roadmap', sourceType: 'confluence', spaceKey: 'PM', redactionApplied: true, redactionCount: 2, extractionStatus: 'extracted', keywords: ['a'] },
    { sourceId: 'KAN-1', title: 'Flash abort', sourceType: 'jira', projectKey: 'KAN', redactionApplied: true, redactionCount: 1, extractionStatus: 'extracted', keywords: ['b'] },
  ] });
  if (u.includes('/confluence/personal/spaces')) return J({ spaces: [{ key: 'PM', name: 'Product', type: 'global', itemCount: 12 }] });
  if (u.includes('/jira/personal/projects'))     return J({ projects: [{ key: 'KAN', name: 'Kanban', itemCount: 6 }] });
  if (u.includes('/uploads/dataset-files/')) return J({
    uploads: [],
    samples: [{ datasetName: 'Driver Behaviour Scores', rowCount: 22, generatedAt: new Date().toISOString() }],
  });
  if (u.includes('/screen-chat')) return J({ reply: 'Stubbed reply.', action: null });
  return J({});
};
<\/script>`;
}

// ── What each screen must satisfy ───────────────────────────────────────────

const SCREENS = {
  cob:  { id: 'screen-opportunities', launcher: 'Chat with Cob',
          must: ['.rp-journey', '.pd-winner, .rp-winner, .cob-title'] },
  aria: { id: 'screen-aria',  launcher: 'Chat with Aria',  must: ['.rp-journey', '.aria-header__title'] },
  arth: { id: 'screen-arth',  launcher: 'Chat with Arth',  must: ['.rp-journey', '#arth-options .arth-option'] },
  // Two states, two different sets of things that must be on screen. Before a
  // build there is no project, so requiring a file tree would demand exactly
  // the fabricated one this screen was fixed to stop showing.
  eame: { id: 'screen-eame',  launcher: 'Chat with Eame',
          must: process.env.EAME_BUILD_STATE === 'none'
            ? ['.rp-journey', '#eame-build-btn', '.eg-gate']
            : ['.rp-journey', '.eg-stat', '.eg-tree__row', '.eg-summary__item', '.eg-chip'] },
  yusu: { id: 'screen-yusu',  launcher: 'Chat with Yusu',  must: ['.rp-journey', '.dp__step', '.eg-usecase__name'] },
};

function probeScript(screen) {
  const cfg = SCREENS[screen];
  return `<script>
setTimeout(function () {
  var out = { screen: ${JSON.stringify(screen)}, fail: [] };
  function bad(m) { out.fail.push(m); }
  try {
    var scr = document.getElementById(${JSON.stringify(cfg.id)});
    if (!scr || scr.offsetParent === null) bad('screen not visible');

    // The stylesheet actually parsed. A CSS comment closing early silently
    // discards everything after it, and the page still returns 200.
    var sheet = [].slice.call(document.styleSheets).filter(function (s) {
      return (s.href || '').indexOf('domain.css') > -1;
    })[0];
    var rules = 0;
    try { rules = sheet.cssRules.length; } catch (e) {}
    out.cssRules = rules;
    if (rules < 1200) bad('stylesheet only parsed ' + rules + ' rules');

    ${JSON.stringify(cfg.must)}.forEach(function (sel) {
      if (!scr.querySelector(sel)) bad('missing ' + sel);
    });

    var nav = scr.querySelectorAll('.rp-journey .pw-step');
    out.steps = nav.length;
    if (nav.length !== 5) bad('journey has ' + nav.length + ' steps, expected 5');

    var lane = scr.querySelector('.sc-lane');
    if (!lane) { bad('no character lane'); }
    else {
      var img = lane.querySelector('.sc-portrait');
      out.portrait = img ? img.getAttribute('src') : null;
      if (!img) bad('no portrait');
      else if (!img.naturalWidth) bad('portrait failed to load: ' + img.getAttribute('src'));

      var btn = lane.querySelector('.sc-launcher');
      out.launcher = btn ? btn.textContent.trim() : null;
      if (!btn) bad('no chat launcher');
      else if (btn.textContent.trim() !== ${JSON.stringify(cfg.launcher)}) bad('launcher reads "' + btn.textContent.trim() + '"');

      // Regression guard: the lane must start below the journey nav and must
      // not reach over the page scrollbar.
      var body = lane.closest('.rp-shell__body').getBoundingClientRect();
      var l = lane.getBoundingClientRect();
      out.laneTop = Math.round(l.top - body.top);
      if (Math.abs(out.laneTop - 165) > 2) bad('lane top is ' + out.laneTop + ', expected 165');
      if (Math.round(l.right) > document.documentElement.clientWidth) bad('lane overhangs the scrollbar');
    }

    // Aria's required-data table and connector tabs. The readiness denominator
    // is the specific regression worth pinning: dividing by the connectable
    // subset rendered six required datasets as "0 of 0".
    if (out.screen === 'aria') {
      var reqTable = (document.getElementById('aria-required-body') || {}).closest ? document.getElementById('aria-required-body').closest('table') : null;
      var head = reqTable ? reqTable.querySelectorAll('thead th') : [];
      out.ariaCols = head.length;
      if (head.length !== 2) bad('required-data table has ' + head.length + ' columns, expected 2');

      var rows = scr.querySelectorAll('#aria-required-body tr');
      var frac = (document.getElementById('aria-readiness-fraction') || {}).textContent || '';
      out.readiness = frac.trim();
      if (/of 0$/.test(out.readiness) && rows.length > 0) {
        bad('readiness reads "' + out.readiness + '" with ' + rows.length + ' datasets listed');
      }

      // A dataset found in the customer's own code must show the entity AND
      // the file that defines it. The path is the evidence — a match without
      // one is the guesswork this feature exists to replace.
      var inCode = scr.querySelector('.aria-status--incode');
      if (!inCode) bad('no dataset rendered as found in the codebase');
      else {
        // NOTHING in this probe may contain a backslash — not even a comment.
        // The probe is built inside a template literal, so escapes are consumed
        // before the browser sees them: an escaped slash in a regex arrives as
        // a line comment, and a newline escape in a comment ends the comment
        // early and turns the rest of the sentence into code. Both silently
        // kill the whole probe, which then reports as "page did not load".
        // Hence String.fromCharCode(10) and indexOf below.
        out.inCode = (inCode.textContent || '').split(String.fromCharCode(10)).join(' ').trim().slice(0, 60);
        if (!inCode.querySelector('code')) bad('in-code status names no entity');
        var where = inCode.querySelector('.aria-status__where');
        if (!where || (where.textContent || '').indexOf('/') === -1) bad('in-code status cites no file path');
      }

      // Moving on must never be blocked. It used to be enabled only by the
      // Confluence/Jira linking path, so an engagement showing GitHub and
      // Upload could never continue at all — the one control that unlocked
      // Arth sat on a tab it was never shown.
      var navBtn = document.getElementById('aria-nav-btn');
      out.nav = navBtn ? (navBtn.disabled ? 'DISABLED' : navBtn.textContent.trim()) : 'missing';
      if (!navBtn) bad('no stage-nav button on Aria');
      else if (navBtn.disabled) bad('Move to Arth is disabled — the stage cannot be completed');

      // The "Still to collect" list is gone — it re-stated what the Required
      // Data table above already showed. What must NOT go with it is the
      // information: a dataset nobody has still has to be visible, in the
      // table, with what it is for. Removing a duplicate is only safe if the
      // original is still there.
      if (document.getElementById('aria-collect')) bad('the removed Still-to-collect section is back');
      var reqRows = document.querySelectorAll('#aria-required-body tr');
      out.collect = reqRows.length;
      if (!reqRows.length) bad('the required-data table is empty');
      var reqText = document.getElementById('aria-required-body').textContent;
      // The one dataset in the fixture that no connector reaches.
      if (reqText.indexOf('Field Telemetry Feed') === -1) {
        bad('the uncovered dataset is no longer listed anywhere');
      }

      // Generated sample data: visible, labelled, and NOT counted as ready.
      var sampleRow = document.querySelector('#aria-required-body .aria-status--sample');
      out.sample = sampleRow ? sampleRow.textContent.replace(/s+/g, ' ').trim() : 'none';
      if (!sampleRow) bad('the sample-backed dataset is not marked as sample data');
      else if (sampleRow.textContent.indexOf('not your real data') === -1) {
        bad('the sample row does not say it is not their real data');
      }
      // 3 of 5, not 4 of 5. This is the assertion the whole feature turns on.
      if (out.readiness !== '3 of 5') {
        bad('readiness reads "' + out.readiness + '" — sample data is being counted as available');
      }
      var sampleLegend = document.getElementById('aria-legend-sample');
      if (!sampleLegend || sampleLegend.textContent.indexOf('1 Sample') === -1) {
        bad('the legend does not call out the sample data');
      }
      // The way to make one, for a dataset that has none.
      if (!document.querySelector('[data-sample-make]')) {
        bad('no way to generate sample data for the uncovered dataset');
      }

      var tabs = scr.querySelectorAll('#aria-tabs .aria-tab');
      out.tabs = [].map.call(tabs, function (t) { return t.dataset.tab; }).join('/');
      if (!tabs.length) bad('no connector tabs rendered');
      if (!scr.querySelector('#aria-tabs .aria-tab--active')) bad('no tab is selected');
      // Upload is the only route in for data no connector reaches, so it must
      // be offered whatever the engagement says.
      if (out.tabs.indexOf('upload') === -1) bad('Upload tab missing (tabs: ' + out.tabs + ')');
    }

    // Arth's two lists. The benchmark tables are advice — they carry no
    // provider, so nothing on them can be run — and the models that can be
    // run are the ones that may be chosen. Presenting the first as choices is
    // what produced a picker whose every option failed on save.
    if (out.screen === 'arth') {
      var advice = scr.querySelectorAll('#arth-models .arth-model--advice');
      var pickable = scr.querySelectorAll('#arth-models .arth-model[data-model]');
      out.advice = advice.length;
      out.pickable = pickable.length;

      // Every recommendation should be runnable now that catalog rows carry
      // endpoints. Anything in the advice group means a row lost its provider
      // or its apiModel, which is the state that produced a picker where
      // nothing could be confirmed.
      if (advice.length) bad(advice.length + ' recommended models cannot be run');
      if (pickable.length !== 5) bad('picker offers ' + pickable.length + ' models, expected 5');

      // Enforced, not styled: an advice card carries no data-model, so the
      // click handler cannot reach it however it looks.
      var selectableAdvice = 0;
      for (var a = 0; a < advice.length; a++) {
        if (advice[a].hasAttribute('data-model')) selectableAdvice++;
      }
      if (selectableAdvice) bad(selectableAdvice + ' advice cards are selectable');

      // Whatever is selected must be runnable. A selection resting on an
      // advice row is exactly the state this split exists to prevent, and it
      // is visible on the settled screen without clicking anything.
      var sel = scr.querySelector('#arth-models .arth-model--on');
      out.selected = sel ? (sel.getAttribute('data-model') || 'AN ADVICE ROW') : 'nothing';
      if (out.selected === 'AN ADVICE ROW') bad('the selected model cannot be run');

      // The two numbers the choice is made on, on every advice card.
      var withBoth = 0;
      for (var c = 0; c < pickable.length; c++) {
        var t = pickable[c].textContent || '';
        // The currency symbol too: a template-literal slip once dropped it and
        // left a bare number, which reads as a score rather than a price.
        var priced = t.indexOf(String.fromCharCode(36)) !== -1;
        if (t.indexOf('Score') !== -1 && t.indexOf('Cost') !== -1 && priced) withBoth++;
      }
      if (withBoth !== pickable.length) bad(withBoth + ' of ' + pickable.length + ' cards show both score and cost');

      // Svarg's own derivation is internal. It used to be printed above the
      // shortlist as if it were product copy — which benchmark was ranked on,
      // why that band, what the band measures.
      var leaked = [
        'ranking is on the', 'band of what the benchmark offers', 'Domain knowledge across',
        'cheapest model in that band', 'The company reads as early-stage', 'Ranked on'
      ].filter(function (phrase) { return (scr.textContent || '').indexOf(phrase) !== -1; });
      out.leaked = leaked.length ? leaked.join(' | ') : 'none';
      if (leaked.length) bad('internal reasoning is on screen: ' + leaked.join(' | '));
    }
    // Eame's build gates. The screen used to say "Generation Complete" as a
    // hardcoded string over a project nobody had built; these are real states,
    // and a passed build must show every gate as passed.
    if (out.screen === 'eame') {
      var gates = scr.querySelectorAll('#eame-gates .eg-gate');
      out.gates = gates.length;
      if (gates.length !== 6) bad('expected 6 build gates, got ' + gates.length);

      var passed = scr.querySelectorAll('#eame-gates .eg-gate--ok').length;
      out.gatesPassed = passed;

      var fresh = /Not built yet/.test((document.getElementById('eame-gen-status') || {}).textContent || '');
      if (fresh) {
        // Nothing built means nothing may be shown as built. This screen used
        // to fall back to the defect-matching template — "32 Files, Full-stack
        // application" and a summary of green ticks — directly under a badge
        // reading "Not built yet".
        if (passed !== 0) bad(passed + ' gates show as passed before anything was built');
        var stats = scr.querySelectorAll('#eame-stats .eg-stat').length;
        var summary = scr.querySelectorAll('#eame-summary li').length;
        var rows = scr.querySelectorAll('#eame-manifest-body tr').length;
        out.freshShows = stats + ' stats, ' + summary + ' summary, ' + rows + ' files';
        if (stats || summary || rows) bad('a project is shown before any build: ' + out.freshShows);
        if (!/No application yet/.test((document.getElementById('eame-tree') || {}).textContent || '')) {
          bad('the file tree does not say there is nothing built yet');
        }
      } else if (passed !== 6) {
        bad(passed + ' of ' + gates.length + ' gates show as passed on a passed build');
      }

      var badge = document.getElementById('eame-gen-status');
      out.badge = badge ? badge.textContent.trim() : 'missing';
      // The old text was a hardcoded claim. Anything that still asserts
      // completion without reference to verification is the same bug.
      if (/Generation Complete/.test(out.badge)) bad('the status badge still claims completion unconditionally');

      var btn = document.getElementById('eame-build-btn');
      if (!btn) bad('no build control on the Eame screen');
    }

    // Cob's engagement note. It states what the whole blueprint was steered
    // by, so a note that silently fails to render is worse than a visibly
    // wrong one — assert it drew, said something, and offers the way out.
    if (out.screen === 'cob') {
      var eng = document.getElementById('opp-engagement');
      var engText = document.getElementById('opp-engagement-text');
      var engSwitch = document.getElementById('opp-engagement-switch');
      if (!eng || eng.style.display === 'none') bad('engagement note did not render');
      else {
        out.engagement = (engText && engText.textContent || '').slice(0, 40);
        if (!out.engagement.trim()) bad('engagement note rendered empty');
        if (!engSwitch || !engSwitch.textContent.trim()) bad('engagement note offers no correction');
        var er = eng.getBoundingClientRect();
        if (er.width === 0 || er.height === 0) bad('engagement note has no box');
      }
    }

    // Open the chat and confirm it does not cover the content column. The
    // panel is deliberately wider than the portrait lane it sits in, growing
    // left into the gap, so "wide enough" and "overlapping" are one setting
    // apart — measure it rather than trusting the arithmetic.
    var launcher = scr.querySelector('[data-sc-open]');
    if (launcher) {
      launcher.click();
      var panel = scr.querySelector('.sc-panel');
      if (panel && !panel.hasAttribute('hidden')) {
        var pr = panel.getBoundingClientRect();
        out.chatW = Math.round(pr.width);
        if (pr.width < 300) bad('chat panel is only ' + Math.round(pr.width) + 'px wide');

        // Only elements that actually PAINT. Full-width containers like
        // #opp-content wrap a much narrower card, so their boxes reach under
        // the panel while nothing is drawn there — measuring those reports an
        // overlap that no one can see.
        var content = scr.querySelectorAll(
          '.rp-winner-card, .prog-bar, .stage-nav, .rp-others-list,' +
          '.aria-table-wrap, .eg-panel, .host-card, .arth-card, .tr-grid, .dp__strip'
        );
        for (var ci = 0; ci < content.length; ci++) {
          var cr = content[ci].getBoundingClientRect();
          if (cr.width === 0 || cr.height === 0) continue;
          if (cr.right > pr.left + 1 && cr.bottom > pr.top && cr.top < pr.bottom) {
            bad('chat panel overlaps content (' + content[ci].className.split(' ')[0] +
                ' ends at ' + Math.round(cr.right) + ', panel starts at ' + Math.round(pr.left) + ')');
            break;
          }
        }
      }
      // Close and reopen. The greeting is appended to the log but never
      // joins the conversation history, so a guard written against history
      // fires every single time — the panel filled up with the character
      // introducing itself again on each reopen.
      var closeBtn = scr.querySelector('[data-sc-close]');
      if (closeBtn) {
        closeBtn.click();
        launcher.click();
        var log = scr.querySelector('[data-sc-log]');
        var greetings = log ? log.querySelectorAll('.sc-msg--bot').length : 0;
        out.greetings = greetings;
        if (greetings > 1) bad('chat greeted ' + greetings + ' times after one close-and-reopen');
        closeBtn.click();
      }
    }

    var d = document.documentElement;
    if (d.scrollWidth > d.clientWidth + 1) bad('page scrolls horizontally');

    // Nothing may claim to be loading once the screen has settled.
    if (/Loading (project files|models)…/.test(scr.textContent)) bad('still showing a loading state');

    // ── Interactions, last ──────────────────────────────────────────
    // Everything below clicks something, and every class now starts a
    // model fetch that cannot resolve inside this synchronous pass.
    // Anything measured after this measures the probe, not the page.
    // Arth's model classes. Open Weight is shown but not selectable, and the
    // failure worth pinning is the quiet one: a locked card that dims but
    // still selects, or refuses without saying why. Both look fine in a
    // screenshot, so this clicks it and checks what happened.
    if (out.screen === 'arth') {
      var pick = function (id) { return scr.querySelector('#arth-options [data-pref=' + id + ']'); };
      var isOn = function (id) { var e = pick(id); return !!e && e.classList.contains('arth-option--on'); };
      var noteText = function () {
        var n = document.getElementById('arth-locked-note');
        return (n && n.style.display !== 'none' && (n.textContent || '').trim()) || '';
      };

      // A frozen screen disables the row, and a disabled button fires no click.
      // Saying so beats four assertions failing as if the lock were broken.
      var frozen = !!(pick('frontier') && pick('frontier').disabled);
      if (frozen) bad('the model-class row is frozen, so the lock cannot be exercised');

      var opts = scr.querySelectorAll('#arth-options .arth-option');
      out.classes = [].map.call(opts, function (o) {
        return o.dataset.pref + (o.classList.contains('arth-option--locked') ? '(locked)' : '');
      }).join('/');
      if (opts.length !== 3) bad('expected 3 model classes, got ' + opts.length);
      if (!pick('open-weight')) bad('no open-weight class rendered — it should be visible, just locked');
      else if (!pick('open-weight').classList.contains('arth-option--locked')) bad('open-weight is not locked');

      // Auto first: an unlocked class that is not already selected proves the
      // row is wired, so a later refusal can be read as the lock working
      // rather than as nothing being connected.
      pick('auto').click();
      if (!isOn('auto')) bad('an unlocked class could not be selected — the row is not wired');

      // Auto means Svarg decides, so it must ask for one model, not a
      // shortlist it then leaves the customer to choose from. The request
      // goes out synchronously, so this is readable in the same pass.
      out.autoLimit = (window.__lastRecommend || {}).limit;
      if (out.autoLimit !== 1) bad('Auto asked for ' + out.autoLimit + ' models, expected 1');

      pick('open-weight').click();
      out.lockNote = noteText().slice(0, 52) || "NONE";
      if (!noteText()) bad('clicking a locked class explained nothing');
      if (isOn('open-weight')) bad('a locked class was selected anyway');
      if (!isOn('auto')) bad('a refused click changed the selection');

      // And the lock does not spread: choosing a selectable class still takes
      // and clears the message on the way.
      //
      // Auto rather than Frontier, deliberately. Frontier starts a model fetch
      // that cannot resolve inside this synchronous pass, so the screen would
      // still read "Loading models…" when the shared assertions run and fail
      // for a reason that has nothing to do with the lock. A probe has to
      // leave the page settled.
      pick('auto').click();
      if (!isOn('auto')) bad('a selectable class could not be chosen after the refusal');
      if (noteText()) bad('the lock message survived choosing a selectable class');
    }

  } catch (e) { bad('probe threw: ' + e.message); }

  out.errs = window.__errs || [];
  if (out.errs.length) out.fail.push('console: ' + out.errs.join(' | '));
  document.title = 'CHECK ' + JSON.stringify(out);
}, 3200);
<\/script>`;
}

// ── Runner ──────────────────────────────────────────────────────────────────

function serve(screen) {
  return http.createServer((req, res) => {
    const p = decodeURIComponent(req.url.split('?')[0]);
    fs.readFile(path.join(FRONTEND, p), (err, data) => {
      if (err) { res.writeHead(404); res.end('not found'); return; }
      if (p.endsWith('domain.html')) {
        const html = data.toString()
          .replace('<script type="module"', stubScript(screen) + '\n  <script type="module"')
          .replace('</body>', probeScript(screen) + '</body>');
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(html);
        return;
      }
      const ext = path.extname(p);
      res.writeHead(200, { 'Content-Type':
        ext === '.css' ? 'text/css' : ext === '.js' ? 'text/javascript'
        : ext === '.png' ? 'image/png' : ext === '.svg' ? 'image/svg+xml' : 'text/plain' });
      res.end(data);
    });
  });
}

function chrome(args) {
  return new Promise((resolve) => {
    const p = spawn(CHROME, args, { windowsHide: true });
    let out = '';
    p.stdout.on('data', d => { out += d; });
    p.on('close', () => resolve(out));
  });
}

async function checkScreen(screen) {
  const server = serve(screen);
  await new Promise(r => server.listen(PORT, r));
  try {
    const url = `http://localhost:${PORT}/domain/domain.html?view=${screen}`;
    const common = ['--headless', '--disable-gpu', '--window-size=1440,1000', '--virtual-time-budget=9000'];
    await chrome([...common, `--screenshot=${path.join(SHOTS, screen + '.png')}`, url]);
    const dom = await chrome([...common, '--dump-dom', url]);
    const m = dom.match(/<title>CHECK ([\s\S]*?)<\/title>/);
    if (!m) return { screen, fail: ['no probe result — the page did not finish loading'] };
    // The DOM dump HTML-escapes the title's contents.
    const json = m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
    return JSON.parse(json);
  } finally {
    await new Promise(r => server.close(r));
  }
}

const wanted = process.argv.slice(2).filter(a => SCREENS[a]);
const list = wanted.length ? wanted : Object.keys(SCREENS);

if (!CHROME) {
  console.error('No Chrome found. Set one of the paths in CHROME at the top of this file.');
  process.exit(2);
}
fs.mkdirSync(SHOTS, { recursive: true });

console.log(`Checking ${list.length} screen(s) — screenshots in scripts/.screens/\n`);
let failed = 0;
for (const screen of list) {
  const r = await checkScreen(screen);
  const ok = !r.fail?.length;
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${screen.padEnd(6)}`
    + `css ${String(r.cssRules ?? '?').padStart(4)} rules · `
    + `${r.steps ?? '?'} steps · lane ${r.laneTop ?? '?'} · chat ${r.chatW ?? '?'}px · `
    + `${r.greetings ?? '?'} greeting · ${r.launcher || 'no launcher'}`
    + (r.tabs ? `\n        tabs ${r.tabs} · ${r.ariaCols} cols · readiness "${r.readiness}" · in-code "${r.inCode || 'none'}"
        nav "${r.nav}" · ${r.collect} rows · sample "${r.sample}"` : '')
    + (r.classes ? `\n        classes ${r.classes} · lock note "${r.lockNote}"\n        advice ${r.advice} · pickable ${r.pickable} · selected ${r.selected} · auto asks for ${r.autoLimit} · internal text: ${r.leaked}` : '')
    // Its own clause, not nested inside the arth one — nested, it could only
    // ever print for a screen that also had model classes, so the eame line
    // was unreachable.
    + (r.gates ? `\n        gates ${r.gatesPassed}/${r.gates} passed · badge "${r.badge}"${r.freshShows ? ' · fresh shows ' + r.freshShows : ''}` : ''));
  (r.fail || []).forEach(f => console.log(`        ↳ ${f}`));
}

console.log(`\n${list.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
