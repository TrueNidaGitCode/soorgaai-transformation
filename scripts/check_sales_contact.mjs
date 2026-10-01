/**
 * Svarg — the warm-introduction contact editor, rendered
 *
 * Opens the sales board in a real browser against a stubbed API, expands a
 * warm introduction's Log panel, and measures the contact fields.
 *
 *   node scripts/check_sales_contact.mjs
 *
 * ── Why this exists ────────────────────────────────────────────────────────
 *
 * Two UI changes in a row passed every assertion about the DOM and were broken
 * on screen: a page rendered near-white on near-white because it shipped
 * light-first onto a dark site, and a button carried a class no loaded
 * stylesheet defined. Both were present and correct in the markup. A form
 * somebody is about to type a phone number into is worth looking at.
 *
 * The motion registry is the real one, imported rather than invented, so the
 * lane strip and the row render the way they will in production.
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { motionRegistry } from '../backend/trunida-backend/services/gtmMotions.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const FRONTEND = path.join(ROOT, 'frontend');
const SHOTS = path.join(ROOT, 'scripts', '.screens');
const PORT = Number(process.env.CHECK_PORT || 8403);

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find((p) => fs.existsSync(p));

/* One warm introduction, with the contact half deliberately incomplete —
   which is the state the panel exists for. */
const LEAD = {
  id: '000000000000000000000001',
  motion: 'warm-intro',
  // laneRows buckets on r.lane, which the server computes from the motion.
  // Omitting it put the lead in Broadcast and the row under test never drew.
  lane: 'introduced',
  status: 'to-contact',
  name: 'Dr Meera Iyer',
  phone: '07349250500',
  email: '',
  company: 'Meera Physiotherapy',
  role: '',
  relationship: 'Former colleague',
  industry: 'Clinics & Wellness',
  location: 'Bengaluru',
  via: 'Introduced by Rahul',
  nextStep: 'Send the one-pager',
  nextStepAt: null,
  note: '',
  inviteLink: 'https://www.svargai.com/?ref=abc123',
  sequence: { sentCount: 0, maxSends: 3, intervalDays: 4, enabled: false },
};

const SIGNALS = {
  generatedAt: new Date().toISOString(),
  outreach: [LEAD],
  discovery: [], conversion: [], onboarding: [], sales: [],
};

function stub() {
  return `<script>
localStorage.setItem('token','stub');
localStorage.setItem('role','admin');
localStorage.setItem('username','check@svarg.ai');
window.CONFIG = { API_BASE: '/api' };
var SIGNALS = ${JSON.stringify(SIGNALS)};
var MOTIONS = ${JSON.stringify(motionRegistry({ industries: ['Clinics & Wellness'] }))};
window.__patches = [];
window.fetch = function (url, opts) {
  var u = String(url);
  function J(b) { return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve(b); } }); }
  if (opts && opts.method === 'PATCH') {
    window.__patches.push(JSON.parse(opts.body));
    return J({ lead: SIGNALS.outreach[0] });
  }
  if (u.indexOf('/api/admin/sales-signals/motions') === 0) return J(MOTIONS);
  if (u.indexOf('/api/admin/sales-signals/mail-status') === 0) return J({ mail: null });
  if (u.indexOf('/api/admin/sales-signals/template') === 0) return J({ template: null });
  if (u.indexOf('/api/admin/sales-signals') === 0) return J({ signals: SIGNALS });
  return Promise.resolve({ ok: false, status: 404, json: function () { return Promise.resolve({ message: 'no stub for ' + u }); } });
};
</script>`;
}

