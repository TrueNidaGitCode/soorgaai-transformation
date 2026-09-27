// The home board with Example mode off and on. From backend/trunida-backend:
//   node scripts/app-checks/shot_example_mode.mjs
// Screenshots go to scripts/.screens/example-{off,on}.png.
import http from 'http';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const TPL = path.join(ROOT, 'backend/trunida-backend/eame-template/frontend');
const OUT = path.join(ROOT, 'scripts', '.screens');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 5631;

const COPY = {
  __APP_NAME__: 'Vesoma', __APP_TAGLINE__: 'Ask about bookings, packages and attendance.',
  __APP_WELCOME_TITLE__: 'Who needs attention?', __APP_WELCOME_BODY__: 'Ask in your own words.',
  __APP_PROMPT__: 'Ask about a client...', __APP_EYEBROW__: 'Care',
  __APP_HEADLINE__: 'Your practice,', __APP_ACCENT__: 'watched.',
  __APP_ACCENT_COLOR__: '#5CC5A7', __APP_INITIAL__: 'V', __APP_HERO_IMAGE__: 'none',
  __APP_HERO_CREDIT__: '', __APP_HERO_CREDIT_URL__: '', __APP_PREVIEW_JSON__: '{}',
};
const fill = (s) => Object.entries(COPY).reduce((o, [k, v]) => o.split(k).join(v), s);
const now = new Date().toISOString();

const CATEGORIES = ['Retention', 'Utilisation', 'Growth', 'Cash', 'Compliance'];

/** Findings built on the sample data — what Example mode shows. */
const EXAMPLES = [
  ['Rahul Menon', 'Promise Not Kept', 'Growth', 'high'],
  ['Kavitha Raman', 'No Show', 'Retention', 'medium'],
  ['Manish T.', 'Deadline Approaching', 'Compliance', 'medium'],
].map(([title, watcher, category, severity], i) => ({
  id: 'f' + i, key: title, title, watcher, category, severity, state: 'open',
  since: now, lastSeenAt: now,
  evidence: {
    dataset: 'Appointment Booking Diary + Enquiries and Calls',
    simulated: true, checked: true, rows: 2, lines: [], columns: [],
  },
}));

const board = (example) => ({
  open: example ? EXAMPLES : [],
  resolved: [],
  counts: example ? { high: 1, medium: 2, low: 0 } : { high: 0, medium: 0, low: 0 },
  categories: CATEGORIES.map((name) => ({
    name, asks: '', locked: false, watchers: 3,
    count: example ? EXAMPLES.filter((f) => f.category === name).length : 0,
  })),
  // The point of the whole change: nothing of theirs has arrived.
  hasRealData: false,
  hasExample: true,
  example,
  examples: [],
  watching: 13,
  degraded: 0,
  nextDueAt: now,
  everRan: true,
});

const PROBE = [
  '<script>',
  'localStorage.clear(); sessionStorage.clear();',
  '// Straight to the board: the front door and the welcome are not what this checks.',
  'sessionStorage.setItem("ch-entered", "1");',
  'localStorage.setItem("ownerToken","o"); localStorage.setItem("token","t");',
  'localStorage.setItem("ch-user", JSON.stringify({ name: "Dr Rao", email: "hod@vesoma.in" }));',
  'if (new URLSearchParams(location.search).get("mode") === "on") localStorage.setItem("ch-example","1");',
  'setTimeout(async function () { try {',
  '  var wait = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };',
  '  var txt = function (el) { return el ? el.textContent.replace(/\\s+/g, " ").trim() : ""; };',
  '  for (var g = 0; g < 4; g++) {',
  '    var go = document.getElementById("ch-login") || document.getElementById("ch-continue");',
  '    if (!go || go.offsetParent === null) break;',
  '    go.click(); await wait(300);',
  '  }',
  '  await wait(600);',
  '  ["ch-landing","ch-welcome","ch-hero"].forEach(function (id) {',
  '    var n = document.getElementById(id); if (n) n.remove(); });',
  '  Array.prototype.forEach.call(document.querySelectorAll(".ld, .wl"), function (n) { n.remove(); });',
  '  window.scrollTo(0, 0);',
  '  await wait(200);',
  '  var out = {};',
  '  out.mode = txt(document.getElementById("fn-mode"));',
  '  out.modeHidden = (document.getElementById("fn-mode") || {}).hidden;',
  '  out.verdict = txt(document.getElementById("fn-health-verdict"));',
  '  out.line = txt(document.getElementById("fn-heroline"));',
  '  out.sub = txt(document.getElementById("fn-herosub"));',
  '  out.rows = Array.prototype.map.call(document.querySelectorAll(".fn__row"), txt).slice(0, 3);',
  '  out.tags = document.querySelectorAll(".fn__row .fn__egtag").length;',
  '  document.title = "PROBE " + JSON.stringify(out);',
  '} catch (e) { document.title = "PROBE " + JSON.stringify({ threw: e.message }); }',
  '}, 700);',
  '</script>',
].join('\n');

const server = http.createServer((req, res) => {
  const [p, q] = req.url.split('?');
  const qs = new URLSearchParams(q || '');
  const json = (o) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
  if (p === '/api/auth/providers') return json({ google: true, email: true, public: false });
  if (p === '/api/auth/me') return json({ signedIn: true, name: 'Dr Rao', email: 'hod@vesoma.in' });
  if (p === '/api/agents/findings') return json(board(qs.get('example') === '1'));
  if (p.indexOf('/api/') === 0) return json({});
  const file = path.join(TPL, p === '/' ? 'index.html' : p);
  if (!fs.existsSync(file)) { res.writeHead(404); return res.end('nf'); }
  let text = fs.readFileSync(file, 'utf8');
  if (file.endsWith('.html')) text = fill(text).replace('<script src="config.js"></script>', '<script src="config.js"></script>' + PROBE);
  else if (file.endsWith('.js') || file.endsWith('.css')) text = fill(text);
  const ext = path.extname(file);
  res.writeHead(200, { 'Content-Type': ext === '.css' ? 'text/css' : ext === '.js' ? 'text/javascript' : 'text/html' });
  res.end(text);
});

const chrome = (args) => new Promise((r) => {
  const pr = spawn(CHROME, args, { windowsHide: true });
  let o = ''; pr.stdout.on('data', (d) => { o += d; }); pr.on('close', () => r(o));
});

fs.mkdirSync(OUT, { recursive: true });
await new Promise((r) => server.listen(PORT, r));
for (const mode of ['off', 'on']) {
  const url = `http://localhost:${PORT}/?mode=${mode}`;
  const common = ['--headless', '--disable-gpu', '--window-size=1200,1000', '--virtual-time-budget=9000'];
  await chrome([...common, `--screenshot=${path.join(OUT, 'example-' + mode + '.png')}`, url]);
  const dom = await chrome([...common, '--dump-dom', url]);
  const m = dom.match(/<title>PROBE ([\s\S]*?)<\/title>/);
  console.log(mode.toUpperCase(), m ? m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#39;/g, "'") : 'no probe');
  console.log();
}
server.close();
