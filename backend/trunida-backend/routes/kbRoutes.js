/**
 * SoorgaAI — Knowledge Base Routes
 *
 * Mounted at: /api/kb
 * Exposes read-only access to the three KB sources used by the
 * Dynamic Assessment Intelligence Engine.
 *
 * TC-API-022: GET /api/kb/maturity-stages
 * TC-API-023: GET /api/kb/focus-areas
 * TC-API-024: GET /api/kb/domain-studies/:domain
 * TC-API-025: GET /api/kb/domain-studies/<unknown>
 */

import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  getMaturityStages,
  getFocusAreas,
  getDomainStudy,
} from '../services/kbRetrievalService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const KB_DIR    = path.resolve(__dirname, '../knowledge-base/domain-studies');

/** Domains with a real .md file in domain-studies/ */
function getAvailableDomains() {
  try {
    return fs
      .readdirSync(KB_DIR)
      .filter(f => f.endsWith('.md'))
      .map(f => f.replace('.md', ''));
  } catch {
    return ['automotive'];
  }
}

const router = express.Router();

// ── GET /api/kb/maturity-stages ───────────────────────────────────────────────
router.get('/maturity-stages', (req, res) => {
  try {
    const data = getMaturityStages();
    return res.status(200).json({
      stages:  data.stages,
      version: data.version || '1.0',
      count:   data.stages.length,
    });
  } catch (err) {
    console.error('KB /maturity-stages error:', err);
    return res.status(500).json({ error: 'ServerError', message: 'Failed to load maturity stages.' });
  }
});

// ── GET /api/kb/focus-areas ───────────────────────────────────────────────────
router.get('/focus-areas', (req, res) => {
  try {
    const data = getFocusAreas();
    return res.status(200).json({
      focusAreas: data.focusAreas,
      version:    data.version || '1.0',
      count:      data.focusAreas.length,
    });
  } catch (err) {
    console.error('KB /focus-areas error:', err);
    return res.status(500).json({ error: 'ServerError', message: 'Failed to load focus areas.' });
  }
});

// ── GET /api/kb/domain-studies/:domain ───────────────────────────────────────
router.get('/domain-studies/:domain', (req, res) => {
  try {
    const { domain } = req.params;
    const key      = domain.toLowerCase().replace(/\s+/g, '-');
    const filePath = path.join(KB_DIR, `${key}.md`);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        error:            'DomainNotFound',
        message:          'Domain study not available for the requested domain.',
        requestedDomain:  domain,
        availableDomains: getAvailableDomains(),
      });
    }

    const content = getDomainStudy(domain);
    return res.status(200).json({
      domain,
      key,
      content,
      version:           '1.0',
      availableDomains:  getAvailableDomains(),
    });
  } catch (err) {
    console.error('KB /domain-studies/:domain error:', err);
    return res.status(500).json({ error: 'ServerError', message: 'Failed to load domain study.' });
  }
});

export default router;
