// Learned churn patterns on the Agents board and the Data page, against a
// stubbed API. Usage, from backend/trunida-backend:
//   node scripts/app-checks/shot_patterns.mjs
// Screenshots go to scripts/.screens/patterns-agents.png and patterns-data.png.
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

const SOURCES = [
  { kind: 'folder', label: 'Your folder of spreadsheets', rows: 1284, datasets: ['Appointment Booking Diary', 'Package Sales and Balances'], lastChange: now },
  { kind: 'whatsapp', label: 'WhatsApp', rows: 212, datasets: ['Enquiries and Calls'], lastChange: now },
];
const S_DIARY = [SOURCES[0]];
const S_BOTH = SOURCES;

const C = (id, area, name, says, category, state, opts) => Object.assign({
  id, area, name, says, category, state, ready: state !== 'blocked', openCount: 0,
  using: '', datasets: [], sources: [], question: '', missing: '', severity: 'medium',
  schedule: 'daily', atHour: 7, startHere: false,
  agentId: state === 'off' || state === 'blocked' ? '' : 'a-' + id,
}, opts || {});

const CATALOGUE = [
  C('stopped-coming', 'People', 'Stopped Coming', 'Somebody who used to turn up has stopped', 'Retention', 'running',
    { openCount: 4, using: 'Appointment Booking Diary', sources: S_DIARY, question: 'Client Name in Appointment Booking Diary with no Appointment Date in the last 14 days' }),
  C('no-show', 'People', 'No Show', 'Booked and did not arrive', 'Retention', 'running',
    { openCount: 9, using: 'Appointment Booking Diary', sources: S_DIARY }),
  C('no-show-then-contact', 'Customers', 'No Show, Then Got In Touch', 'Marked absent, and then they contacted you', 'Retention', 'running',
    { openCount: 2, using: 'Appointment Booking Diary + Enquiries and Calls', sources: S_BOTH, question: 'Client Name in Appointment Booking Diary whose Status says no show or absent, who also appear in Enquiries and Calls with a Contact Date AFTER that appointment' }),
  C('empty-slot', 'Schedule', 'Empty Slot', 'A session with nobody booked', 'Utilisation', 'running',
    { openCount: 3, using: 'Appointment Booking Diary', sources: S_DIARY }),
  C('unstaffed-session', 'Schedule', 'Unstaffed Session', 'Booked with nobody to run it', 'Utilisation', 'off',
    { using: 'Appointment Booking Diary', sources: S_DIARY }),
  C('unanswered-enquiry', 'Customers', 'Unanswered Enquiry', 'Somebody asked and nobody replied', 'Growth', 'running',
    { openCount: 5, using: 'Enquiries and Calls', sources: [SOURCES[1]] }),
  C('contact-no-record', 'Customers', 'Contact Never Recorded', 'They got in touch and nothing happened afterwards', 'Growth', 'running',
    { openCount: 6, using: 'Enquiries and Calls + Appointment Booking Diary', sources: S_BOTH }),
  C('cancelled-not-updated', 'Money', 'Cancelled, Still No Show', 'They said they could not come, and the booking was never changed', 'Cash', 'running',
    { openCount: 3, using: 'Appointment Booking Diary + Enquiries and Calls', sources: S_BOTH }),
  C('absent-but-attended', 'Money', 'Marked Absent, But Attended', 'Recorded as a no-show, but the visit left its fingerprints', 'Cash', 'running',
    { openCount: 7, using: 'Appointment Booking Diary', sources: S_DIARY }),
  C('overdue-invoice', 'Money', 'Overdue Invoice', 'Past the due date and still unpaid', 'Cash', 'stopped',
    { using: 'Package Sales and Balances', sources: S_DIARY }),
  C('expiring-soon', 'Compliance', 'Expiring Soon', 'A certificate, licence or document running out', 'Compliance', 'blocked',
    { missing: 'Needs records with a document and a due date' }),
  C('missing-document', 'Compliance', 'Missing Document', 'Required and never supplied', 'Compliance', 'blocked',
    { missing: 'Needs records with a name and a document' }),
];

const CATEGORIES = [
  { name: 'Retention', asks: 'Who is drifting out of treatment', locked: false },
  { name: 'Utilisation', asks: 'What capacity is going to waste', locked: false },
  { name: 'Growth', asks: 'Which new business is going cold', locked: false },
  { name: 'Cash', asks: 'What money is at risk', locked: false },
  { name: 'Compliance', asks: 'What would fail an inspection', locked: false },
];

