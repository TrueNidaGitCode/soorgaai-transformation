/**
 * Svarg — the first message, with a tracked link
 *
 *   node scripts/check_first_message.mjs
 *
 * Opens the Pitches tab in a real browser, picks a lead, and checks that both
 * messages carry THAT lead's tracked link and name — and that the clipboard
 * gets plain text rather than the HTML entities the page is written in.
 *
 * The link is the whole point. A message ending in a bare www.svargai.com
 * still reads correctly and attributes nothing, so the failure is invisible:
 * the lead sits in Outreach afterwards looking as though they never replied.
 * Nothing but rendering it and reading the text would catch that.
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
const PORT = Number(process.env.CHECK_PORT || 8404);

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find((p) => fs.existsSync(p));

const REF = 'https://www.svargai.com/?ref=Zm9vYmFy';

const SIGNALS = {
  generatedAt: new Date().toISOString(),
  outreach: [{
    id: '000000000000000000000001',
    motion: 'warm-intro', lane: 'introduced', status: 'to-contact',
    name: 'Dr Meera Iyer', phone: '07349250500', email: '',
    company: 'Meera Physiotherapy', relationship: 'Former colleague',
    industry: 'Clinics & Wellness', location: 'Bengaluru',
    via: 'Introduced by Rahul', nextStep: '', nextStepAt: null, note: '',
    inviteLink: REF,
    sequence: { sentCount: 0, maxSends: 3, intervalDays: 4, enabled: false },
  }],
  discovery: [], conversion: [], onboarding: [], sales: [],
};

function stub() {
  return `<script>
localStorage.setItem('token','stub'); localStorage.setItem('role','admin');
localStorage.setItem('username','check@svarg.ai');
window.CONFIG = { API_BASE: '/api' };
var SIGNALS = ${JSON.stringify(SIGNALS)};
var MOTIONS = ${JSON.stringify(motionRegistry({ industries: ['Clinics & Wellness'] }))};
window.__copied = [];
// navigator.clipboard is read-only, so a plain assignment is silently
// dropped and the real API throws in headless — which looked like the page
// failing to copy. defineProperty actually replaces it.
Object.defineProperty(navigator, 'clipboard', {
  configurable: true,
  value: { writeText: function (t) { window.__copied.push(t); return Promise.resolve(); } },
});
window.fetch = function (url, opts) {
  var u = String(url);
  function J(b) { return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve(b); } }); }
  if (u.indexOf('/api/admin/sales-signals/motions') === 0) return J(MOTIONS);
  if (u.indexOf('/api/admin/sales-signals/mail-status') === 0) return J({ mail: null });
  if (u.indexOf('/api/admin/sales-signals/template') === 0) return J({ template: null });
  if (u.indexOf('/api/admin/sales-signals/deck') === 0) return J({});
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
  var REF = ${JSON.stringify(REF)};
  try {
    for (var i = 0; i < 60 && !document.getElementById('sg-view-pitches'); i++) await wait(100);
    document.getElementById('sg-view-pitches').click();
    for (var j = 0; j < 60 && !document.querySelector('.sg-fm'); j++) await wait(100);

    var fm = document.querySelector('.sg-fm');
    if (!fm) { bad('the first-message block never rendered'); document.title = 'CHECK ' + JSON.stringify(out); return; }

    var bodies = fm.querySelectorAll('.sg-fm__body');
    out.messages = bodies.length;
    if (bodies.length < 2) bad('expected an email and a short message, found ' + bodies.length);

    // ── Untracked by default, and said so ────────────────────────────────
    var all0 = fm.textContent;
    if (all0.indexOf('{{link}}') > -1) bad('the link token was left unfilled on screen');
    if (all0.indexOf(REF) > -1) bad('a tracked link appears before anybody was chosen');
    if (all0.indexOf('attributes nothing') < 0) bad('the untracked state does not say it attributes nothing');
    out.before = bodies[1].textContent.trim().slice(-46);

    // ── Choose the lead ──────────────────────────────────────────────────
    var sel = document.getElementById('sg-fm-lead');
    if (!sel) { bad('no lead picker'); document.title = 'CHECK ' + JSON.stringify(out); return; }
    out.options = sel.options.length;
    if (sel.options.length !== 2) bad('picker offers ' + sel.options.length + ' options, expected 2');

    sel.value = '000000000000000000000001';
    sel.dispatchEvent(new Event('change'));
    await wait(200);

    fm = document.querySelector('.sg-fm');
    bodies = fm.querySelectorAll('.sg-fm__body');
    var email = bodies[0].textContent;
    var short = bodies[1].textContent;
    out.after = short.trim().slice(-46);

    if (email.indexOf(REF) < 0) bad('the email does not carry the tracked link');
    if (short.indexOf(REF) < 0) bad('the short message does not carry the tracked link');
    if (short.indexOf('https://www.svargai.com/?ref=') < 0) bad('the ref is missing from the short message');
    if (email.indexOf('[Name]') > -1) bad('the email still says [Name] after a lead was chosen');
    if (short.indexOf('[Name]') > -1) bad('the short message still says [Name]');
    if (email.indexOf('Dr Meera Iyer') < 0) bad('the email was not addressed to the lead');
    if (fm.textContent.indexOf('attributed to them') < 0) bad('the chosen state does not say what the link does');

    // The content itself, which is what was asked for.
    for (var phrase of ['clinics and wellness centres', 'multiple AI agents', 'No Show', 'package']) {
      if (short.indexOf(phrase) < 0) bad('the short message lost: ' + phrase);
    }

    // ── The clipboard gets text, not entities ────────────────────────────
    var btns = fm.querySelectorAll('[data-fmcopy]');
    out.copyButtons = btns.length;
    if (btns.length !== 2) bad('expected two copy buttons, found ' + btns.length);
    btns[1].click();
    await wait(150);
    var copied = (window.__copied || [])[0] || '';
    out.copied = copied.slice(0, 40);
    out.copiedTail = copied.trim().slice(-42);
    if (!copied) bad('Copy put nothing on the clipboard');
    if (/&(mdash|ldquo|rdquo|amp|rsquo);/.test(copied)) bad('the clipboard holds HTML entities: ' + copied.slice(0, 80));
    if (copied.indexOf(REF) < 0) bad('the copied message does not carry the tracked link');
    if (copied.indexOf('<') > -1) bad('the clipboard holds markup');
    if (copied.indexOf('Dr Meera Iyer') < 0) bad('the copied message is not addressed to the lead');

    // Copying the email takes the signature with it.
    btns[0].click();
    await wait(150);
    var mail = (window.__copied || [])[1] || '';
    if (mail.indexOf('Founder') < 0) bad('the copied email has no signature');

    // ── Readable ─────────────────────────────────────────────────────────
    function rgb(s) { var m = String(s).match(/(\\d+(?:\\.\\d+)?)/g) || []; return { r: +m[0] || 0, g: +m[1] || 0, b: +m[2] || 0, a: m.length > 3 ? +m[3] : 1 }; }
    function lum(c) { var f = [c.r, c.g, c.b].map(function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2]; }
    function behind(n) { for (var e = n; e && e !== document.documentElement; e = e.parentElement) { var b = rgb(getComputedStyle(e).backgroundColor); if (b.a > 0.85) return b; } return rgb(getComputedStyle(document.body).backgroundColor); }
    function ratio(a, b) { var x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
    out.contrast = [];
    [['the message', bodies[1].querySelector('p')], ['the picker', document.getElementById('sg-fm-lead')]].forEach(function (s) {
      if (!s[1]) return;
      var r = ratio(rgb(getComputedStyle(s[1]).color), behind(s[1]));
      out.contrast.push(s[0] + ' ' + r.toFixed(1));
      if (r < 4.5) bad(s[0] + ' has contrast ' + r.toFixed(2) + ':1');
    });
    if (!parseInt(getComputedStyle(document.getElementById('sg-fm-lead')).borderRadius, 10)) bad('the picker is unstyled');

    out.scrollW = document.documentElement.scrollWidth;
    out.clientW = document.documentElement.clientWidth;
    if (out.scrollW > out.clientW + 2) bad('the page scrolls sideways');
  } catch (e) { bad('probe threw: ' + e.message); }
  document.title = 'CHECK ' + JSON.stringify(out);
}, 500);
</script>`;
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.pdf': 'application/pdf' };

function serve() {
  return http.createServer((req, res) => {
    const url = req.url.split('?')[0];
    const file = path.join(FRONTEND, url === '/' ? 'index.html' : url);
    if (!file.startsWith(FRONTEND) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('nope'); return; }
    let body = fs.readFileSync(file);
    if (file.endsWith('sales.html')) {
      body = Buffer.from(String(body).replace('</head>', `${stub()}</head>`).replace('</body>', `${probe()}</body>`));
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
  const url = `http://localhost:${PORT}/admin/sales.html`;
  const common = ['--headless', '--disable-gpu', `--window-size=${process.env.CHECK_WINDOW || '1440,1700'}`, '--virtual-time-budget=16000'];
  await chrome([...common, `--screenshot=${path.join(SHOTS, 'first-message.png')}`, url]);
  const dom = await chrome([...common, '--dump-dom', url]);
  const m = dom.match(/<title>CHECK ([\s\S]*?)<\/title>/);
  r = m ? JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'))
        : { fail: ['no probe result — the page did not finish loading'] };
} finally { await new Promise((x) => server.close(x)); }

const ok = !r.fail?.length;
console.log(`${ok ? 'PASS' : 'FAIL'}  first message — ${r.messages ?? '?'} messages · ${r.copyButtons ?? '?'} copy buttons · picker ${r.options ?? '?'} options`);
console.log(`      before: …${r.before ?? '?'}`);
console.log(`      after : …${r.after ?? '?'}`);
console.log(`      copied: "${r.copied ?? '?'}…${r.copiedTail ?? ''}"`);
console.log(`      contrast: ${(r.contrast || []).join(' · ')} · width ${r.scrollW ?? '?'}/${r.clientW ?? '?'}`);
(r.fail || []).forEach((f) => console.log(`        ↳ ${f}`));
console.log('\nScreenshot: scripts/.screens/first-message.png');
process.exit(ok ? 0 : 1);
