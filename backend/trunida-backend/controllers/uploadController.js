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
import { classifyUploads } from '../services/uploadClassifierService.js';

/**
 * Text formats only. PDF and Office documents need a parser this project does
 * not have, and a truthful refusal is better than storing the mojibake that
 * results from reading a binary as text.
 */
const ACCEPTED = [
  '.csv', '.tsv', '.json', '.txt', '.md',
  // Schema files are data descriptions, and a blueprint asks for them by name
  // — one of the first customer's required datasets is literally "Data Schema
  // Definitions … Prisma schema". Rejecting the format that satisfies a
  // required dataset made the list narrower than the product's own questions.
  '.sql', '.prisma', '.yaml', '.yml', '.xml',
];

/** Matches the 2 MB body limit on this route; see routes/uploadRoutes.js. */
const MAX_TEXT_CHARS = 2_000_000;

/** Per request. The browser chunks a folder into several calls. */
const MAX_FILES_PER_REQUEST = 20;

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
        datasetName,
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
      .select('sourceId title datasetName updatedAt redactionCount')
      .lean();

    // datasetName is what a file was found to serve; the path is what it is.
    // Reporting both lets the screen show which dataset is covered AND which
    // files could not be placed, rather than silently dropping the latter.
    return res.json({
      uploads: docs.map(d => ({
        path:           d.sourceId.replace(/^upload:/, ''),
        filename:       d.title,
        datasetName:    d.datasetName || '',
        uploadedAt:     d.updatedAt,
        redactionCount: d.redactionCount,
      })),
    });
  } catch (err) {
    console.error('listDatasetFiles error:', err);
    return res.status(500).json({ error: 'Failed to load uploaded files.' });
  }
}

/**
 * POST /api/uploads/folder  { blueprintId, files: [{ path, text }] }
 *
 * A folder's worth of exports at once, with no dataset named. Nobody has one
 * clean file per required dataset; they have a folder, so Svarg takes the
 * folder and works out what is in it (see uploadClassifierService).
 *
 * Files arrive in batches from the browser — the body limit is per request, so
 * the client chunks and calls this repeatedly. Each call stores what it is
 * given; classification runs once at the end, over everything.
 */
export async function uploadFolder(req, res) {
  try {
    const { blueprintId, files } = req.body || {};
    if (!blueprintId || !Array.isArray(files) || !files.length) {
      return res.status(400).json({ error: 'blueprintId and a non-empty files array are required.' });
    }
    if (files.length > MAX_FILES_PER_REQUEST) {
      return res.status(400).json({ error: `Send at most ${MAX_FILES_PER_REQUEST} files per request.` });
    }

    const blueprint = await TransformationBlueprint
      .findOne({ _id: blueprintId, userId: req.user._id })
      .select('_id')
      .lean();
    if (!blueprint) return res.status(404).json({ error: 'Blueprint not found.' });

    const stored = [];
    const rejected = [];

    for (const f of files) {
      const filePath = String(f?.path || '').slice(0, 400);
      const text = typeof f?.text === 'string' ? f.text : '';
      const ext = extensionOf(filePath);

      if (!filePath) { continue; }
      if (!ACCEPTED.includes(ext)) { rejected.push({ path: filePath, reason: 'unsupported type' }); continue; }
      if (!text.trim())            { rejected.push({ path: filePath, reason: 'empty' }); continue; }
      if (text.length > MAX_TEXT_CHARS) { rejected.push({ path: filePath, reason: 'too large' }); continue; }

      const { redactedText, redactionNotes } = regexRedact(text);

      await LinkedProjectDocument.findOneAndUpdate(
        { blueprintId, sourceId: `upload:${filePath}` },
        {
          blueprintId,
          linkedByUserId:   req.user._id,
          sourceType:       'upload',
          sourceId:         `upload:${filePath}`,
          title:            filePath.split('/').pop(),
          // Left empty until classification runs. Unclassified is a real state.
          datasetName:      '',
          rawText:          redactedText,
          contentHash:      hashText(redactedText),
          redactionApplied: redactionNotes.length > 0,
          redactionCount:   redactionNotes.length,
          redactionNotes,
          extractionStatus: 'extracted',
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      stored.push(filePath);
    }

    console.log(`[upload] ${blueprintId}: stored ${stored.length}, rejected ${rejected.length}`);
    return res.json({ stored: stored.length, rejected });
  } catch (err) {
    console.error('uploadFolder error:', err);
    return res.status(500).json({ error: 'Failed to store those files.' });
  }
}

/**
 * POST /api/uploads/classify  { blueprintId }
 *
 * Works out which required dataset each uploaded file serves. Run after the
 * uploads finish, over everything stored — classifying per batch would deny
 * the model the chance to see that two files serve the same dataset.
 */
export async function classifyUploadedFiles(req, res) {
  try {
    const { blueprintId } = req.body || {};
    if (!blueprintId) return res.status(400).json({ error: 'blueprintId is required.' });

    const blueprint = await TransformationBlueprint
      .findOne({ _id: blueprintId, userId: req.user._id })
      .select('domains')
      .lean();
    if (!blueprint) return res.status(404).json({ error: 'Blueprint not found.' });

    const datasets = (blueprint.domains || [])
      .flatMap(d => d.capabilities || [])
      .flatMap(c => c.sections || [])
      .flatMap(s => s.brief?.datasets || [])
      .map(d => ({ name: d.name, purpose: d.purpose }));

    const docs = await LinkedProjectDocument
      .find({ blueprintId, sourceType: 'upload' })
      .select('sourceId rawText')
      .lean();
    if (!docs.length) return res.json({ classified: 0, unclassified: 0 });

    const files = docs.map(d => ({
      path: d.sourceId.replace(/^upload:/, ''),
      content: d.rawText || '',
    }));

    const matches = await classifyUploads(files, datasets);

    // Reset first: a re-run must be able to UNSET a match the model no longer
    // stands behind, not just add new ones.
    await LinkedProjectDocument.updateMany(
      { blueprintId, sourceType: 'upload' },
      { $set: { datasetName: '' } }
    );
    for (const m of matches) {
      await LinkedProjectDocument.updateOne(
        { blueprintId, sourceId: `upload:${m.file}` },
        { $set: { datasetName: m.dataset } }
      );
    }

    console.log(`[upload] ${blueprintId}: classified ${matches.length} of ${files.length}`);
    return res.json({
      classified: matches.length,
      unclassified: files.length - matches.length,
      matches,
    });
  } catch (err) {
    console.error('classifyUploadedFiles error:', err);
    return res.status(500).json({ error: 'Failed to classify the uploaded files.' });
  }
}