const AGENTS = CATALOGUE.filter((c) => c.agentId).map((c) => ({
  id: c.agentId, name: c.name, watcherId: c.id, question: c.question || (c.says + '?'),
  schedule: 'daily', atHour: 7, tz: 'Asia/Kolkata', severity: c.severity,
  enabled: true, status: c.state === 'stopped' ? 'degraded' : 'active',
  lastRunAt: now, lastFoundAt: now,
  lastError: c.state === 'stopped' ? 'Could not read Package Sales and Balances.' : '',
  failures: c.state === 'stopped' ? 3 : 0, openCount: c.openCount,
  open: Array.from({ length: Math.min(c.openCount, 3) }, (_, i) => ({ key: 'Client ' + (i + 1), since: now })),
  nextDueAt: now, createdAt: now,
}));

const BOARD = {
  canManage: true, agents: AGENTS, catalogue: CATALOGUE, categories: CATEGORIES,
  coverage: { categories: { covered: 5, of: 5 } },
  sources: SOURCES,
  areas: ['People', 'Money', 'Customers', 'Schedule', 'Compliance'],
  schedules: ['hourly', 'daily', 'weekdays'],
};

const PATTERNS = {
  canManage: true,
  definition: { businessType: 'recurring', label: 'Recurring Services', inactiveDays: 60, statusWords: ['not renewed', 'expired'], source: 'svarg',
    sentence: 'A customer counts as lost when they have had no activity for 60 days, or their last record says “not renewed” or “expired”.' },
  status: { churned: 31, stayed: 214, enough: true, simulated: false, learnedAt: now, minChurned: 20 },
  patterns: [
    { id: 'p1', state: 'candidate', label: 'No Show in Appointment Booking Diary + A longer gap than usual between visits', signals: [{ id: 'a', label: 'No Show in Appointment Booking Diary' }, { id: 'b', label: 'A longer gap than usual between visits' }], withChurned: 23, churned: 31, withStayed: 9, stayed: 214, strength: 4.1, sentence: 'Seen before 23 of the 31 customers who left; customers showing it left 4.1× as often as those who did not.' },
    { id: 'p2', state: 'approved', label: 'Fewer Package Sales and Balances than usual', signals: [{ id: 'c', label: 'Fewer Package Sales and Balances than usual' }], withChurned: 14, churned: 31, withStayed: 12, stayed: 214, strength: 3.2, sentence: 'Seen before 14 of the 31 customers who left; customers showing it left 3.2× as often as those who did not.' },
    { id: 'p3', state: 'fading', label: 'Flagged by Unanswered Enquiry', signals: [{ id: 'd', label: 'Flagged by Unanswered Enquiry' }], withChurned: 9, churned: 31, withStayed: 15, stayed: 214, strength: 2.1, sentence: 'Seen before 9 of the 31 customers who left; customers showing it left 2.1× as often as those who did not.' },
  ],
};

