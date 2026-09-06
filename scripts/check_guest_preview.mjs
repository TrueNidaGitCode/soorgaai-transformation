/**
 * Svarg — the try-before-login preview, rendered
 *
 * A visitor who types an objective without an account gets one domain — AI Use
 * Cases — and then stops. Nothing about that stop is enforced server-side on
 * this screen; it is entirely a rendering decision, which is exactly the kind
 * that breaks silently. Before this check existed, the Cob screen showed a
 * progress bar counting every capability in the blueprint, so a guest watched
 * it sit at roughly 6% under "Analysing your objective…" for ever, describing
 * work that had already stopped and was never going to run.
 *
 * Two states, both rendered in a real browser:
 *   generating — the free domain is still running, ordinary bar, no pause
 *   paused     — the free domain is done, pause panel with a login button
 *
 *   node scripts/check_guest_preview.mjs
 *
 * Screenshots land in scripts/.screens/guest-*.png. The in-page probe lives
 * in scripts/guest-probe.js — served as its own file rather than inlined,
 * because a regex written through a template literal loses its escapes.
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const FRONTEND = path.join(ROOT, 'frontend');
const SHOTS = path.join(ROOT, 'scripts', '.screens');
const PORT = Number(process.env.GUEST_CHECK_PORT || 8403);
const GUEST_ID = '11111111-2222-3333-4444-555555555555';

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find(p => fs.existsSync(p));

// Domain names and order must match config/domainRegistry.js — the pause panel
// names the next one, and naming the wrong one is the bug this would miss.
const OTHER_DOMAINS = [
  ['ai-strategy', 'AI Strategy'],
  ['data-readiness', 'Data Readiness'],
  ['technology-infrastructure', 'Technology Infrastructure'],
  ['skills-workforce', 'Skills & Workforce'],
  ['governance-security', 'Governance & Ethics'],
];

/**
 * The AI Use Cases capabilities, per state.
 *
 * Four capabilities run and any one of them can come back as malformed JSON,
 * which happens in ordinary runs — a real padhivu preview lost AI Use Case
 * Classification that way. So the failure states are fixtures, not
 * hypotheticals: 'degraded' is prioritisation failing while discovery
 * survives, 'barren' is losing both.
 */
function useCaseCapabilities(state) {
  const RANKED = {
    title: 'AI Implementation Prioritization',
    brief: {
      recommendedStartingPoint: 'Retrieval-Augmented Ticket Routing should go first because the data is already structured.',
      recommendedInitiativeName: 'Retrieval-Augmented Ticket Routing',
      priorityQuadrants: [{ initiatives: ['Retrieval-Augmented Ticket Routing', 'Automated Severity Scoring'] }],
    },
  };
  const DISCOVERED = {
    title: 'AI Opportunity Discovery',
    brief: {
      aiOpportunities: [
        { name: 'Automated Severity Scoring', why: 'Ticket text and resolution times are already captured.' },
        { name: 'Retrieval-Augmented Ticket Routing', why: 'Historic routing decisions give a training signal.' },
      ],
    },
  };
  const cap = (capabilityId, capabilityName, status, sections) =>
    ({ capabilityId, capabilityName, status, sections });

  if (state === 'generating') {
    return [cap('ai-opportunity-discovery', 'AI Opportunity Discovery', 'in-progress', [])];
  }
  if (state === 'degraded') {
    // Prioritisation failed; discovery did not. The screen must fall back.
    return [
      cap('ai-opportunity-discovery', 'AI Opportunity Discovery', 'completed', [DISCOVERED]),
      cap('ai-implementation-prioritization', 'AI Implementation Prioritization', 'error', []),
    ];
  }
  if (state === 'barren') {
    return [
      cap('ai-opportunity-discovery', 'AI Opportunity Discovery', 'error', []),
      cap('ai-implementation-prioritization', 'AI Implementation Prioritization', 'error', []),
    ];
  }
  return [
    cap('ai-opportunity-discovery', 'AI Opportunity Discovery', 'completed', [DISCOVERED]),
    cap('ai-implementation-prioritization', 'AI Implementation Prioritization', 'completed', [RANKED]),
  ];
}

