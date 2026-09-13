// The Data page as two cards: at rest, the folder flow open in its card,
// the matching step, the WhatsApp Business form in its card, and both
// connected. Usage, from backend/trunida-backend: node scripts/app-checks/shot_data_cards.mjs [state,state]
// Needs headless Chrome at the CHROME path; screenshots go to scripts/.screens/cards-*.png.
import http from 'http'; import fs from 'fs'; import path from 'path'; import { spawn } from 'child_process'; import { fileURLToPath } from 'url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const TPL = path.join(ROOT, 'backend/trunida-backend/eame-template/frontend');
const OUT = path.join(ROOT, 'scripts', '.screens');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 5623;
const COPY = { __APP_NAME__: 'Six Cricket', __APP_TAGLINE__: 'Ask about players, attendance and fees.', __APP_WELCOME_TITLE__: 'Who needs attention this week?', __APP_WELCOME_BODY__: 'Ask in your own words.', __APP_PROMPT__: 'Ask about a learner…', __APP_EYEBROW__: 'Train', __APP_HEADLINE__: 'Your Cricket Journey,', __APP_ACCENT__: 'Simplified.', __APP_ACCENT_COLOR__: '#5CC5A7', __APP_INITIAL__: 'S', __APP_HERO_IMAGE__: 'none', __APP_HERO_CREDIT__: '', __APP_HERO_CREDIT_URL__: '', __APP_PREVIEW_JSON__: '{}' };
const fill = (s) => Object.entries(COPY).reduce((o, [k, v]) => o.split(k).join(v), s);
const now = new Date().toISOString();
const DS = [
  { name: 'Student roster and enrolment', slug: 'student-roster', sampleRows: 24, columns: ['student_id', 'name', 'age', 'batch', 'guardian_phone', 'status'], key: 'student_id', own: null, held: 0, bySource: {}, lastChange: null, missing: 0 },
  { name: 'Session attendance', slug: 'session-attendance', sampleRows: 60, columns: ['session_date', 'batch', 'player_name', 'reply', 'status'], key: 'session_date + player_name', own: null, held: 0, bySource: {}, lastChange: null, missing: 0 },
  { name: 'Fee ledger', slug: 'fee-ledger', sampleRows: 30, columns: ['invoice_no', 'student_id', 'amount', 'due_on', 'paid_on'], key: 'invoice_no', own: null, held: 0, bySource: {}, lastChange: null, missing: 0 },
];
const EMPTY = { datasets: DS, imports: [] };
const FULL = { datasets: DS, imports: [
  { datasetName: 'Student roster and enrolment', rows: 17, source: 'folder', origin: 'Students.xlsx', added: 17, updated: 0, missing: 0, at: now },
  { datasetName: 'Fee ledger', rows: 640, source: 'folder', origin: 'Fees 2025.xlsx, Fees 2026.xlsx', added: 12, updated: 3, missing: 3, at: now },
  { datasetName: 'Session attendance', rows: 13, source: 'folder', origin: 'Roll calls.xlsx', added: 13, updated: 0, missing: 0, at: now },
] };
const SOURCES = { sources: [
  { kind: 'folder', label: 'Your folder of spreadsheets', providers: ['upload'], holds: ['enrolment', 'attendance', 'fees'], note: 'Upload the whole folder.' },
  { kind: 'whatsapp', label: 'WhatsApp', providers: ['export', 'business-account'], holds: ['attendance', 'communication'], note: 'Attendance is asked and answered in one group per batch.' },
] };
const KIND = { kind: 'whatsapp-business', label: 'WhatsApp Business', help: 'Your own Meta app: the number, its access token and the app secret.', provides: ['messages', 'attendance'], fields: [{ name: 'phoneNumberId', label: 'Phone number ID', placeholder: '1234567890' }, { name: 'accessToken', label: 'Access token', secret: true }, { name: 'appSecret', label: 'App secret', secret: true }, { name: 'mode', label: 'Read replies as', options: ['attendance', 'messages'] }] };
const NOCONN = { kinds: [KIND], connectors: [] };
const CONN = { kinds: [KIND], connectors: [{ id: 'c1', kind: 'whatsapp-business', label: 'WhatsApp Business', datasetName: 'Session attendance', schedule: 'manual', status: 'connected', lastSyncAt: now, lastRows: 42 }] };
const STUDENTS = 'Student ID,Name,Age,Batch,Guardian Phone,Status\nS1,Priya Nair,13,U14,9800000001,Active\nS2,Arjun Sharma,15,U16,9800000002,Active\nS3,Meera Iyer,11,U12,9800000003,Trial\n';
const FEES = 'Invoice No,Student ID,Amount,Due On,Paid On\nINV-1,S1,4500,2026-09-01,2026-09-03\nINV-2,S2,4500,2026-09-01,\n';
const NOTES = 'Ground rules\nNo spikes on the indoor pitch.';
const PROBE = (state) => `<script>
window.__errs = []; window.addEventListener('error', e => window.__errs.push(e.message)); window.addEventListener('unhandledrejection', e => window.__errs.push('rej: ' + String(e.reason && e.reason.stack || e.reason).slice(0, 400)));
localStorage.clear(); sessionStorage.clear();
localStorage.setItem('ownerToken', 'owner-stub'); localStorage.setItem('token', 'user-stub'); localStorage.setItem('ch-user', JSON.stringify({ name: 'Ravi Coach', email: 'ravi@six.in' }));
window.__state = ${JSON.stringify(state)};
setTimeout(async function () { try {
  var wait = ms => new Promise(r => setTimeout(r, ms));
  var out = { state: window.__state, errs: [] };
  function addFiles(input, files) { input.removeAttribute('webkitdirectory'); input.removeAttribute('directory'); var dt = new DataTransfer(); files.forEach(function (f) { dt.items.add(new File([f[1]], f[0], { type: 'text/csv' })); }); input.files = dt.files; input.dispatchEvent(new Event('change', { bubbles: true })); }
  for (var rw = 0; rw < 30 && !document.querySelector('.dt-card'); rw++) await wait(100);
  var cardText = function () { return Array.from(document.querySelectorAll('.dt-card')).map(function (c) { return c.querySelector('.dt-card__title').textContent + ' :: ' + c.querySelector('.dt-card__dot').textContent + ' :: ' + ((c.querySelector('.dt-card__go') || {}).textContent || '-').trim(); }); };
  out.cards = cardText();
  out.gone = ['dt-datasets', 'dt-log', 'dt-signals', 'dt-also', 'dt-panel'].filter(function (id) { return document.getElementById(id); });
  out.lock = !document.getElementById('dt-lock').hidden;
  if (window.__state === 'open' || window.__state === 'match' || window.__state === 'landed') {
    document.querySelector('[data-open="folder"]').click(); await wait(50);
    out.openCard = document.querySelector('.dt-card--open [data-card]') === null && !!document.querySelector('.dt-card--open .dt-drop');
    out.footGone = !document.querySelector('[data-card="folder"] .dt-card__foot');
  }
  if (window.__state === 'match' || window.__state === 'landed') {
    addFiles(document.querySelector('[data-folder]'), [['Students.csv', ${JSON.stringify(STUDENTS)}], ['Fees 2026.csv', ${JSON.stringify(FEES)}], ['Ground rules.txt', ${JSON.stringify(NOTES)}]]);
    for (var pw = 0; pw < 40 && !document.querySelector('[data-card="folder"] .dt-folder'); pw++) await wait(100);
    out.inCard = !!document.querySelector('[data-card="folder"] [data-body] .dt-folder');
    out.sheets = Array.from(document.querySelectorAll('.dt-folder tbody tr')).map(function (r) { var s = r.querySelector('select'); return r.querySelector('.dt-folder__name').textContent + ' -> ' + s.options[s.selectedIndex].text + ' (' + r.querySelector('.dt-folder__fit').textContent + ')'; });
    out.goBtn = (document.querySelector('[data-folder-go]') || {}).textContent;
  }
  if (window.__state === 'landed') {
    window.__full = true;
    document.querySelector('[data-folder-go]').click();
    for (var lw = 0; lw < 40 && !document.querySelector('[data-card="folder"] .dt-done'); lw++) await wait(100);
    out.done = (document.querySelector('[data-card="folder"] .dt-done__line') || {}).textContent;
    out.doneLines = Array.from(document.querySelectorAll('[data-card="folder"] .dt-done__list li')).map(function (l) { return l.textContent.replace(/\\s+/g, ' ').trim(); });
    out.status = (document.querySelector('[data-card="folder"] > .dt-card__label') || {}).textContent;
    out.cards = cardText();
    out.note = (document.getElementById('dt-note') || {}).textContent;
    out.posted = window.__posted;
  }
  if (window.__state === 'wabiz') {
    document.querySelector('[data-open="whatsapp-business"]').click(); await wait(200);
    out.formInCard = !!document.querySelector('[data-card="whatsapp"] [data-body] [data-connect]');
    out.setup = (document.getElementById('dt-wa-url') || {}).textContent;
    out.fields = Array.from(document.querySelectorAll('[data-card="whatsapp"] [name]')).map(function (f) { return f.name; });
  }
  if (window.__state === 'connected') {
    out.conn = (document.querySelector('[data-card="whatsapp"] .dt-conn__meta') || {}).textContent;
    out.status = (document.querySelector('[data-card="whatsapp"] > .dt-card__label') || {}).textContent;
    out.alt = (document.querySelector('[data-card="whatsapp"] .dt-card__alt') || {}).textContent;
  }
  out.errs = window.__errs;
  document.title = 'PROBE ' + JSON.stringify(out);
  } catch (e) { document.title = 'PROBE ' + JSON.stringify({ threw: e.message, stack: String(e.stack).slice(0, 300), errs: window.__errs }); }
}, 700);
</script>`;
const server = http.createServer((req, res) => {
  const [p, q] = req.url.split('?');
  const qs = new URLSearchParams(q || '');
  const ref = new URLSearchParams(String(req.headers.referer || '').split('?')[1] || ''); const state = qs.get('state') || ref.get('state') || 'data';
  const json = (o, code) => { res.writeHead(code || 200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
  const body = () => new Promise(r => { let b = ''; req.on('data', d => b += d); req.on('end', () => r(b ? JSON.parse(b) : {})); });
  if (p === '/api/auth/providers') return json({ google: true, email: true, public: false });
  if (p === '/api/auth/me') return json({ signedIn: true, name: 'Ravi Coach', email: 'ravi@six.in' });
  if (p === '/api/data/datasets') return json(qs.get('full') === '1' || state === 'full' || state === 'connected' ? FULL : EMPTY);
  if (p === '/api/data/sources') return json(SOURCES);
  if (p === '/api/connectors') return json(state === 'connected' ? CONN : NOCONN);
  if (p === '/api/whatsapp/setup') return json({ webhookUrl: 'https://six-cricket.up.railway.app/api/whatsapp/webhook', verifyToken: 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6' });
  if (p === '/api/data/areas') return json({ areas: DS.map(d => ({ name: d.name, columns: d.columns, key: d.key, own: 0, sample: d.sampleRows })) });
  if (p === '/api/data/import') return body().then(b => json({ ok: true, datasetName: b.datasetName, rows: b.rows.length, added: b.rows.length, updated: 0, unchanged: 0, missing: 0, moved: [], key: 'student_id', __echo: { source: b.source, origin: b.origin, complete: b.complete, mode: b.mode, first: b.rows[0] } }));
  const file = path.join(TPL, p === '/' ? 'index.html' : p);
  if (!fs.existsSync(file)) { res.writeHead(404); return res.end('nf'); }
  let text = fs.readFileSync(file, 'utf8');
  if (file.endsWith('.html')) text = fill(text).replace('<script src="config.js"></script>', '<script src="config.js"></script>' + PROBE(state) + `<script>(function(){var f=window.fetch;window.fetch=async function(u,i){var s=String(u);if(window.__full&&s.indexOf('/api/data/datasets')!==-1)s+=(s.indexOf('?')===-1?'?':'&')+'full=1';var r=await f(s,i);if(s.indexOf("/api/data/import")!==-1){var c=r.clone();c.json().then(function(d){window.__posted=(window.__posted||[]).concat([d.__echo]);});}return r;};})();</script>`);
  else if (file.endsWith('.js') || file.endsWith('.css')) text = fill(text);
  const ext = path.extname(file);
  res.writeHead(200, { 'Content-Type': ext === '.css' ? 'text/css' : ext === '.js' ? 'text/javascript' : 'text/html' });
  res.end(text);
});
const chrome = (args) => new Promise(r => { const pr = spawn(CHROME, args, { windowsHide: true }); let o = ''; pr.stdout.on('data', d => o += d); pr.on('close', () => r(o)); });
await new Promise(r => server.listen(PORT, r));
const states = process.argv[2] ? process.argv[2].split(',') : ['data', 'open', 'match', 'landed', 'wabiz', 'connected'];
for (const state of states) {
  const url = `http://localhost:${PORT}/?state=${state}#data`;
  const common = ['--headless', '--disable-gpu', '--window-size=1400,1000', '--virtual-time-budget=9000'];
  await chrome([...common, `--screenshot=${path.join(OUT, 'cards-' + state + '.png')}`, url]);
  const dom = await chrome([...common, '--dump-dom', url]);
  const m = dom.match(/<title>PROBE ([\s\S]*?)<\/title>/);
  console.log(state, m ? m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&gt;/g, '>') : 'no probe');
}
server.close();
