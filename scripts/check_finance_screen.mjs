/**
 * Svarg — finance board screen check
 *
 * Renders /admin/finance.html in a real browser against a stubbed API and
 * measures what is actually on the page. Written for the same reason
 * check_screens.mjs was: "HTTP 200 and the braces balance" has twice passed a
 * screen that rendered completely broken, once when a stray `*​/` in a CSS
 * comment silently discarded 8,590 lines of stylesheet.
 *
 *   node scripts/check_finance_screen.mjs
 *
 * The screenshot lands in scripts/.screens/finance.png. Exit code is non-zero
 * if anything failed.
 *
 * ── What it is really guarding ─────────────────────────────────────────────
 *
 * This board's whole reason for existing is that a reader can tell a measured
 * figure from one somebody typed. So the check does not stop at "the table has
 * rows": it asserts that the entered column is drawn in the assumption colour,
 * that the caveats are above the totals rather than below them, and that a
 * free account's margin reads "n/a" rather than a large negative number. Those
 * are the properties that make the page safe to set a price from, and every one
 * of them is the kind of thing a refactor silently loses.
 *
 * The fixture is shaped like the real response, with the real September
 * figures, so the arithmetic on screen is arithmetic the server really does.
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const FRONTEND = path.join(ROOT, 'frontend');
const SHOTS = path.join(ROOT, 'scripts', '.screens');
const PORT = Number(process.env.CHECK_PORT || 8402);

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find((p) => fs.existsSync(p));

/*
 * The board, shaped exactly as financeService.buildBom returns it.
 *
 * Two accounts, deliberately unalike: one on Pro so a margin can be drawn, one
 * on the implicit Hobby default so the "n/a" path is exercised. A fixture where
 * everyone paid would leave the more common case untested.
 */
