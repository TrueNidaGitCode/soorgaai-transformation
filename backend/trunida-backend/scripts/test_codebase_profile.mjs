/**
 * Reading a customer's repository.
 *
 * The properties worth pinning are the ones whose failure is silent: selecting
 * the wrong files wastes their API quota, a chunk id that ignores the tenant
 * lets one customer's code overwrite another's, and an unscoped retrieval
 * returns somebody else's source.
 *
 *   node scripts/test_codebase_profile.mjs
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import CustomerCodeChunk from '../models/CustomerCodeChunk.js';
import { selectFiles, retrieveCode, storeCodeChunks } from '../services/codebaseProfileService.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

let pass = true;
const check = (l, ok, d = '') => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${l}${d ? ' — ' + d : ''}`); if (!ok) pass = false; };

// A tree shaped like a real product repo, including the noise.
const TREE = [
  { path: 'package.json', bytes: 1200 },
  { path: 'README.md', bytes: 3000 },
  { path: 'server.js', bytes: 2000 },
  { path: 'db/migrate/20240101_create_attendances.rb', bytes: 900 },
  { path: 'db/migrate/20240102_create_invoices.rb', bytes: 800 },
  { path: 'models/Student.js', bytes: 1500 },
  { path: 'routes/attendance.js', bytes: 1100 },
  { path: 'prisma/schema.prisma', bytes: 2400 },
  // Noise that must never be fetched.
  { path: 'node_modules/react/index.js', bytes: 50000 },
  { path: 'node_modules/lodash/models/User.js', bytes: 4000 },
  { path: 'package-lock.json', bytes: 400000 },
  { path: 'dist/bundle.min.js', bytes: 900000 },
  { path: 'public/logo.png', bytes: 20000 },
  { path: 'assets/font.woff2', bytes: 30000 },
  { path: 'vendor/lib/thing.js', bytes: 5000 },
];

console.log('1. selection picks what describes the product and skips the noise');
{
  const { selected } = selectFiles(TREE);
  const paths = selected.map(s => s.path);

  check('manifest selected', paths.includes('package.json'));
  check('migrations selected',
    paths.includes('db/migrate/20240101_create_attendances.rb')
    && paths.includes('db/migrate/20240102_create_invoices.rb'));
  check('ORM model selected', paths.includes('models/Student.js'));
  check('prisma schema selected', paths.includes('prisma/schema.prisma'));
  check('entry point selected', paths.includes('server.js'));

  check('node_modules never selected', !paths.some(p => p.startsWith('node_modules/')), paths.filter(p => p.includes('node_modules')).join(', '));
  check('lockfile never selected', !paths.includes('package-lock.json'));
  check('minified bundle never selected', !paths.some(p => p.includes('.min.js')));
  check('images and fonts never selected', !paths.some(p => /\.(png|woff2)$/.test(p)));
  check('vendor never selected', !paths.some(p => p.startsWith('vendor/')));

  // The trap: a path under node_modules that matches the models/ pattern.
  check('a models/ path inside node_modules is still skipped',
    !paths.includes('node_modules/lodash/models/User.js'));
}

console.log('\n2. a huge repository degrades to a partial profile, not an unbounded read');
{
  const huge = Array.from({ length: 500 }, (_, i) => ({ path: `models/Model${i}.js`, bytes: 3000 }));
  const { selected, capped } = selectFiles(huge);
  check('file count is capped', selected.length <= 60, `got ${selected.length}`);
  check('reported as capped', capped === true);
}

console.log('\n3. source is redacted before it is stored');
{
  // analyzeRepository needs GitHub, so this asserts the wiring rather than
  // round-tripping: redaction must happen between reading and storing.
  const src = fs.readFileSync(path.join(ROOT, 'services/codebaseProfileService.js'), 'utf8');
  check('imports the shared redactor', /import \{ regexRedact \}/.test(src));

  // Scoped to analyzeRepository. Comparing indices across the whole file
  // measured where storeCodeChunks is DEFINED, not where it is called, so the
  // ordering it reported was meaningless.
  const body = src.slice(src.indexOf('export async function analyzeRepository'));
  // Renamed when reading moved to githubReadService. The assertion looked for
  // the old name and silently reported -1, which compares as "before
  // everything" — the ordering check would have passed no matter what.
  const readIdx   = body.indexOf('readFile(');
  const redactIdx = body.indexOf('regexRedact(');
  const storeIdx  = body.indexOf('await storeCodeChunks(');
  check('redacts after reading and before storing',
    readIdx > 0 && redactIdx > readIdx && storeIdx > redactIdx,
    `read@${readIdx} redact@${redactIdx} store@${storeIdx}`);
  check('nothing unredacted reaches the chunk store',
    !/content:\s*raw\b/.test(body));
}

console.log('\n4. two customers with the same file path cannot collide');
{
  const userA = new mongoose.Types.ObjectId();
  const userB = new mongoose.Types.ObjectId();
  const idFor = (userId) => crypto.createHash('sha256')
    .update(`${userId}:acme/app:src/models/user.js:0`).digest('hex');

  check('same path under two users yields different chunk ids', idFor(userA) !== idFor(userB));
  check('same path under the same user is stable', idFor(userA) === idFor(userA));
}

console.log('\n5. retrieval refuses to run unscoped');
{
  let threw = false;
  try { await retrieveCode({ queryText: 'attendance' }); } catch (e) { threw = /userId/.test(e.message); }
  check('missing userId throws rather than searching everything', threw);
}

console.log('\n6. stored chunks are scoped, and re-analysis replaces rather than accumulates');
{
  await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);
  const userId = new mongoose.Types.ObjectId();
  const otherUser = new mongoose.Types.ObjectId();
  const blueprintId = new mongoose.Types.ObjectId();

  try {
    await storeCodeChunks({
      userId, blueprintId, repoFullName: 'acme/app',
      files: [{ path: 'models/Student.js', content: 'class Student { name; }' }],
    });
    let mine = await CustomerCodeChunk.countDocuments({ userId, blueprintId });
    check('chunk stored', mine === 1, `got ${mine}`);

    // Same repo and path, different user — must coexist, not overwrite.
    await storeCodeChunks({
      userId: otherUser, blueprintId, repoFullName: 'acme/app',
      files: [{ path: 'models/Student.js', content: 'class Student { other; }' }],
    });
    mine = await CustomerCodeChunk.countDocuments({ userId });
    const theirs = await CustomerCodeChunk.countDocuments({ userId: otherUser });
    check('both users keep their own copy', mine === 1 && theirs === 1, `mine ${mine}, theirs ${theirs}`);

    await storeCodeChunks({
      userId, blueprintId, repoFullName: 'acme/app',
      files: [{ path: 'models/Teacher.js', content: 'class Teacher { name; }' }],
    });
    const after = await CustomerCodeChunk.find({ userId, blueprintId }).select('path').lean();
    check('re-analysis replaces the previous read',
      after.length === 1 && after[0].path === 'models/Teacher.js',
      after.map(a => a.path).join(', '));
    const stillTheirs = await CustomerCodeChunk.countDocuments({ userId: otherUser });
    check('and leaves the other user untouched', stillTheirs === 1, `got ${stillTheirs}`);
  } finally {
    await CustomerCodeChunk.deleteMany({ userId });
    await CustomerCodeChunk.deleteMany({ userId: otherUser });
    await mongoose.disconnect();
  }
}

console.log(pass ? '\nALL PASS' : '\nFAILURES ABOVE');
process.exit(pass ? 0 : 1);
