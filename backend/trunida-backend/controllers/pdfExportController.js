/**
 * SoorgaAI — PDF Export Controller
 *
 * GET /api/strategy-canvas/company-blueprint/export-pdf
 *
 * Fetches the user's latest Company Blueprint and streams a PDF response.
 * The PDF is executive-ready and contains no platform branding.
 */

import CompanyBlueprint     from '../models/CompanyBlueprint.js';
import UserProfile           from '../models/UserProfile.js';
import { generateBlueprintPDF } from '../services/pdfExportService.js';

export async function exportBlueprintPDF(req, res) {
  try {
    const userId = req.user._id;

    const [blueprint, profile] = await Promise.all([
      CompanyBlueprint.findOne({ userId }).sort({ createdAt: -1 }).lean(),
      UserProfile.findOne({ userId }).lean(),
    ]);

    if (!blueprint) {
      return res.status(404).json({ error: 'No blueprint found.' });
    }

    // Backfill companyName from UserProfile for blueprints created before this field was set
    if (!blueprint.companyName && profile?.orgName) {
      blueprint.companyName = profile.orgName;
    }

    const pdfBuffer = await generateBlueprintPDF(blueprint);

    const company  = (blueprint.companyName || 'Company').replace(/[^a-zA-Z0-9]/g, '_');
    const version  = blueprint.version || '1.0';
    const filename = `${company}_AI_Strategy_Blueprint_v${version}.pdf`;

    res.setHeader('Content-Type',        'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length',      pdfBuffer.length);
    res.end(pdfBuffer);

  } catch (err) {
    console.error('[pdfExport] Error:', err.message);
    res.status(500).json({ error: 'Failed to generate PDF export.' });
  }
}
