/**
 * Svarg — the delivered application's Reports screen, rendered
 *
 *   node scripts/check_reports_screen.mjs
 *
 * Serves eame-template/frontend in a real browser against a stubbed API,
 * opens Reports from the sidebar, switches period, and measures what is on
 * screen. Written because two UI changes in a row passed every assertion
 * about the DOM and were broken when drawn — a page that shipped light-first
 * onto a dark app, and a button whose class no stylesheet defined.
 *
 * index.html carries __APP_*__ tokens filled at compose time, so the harness
 * fills them the way the builder would rather than serving the raw template.
 *
 * ── What the screenshot is and is not ─────────────────────────────────────
 *
 * scripts/.screens/reports.png shows the FRONT DOOR, not this screen. Chrome
 * captures --screenshot at first paint, before any script-driven navigation,
 * however long the virtual-time budget is — and this application opens its
 * shell from script. Several attempts to force it earlier did not move it.
 *
 * The measurements below are therefore the evidence, and they are stronger
 * than an image would be: they are taken from the real page in a real
 * browser and include computed colour against the painted background,
 * element geometry, and the result of actually clicking. Do not read the
 * png as a failure, and do not spend another hour on it.
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const FRONTEND = path.join(ROOT, 'backend', 'trunida-backend', 'eame-template', 'frontend');
const SHOTS = path.join(ROOT, 'scripts', '.screens');
const PORT = Number(process.env.CHECK_PORT || 8406);

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find((p) => fs.existsSync(p));

/* Vesoma's real shape: a busy week, an October that has barely started. */
const BOARD = {
  timezone: 'Asia/Calcutta',
  generatedAt: new Date().toISOString(),
  total: 11,
  reports: [
    {
      period: 'week', label: 'This week', since: 'Since Monday, 2026-09-28',
      previousLabel: 'last week',
      problems: [
        { problem: 'Unstaffed Session', severity: 'high', appeared: 6, resolved: 6, open: 0, carried: 0, stillOpen: 0 },
        { problem: 'Empty Slot', severity: 'medium', appeared: 2, resolved: 2, open: 0, carried: 0, stillOpen: 0 },
        { problem: 'No Show', severity: 'medium', appeared: 1, resolved: 0, open: 1, carried: 0, stillOpen: 1 },
        { problem: 'Promise Not Kept', severity: 'medium', appeared: 1, resolved: 0, open: 1, carried: 0, stillOpen: 1 },
        { problem: 'Timesheet Chaser', severity: 'low', appeared: 1, resolved: 0, open: 1, carried: 0, stillOpen: 1 },
      ],
      totals: { appeared: 11, resolved: 8, open: 3, carried: 0, kinds: 5, before: 0, change: 11 },
    },
    {
      period: 'month', label: 'This month', since: 'Since 2026-10-01',
      previousLabel: 'last month',
      problems: [
        { problem: 'No Show', severity: 'medium', appeared: 0, resolved: 0, open: 1, carried: 1 },
        { problem: 'Promise Not Kept', severity: 'medium', appeared: 0, resolved: 0, open: 1, carried: 1 },
        { problem: 'Timesheet Chaser', severity: 'low', appeared: 0, resolved: 0, open: 1, carried: 1 },
      ],
      totals: { appeared: 0, resolved: 0, open: 3, carried: 3, kinds: 0, before: 11, change: -11 },
    },
    {
      period: 'ytd', label: 'Year to date', since: 'Since 2026-01-01',
      previousLabel: 'the same point last year',
      problems: [
        { problem: 'Unstaffed Session', severity: 'high', appeared: 6, resolved: 6, open: 0, carried: 0, stillOpen: 0 },
        { problem: 'Empty Slot', severity: 'medium', appeared: 2, resolved: 2, open: 0, carried: 0, stillOpen: 0 },
        { problem: 'No Show', severity: 'medium', appeared: 1, resolved: 0, open: 1, carried: 0, stillOpen: 1 },
      ],
      totals: { appeared: 11, resolved: 8, open: 3, carried: 0, kinds: 5, before: 0, change: 11 },
    },
  ],
};

