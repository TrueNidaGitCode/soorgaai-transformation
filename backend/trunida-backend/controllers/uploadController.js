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
import { generateSampleDataset } from '../services/syntheticDatasetService.js';

/**
 * One of the blueprint's required datasets, by name.
 *
 * Read from the blueprint rather than trusted from the request: a caller who
 * could name any dataset could have Svarg generate data for something this
 * blueprint never asked for, and that row would then be read into its
 * generation context as though Aria had identified it.
 *
 * Mirrors readDatasets() in services/eameSpec.js — the same section of the
 * data-readiness domain is the single source of what a blueprint needs.
 */
function findDataset(blueprint, datasetName) {
  const domain = (blueprint?.domains || []).find(d => d.domainId === 'data-readiness');
  for (const cap of domain?.capabilities || []) {
    for (const section of cap.sections || []) {
      const match = (section.brief?.datasets || []).find(d => d?.name === datasetName);
      if (match) {
        return {
          name: String(match.name || '').trim(),
          purpose: String(match.purpose || '').trim(),
          typicalSource: String(match.typicalSource || '').trim(),
        };
      }
    }
  }
  return null;
}

/**
 * One CSV line into cells, respecting quotes.
 *
 * A plain split(',') tears a generated row apart at the first comma inside a
 * quoted note — and the generator is asked for realistic values, so quoted
 * commas are the normal case, not the edge one.
 */
