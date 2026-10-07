// Build the one-page proposal PDF and its preview image from the HTML source.
//
//   node scripts/make_one_pager.mjs            (from the repo root)
//
// Source:  docs/proposals/recurring-services-one-page.html
// Output:  frontend/admin/proposals/recurring-services-one-page-proposal.pdf
//          frontend/admin/proposals/recurring-services-one-page-proposal.png
//
// The preview is an image rather than the PDF in a frame because vercel.json
// sends X-Frame-Options: DENY, and a framed PDF draws as an empty box.
import { spawnSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'docs', 'proposals', 'recurring-services-one-page.html');
const OUT = path.join(ROOT, 'frontend', 'admin', 'proposals', 'recurring-services-one-page-proposal');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const url = pathToFileURL(SRC).href;

const run = (args) => {
  const r = spawnSync(CHROME, ['--headless', '--disable-gpu', '--virtual-time-budget=8000', ...args, url], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(r.stderr || `chrome exited ${r.status}`);
};

run(['--no-pdf-header-footer', `--print-to-pdf=${OUT}.pdf`]);
// A4 at 96 dpi is 794 × 1123; drawn at twice that so it reads on a retina screen.
run(['--window-size=794,1123', '--force-device-scale-factor=2', '--hide-scrollbars', `--screenshot=${OUT}.png`]);

for (const ext of ['pdf', 'png']) {
  const f = `${OUT}.${ext}`;
  console.log(`${path.relative(ROOT, f)}  ${(fs.statSync(f).size / 1024).toFixed(0)} KB`);
}