const BOARD = {
  period: '2026-09',
  inrPerUsd: 88,
  accounts: [
    {
      userId: 'u1', name: 'Vesoma Clinic', email: 'clinic@example.com',
      plan: 'pro', planLabel: 'Pro', planImplicit: false, planStatus: 'active',
      priceInrMonthly: 2999,
      metered: {
        svargUsd: 0.451, gatewayUsd: 0.269, totalUsd: 0.72, totalInr: 63.36,
        calls: 61, gatewayRequests: 237, inputTokens: 40000, outputTokens: 9000,
        byStage: { cob: { calls: 30, costUsd: 0.201 }, eame: { calls: 25, costUsd: 0.247 }, aria: { calls: 6, costUsd: 0.003 } },
      },
      assumed: { tenantHostingInr: 400, fixedShareInr: 123000, totalInr: 123400 },
      deployments: 1,
      costInr: 123463.36,
      marginInr: 2999 - 123463.36,
      marginPct: ((2999 - 123463.36) / 2999) * 100,
    },
    {
      userId: 'u2', name: 'Six Cricket', email: 'academy@example.com',
      plan: 'hobby', planLabel: 'Hobby', planImplicit: true, planStatus: 'active',
      priceInrMonthly: 0,
      metered: {
        svargUsd: 0.084, gatewayUsd: 0.128, totalUsd: 0.212, totalInr: 18.66,
        calls: 12, gatewayRequests: 108, inputTokens: 9000, outputTokens: 2000,
        byStage: { eame: { calls: 10, costUsd: 0.071 }, aria: { calls: 2, costUsd: 0.003 } },
      },
      assumed: { tenantHostingInr: 400, fixedShareInr: 0, totalInr: 400 },
      deployments: 1,
      costInr: 418.66,
      marginInr: null,
      marginPct: null,
    },
  ],
  guest: { calls: 67, costUsd: 0.2443, costInr: 21.5, byStage: { cob: { calls: 67, costUsd: 0.2443 } } },
  fixed: {
    lines: [
      { kind: 'amortised', label: 'Platform development', monthlyInr: 100000, totalInr: 3600000, overMonths: 36, note: 'Build to date' },
      { kind: 'amortised', label: 'Zoho CRM', monthlyInr: 10000, totalInr: 120000, overMonths: 12, note: '' },
      { kind: 'amortised', label: 'Exotel', monthlyInr: 5000, totalInr: 60000, overMonths: 12, note: '' },
      { kind: 'recurring', label: 'Atlas cluster', monthlyInr: 5000, note: 'Shared by every tenant.' },
      { kind: 'recurring', label: 'Control plane hosting', monthlyInr: 1000, note: '' },
      { kind: 'recurring', label: 'Brevo', monthlyInr: 2000, note: '' },
    ],
    totalInr: 123000,
    basis: 'paying accounts',
    basisCount: 1,
    perAccountInr: 123000,
  },
  totals: {
    accounts: 2, activeAccounts: 2, payingAccounts: 1,
    meteredUsd: 1.1763, meteredInr: 103.51,
    assumedInr: 123800, fixedInr: 123000,
    revenueInr: 2999,
    costInr: 123903.51,
    marginInr: 2999 - 123903.51,
  },
  caveats: [
    'Delivered applications are running but no per-tenant hosting cost is set, so their containers are counted as free.',
  ],
  plans: [
    { key: 'hobby', label: 'Hobby', priceInrMonthly: 0, priceInrYearly: 0, businessCategories: 2, dataConnections: 2, monitoringFrequency: 'daily', seats: 1, deploymentCostUsd: 2, accounts: 1 },
    { key: 'pro', label: 'Pro', priceInrMonthly: 2999, priceInrYearly: 28999, businessCategories: 3, dataConnections: 5, monitoringFrequency: 'daily', seats: 3, deploymentCostUsd: 5, accounts: 1 },
    { key: 'ultra', label: 'Ultra', priceInrMonthly: 16999, priceInrYearly: 163999, businessCategories: null, dataConnections: 10, monitoringFrequency: 'hourly', seats: 10, deploymentCostUsd: 5, accounts: 0 },
    { key: 'enterprise', label: 'Enterprise', priceInrMonthly: null, priceInrYearly: null, businessCategories: null, dataConnections: null, monitoringFrequency: 'custom', seats: null, deploymentCostUsd: 50, accounts: 0 },
  ],
  assumptions: {
    inrPerUsd: 88,
    platformDevelopment: { label: 'Platform development', totalInr: 3600000, overMonths: 36, note: 'Build to date' },
    integrations: [
      { label: 'Zoho CRM', totalInr: 120000, overMonths: 12, note: '' },
      { label: 'Exotel', totalInr: 60000, overMonths: 12, note: '' },
    ],
    monthly: { atlasInr: 5000, controlPlaneInr: 1000, brevoInr: 2000, otherInr: 0, otherNote: '' },
    perAccount: { tenantHostingInr: 400, tenantHostingNote: 'Railway container, measured' },
    perUnit: { transcriptionInrPerCall: 0.5, emailInr: 0.1 },
    updatedBy: 'check@svarg.ai',
    updatedAt: new Date().toISOString(),
  },
};

/** Auth and a strict fetch stub, injected before the page's own script runs. */
function stub() {
  return `<script>
localStorage.setItem('token','stub');
localStorage.setItem('role','admin');
localStorage.setItem('username','check@svarg.ai');
window.CONFIG = { API_BASE: '/api' };
var BOARD = ${JSON.stringify(BOARD)};
window.__requests = [];
window.fetch = function (url, opts) {
  var u = String(url);
  window.__requests.push((opts && opts.method ? opts.method : 'GET') + ' ' + u);
  function J(body) {
    return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve(body); } });
  }
  if (u.indexOf('/api/admin/finance/periods') === 0) return J({ periods: ['2026-09', '2026-08'] });
  if (u.indexOf('/api/admin/finance/assumptions') === 0) return J(BOARD);
  if (u.indexOf('/api/admin/finance') === 0) return J(BOARD);
  // Strict on purpose: a stub that matches loosely hides a malformed URL.
  return Promise.resolve({ ok: false, status: 404, json: function () { return Promise.resolve({ message: 'stub has no route for ' + u }); } });
};
</script>`;
}