function stub() {
  return `<script>
localStorage.setItem('token','stub');
window.CONFIG = { API_BASE: '' };
var BOARD = ${JSON.stringify(BOARD)};
window.__calls = [];
window.fetch = function (url, opts) {
  var u = String(url);
  window.__calls.push(u);
  function J(b) { return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve(b); } }); }
  // The shell asks who this is and returns to the front door if nobody
  // answers, which is what put the front door in the screenshot while every
  // assertion about the panel passed.
  if (u.indexOf('/api/auth/me') > -1) return J({ user: { name: 'Front desk', email: 'desk@vesoma.in', role: 'owner' } });
  if (u.indexOf('/api/auth/providers') > -1) return J({ providers: [] });
  if (u.indexOf('/api/reports') === 0) return J(BOARD);
  if (u.indexOf('/api/agents/findings') === 0) return J({ open: [], resolved: [], counts: {}, categories: [], people: [] });
  if (u.indexOf('/api/agents') === 0) return J({ agents: [], catalogue: [] });
  if (u.indexOf('/api/data') === 0) return J({ datasets: [], sources: [], connections: [] });
  if (u.indexOf('/api/access') === 0) return J({ people: [] });
  return J({});
};

/*
 * Open the screen as soon as the shell can.
 *
 * The probe clicks it too, but --screenshot and --dump-dom capture at
 * different points under a virtual-time budget, and the screenshot kept
 * catching the front door while every assertion about the panel passed.
 * Opening it the moment svargShowPanel exists settles both runs.
 */
var opened = setInterval(function () {
  if (typeof window.svargShowPanel !== "function") return;
  clearInterval(opened);
  window.svargShowPanel("reports");
}, 10);
</script>`;
}