function blueprint(state) {
  const running = state === 'generating';
  return {
    _id: '000000000000000000000009',
    // A guest blueprint is marked completed once its one domain finishes —
    // the other five stay pending for ever, which is the whole point.
    status: running ? 'generating' : 'completed',
    businessObjective: 'Cut the time it takes to triage incoming support tickets.',
    opportunityApproval: { approved: false },
    engagement: {
      checked: true, category: 'workflow-automation', subArea: 'support',
      maturity: 'startup', confidence: 0.9, reason: 'Automates internal triage.', userSet: false,
    },
    domains: [
      {
        domainId: 'ai-use-cases', domainName: 'AI Use Cases',
        // The domain completes even when a capability inside it failed — that
        // is the case this whole fixture set exists for.
        status: running ? 'generating' : 'completed',
        capabilities: useCaseCapabilities(state),
      },
      ...OTHER_DOMAINS.map(([domainId, domainName]) => ({
        domainId, domainName, status: 'pending',
        capabilities: [
          { capabilityId: domainId + '-a', capabilityName: 'First capability', status: 'pending', sections: [] },
          { capabilityId: domainId + '-b', capabilityName: 'Second capability', status: 'pending', sections: [] },
        ],
      })),
    ],
  };
}

function stub(state) {
  return `<script>
localStorage.clear();
sessionStorage.clear();
localStorage.setItem('soorgaai_guest_id', ${JSON.stringify(GUEST_ID)});
window.handleSessionExpired = function(){};
window.__errs = [];
window.addEventListener('error', function(e){ window.__errs.push('JSERR: ' + e.message); });
window.addEventListener('unhandledrejection', function(e){
  window.__errs.push('REJECT: ' + ((e.reason && e.reason.message) || e.reason));
});
const BP = ${JSON.stringify(blueprint(state))};
window.fetch = function (url) {
  const u = String(url);
  if (u.includes('/guest/blueprint/')) {
    return Promise.resolve(new Response(JSON.stringify(BP), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    }));
  }
  // Anything else is a request a guest screen should not be making. Failing
  // loudly beats a silent 200 that hides a call needing a token.
  window.__errs.push('UNEXPECTED FETCH: ' + u);
  return Promise.resolve(new Response('{}', { status: 404 }));
};
</script>`;
}