/**
 * What must be true on the rendered page.
 *
 * Reads the DOM and reports through the document title, which is how
 * check_screens.mjs gets a result out of --dump-dom.
 */
function probe() {
  return `<script>
setTimeout(async function () {
  var out = { fail: [] };
  function bad(m) { out.fail.push(m); }
  var wait = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  try {
    // The board arrives over two round trips; wait for the rows rather than
    // reading at a fixed moment.
    for (var i = 0; i < 60 && !document.querySelectorAll('#fi-accounts-body .fi-acc').length; i++) await wait(100);

    // The stylesheet actually parsed. A comment closing early discards the
    // rest of the file and the page still returns 200.
    var sheet = [].slice.call(document.styleSheets).filter(function (s) {
      return (s.href || '').indexOf('finance.css') > -1;
    })[0];
    try { out.cssRules = sheet.cssRules.length; } catch (e) { out.cssRules = 0; }
    if (!out.cssRules || out.cssRules < 40) bad('finance.css parsed only ' + out.cssRules + ' rules');

    if (!document.getElementById('fi-loading') || !document.getElementById('fi-loading').hidden) {
      bad('still showing the loading line after the board arrived');
    }
    var err = document.getElementById('fi-error');
    if (err && !err.hidden) bad('error shown: ' + err.textContent);

    // ── The account table ──────────────────────────────────────────────────
    var rows = document.querySelectorAll('#fi-accounts-body .fi-acc');
    out.rows = rows.length;
    if (rows.length !== 2) bad('account table has ' + rows.length + ' rows, expected 2');

    var cols = rows[0] ? rows[0].querySelectorAll('td').length : 0;
    out.cols = cols;
    var heads = document.querySelectorAll('#fi-accounts thead th').length;
    if (cols !== heads) bad(cols + ' cells against ' + heads + ' headings');

    // ── Measured and entered are visibly different ─────────────────────────
    var enteredCell = rows[0].querySelector('.fi-assumed');
    if (!enteredCell) bad('the entered column is not marked as entered');
    else {
      var c = getComputedStyle(enteredCell).color;
      var plain = getComputedStyle(rows[0].querySelectorAll('td')[3]).color;
      out.enteredColour = c;
      out.measuredColour = plain;
      // The whole point of the page: a reader can see which half is judgement.
      if (c === plain) bad('entered figures are drawn the same colour as measured ones');
    }

    /*
     * ── And the text can actually be read ─────────────────────────────────
     *
     * This page first shipped with a light-first palette on a site that is
     * dark whatever the operating system thinks, so plain cells rendered
     * near-white on near-white: the account names, the plan column and every
     * dollar figure were invisible, and the plan table looked empty. Every
     * element was present and correct, so nothing above caught it.
     *
     * Contrast is therefore measured rather than assumed. The threshold is
     * WCAG AA for body text; a table of numbers nobody can read is not a
     * lesser version of this page, it is a blank one.
     */
    function rgb(s) {
      var m = String(s).match(/(\\d+(?:\\.\\d+)?)/g) || [];
      return { r: +m[0] || 0, g: +m[1] || 0, b: +m[2] || 0, a: m.length > 3 ? +m[3] : 1 };
    }
    function lum(c) {
      var f = [c.r, c.g, c.b].map(function (v) {
        v /= 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2];
    }
    /** The first painted background behind an element. */
    function behind(node) {
      for (var n = node; n && n !== document.documentElement; n = n.parentElement) {
        var bg = rgb(getComputedStyle(n).backgroundColor);
        if (bg.a > 0.85) return bg;
      }
      return rgb(getComputedStyle(document.body).backgroundColor);
    }
    function ratio(fg, bg) {
      var a = lum(fg), b = lum(bg);
      return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    }

    var samples = [
      ['an account name', rows[0].querySelector('.fi-acc__name')],
      ['the plan column', rows[0].querySelectorAll('td')[1]],
      ['a measured figure', rows[0].querySelectorAll('td')[3]],
      ['an entered figure', rows[0].querySelector('.fi-assumed')],
      ['a plan table cell', document.querySelector('#fi-plans-body td')],
      ['a summary figure', document.getElementById('fi-sum-cost')],
      ['a table heading', document.querySelector('#fi-accounts thead th')],
    ];
    out.contrast = [];
    samples.forEach(function (s) {
      if (!s[1]) { bad('nothing to measure for ' + s[0]); return; }
      var r = ratio(rgb(getComputedStyle(s[1]).color), behind(s[1]));
      out.contrast.push(s[0] + ' ' + r.toFixed(1));
      if (r < 4.5) bad(s[0] + ' has contrast ' + r.toFixed(2) + ':1 — it cannot be read');
    });

    // ── A free account is not a loss ───────────────────────────────────────
    var hobby = [].filter.call(rows, function (r) { return /Hobby/.test(r.textContent); })[0];
    if (!hobby) bad('no Hobby row');
    else {
      var lastCell = hobby.querySelectorAll('td')[8];
      out.hobbyMargin = lastCell ? lastCell.textContent.trim() : '(none)';
      if (!/n\\/a/.test(out.hobbyMargin)) bad('Hobby margin reads "' + out.hobbyMargin + '", expected n/a');
      if (!hobby.querySelector('.fi-default')) bad('an implicit plan is not marked as a default');
    }

    // The paid account does show a margin, and a negative one reads negative.
    var pro = [].filter.call(rows, function (r) { return /Pro/.test(r.textContent); })[0];
    var proMargin = pro ? pro.querySelectorAll('td')[8].textContent.trim() : '';
    out.proMargin = proMargin;
    if (proMargin.charAt(0) !== String.fromCharCode(45)) bad('Pro margin reads "' + proMargin + '", expected a negative rupee figure');
    if (pro && !pro.querySelector('.fi-neg')) bad('a negative margin is not marked negative');

    // ── The breakdown opens, and is the bill of materials ─────────────────
    if (document.querySelectorAll('#fi-accounts-body .fi-sub').length) bad('a breakdown is open before anything was clicked');
    rows[0].click();
    await wait(80);
    var stages = document.querySelectorAll('#fi-accounts-body .fi-stage');
    out.stages = stages.length;
    if (stages.length !== 3) bad('breakdown shows ' + stages.length + ' stages, expected 3');
    out.stageNames = [].map.call(stages, function (s) { return s.querySelector('.fi-stage__n').textContent; }).join(',');
    // Sorted by spend, so the expensive layer is first.
    if (out.stageNames.indexOf('eame') !== 0) bad('stages not ordered by spend: ' + out.stageNames);

    // ── Caveats come before the numbers ───────────────────────────────────
    var cav = document.getElementById('fi-caveats');
    if (!cav || cav.hidden) bad('caveats not shown although the board carries one');
    out.caveats = cav ? cav.querySelectorAll('li').length : 0;
    var sum = document.getElementById('fi-summary');
    if (cav && sum && cav.getBoundingClientRect().top >= sum.getBoundingClientRect().top) {
      bad('the caveats sit below the totals');
    }

    // ── The totals ────────────────────────────────────────────────────────
    out.metered = (document.getElementById('fi-sum-metered').textContent || '').trim();
    out.cost = (document.getElementById('fi-sum-cost').textContent || '').trim();
    out.revenue = (document.getElementById('fi-sum-revenue').textContent || '').trim();
    if (!/\\u20b9/.test(out.metered)) bad('measured total is not in rupees: ' + out.metered);
    if (out.metered === '\\u20b90') bad('measured total rounded a real cost to zero');

    // ── The plan baseline ─────────────────────────────────────────────────
    var planRows = document.querySelectorAll('#fi-plans-body tr');
    out.plans = planRows.length;
    if (planRows.length !== 4) bad('plan table has ' + planRows.length + ' rows, expected 4');
    var planText = document.getElementById('fi-plans-body').textContent;
    if (planText.indexOf('2,999') < 0) bad('Pro price is not on the plan table');
    if (planText.indexOf('Unlimited') < 0) bad('an unlimited allowance is not said as Unlimited');
    if (planText.indexOf('negotiated') < 0) bad('Enterprise is not marked negotiated');

    // ── The assumptions form came back filled ─────────────────────────────
    out.rate = document.getElementById('fa-rate').value;
    if (out.rate !== '88') bad('exchange rate field holds "' + out.rate + '"');
    out.ints = document.querySelectorAll('#fa-integrations .fi-int').length;
    if (out.ints !== 2) bad(out.ints + ' integration rows, expected 2');
    if (document.getElementById('fa-dev-total').value !== '3600000') bad('platform development total not filled');

    // Adding and removing a line works, and the last one is never removed.
    document.getElementById('fa-add-integration').click();
    await wait(40);
    if (document.querySelectorAll('#fa-integrations .fi-int').length !== 3) bad('Add did not add a row');
    var xs = document.querySelectorAll('#fa-integrations .fi-int__x');
    xs[xs.length - 1].click(); xs[xs.length - 2].click();
    await wait(40);
    var left = document.querySelectorAll('#fa-integrations .fi-int').length;
    if (left !== 1) bad('after removing two of three, ' + left + ' rows remain');
    document.querySelectorAll('#fa-integrations .fi-int__x')[0].click();
    await wait(40);
    if (!document.querySelectorAll('#fa-integrations .fi-int').length) bad('removing the last row left the fieldset empty');

    /*
     * Every button is actually styled.
     *
     * The save button shipped with a class no loaded stylesheet defines, so it
     * rendered as a bare browser control. A default button has no border-radius
     * and a system background, which is what this looks for.
     */
    out.buttons = [];
    ["fi-refresh", "fa-add-integration", "fa-save"].forEach(function (id) {
      var b = document.getElementById(id);
      if (!b) { bad("no button " + id); return; }
      var cs = getComputedStyle(b);
      out.buttons.push(id + " r" + parseInt(cs.borderRadius, 10));
      if (parseInt(cs.borderRadius, 10) < 4) bad(id + " is unstyled (no border radius) — its class is probably not defined");
      if (cs.backgroundColor === "rgba(0, 0, 0, 0)" && cs.borderStyle === "none") bad(id + " has neither a fill nor a border");
    });
    // ── Fixed cost names its divisor ──────────────────────────────────────
    var fx = document.getElementById('fi-fixed-block');
    if (!fx || fx.hidden) bad('fixed cost block not shown');
    out.fixedRows = document.querySelectorAll('#fi-fixed-body tr').length;
    if (out.fixedRows !== 6) bad('fixed table has ' + out.fixedRows + ' rows, expected 6');
    out.fixedSub = (document.getElementById('fi-fixed-sub').textContent || '').trim();
    if (out.fixedSub.indexOf('paying accounts') < 0) bad('the divisor is not named: ' + out.fixedSub);

    // ── Guest note ────────────────────────────────────────────────────────
    out.guest = (document.getElementById('fi-guest').textContent || '').trim().slice(0, 60);
    if (!/Guest previews/.test(out.guest)) bad('the guest cost is not reported');

    // ── Nothing went to a URL the stub did not know ───────────────────────
    out.requests = (window.__requests || []).join(' | ');
    if (out.requests.indexOf('undefined') > -1 || /\\/api\\/\\/|\\/apiadmin/.test(out.requests)) {
      bad('a malformed request: ' + out.requests);
    }

    // ── No sideways scroll at phone width ─────────────────────────────────
    out.scrollW = document.documentElement.scrollWidth;
    out.clientW = document.documentElement.clientWidth;
    if (out.scrollW > out.clientW + 2) bad('the page scrolls sideways (' + out.scrollW + ' > ' + out.clientW + ')');
  } catch (e) {
    bad('probe threw: ' + e.message);
  }
  document.title = 'CHECK ' + JSON.stringify(out);
}, 400);
</script>`;
}

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.woff2': 'font/woff2',
};