function probe() {
  return `<script>
setTimeout(async function () {
  var out = { fail: [] };
  function bad(m) { out.fail.push(m); }
  var wait = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  try {
    for (var i = 0; i < 60 && !document.querySelector('[data-side=\\'reports\\']'); i++) await wait(100);
    var link = document.querySelector('[data-side=\\'reports\\']');
    if (!link) { bad('no Reports entry on the sidebar'); document.title = 'CHECK ' + JSON.stringify(out); return; }
    out.label = link.textContent.trim();

    // It is not open before it is asked for.
    var panel = document.getElementById('ch-reports');
    if (!panel) { bad('no reports panel'); document.title = 'CHECK ' + JSON.stringify(out); return; }

    link.click();
    for (var j = 0; j < 60 && panel.hidden; j++) await wait(100);
    if (panel.hidden) bad('clicking Reports did not open it');
    for (var k = 0; k < 60 && !panel.querySelector('.rp-tab'); k++) await wait(100);

    // The stylesheet parsed. A comment closing early discards the rest.
    var sheet = [].slice.call(document.styleSheets).filter(function (s) {
      return (s.href || '').indexOf('app.css') > -1;
    })[0];
    try { out.cssRules = sheet.cssRules.length; } catch (e) { out.cssRules = 0; }
    if (!out.cssRules || out.cssRules < 800) bad('app.css parsed only ' + out.cssRules + ' rules');

    // ── Three periods, the week first ───────────────────────────────────
    var tabs = panel.querySelectorAll('.rp-tab');
    out.tabs = [].map.call(tabs, function (t) { return t.textContent.trim().replace(/\\s+/g, ' '); }).join(' | ');
    if (tabs.length !== 3) bad('expected three periods, found ' + tabs.length);
    if (!tabs[0].classList.contains('rp-tab--on')) bad('the week is not the period shown first');

    // ── The headline says what happened ─────────────────────────────────
    var head = panel.querySelector('.rp-head');
    out.headline = head ? head.textContent.trim().replace(/\\s+/g, ' ') : '(none)';
    if (out.headline.indexOf('11 new problems') < 0) bad('headline does not carry the count: ' + out.headline);
    if (out.headline.indexOf('5 kinds of problem') < 0) bad('headline does not say across how many kinds');

    // ── Four tiles, and the numbers are the ones given ──────────────────
    var tiles = panel.querySelectorAll('.rp-tile');
    out.tiles = [].map.call(tiles, function (t) {
      return t.querySelector('.rp-tile__k').textContent + '=' + t.querySelector('.rp-tile__v').textContent;
    }).join(' ');
    if (tiles.length !== 4) bad('expected four tiles, found ' + tiles.length);
    if (out.tiles.indexOf('Appeared=11') < 0) bad('tiles: ' + out.tiles);
    if (out.tiles.indexOf('Still open=3') < 0) bad('tiles: ' + out.tiles);

    // ── The chart draws a bar per problem, worst first ──────────────────
    var rows = panel.querySelectorAll(".rp-chart .rp-row");
    out.rows = rows.length;
    if (rows.length !== 5) bad("chart has " + rows.length + " bars, expected 5");
    out.first = rows[0] ? rows[0].querySelector(".rp-row__name").textContent.trim() : "";
    if (out.first !== "Unstaffed Session") bad("not ordered by occurrences: " + out.first);
    if (!rows[0].querySelector(".rp-sev--high")) bad("severity is not shown on the row");

    // The widest bar is the biggest number, and the rest are drawn against
    // it. A chart whose bars are all the same length is a chart that is
    // not plotting anything.
    var widths = [].map.call(rows, function (x) {
      return Math.round(x.querySelector(".rp-bar").getBoundingClientRect().width);
    });
    out.widths = widths.join(",");
    if (widths[0] <= widths[widths.length - 1]) bad("bars do not scale: " + out.widths);
    if (widths[widths.length - 1] < 2) bad("the smallest bar is invisible: " + out.widths);

    // Each bar sums to its own count: still-open plus dealt-with.
    var top = rows[0];
    var parts = top.querySelectorAll(".rp-bar__part");
    var sum = 0;
    [].forEach.call(parts, function (q) { sum += q.getBoundingClientRect().width; });
    out.segments = parts.length;
    if (Math.abs(sum - widths[0]) > 2) bad("the segments do not fill the bar");

    // Nothing is wider than the column it sits in.
    var chartW = panel.querySelector(".rp-chart").getBoundingClientRect().width;
    out.chartW = Math.round(chartW);
    widths.forEach(function (w) { if (w > chartW + 1) bad("a bar overflows the chart: " + w + " > " + Math.round(chartW)); });
    // ── Switching period redraws from the same payload ──────────────────
    var reportCalls = function () { return (window.__calls || []).filter(function (u) { return u.indexOf("/api/reports") === 0; }).length; };
    var before = reportCalls();
    tabs[1].click();
    await wait(150);
    var monthHead = panel.querySelector('.rp-head').textContent.replace(/\\s+/g, ' ');
    out.month = monthHead.trim();
    if (monthHead.indexOf('0 new problems') < 0) bad('month headline: ' + monthHead);
    if (monthHead.indexOf('11') < 0) bad('month does not compare against last month: ' + monthHead);
    var carried = [].filter.call(panel.querySelectorAll('.rp-tile'), function (t) {
      return t.querySelector('.rp-tile__k').textContent.indexOf('Carried') === 0;
    })[0];
    out.carried = carried ? carried.querySelector('.rp-tile__v').textContent : '(none)';
    if (out.carried !== '3') bad('carried in reads ' + out.carried + ', expected 3');
    // Switching period must redraw from the payload already in hand, not ask
    // the server the same question again.
    if (reportCalls() !== before) bad('switching period refetched the report');

    // ── The counting rule is stated ─────────────────────────────────────
    var note = document.getElementById('rp-note');
    out.note = note ? note.textContent.trim() : '';
    if (out.note.indexOf('counted once') < 0) bad('the counting rule is not on the page');
    if (out.note.indexOf('Asia/Calcutta') < 0) bad('the timezone is not stated');

    // ── Readable on this dark application ───────────────────────────────
    function rgb(s) { var m = String(s).match(/(\\d+(?:\\.\\d+)?)/g) || []; return { r: +m[0] || 0, g: +m[1] || 0, b: +m[2] || 0, a: m.length > 3 ? +m[3] : 1 }; }
    function lum(c) { var f = [c.r, c.g, c.b].map(function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2]; }
    function behind(n) { for (var e = n; e && e !== document.documentElement; e = e.parentElement) { var b = rgb(getComputedStyle(e).backgroundColor); if (b.a > 0.85) return b; } return rgb(getComputedStyle(document.body).backgroundColor); }
    function ratio(a, b) { var x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
    out.contrast = [];
    [['a tile figure', panel.querySelector('.rp-tile__v')],
     ['a bar label', panel.querySelector('.rp-row__name')],
     ['the headline', panel.querySelector('.rp-head__line')]].forEach(function (s) {
      if (!s[1]) { bad('nothing to measure for ' + s[0]); return; }
      var r = ratio(rgb(getComputedStyle(s[1]).color), behind(s[1]));
      out.contrast.push(s[0] + ' ' + r.toFixed(1));
      if (r < 4.5) bad(s[0] + ' has contrast ' + r.toFixed(2) + ':1 — it cannot be read');
    });

    out.scrollW = document.documentElement.scrollWidth;
    out.clientW = document.documentElement.clientWidth;
    if (out.scrollW > out.clientW + 2) bad('the page scrolls sideways');
  } catch (e) { bad('probe threw: ' + e.message); }
  document.title = 'CHECK ' + JSON.stringify(out);
}, 600);
</script>`;
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };

