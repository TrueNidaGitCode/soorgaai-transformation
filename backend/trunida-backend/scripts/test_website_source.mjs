/**
 * Website connector: does it refuse what it must, and read what it should?
 *
 *   node scripts/test_website_source.mjs [url]
 */
import 'dotenv/config';
import { assertFetchable, readCompanySite, extractText } from '../services/websiteService.js';

let pass = true;
const check = (l, ok, d = '') => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${l}${d ? ' — ' + d : ''}`); if (!ok) pass = false; };

console.log('1. refuses what must never be fetched');
const BLOCKED = [
  ['http://169.254.169.254/latest/meta-data/', 'cloud metadata'],
  ['http://localhost:3000/api/users',          'loopback by name'],
  ['http://127.0.0.1/',                        'loopback by address'],
  ['http://10.0.0.1/',                         'private 10/8'],
  ['http://192.168.1.1/',                      'private 192.168/16'],
  ['http://172.16.0.1/',                       'private 172.16/12'],
  ['file:///etc/passwd',                       'non-http scheme'],
  ['ftp://example.com/',                       'non-http scheme'],
  ['[::1]',                                    'malformed'],
];
for (const [url, label] of BLOCKED) {
  try {
    await assertFetchable(url);
    check(label, false, `${url} was ALLOWED`);
  } catch (err) {
    check(label, true, err.message.slice(0, 52));
  }
}

console.log('\n2. allows an ordinary public site');
try {
  const u = await assertFetchable('https://example.com');
  check('public https', u.hostname === 'example.com');
} catch (err) { check('public https', false, err.message); }

console.log('\n3. extraction strips furniture');
{
  const html = `<html><head><title> Padhivu — Academy Software </title></head>
    <body><script>var x=1;</script><style>.a{}</style>
    <nav><a href="/about">About</a></nav>
    <h1>Run your academy</h1><p>Attendance &amp; fees in one place.</p>
    <p>Built for teachers.</p></body></html>`;
  const text = extractText(html);
  check('no script content', !text.includes('var x'));
  check('no style content', !text.includes('.a{'));
  check('keeps prose', text.includes('Run your academy') && text.includes('Built for teachers'));
  check('decodes entities', text.includes('Attendance & fees'));
}

console.log('\n4. reads a real site');
const target = process.argv[2] || 'https://padhivu.org/';
try {
  const { pages, origin } = await readCompanySite(target);
  check('fetched at least one page', pages.length > 0, `${pages.length} page(s) from ${origin}`);
  pages.forEach(p => console.log(`        ${String(p.text.length).padStart(6)} chars  ${p.title.slice(0, 44).padEnd(46)} ${p.url}`));
  const total = pages.reduce((n, p) => n + p.text.length, 0);
  check('enough text to be useful', total > 500, `${total} chars total`);
  console.log('\n  --- what the model would actually see (first 400 chars) ---');
  console.log('  ' + pages[0].text.slice(0, 400).replace(/\n/g, '\n  '));
} catch (err) {
  check('read a real site', false, err.message);
}

console.log(pass ? '\nPASS' : '\nFAILED');
process.exit(pass ? 0 : 1);
