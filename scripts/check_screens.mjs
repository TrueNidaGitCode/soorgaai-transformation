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
  arthSelection: { preference: 'frontier', modelId: 'claude-sonnet', displayName: 'Claude Sonnet' },
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
        ] },
      }] }] },
  ],
};

const DEPLOYMENT = {
  status: 'prepared', hosting: 'svarg', environmentName: 'svarg-tenant-000001',
  region: 'us-west', dbName: 'tenant_000001', appAttached: false, url: '',
  model: { modelId: 'claude-sonnet', displayName: 'Claude Sonnet' },
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

function stubScript() {
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
const DEP = ${JSON.stringify(DEPLOYMENT)};
const MANIFEST = ${JSON.stringify({ fileCount: MANIFEST_FILES.length, totalBytes: MANIFEST_FILES.reduce((n, f) => n + f.bytes, 0), files: MANIFEST_FILES })};
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
  if (u.includes('/arth-recommend'))    return J({ ...CATALOG.frontier[1], why: 'Best balance for this use case.', priority: 'quality' }, 200);
  if (u.includes('/arth-selection'))    return J({ saved: true, selection: { displayName: 'Claude Sonnet' } });
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
  eame: { id: 'screen-eame',  launcher: 'Chat with Eame',  must: ['.rp-journey', '.eg-stat', '.eg-tree__row', '.eg-summary__item', '.eg-chip'] },
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

    var d = document.documentElement;
    if (d.scrollWidth > d.clientWidth + 1) bad('page scrolls horizontally');

    // Nothing may claim to be loading once the screen has settled.
    if (/Loading (project files|models)…/.test(scr.textContent)) bad('still showing a loading state');
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
          .replace('<script type="module"', stubScript() + '\n  <script type="module"')
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
    + `${r.steps ?? '?'} steps · lane ${r.laneTop ?? '?'} · ${r.launcher || 'no launcher'}`);
  (r.fail || []).forEach(f => console.log(`        ↳ ${f}`));
}

console.log(`\n${list.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
