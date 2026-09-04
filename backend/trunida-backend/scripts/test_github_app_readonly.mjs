/**
 * Aria's GitHub connection must be read-only.
 *
 * The property under test is not "we chose not to write" — it is that this
 * code path HAS no way to write. The OAuth connection Eame uses carries the
 * classic `repo` scope (read and write on every repository the user owns), and
 * the whole reason a second connection exists is that asking a customer for
 * that on a data-connection screen is not acceptable.
 *
 * Runs without a configured GitHub App: everything here is about what the code
 * offers and refuses, not about talking to GitHub.
 *
 *   node scripts/test_github_app_readonly.mjs
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import mongoose from 'mongoose';
import GithubAppInstallation from '../models/GithubAppInstallation.js';
import * as appService from '../services/githubAppService.js';
import { getAppStatus, listRepos, disconnectApp } from '../controllers/githubAppController.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

let pass = true;
const check = (l, ok, d = '') => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${l}${d ? ' — ' + d : ''}`); if (!ok) pass = false; };

console.log('1. the service exposes no way to write');
{
  const exported = Object.keys(appService);
  const writeish = exported.filter(n => /push|create|write|commit|update|delete|put/i.test(n));
  check('no write-shaped export', writeish.length === 0, `found ${writeish.join(', ')}`);
  check('read helpers are present',
    exported.includes('listInstallationRepos') && exported.includes('getInstallation'),
    exported.join(', '));

  // A POST does exist — minting an installation token — and that is the one
  // legitimate write-verb call. Anything else means the read-only claim has
  // quietly stopped being true.
  const src = fs.readFileSync(path.join(ROOT, 'services/githubAppService.js'), 'utf8');
  const posts = (src.match(/method:\s*'POST'/g) || []).length;
  check('exactly one POST, the token exchange', posts === 1, `found ${posts}`);
  check('no PUT/PATCH/DELETE anywhere', !/method:\s*'(PUT|PATCH|DELETE)'/.test(src));
  check('does not import the OAuth push helpers',
    !/githubApiService|pushFiles|createRepo/.test(src));
}

console.log('\n2. the controller offers no route that writes to GitHub');
{
  const src = fs.readFileSync(path.join(ROOT, 'routes/githubAppRoutes.js'), 'utf8');

  // POST here means "changes something of OURS". /analyze writes a profile to
  // the blueprint and /disconnect drops our record; neither sends anything to
  // GitHub. Counting POSTs would only measure how many routes exist, so the
  // check is on which ones — an unexpected name is the signal worth failing on.
  const posts = [...src.matchAll(/router\.post\('([^']+)'/g)].map(m => m[1]).sort();
  check('POST routes are exactly /analyze and /disconnect',
    JSON.stringify(posts) === JSON.stringify(['/analyze', '/disconnect']), posts.join(', '));
  check('no route pushes anything', !/push|deliver/i.test(src));
}

console.log('\n3. Eame’s write-capable connection is untouched and separate');
{
  const oauth = fs.readFileSync(path.join(ROOT, 'services/githubAuthService.js'), 'utf8');
  check("OAuth app still requests 'repo' for Eame", /GITHUB_SCOPES = \['repo'\]/.test(oauth));

  const appSrc = fs.readFileSync(path.join(ROOT, 'services/githubAppService.js'), 'utf8');
  check('the read-only service never requests a scope', !/GITHUB_SCOPES|scope:/.test(appSrc));

  const model = fs.readFileSync(path.join(ROOT, 'models/GithubAppInstallation.js'), 'utf8');
  check('installation record stores no token',
    !/encryptedAccessToken|accessToken/.test(model));
}

console.log('\n4. status is honest when the server has no GitHub App configured');
{
  await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);
  const userId = new mongoose.Types.ObjectId();

  const app = express();
  app.use((req, _res, next) => { req.user = { _id: userId }; next(); });
  app.get('/status', getAppStatus);
  app.get('/repos', listRepos);
  app.post('/disconnect', express.json(), disconnectApp);
  const server = app.listen(0);
  const base = `http://localhost:${server.address().port}`;

  try {
    const configured = appService.isGithubAppConfigured();
    const s = await (await fetch(`${base}/status`)).json();
    check('reports not connected', s.connected === false, JSON.stringify(s));
    check('reports whether the server is configured at all',
      s.configured === configured,
      `status says ${s.configured}, service says ${configured}`);

    // Without a record there is nothing to read, whatever GitHub would say.
    const r = await fetch(`${base}/repos`);
    check('listing repos without a connection is refused', r.status === 404, `got ${r.status}`);

    await GithubAppInstallation.create({
      userId, installationId: '999999', accountLogin: 'test-co',
      accountType: 'Organization', repositorySelection: 'selected', connectedAt: new Date(),
    });
    const d = await (await fetch(`${base}/disconnect`, { method: 'POST' })).json();
    check('disconnect removes our record', d.disconnected === true);
    check('and says the app must be uninstalled on GitHub to fully revoke',
      /uninstall/i.test(d.note || ''), d.note);
    const left = await GithubAppInstallation.countDocuments({ userId });
    check('nothing left behind', left === 0, `got ${left}`);
  } finally {
    await GithubAppInstallation.deleteMany({ userId });
    server.close();
    await mongoose.disconnect();
  }
}

console.log(pass ? '\nALL PASS' : '\nFAILURES ABOVE');
process.exit(pass ? 0 : 1);