function probe() {
  return `<script>
setTimeout(async function () {
  var out = { fail: [] };
  function bad(m) { out.fail.push(m); }
  var wait = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  try {
    for (var i = 0; i < 60 && !document.querySelector('[data-log]'); i++) await wait(100);

    var sheet = [].slice.call(document.styleSheets).filter(function (s) {
      return (s.href || '').indexOf('sales.css') > -1;
    })[0];
    try { out.cssRules = sheet.cssRules.length; } catch (e) { out.cssRules = 0; }
    if (!out.cssRules || out.cssRules < 400) bad('sales.css parsed only ' + out.cssRules + ' rules');

    var cell = document.querySelector('[data-log]');
    if (!cell) { bad('no Log cell on the warm introduction'); document.title = 'CHECK ' + JSON.stringify(out); return; }
    out.hint = cell.getAttribute('title') || '';
    if (out.hint.indexOf('contact') < 0) bad('the cell does not say the contact can be edited: "' + out.hint + '"');

    // Closed until asked for.
    var panel = document.getElementById('log-' + LEADID);
    if (!panel) { bad('no panel for the lead'); document.title = 'CHECK ' + JSON.stringify(out); return; }
    if (!panel.hidden) bad('the panel is open before anything was clicked');

    cell.click();
    await wait(120);
    if (panel.hidden) bad('clicking the cell did not open the panel');

    // ── The contact fields are there, filled, and visible ────────────────
    var want = {
      '.sg-l-name': 'Dr Meera Iyer',
      '.sg-l-phone': '07349250500',
      '.sg-l-email': '',
      '.sg-l-company': 'Meera Physiotherapy',
      '.sg-l-role': '',
      '.sg-l-rel': 'Former colleague',
    };
    out.fields = [];
    Object.keys(want).forEach(function (sel) {
      var f = panel.querySelector(sel);
      if (!f) { bad('missing field ' + sel); return; }
      if (f.value !== want[sel]) bad(sel + ' holds "' + f.value + '", expected "' + want[sel] + '"');
      var r = f.getBoundingClientRect();
      out.fields.push(sel.slice(6) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height));
      if (r.width < 60 || r.height < 18) bad(sel + ' is ' + Math.round(r.width) + 'x' + Math.round(r.height) + ' — not usable');
      if (getComputedStyle(f).display === 'none' || f.offsetParent === null) bad(sel + ' is not visible');
    });

    // ── Readable, on this dark page ──────────────────────────────────────
    function rgb(s) { var m = String(s).match(/(\\d+(?:\\.\\d+)?)/g) || []; return { r: +m[0] || 0, g: +m[1] || 0, b: +m[2] || 0, a: m.length > 3 ? +m[3] : 1 }; }
    function lum(c) { var f = [c.r, c.g, c.b].map(function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2]; }
    function behind(n) { for (var e = n; e && e !== document.documentElement; e = e.parentElement) { var b = rgb(getComputedStyle(e).backgroundColor); if (b.a > 0.85) return b; } return rgb(getComputedStyle(document.body).backgroundColor); }
    function ratio(a, b) { var x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
    var nameField = panel.querySelector('.sg-l-name');
    var label = panel.querySelector('.sg-l-who label');
    out.contrast = [];
    [['the value you type', nameField], ['its label', label]].forEach(function (s) {
      if (!s[1]) return;
      var r = ratio(rgb(getComputedStyle(s[1]).color), behind(s[1]));
      out.contrast.push(s[0] + ' ' + r.toFixed(1));
      if (r < 4.5) bad(s[0] + ' has contrast ' + r.toFixed(2) + ':1 — it cannot be read');
    });

    // The inputs are styled, not bare browser controls.
    var radius = parseInt(getComputedStyle(nameField).borderRadius, 10);
    out.radius = radius;
    if (!radius) bad('the contact inputs are unstyled');

    // ── The process fields survived ──────────────────────────────────────
    ['.sg-l-via', '.sg-l-next', '.sg-l-industry', '.sg-l-loc', '.sg-l-when', '.sg-l-note'].forEach(function (sel) {
      if (!panel.querySelector(sel)) bad('lost the existing field ' + sel);
    });

    // ── Saving sends the contact ─────────────────────────────────────────
    panel.querySelector('.sg-l-email').value = 'Meera@Clinic.COM';
    panel.querySelector('.sg-l-role').value = 'Clinical Director';
    panel.querySelector('[data-logsave]').click();
    await wait(300);
    var sent = (window.__patches || [])[0];
    out.sent = sent ? Object.keys(sent).sort().join(',') : '(nothing)';
    if (!sent) bad('Save sent no request');
    else {
      ['name', 'phone', 'email', 'company', 'role', 'relationship'].forEach(function (k) {
        if (!(k in sent)) bad('the save left out ' + k);
      });
      if (sent.email !== 'Meera@Clinic.COM') bad('the typed email was not sent as typed: ' + sent.email);
      if (sent.role !== 'Clinical Director') bad('the typed role was not sent: ' + sent.role);
      if (sent.via !== 'Introduced by Rahul') bad('the save dropped the route in');
    }

    out.scrollW = document.documentElement.scrollWidth;
    out.clientW = document.documentElement.clientWidth;
    if (out.scrollW > out.clientW + 2) bad('the page scrolls sideways');
  } catch (e) {
    bad('probe threw: ' + e.message);
  }
  document.title = 'CHECK ' + JSON.stringify(out);
}, 500);
</script>`;
}

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2',
};

function serve() {
  return http.createServer((req, res) => {
    const url = req.url.split('?')[0];
    const file = path.join(FRONTEND, url === '/' ? 'index.html' : url);
    if (!file.startsWith(FRONTEND) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404); res.end('not found'); return;
    }
    let body = fs.readFileSync(file);
    if (file.endsWith('sales.html')) {
      body = Buffer.from(String(body)
        .replace('</head>', `${stub()}<script>var LEADID=${JSON.stringify(LEAD.id)};</script></head>`)
        .replace('</body>', `${probe()}</body>`));
    }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(body);
  }).listen(PORT);
}

const chrome = (args) => new Promise((resolve, reject) => {
  const p = spawn(CHROME, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  p.stdout.on('data', (d) => { out += d; });
  p.on('error', reject);
  p.on('close', () => resolve(out));
});

if (!CHROME) { console.error('No Chrome found.'); process.exit(2); }
fs.mkdirSync(SHOTS, { recursive: true });

const server = serve();
let result;
try {
  const url = `http://localhost:${PORT}/admin/sales.html`;
  const common = ['--headless', '--disable-gpu', `--window-size=${process.env.CHECK_WINDOW || '1440,1600'}`, '--virtual-time-budget=14000'];
  await chrome([...common, `--screenshot=${path.join(SHOTS, 'sales-contact.png')}`, url]);
  const dom = await chrome([...common, '--dump-dom', url]);
  const m = dom.match(/<title>CHECK ([\s\S]*?)<\/title>/);
  result = m
    ? JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'))
    : { fail: ['no probe result — the page did not finish loading'] };
} finally {
  await new Promise((r) => server.close(r));
}

const ok = !result.fail?.length;
console.log(`${ok ? 'PASS' : 'FAIL'}  warm-intro contact editor — css ${result.cssRules ?? '?'} rules · radius ${result.radius ?? '?'}px`);
console.log(`      fields: ${(result.fields || []).join(' · ')}`);
console.log(`      contrast: ${(result.contrast || []).join(' · ')}`);
console.log(`      hint: "${result.hint ?? '?'}"`);
console.log(`      saved: ${result.sent ?? '?'}`);
console.log(`      width: ${result.scrollW ?? '?'}/${result.clientW ?? '?'}`);
(result.fail || []).forEach((f) => console.log(`        ↳ ${f}`));
console.log('\nScreenshot: scripts/.screens/sales-contact.png');
process.exit(ok ? 0 : 1);
