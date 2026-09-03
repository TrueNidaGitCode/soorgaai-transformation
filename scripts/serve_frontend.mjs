/**
 * Static server for the frontend during local testing.
 *
 * Port 5500 is not arbitrary — it is in the backend's CORS allow-list
 * (server.js), and frontend/login/config.js points the API at
 * localhost:3000 whenever the page is served from localhost. Serving from
 * any other port gives CORS failures that look like backend bugs.
 *
 *   node scripts/serve_frontend.mjs
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'frontend');
const PORT = Number(process.env.FRONTEND_PORT || 5500);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'text/javascript; charset=utf-8',
  '.mjs':  'text/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2',
};

http.createServer((req, res) => {
  let rel = decodeURIComponent(req.url.split('?')[0]);
  if (rel === '/') rel = '/index.html';

  const file = path.join(ROOT, rel);
  // Never serve outside the frontend directory.
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end('forbidden'); }

  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    return res.end('Not found: ' + rel);
  }

  res.writeHead(200, {
    'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
    // Always revalidate: this exists to test edits, and a cached module is
    // the difference between "the fix did not work" and "you did not load it".
    'Cache-Control': 'no-store',
  });
  res.end(fs.readFileSync(file));
}).listen(PORT, () => {
  console.log(`frontend  http://localhost:${PORT}`);
  console.log(`  app     http://localhost:${PORT}/domain/domain.html`);
  console.log(`  login   http://localhost:${PORT}/login/login.html`);
  console.log(`\nserving ${ROOT}`);
  console.log('backend must be on http://localhost:3000 (config.js + CORS expect it)');
});