function serve() {
  return http.createServer((req, res) => {
    const url = req.url.split('?')[0];
    const file = path.join(FRONTEND, url === '/' ? 'index.html' : url);
    if (!file.startsWith(FRONTEND) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404); res.end('not found'); return;
    }
    let body = fs.readFileSync(file);
    if (file.endsWith('finance.html')) {
      // The stub goes in the head so it is in place before finance.js runs;
      // the probe goes last so it reads a finished page.
      body = Buffer.from(String(body)
        .replace('</head>', `${stub()}</head>`)
        .replace('</body>', `${probe()}</body>`));
    }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(body);
  }).listen(PORT);
}

function chrome(args) {
  return new Promise((resolve, reject) => {
    const p = spawn(CHROME, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    p.stdout.on('data', (d) => { out += d; });
    p.on('error', reject);
    p.on('close', () => resolve(out));
  });
}

if (!CHROME) {
  console.error('No Chrome found. Set one of the paths in CHROME at the top of this file.');
  process.exit(2);
}

fs.mkdirSync(SHOTS, { recursive: true });
const server = serve();
let result;
try {
  const url = `http://localhost:${PORT}/admin/finance.html`;
  const win = process.env.CHECK_WINDOW || '1440,1400';
  const common = ['--headless', '--disable-gpu', `--window-size=${win}`, '--virtual-time-budget=12000'];
  await chrome([...common, `--screenshot=${path.join(SHOTS, 'finance.png')}`, url]);
  const dom = await chrome([...common, '--dump-dom', url]);
  const m = dom.match(/<title>CHECK ([\s\S]*?)<\/title>/);
  result = m
    ? JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'))
    : { fail: ['no probe result — the page did not finish loading'] };
} finally {
  await new Promise((r) => server.close(r));
}

const ok = !result.fail?.length;
console.log(`${ok ? 'PASS' : 'FAIL'}  finance — css ${result.cssRules ?? '?'} rules · ${result.rows ?? '?'} accounts × ${result.cols ?? '?'} cols · ${result.plans ?? '?'} plans · ${result.fixedRows ?? '?'} fixed lines`);
console.log(`      totals: measured ${result.metered ?? '?'} · cost ${result.cost ?? '?'} · revenue ${result.revenue ?? '?'}`);
console.log(`      margins: Pro ${result.proMargin ?? '?'} · Hobby ${result.hobbyMargin ?? '?'}`);
console.log(`      breakdown: ${result.stages ?? '?'} stages [${result.stageNames ?? '-'}] · caveats ${result.caveats ?? '?'}`);
console.log(`      colours: entered ${result.enteredColour ?? '?'} vs measured ${result.measuredColour ?? '?'}`);
console.log(`      contrast: ${(result.contrast||[]).join(" · ")}`);
console.log(`      buttons: ${(result.buttons||[]).join(" · ")}`);
console.log(`      basis: ${result.fixedSub ?? '?'}`);
console.log(`      width: ${result.scrollW ?? '?'}/${result.clientW ?? '?'} · requests ${result.requests ?? '-'}`);
(result.fail || []).forEach((f) => console.log(`        ↳ ${f}`));
console.log('\nScreenshot: scripts/.screens/finance.png');
process.exit(ok ? 0 : 1);
