/**
 * __APP_NAME__ — server entrypoint
 *
 * Part of the fixed runtime: this file is the same for every application Eame
 * builds, and the application itself lives in routes/, controllers/, services/
 * and models/ alongside it.
 *
 * ── Routes are discovered, not listed ──────────────────────────────────────
 *
 * Every file in routes/ is mounted automatically. It used to import two route
 * modules by name, which coupled the entrypoint to one particular application:
 * building without the Jira module produced a server that imported a file the
 * project did not contain and died on startup, and an application Eame wrote
 * for some other use case could not be mounted at all.
 *
 * The mount path comes from the filename: `churnRoutes.js` -> /api/churn,
 * `defectMatchingRoutes.js` -> /api/defect-matching.
 */

import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;
const APP_NAME = process.env.APP_NAME || '__APP_NAME__';

app.use(express.json());
app.use(cors({
  origin: [
    'http://localhost:5500',
    'http://127.0.0.1:5500',
    process.env.FRONTEND_URL,
  ].filter(Boolean),
  credentials: true,
}));

/**
 * The application itself. The UI lives in frontend/ and used to sit in the
 * repository unserved, so opening the address returned a JSON banner instead
 * of the product — the API was running, but nothing was using it.
 */
app.use(express.static(path.join(__dirname, 'frontend')));

/** Health/version, where a machine looks for it rather than at the front door. */
app.get('/api', (req, res) => {
  res.json({ name: APP_NAME, status: 'running', version: '1.0.0', routes: mounted });
});

/**
 * A browser session for the chat UI.
 *
 * Off unless APP_PUBLIC_ACCESS is set. Hosted deployments turn it on so the
 * application simply works when its address is opened; a customer running
 * this themselves leaves it off and puts their own sign-in in front, which
 * is why it is opt-in rather than the default.
 */
app.post('/api/session', (req, res) => {
  if (process.env.APP_PUBLIC_ACCESS !== 'true') {
    return res.status(403).json({ error: 'Public access is disabled for this deployment.' });
  }
  const token = jwt.sign(
    { userId: 'public-session', role: 'user' },
    process.env.JWT_SECRET || 'your_secret_key',
    { expiresIn: '12h' }
  );
  res.json({ token, appName: APP_NAME });
});

/** `defectMatchingRoutes.js` -> `defect-matching`; `jiraRoutes.js` -> `jira`. */
function mountPathFor(filename) {
  return filename
    .replace(/\.m?js$/, '')
    .replace(/Routes$/, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase();
}

const mounted = [];

async function mountRoutes() {
  const dir = path.join(__dirname, 'routes');
  if (!fs.existsSync(dir)) return;

  for (const filename of fs.readdirSync(dir).sort()) {
    if (!/\.m?js$/.test(filename)) continue;
    const name = mountPathFor(filename);
    if (!name) continue;

    const module = await import(new URL('./routes/' + filename, import.meta.url).href);
    const router = module.default;
    // A route file that exports something else is a mistake worth naming.
    // Mounting a non-router throws inside express with a far worse message.
    if (typeof router !== 'function') {
      console.error(`routes/${filename} has no default-exported router — not mounted`);
      continue;
    }
    app.use('/api/' + name, router);
    mounted.push('/api/' + name);
  }
}

async function start() {
  if (!process.env.MONGO_URI) {
    throw new Error('MONGO_URI is missing — copy .env.example to .env and fill it in.');
  }
  await mongoose.connect(process.env.MONGO_URI);
  console.log('MongoDB connected');

  await mountRoutes();
  console.log(mounted.length ? `Mounted: ${mounted.join(', ')}` : 'No routes found in routes/');

  // Registered after the routes, or it would swallow every API path below it.
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(__dirname, 'frontend', 'index.html'));
  });

  app.listen(PORT, () => console.log(`${APP_NAME} listening on port ${PORT}`));
}

start().catch((err) => {
  console.error('Startup failed:', err.message);
  process.exit(1);
});