const PROBE = [
  '<script>',
  'window.__errs = []; window.addEventListener("error", function (e) { window.__errs.push(e.message); });',
  'localStorage.clear(); localStorage.setItem("ownerToken","owner-stub"); localStorage.setItem("token","user-stub");',
  'localStorage.setItem("ch-user", JSON.stringify({ name: "Dr Rao", email: "hod@vesoma.in" }));',
  'setTimeout(async function () { try {',
  '  var wait = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };',
  '  var txt = function (el) { return el ? el.textContent.replace(/\\s+/g, " ").trim() : ""; };',
  '  var out = {};',
  '  // Past the front door AND the welcome screen behind it, or the',
  '  // screenshot is of whichever one is still covering the board.',
  '  for (var g = 0; g < 4; g++) {',
  '    var go = document.getElementById("ch-login") || document.getElementById("ch-continue");',
  '    if (!go || go.offsetParent === null) break;',
  '    go.click(); await wait(300);',
  '  }',
  '  if (location.hash !== "#agents") { location.hash = "#agents"; } else { window.dispatchEvent(new Event("hashchange")); }',
  '  await wait(300);',
  '  for (var i = 0; i < 40 && !document.querySelector(".ag-col"); i++) await wait(100);',
  '  // The landing and welcome screens sit above the panel in the document,',
  '  // so a screenshot from the top is of them. The board is what is being',
  '  // checked, so they come out for the picture.',
  '  ["ch-landing", "ch-welcome", "ch-hero"].forEach(function (id) {',
  '    var n = document.getElementById(id); if (n) n.remove();',
  '  });',
  '  Array.prototype.forEach.call(document.querySelectorAll(".ld, .wl"), function (n) { n.remove(); });',
  '  window.scrollTo(0, 0);',
  '  await wait(150);',
  '  out.layers = Array.prototype.map.call(document.querySelectorAll(".ag-layer"), txt);',
  '  out.chiefWhat = txt(document.querySelector(".ag-chief__what"));',
  '  out.chiefState = txt(document.querySelector(".ag-chief__state"));',
  '  out.srcHead = txt(document.querySelector(".ag-src__head"));',
  '  out.srcItems = Array.prototype.map.call(document.querySelectorAll(".ag-src__item"), txt);',
  '  out.cols = Array.prototype.map.call(document.querySelectorAll(".ag-col__name"), txt);',
  '  out.twoChip = Array.prototype.filter.call(document.querySelectorAll(".ag-node"), function (n) {',
  '    return n.querySelectorAll(".ag-chip").length === 2; }).map(function (n) { return txt(n.querySelector(".ag-node__name")); });',
  '  for (var k = 0; k < 30 && !document.querySelector("#pt-learned .pt-card"); k++) await wait(100);',
  '  out.pt = txt(document.querySelector("#pt-learned .pt__lede"));',
  '  out.ptCards = document.querySelectorAll("#pt-learned .pt-card").length;',
  '  out.ptButtons = Array.prototype.map.call(document.querySelectorAll("#pt-learned button"), txt);',
  '  out.lost = txt(document.querySelector("#pt-lost .pt__lede"));',
  '  out.errs = window.__errs;',
  '  document.title = "PROBE " + JSON.stringify(out);',
  '} catch (e) { document.title = "PROBE " + JSON.stringify({ threw: e.message, errs: window.__errs }); }',
  '}, 700);',
  '</script>',
].join('\n');

const server = http.createServer((req, res) => {
  const p = req.url.split('?')[0];
  const json = (o) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
  if (p === '/api/auth/providers') return json({ google: true, email: true, public: false });
  if (p === '/api/auth/me') return json({ signedIn: true, name: 'Dr Rao', email: 'hod@vesoma.in' });
  if (p === '/api/agents') return json(BOARD);
  if (p === '/api/patterns') return json(PATTERNS);
  if (p.indexOf('/api/agents/findings') === 0) return json({ open: [], resolved: [], counts: {}, categories: [] });
  if (p.indexOf('/api/') === 0) return json({});
  const file = path.join(TPL, p === '/' ? 'index.html' : p);
  if (!fs.existsSync(file)) { res.writeHead(404); return res.end('nf'); }
  let text = fs.readFileSync(file, 'utf8');
  if (file.endsWith('.html')) {
    text = fill(text).replace('<script src="config.js"></script>', '<script src="config.js"></script>' + PROBE);
  } else if (file.endsWith('.js') || file.endsWith('.css')) {
    text = fill(text);
  }
  const ext = path.extname(file);
  res.writeHead(200, { 'Content-Type': ext === '.css' ? 'text/css' : ext === '.js' ? 'text/javascript' : 'text/html' });
  res.end(text);
});

const chrome = (args) => new Promise((r) => {
  const pr = spawn(CHROME, args, { windowsHide: true });
  let o = '';
  pr.stdout.on('data', (d) => { o += d; });
  pr.on('close', () => r(o));
});

fs.mkdirSync(OUT, { recursive: true });
await new Promise((r) => server.listen(PORT, r));
const url = 'http://localhost:' + PORT + '/#agents';
const common = ['--headless', '--disable-gpu', '--window-size=1400,2100', '--virtual-time-budget=9000'];
await chrome([...common, '--screenshot=' + path.join(OUT, 'patterns-agents.png'), url]);
const dom = await chrome([...common, '--dump-dom', url]);
const m = dom.match(/<title>PROBE ([\s\S]*?)<\/title>/);
console.log(m ? m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&gt;/g, '>') : 'no probe');
server.close();
