/**
 * The delivered project, built under a chosen name.
 *
 * Checks the substitution actually happened everywhere the placeholder
 * appears, that no placeholder survives into what ships, and that the chat
 * front end is present and wired to files that exist — a page referencing a
 * stylesheet the builder does not emit would 404 in the customer's browser.
 */

import { buildManifest } from '../services/eameProjectBuilder.js';

const APP_NAME = 'Defect Copilot';
const files = buildManifest({ includeJira: true, appName: APP_NAME });
const byPath = Object.fromEntries(files.map(f => [f.path, f.content]));

let pass = true;
const check = (label, ok, detail = '') => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ' — ' + detail : ''}`);
  if (!ok) pass = false;
};

console.log('1. the chat front end ships');
for (const p of ['frontend/index.html', 'frontend/chat.js', 'frontend/chat.css', 'frontend/base.css', 'frontend/config.js']) {
  check(p, p in byPath);
}

console.log('\n2. the name reaches what the user sees');
const html = byPath['frontend/index.html'] || '';
check('page title', html.includes(`<title>${APP_NAME}</title>`));
check('heading', html.includes(`>${APP_NAME}</h1>`));

console.log('\n3. no placeholder survives');
const leaked = files.filter(f => f.content.includes('__APP_NAME__')).map(f => f.path);
check('every __APP_NAME__ substituted', leaked.length === 0, leaked.join(', '));

console.log('\n4. an unnamed build still reads sensibly');
const anon = buildManifest({ includeJira: true });
const anonHtml = anon.find(f => f.path === 'frontend/index.html').content;
check('falls back to a real name', anonHtml.includes('<title>AI Assistant</title>'));
check('no placeholder left', !anon.some(f => f.content.includes('__APP_NAME__')));

console.log('\n5. the page only references files that ship');
for (const m of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
  const ref = m[1];
  if (/^https?:|^\/\//.test(ref)) continue;
  check(`references ${ref}`, `frontend/${ref}` in byPath);
}

console.log('\n6. the server serves it');
const server = byPath['server.js'] || '';
check('serves the frontend directory', server.includes('express.static'));
check('no JSON banner at the front door', !/app\.get\('\/',[\s\S]{0,120}res\.json/.test(server));
check('session endpoint is opt-in', server.includes("APP_PUBLIC_ACCESS !== 'true'"));

console.log('\n7. the project is still complete');
for (const p of ['package.json', 'server.js', 'README.md', 'services/defectMatchingService.js']) {
  check(p, p in byPath);
}
const pkg = JSON.parse(byPath['package.json']);
check('package.json parses with a start script', !!pkg.scripts?.start, pkg.scripts?.start);

console.log(pass ? '\nPASS — the delivered app is named, complete and served' : '\nFAILED');
process.exit(pass ? 0 : 1);