function serve(state) {
  return http.createServer((req, res) => {
    const p = decodeURIComponent(req.url.split('?')[0]);
    if (p === '/__probe.js') {
      res.writeHead(200, { 'Content-Type': 'text/javascript' });
      res.end(fs.readFileSync(path.join(ROOT, 'scripts', 'guest-probe.js')));
      return;
    }
    fs.readFile(path.join(FRONTEND, p), (err, data) => {
      if (err) { res.writeHead(404); res.end('not found'); return; }
      if (p.endsWith('domain.html')) {
        const html = data.toString()
          .replace('<script type="module"', stub(state) + '\n  <script type="module"')
          .replace('</body>', '<script type="module" src="/__probe.js"></script></body>');
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
  return new Promise(resolve => {
    const p = spawn(CHROME, args, { windowsHide: true });
    let out = '';
    p.stdout.on('data', d => { out += d; });
    p.on('close', () => resolve(out));
  });
}

async function run(state) {
  const server = serve(state);
  await new Promise(r => server.listen(PORT, r));
  try {
    const url = `http://localhost:${PORT}/domain/domain.html?view=cob`;
    const common = ['--headless', '--disable-gpu', '--window-size=1440,1000', '--virtual-time-budget=9000'];
    await chrome([...common, `--screenshot=${path.join(SHOTS, 'guest-' + state + '.png')}`, url]);
    const dom = await chrome([...common, '--dump-dom', url]);
    const m = dom.match(/<title>CHECK ([\s\S]*?)<\/title>/);
    if (!m) return null;
    return JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'));
  } finally {
    await new Promise(r => server.close(r));
  }
}

if (!CHROME) { console.error('No Chrome found.'); process.exit(2); }
fs.mkdirSync(SHOTS, { recursive: true });

let failed = 0;
const check = (label, ok, detail = '') => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ' — ' + detail : ''}`);
  if (!ok) failed++;
};

console.log('1. the free domain is still generating');
{
  const r = await run('generating');
  if (!r) { check('the page rendered', false, 'probe never ran'); }
  else {
    check('the ordinary progress bar is showing', r.ordinaryBar === true);
    check('the pause panel is not', r.paused === false);
    check('the guest banner explains the preview', r.guestBanner === true);
    check('the bar names the work in flight', /Opportunity Discovery/.test(r.barLabel), r.barLabel);
    check('Approve is not offered yet', r.approveOn === false);
    check('the stylesheet loaded', r.cssRules > 1500, String(r.cssRules));
    check('no script errors', r.errors.length === 0, r.errors.join(' | '));
  }
}

console.log('\n2. the free domain is done — paused, waiting for a login');
{
  const r = await run('paused');
  if (!r) { check('the page rendered', false, 'probe never ran'); }
  else {
    check('the pause panel is showing', r.paused === true);
    check('the ordinary bar is hidden', r.ordinaryBar === false);
    check('the guest banner steps aside for it', r.guestBanner === false);
    check('there is a login button', r.loginBtn === true);
    // Without devtools: the guest id is the only thing tying a visitor to a
    // preview, and until this existed there was no way to drop it in the UI.
    check('and a way to start over', r.restartBtn === true, r.restartText);
    check('it counts domains, not capabilities', r.count === '1 of 6 domains', r.count);
    check('it names the domain that comes next', /AI Strategy is next/.test(r.next), r.next);
    check('it promises nothing is lost', /nothing you have seen is lost/i.test(r.next));
    // Unlock, not resume. Claiming does not generate the remaining domains,
    // and copy that says it does sends someone looking for a run that never
    // starts.
    check('it says unlock, not carry on', /unlock the remaining 5 domains/.test(r.next), r.next);
    check('it does not promise generation resumes', !/carries on from here/i.test(r.next));
    check('the preview data is on screen', /Retrieval-Augmented Ticket Routing/.test(r.winner), r.winner);
    // The recommendation is the reason to sign up, so it has to be read
    // before the request to sign up — an ask that arrives first is a wall.
    check('the ask comes after the value', r.pauseBelowValue === true);
    check('the navbar offers a log in', r.logoutText === 'Log in', r.logoutText);
    check('it says this is a guest preview', r.navUsername === 'Guest preview', r.navUsername);
    check('no script errors', r.errors.length === 0, r.errors.join(' | '));
  }
}

console.log('\n3. prioritisation failed, discovery did not — fall back, do not blank');
{
  const r = await run('degraded');
  if (!r) { check('the page rendered', false, 'probe never ran'); }
  else {
    check('opportunities are still shown', r.contentShown === true);
    check('the loading line is gone', r.loadingShown === false);
    check('it shows the discovered one', r.winner === 'Automated Severity Scoring', r.winner);
    check('with its reasoning', /already captured/.test(r.winnerWhy), r.winnerWhy);
    check('the rest are listed', r.others.join(' | ') === 'Retrieval-Augmented Ticket Routing', r.others.join(' | '));
    // Nothing ranked this list, so the screen must not claim a recommendation.
    check('it does not claim a recommendation', r.winnerLabel === '★ Top opportunity', r.winnerLabel);
    check('the pause still appears', r.paused === true);
    check('no script errors', r.errors.length === 0, r.errors.join(' | '));
  }
}

console.log('\n4. everything failed — say so instead of spinning');
{
  const r = await run('barren');
  if (!r) { check('the page rendered', false, 'probe never ran'); }
  else {
    check('the loading line is gone', r.loadingShown === false);
    check('no opportunities are claimed', r.contentShown === false);
    check('it says the run failed', /finished without producing a usable list/.test(r.errorText), r.errorText);
    check('it does not blame the objective', /generation failure rather than a verdict/.test(r.errorText));
    check('no script errors', r.errors.length === 0, r.errors.join(' | '));
  }
}

console.log(failed ? `\nFAILED — ${failed} check(s)` : '\nPASS — the preview stops where it says it stops');
process.exit(failed ? 1 : 0);