function splitCsvLine(line) {
  const cells = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { cells.push(cur); cur = ''; }
    else cur += ch;
  }
  cells.push(cur);
  return cells.map(c => c.trim());
}

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
      .find({ blueprintId, sourceType: { $in: ['upload', 'synthetic'] } })
      .select('sourceId sourceType title datasetName updatedAt redactionCount synthetic')
      .lean();

    // datasetName is what a file was found to serve; the path is what it is.
    // Reporting both lets the screen show which dataset is covered AND which
    // files could not be placed, rather than silently dropping the latter.
    //
    // Samples are returned in their OWN list, not merged into uploads. The
    // whole point of generated data is that it is distinguishable from the
    // customer's own, and a single list would put the distinction back in the
    // hands of whoever remembers to check a flag.
    return res.json({
      uploads: docs.filter(d => d.sourceType === 'upload').map(d => ({
        path:           d.sourceId.replace(/^upload:/, ''),
        filename:       d.title,
        datasetName:    d.datasetName || '',
        uploadedAt:     d.updatedAt,
        redactionCount: d.redactionCount,
      })),
      samples: docs.filter(d => d.sourceType === 'synthetic').map(d => ({
        datasetName: d.datasetName || '',
        rowCount:    d.synthetic?.rowCount || 0,
        generatedAt: d.synthetic?.generatedAt || d.updatedAt,
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

// ── Sample data ──────────────────────────────────────────────────────────────

/**
 * POST /api/uploads/synthetic-dataset  { blueprintId, datasetName }
 *
 * Generate a representative sample for a dataset the customer does not have.
 * See services/syntheticDatasetService.js for why this does not contradict
 * Eame's "do not invent data" rule.
 */
export async function generateSyntheticDataset(req, res) {
  try {
    const { blueprintId, datasetName } = req.body || {};
    if (!blueprintId || !datasetName) {
      return res.status(400).json({ error: 'blueprintId and datasetName are both required.' });
    }

    // Ownership, not existence — same reason as uploadDatasetFile: without the
    // userId a caller could attach generated rows to somebody else's blueprint
    // and have them read into that blueprint's generation context.
    const blueprint = await TransformationBlueprint
      .findOne({ _id: blueprintId, userId: req.user._id })
      .select('_id businessObjective industry companyName domains')
      .lean();
    if (!blueprint) return res.status(404).json({ error: 'Blueprint not found.' });

    // Generated data must never displace the customer's own. If they have
    // uploaded a real export for this dataset, there is nothing to invent.
    const realUpload = await LinkedProjectDocument
      .findOne({ blueprintId, sourceType: 'upload', datasetName })
      .select('_id title').lean();
    if (realUpload) {
      return res.status(409).json({
        error: `You have already uploaded "${realUpload.title}" for this dataset. `
          + 'Sample data is only for datasets you do not have yet.',
        code: 'real_data_exists',
      });
    }

    const dataset = findDataset(blueprint, datasetName);
    if (!dataset) {
      return res.status(404).json({ error: 'That dataset is not part of this blueprint.' });
    }

    const { csv, rowCount, columns, model } = await generateSampleDataset({
      dataset,
      objective:   blueprint.businessObjective || '',
      industry:    blueprint.industry || '',
      companyName: blueprint.companyName || '',
    });

    // No redaction pass. uploadDatasetFile redacts because a customer's export
    // can carry personal data; nothing here came from a person, and a pass over
    // invented rows can only produce false positives.
    const sourceId = `synthetic:${datasetName}`;
    const title = `${datasetName} — sample data (generated)`;

    const doc = await LinkedProjectDocument.findOneAndUpdate(
      { blueprintId, sourceId },
      {
        blueprintId,
        linkedByUserId:   req.user._id,
        sourceType:       'synthetic',
        sourceId,
        title,
        datasetName,
        rawText:          csv,
        summary:          `Generated sample data illustrating the shape of "${datasetName}". `
                          + `${rowCount} invented rows, columns: ${columns.join(', ')}. `
                          + 'The customer does not have this data.',
        contentHash:      hashText(csv),
        synthetic:        { generatedAt: new Date(), model, rowCount },
        extractionStatus: 'extracted',
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();

    console.log(`[synthetic] ${blueprintId}: "${datasetName}" — ${rowCount} sample rows via ${model || 'default'}`);

    return res.json({
      datasetName, rowCount, columns,
      generatedAt: doc.synthetic?.generatedAt,
      documentId:  String(doc._id),
    });

  } catch (err) {
    console.error('generateSyntheticDataset error:', err.message);
    return res.status(500).json({ error: err.message || 'Could not generate sample data.' });
  }
}

/** DELETE /api/uploads/synthetic-dataset/:blueprintId/:datasetName */
export async function removeSyntheticDataset(req, res) {
  try {
    const { blueprintId, datasetName } = req.params;

    const blueprint = await TransformationBlueprint
      .findOne({ _id: blueprintId, userId: req.user._id })
      .select('_id').lean();
    if (!blueprint) return res.status(404).json({ error: 'Blueprint not found.' });

    // sourceType is in the filter as well as the id: a bug in the id format
    // must not be able to delete a real upload.
    const result = await LinkedProjectDocument.deleteOne({
      blueprintId, sourceType: 'synthetic', sourceId: `synthetic:${datasetName}`,
    });

    return res.json({ datasetName, removed: result.deletedCount > 0 });
  } catch (err) {
    console.error('removeSyntheticDataset error:', err.message);
    return res.status(500).json({ error: 'Could not remove the sample data.' });
  }
}

/**
 * GET /api/uploads/synthetic-dataset/:blueprintId/:datasetName
 *
 * The generated rows themselves. The screen could report "20 generated rows"
 * but not show them, which asks a customer to take on trust the one thing this
 * feature exists to let them check — whether the shape is actually right for
 * their business.
 */
export async function readSyntheticDataset(req, res) {
  try {
    const { blueprintId, datasetName } = req.params;

    const blueprint = await TransformationBlueprint
      .findOne({ _id: blueprintId, userId: req.user._id })
      .select('_id').lean();
    if (!blueprint) return res.status(404).json({ error: 'Blueprint not found.' });

    const doc = await LinkedProjectDocument.findOne({
      blueprintId, sourceType: 'synthetic', sourceId: `synthetic:${datasetName}`,
    }).select('rawText synthetic datasetName').lean();
    if (!doc) return res.status(404).json({ error: 'No sample data for that dataset.' });

    const lines = String(doc.rawText || '').split(/\r?\n/).filter(l => l.trim());
    return res.json({
      datasetName: doc.datasetName,
      csv:         doc.rawText || '',
      header:      lines[0] ? splitCsvLine(lines[0]) : [],
      rows:        lines.slice(1).map(splitCsvLine),
      rowCount:    doc.synthetic?.rowCount || lines.length - 1,
      generatedAt: doc.synthetic?.generatedAt || null,
    });
  } catch (err) {
    console.error('readSyntheticDataset error:', err.message);
    return res.status(500).json({ error: 'Could not read the sample data.' });
  }
}
