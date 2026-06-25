/**
 * SoorgaAI — Blueprint PDF Export Service
 *
 * Renders a Company Blueprint into an executive-ready PDF using Puppeteer
 * (headless Chrome). All SVG section builders execute in the browser context
 * so the PDF is pixel-identical to the web UI.
 *
 * Public API:
 *   generateBlueprintPDF(blueprint) → Promise<Buffer>
 */

import puppeteer from 'puppeteer-core';
import { buildBlueprintHTML } from './pdfTemplateService.js';

// Use system Chromium installed by nixpacks on Railway; override via env var if needed
const CHROME_EXECUTABLE =
  process.env.PUPPETEER_EXECUTABLE_PATH ||
  process.env.CHROME_BIN ||
  'chromium';

export async function generateBlueprintPDF(blueprint) {
  const html = buildBlueprintHTML(blueprint);

  const browser = await puppeteer.launch({
    executablePath: CHROME_EXECUTABLE,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
    ],
    headless: true,
  });

  try {
    const page = await browser.newPage();

    // setContent waits for DOM ready + synchronous scripts to execute
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 60000 });

    const company = (blueprint.companyName || 'Company').replace(/[^a-zA-Z0-9\s]/g, '');

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: '<span></span>',
      footerTemplate: `
        <div style="
          width: 100%;
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0 20mm;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          font-size: 8px;
          color: rgba(150,150,180,0.65);
        ">
          <span>${company}</span>
          <span class="pageNumber"></span>
          <span>CONFIDENTIAL</span>
        </div>`,
      margin: { top: '0', right: '0', bottom: '12mm', left: '0' },
    });

    return Buffer.from(pdfBuffer);
  } finally {
    await browser.close();
  }
}