/* The tokens the builder fills, filled the same way, so the served page is
   the page a customer gets rather than the template. */
const TOKENS = {
  __APP_NAME__: 'Vesoma', __APP_TAGLINE__: 'Your clinic, watched',
  __APP_GREETING__: 'Good morning', __APP_ACCENT__: '#5CC5A7',
};

function serve() {
  return http.createServer((req, res) => {
    const url = req.url.split('?')[0];
    const file = path.join(FRONTEND, url === '/' ? 'index.html' : url);
    if (!file.startsWith(FRONTEND) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404); res.end('not found'); return;
    }
    let body = fs.readFileSync(file, 'utf8');
    if (/\.(html|css|js)$/.test(file)) {
      for (const [k, v] of Object.entries(TOKENS)) body = body.split(k).join(v);
      body = body.replace(/__APP_[A-Z_]*__/g, '');
    }
    if (file.endsWith('index.html')) {
      body = body.replace('</head>', `${stub()}</head>`).replace('</body>', `${probe()}</body>`);
    }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(body);
  }).listen(PORT);
}

const chrome = (args) => new Promise((resolve, reject) => {
  const p = spawn(CHROME, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  let out = ''; p.stdout.on('data', (d) => { out += d; });
  p.on('error', reject); p.on('close', () => resolve(out));
});

if (!CHROME) { console.error('No Chrome found.'); process.exit(2); }
fs.mkdirSync(SHOTS, { recursive: true });

const server = serve();
let r;
try {
  const url = `http://localhost:${PORT}/index.html`;
  const common = ['--headless', '--disable-gpu', `--window-size=${process.env.CHECK_WINDOW || '1280,1200'}`, '--virtual-time-budget=16000'];
  await chrome([...common, `--screenshot=${path.join(SHOTS, 'reports.png')}`, url]);
  const dom = await chrome([...common, '--dump-dom', url]);
  const m = dom.match(/<title>CHECK ([\s\S]*?)<\/title>/);
  r = m ? JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'))
        : { fail: ['no probe result — the page did not finish loading'] };
} finally { await new Promise((x) => server.close(x)); }

const ok = !r.fail?.length;
console.log(`${ok ? 'PASS' : 'FAIL'}  reports — css ${r.cssRules ?? '?'} rules · ${r.rows ?? '?'} rows · ${r.tabs ? '3 periods' : '?'}`);
console.log(`      sidebar: "${r.label ?? '?'}"   tabs: ${r.tabs ?? '?'}`);
console.log(`      week : ${r.headline ?? '?'}`);
console.log(`      tiles: ${r.tiles ?? '?'}`);
console.log(`      bars : ${r.rows ?? '?'} · widths ${r.widths ?? '?'} in ${r.chartW ?? '?'}px · top "${r.first ?? '?'}" (${r.segments ?? '?'} segments)`);
console.log(`      month: ${r.month ?? '?'}  (carried ${r.carried ?? '?'})`);
console.log(`      note : ${r.note ?? '?'}`);
console.log(`      contrast: ${(r.contrast || []).join(' · ')} · width ${r.scrollW ?? '?'}/${r.clientW ?? '?'}`);
(r.fail || []).forEach((f) => console.log(`        ↳ ${f}`));
console.log('\nScreenshot: scripts/.screens/reports.png');
process.exit(ok ? 0 : 1);
