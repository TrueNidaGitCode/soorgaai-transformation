/**
 * Svarg — Dataset file upload
 *
 * The route in for a company whose data no connector can reach. Padhivu's
 * datasets live in their own PostgreSQL, Stripe and Segment; Confluence and
 * Jira are irrelevant to them, and Aria had nothing to offer but "we will fill
 * this in from analysis". An export they paste in is real evidence instead.
 *
 * ── Why no files are stored ────────────────────────────────────────────────
 *
 * This project has no multer, busboy, formidable or object storage, and
 * Railway's disk is ephemeral — a stored file would silently vanish on the next
 * deploy. Nothing here needs the file itself: every other source type keeps
 * only extracted text, so the browser reads the file and posts its text, and
 * the bytes never leave the user's machine.
 *
 * The result is a LinkedProjectDocument with sourceType 'upload', which is
 * already the generic per-blueprint document shape and is already included in
 * that blueprint's generation context.
 *
 * POST /api/uploads/dataset-file  { blueprintId, datasetName, filename, text }
 */

import TransformationBlueprint from '../models/TransformationBlueprint.js';
import LinkedProjectDocument from '../models/LinkedProjectDocument.js';
import { regexRedact, hashText } from '../services/jiraContentService.js';

/**
 * Text formats only. PDF and Office documents need a parser this project does
 * not have, and a truthful refusal is better than storing the mojibake that
 * results from reading a binary as text.
 */
const ACCEPTED = ['.csv', '.json', '.txt', '.md'];

/** Matches the 2 MB body limit on this route; see routes/uploadRoutes.js. */
const MAX_TEXT_CHARS = 2_000_000;

function extensionOf(filename) {
  const i = String(filename || '').lastIndexOf('.');
  return i === -1 ? '' : filename.slice(i).toLowerCase();
}

export async function uploadDatasetFile(req, res) {
  try {
    const { blueprintId, datasetName, filename, text } = req.body || {};

    if (!blueprintId || !datasetName || !filename || typeof text !== 'string') {
      return res.status(400).json({ error: 'blueprintId, datasetName, filename and text are all required.' });
    }

    const ext = extensionOf(filename);
    if (!ACCEPTED.includes(ext)) {
      return res.status(400).json({
        error: `${ext || 'That file type'} is not supported. Upload a ${ACCEPTED.join(', ')} export.`,
      });
    }
    if (!text.trim()) {
      return res.status(400).json({ error: 'That file appears to be empty.' });
    }
    if (text.length > MAX_TEXT_CHARS) {
      return res.status(413).json({ error: 'That file is too large. Upload a smaller export or a sample.' });
    }

    // Ownership, not just existence: without the userId a caller could attach
    // their file to somebody else's blueprint and have it read into that
    // blueprint's generation context.
    const blueprint = await TransformationBlueprint
      .findOne({ _id: blueprintId, userId: req.user._id })
      .select('_id')
      .lean();
    if (!blueprint) return res.status(404).json({ error: 'Blueprint not found.' });

    // An export a company keeps internally is more likely to carry personal
    // data than a public web page, not less — same redaction pass, no
    // exemption for "they uploaded it themselves".
    const { redactedText, redactionNotes } = regexRedact(text);

    // Re-uploading for the same dataset replaces the previous file rather than
    // accumulating rows the user cannot see or remove.
    const sourceId = `upload:${datasetName}`;

    const doc = await LinkedProjectDocument.findOneAndUpdate(
      { blueprintId, sourceId },
      {
        blueprintId,
        linkedByUserId:   req.user._id,
        sourceType:       'upload',
        sourceId,
        title:            filename,
        rawText:          redactedText,
        contentHash:      hashText(redactedText),
        redactionApplied: redactionNotes.length > 0,
        redactionCount:   redactionNotes.length,
        redactionNotes,
        extractionStatus: 'extracted',
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();

    console.log(`[upload] ${blueprintId}: "${filename}" for dataset "${datasetName}"`
      + ` — ${redactedText.length} chars, ${redactionNotes.length} redactions`);

    return res.json({
      datasetName,
      filename,
      characters:     redactedText.length,
      redactionCount: redactionNotes.length,
      documentId:     String(doc._id),
    });

  } catch (err) {
    console.error('uploadDatasetFile error:', err);
    return res.status(500).json({ error: 'Failed to store that file.' });
  }
}

/**
 * GET /api/uploads/dataset-files/:blueprintId
 * Which datasets already have a file, so Aria can render their status without
 * the client having to remember what it uploaded.
 */
export async function listDatasetFiles(req, res) {
  try {
    const { blueprintId } = req.params;

    const blueprint = await TransformationBlueprint
      .findOne({ _id: blueprintId, userId: req.user._id })
      .select('_id')
      .lean();
    if (!blueprint) return res.status(404).json({ error: 'Blueprint not found.' });

    const docs = await LinkedProjectDocument
      .find({ blueprintId, sourceType: 'upload' })
      .select('sourceId title updatedAt redactionCount')
      .lean();

    return res.json({
      uploads: docs.map(d => ({
        datasetName:    d.sourceId.replace(/^upload:/, ''),
        filename:       d.title,
        uploadedAt:     d.updatedAt,
        redactionCount: d.redactionCount,
      })),
    });
  } catch (err) {
    console.error('listDatasetFiles error:', err);
    return res.status(500).json({ error: 'Failed to load uploaded files.' });
  }
}
