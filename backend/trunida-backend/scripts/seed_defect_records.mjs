/**
 * Seed synthetic DefectRecords + matching KnowledgeChunks for the
 * "Retrieval-Augmented Semantic Matching for Defects" walking skeleton.
 *
 * These are SYNTHETIC, representative OTA ECU flashing failure scenarios —
 * not real VW Group / CARIAD / KPIT data, which we have no access to. Each
 * record's sourceSystem field says "(sample)" to keep that visible in the
 * data itself. Idempotent — safe to re-run.
 *
 * Usage:
 *   MONGO_URI="mongodb+srv://..." node scripts/seed_defect_records.mjs
 */

import mongoose from 'mongoose';
import DefectRecord from '../models/DefectRecord.js';
import { syncDefectRecordToChunk } from '../services/hybridRetrievalService.js';

const ORG_NAME  = 'KPIT';
const INDUSTRY  = 'Automotive';
const SYSTEM    = 'OTA ECU Flashing';

const RECORDS = [
  // ── Checksum mismatch family ──────────────────────────────────────────
  {
    defectId: 'DEF-OTA-0001',
    title: 'Checksum validation failure after flash — corrupted binary',
    symptom: 'ECU rejected the firmware image after flashing completed; post-flash checksum verification returned a mismatch against the expected value.',
    rootCause: 'The firmware binary was corrupted during transfer to the flashing tool, before the OTA session began — a storage-layer bit error on the build artifact, not a transmission issue.',
    resolution: 'Re-generated the firmware image from the build pipeline, verified its checksum against the release manifest before upload, and re-flashed successfully.',
    component: 'Checksum Validation', severity: 'high',
    sourceSystem: 'Jira Defect Management (sample)',
    keywords: ['checksum', 'corrupted binary', 'flash failure'],
  },
  {
    defectId: 'DEF-OTA-0002',
    title: 'Checksum mismatch on ECU firmware — truncated file',
    symptom: 'Flashing tool reported a checksum mismatch immediately after transfer; the transferred file size was smaller than the expected package size.',
    rootCause: 'A disk write error on the flashing workstation truncated the firmware package before it was written to the transfer medium.',
    resolution: 'Re-copied the firmware package from a verified source, confirmed file size and checksum matched the release manifest, re-flashed successfully.',
    component: 'Checksum Validation', severity: 'medium',
    sourceSystem: 'Jira Defect Management (sample)',
    keywords: ['checksum', 'truncated file', 'flash failure'],
  },
  {
    defectId: 'DEF-OTA-0003',
    title: 'Post-flash checksum verification failed — algorithm version mismatch',
    symptom: 'Checksum verification failed even though the transferred file was confirmed byte-identical to the source; manual recomputation of the checksum produced a different value than the tool reported.',
    rootCause: 'The flashing tool used an older checksum algorithm version than the one the target ECU bootloader expected, producing a spurious mismatch on an otherwise valid image.',
    resolution: 'Updated the flashing tool to the current checksum algorithm version matching the bootloader spec; re-verification passed without re-flashing.',
    component: 'Checksum Validation', severity: 'low',
    sourceSystem: 'Confluence Engineering Wiki (sample)',
    keywords: ['checksum', 'algorithm mismatch', 'bootloader'],
  },

  // ── Timeout during flash family ───────────────────────────────────────
  {
    defectId: 'DEF-OTA-0004',
    title: 'Flash procedure timed out mid-transfer — CAN bus congestion',
    symptom: 'The flashing session terminated with a timeout error approximately 60% through the transfer; no error was reported by the ECU itself.',
    rootCause: 'High CAN bus load from concurrent diagnostic traffic during the flashing window slowed the transfer below the tool\'s timeout threshold.',
    resolution: 'Scheduled flashing sessions during low-traffic diagnostic windows and increased the tool\'s timeout threshold for high-load scenarios.',
    component: 'Transfer Timing', severity: 'medium',
    sourceSystem: 'Jira Defect Management (sample)',
    keywords: ['timeout', 'CAN bus congestion', 'transfer'],
  },
  {
    defectId: 'DEF-OTA-0005',
    title: 'ECU flash timeout — vehicle network sleep mode mid-session',
    symptom: 'Flashing session timed out with no data transferred after an initial handshake; the vehicle network appeared unresponsive partway through.',
    rootCause: 'The vehicle\'s network entered sleep mode mid-session because no keep-alive signal was sent during a pause in the flashing tool\'s transfer loop.',
    resolution: 'Added a periodic network keep-alive signal to the flashing tool\'s transfer loop to prevent sleep-mode entry during active sessions.',
    component: 'Network Session Management', severity: 'high',
    sourceSystem: 'Flash Log Repository (sample)',
    keywords: ['timeout', 'sleep mode', 'network session'],
  },
  {
    defectId: 'DEF-OTA-0006',
    title: 'Flashing session timeout on gateway ECU — missing keep-alive',
    symptom: 'Gateway ECU flashing session dropped with a diagnostic session timeout error roughly two minutes after starting.',
    rootCause: 'The flashing tester did not send the required diagnostic session keep-alive message at the expected interval, causing the ECU to exit the extended diagnostic session.',
    resolution: 'Corrected the tester configuration to send keep-alive messages at the ECU-specified interval; flashing completed successfully on retry.',
    component: 'Network Session Management', severity: 'medium',
    sourceSystem: 'Jira Defect Management (sample)',
    keywords: ['timeout', 'keep-alive', 'diagnostic session', 'gateway'],
  },

  // ── Version incompatibility family ──────────────────────────────────────
  {
    defectId: 'DEF-OTA-0007',
    title: 'Flash rejected — hardware revision incompatible with firmware version',
    symptom: 'ECU immediately rejected the flash request during the compatibility pre-check, before any data transfer began.',
    rootCause: 'The target ECU was an earlier hardware revision that the new firmware version does not support — the firmware package was built for a newer hardware variant only.',
    resolution: 'Identified the correct firmware variant for the earlier hardware revision from the release matrix and flashed that variant instead.',
    component: 'Version Compatibility', severity: 'high',
    sourceSystem: 'Polarion Requirements Repository (sample)',
    keywords: ['version incompatibility', 'hardware revision'],
  },
  {
    defectId: 'DEF-OTA-0008',
    title: 'Version compatibility check failed — bootloader too old for package format',
    symptom: 'Flash tool reported a package format error during the pre-check; the ECU\'s current bootloader version was logged alongside the error.',
    rootCause: 'The target ECU was running a bootloader version predating support for the newer OTA package format, so it could not parse the package header.',
    resolution: 'Staged a bootloader update as a prerequisite step before the main firmware flash, per the release notes\' documented upgrade path.',
    component: 'Version Compatibility', severity: 'high',
    sourceSystem: 'Confluence Engineering Wiki (sample)',
    keywords: ['version incompatibility', 'bootloader', 'package format'],
  },
  {
    defectId: 'DEF-OTA-0009',
    title: 'ECU refused update — cross-ECU dependency version not met',
    symptom: 'Flash request was refused with a dependency-check error referencing a different ECU\'s software version.',
    rootCause: 'The new firmware requires a minimum software version on a dependent ECU (a cross-component interface contract) that had not yet been updated in this vehicle.',
    resolution: 'Sequenced the flash campaign to update the dependent ECU first, then re-attempted the original flash, which passed the dependency check.',
    component: 'Version Compatibility', severity: 'medium',
    sourceSystem: 'Polarion Requirements Repository (sample)',
    keywords: ['version incompatibility', 'cross-ECU dependency'],
  },

  // ── Connectivity loss mid-flash family ────────────────────────────────
  {
    defectId: 'DEF-OTA-0010',
    title: 'Connectivity lost during OTA download — cellular signal drop',
    symptom: 'OTA package download stalled and then failed partway through; the vehicle\'s telematics unit logged a loss of cellular signal at the same timestamp.',
    rootCause: 'A cellular signal drop during download corrupted the in-progress package transfer, and the download did not resume automatically.',
    resolution: 'Enabled resumable/chunked download support in the OTA client so an interrupted transfer resumes from the last verified chunk instead of restarting.',
    component: 'Connectivity Layer', severity: 'medium',
    sourceSystem: 'Flash Log Repository (sample)',
    keywords: ['connectivity loss', 'cellular', 'download interrupted'],
  },
  {
    defectId: 'DEF-OTA-0011',
    title: 'Vehicle lost Wi-Fi connection during flash — fallback to previous firmware',
    symptom: 'Flash was interrupted partway through; the vehicle automatically fell back to running the previous firmware version rather than being left in a partial state.',
    rootCause: 'The vehicle\'s Wi-Fi connection dropped during an over-the-air update performed at a location with weak signal, triggering the safe-fallback mechanism as designed.',
    resolution: 'No defect in the fallback behavior itself (working as intended); advised re-attempting the update in a location with stronger Wi-Fi signal.',
    component: 'Connectivity Layer', severity: 'low',
    sourceSystem: 'Jira Defect Management (sample)',
    keywords: ['connectivity loss', 'wifi', 'fallback firmware'],
  },
  {
    defectId: 'DEF-OTA-0012',
    title: 'OTA session dropped due to power-mode transition during download',
    symptom: 'Download session terminated unexpectedly; vehicle logs show a transition to a lower power mode at the same time as the disconnect.',
    rootCause: 'The vehicle entered a lower power mode mid-download because the OTA client did not request a power-mode inhibit for the duration of the transfer.',
    resolution: 'Added a power-mode inhibit request to the OTA client for the duration of active downloads, released once the transfer completes or is safely paused.',
    component: 'Connectivity Layer', severity: 'medium',
    sourceSystem: 'Flash Log Repository (sample)',
    keywords: ['connectivity loss', 'power mode', 'download interrupted'],
  },

  // ── Rollback failure family ──────────────────────────────────────────
  {
    defectId: 'DEF-OTA-0013',
    title: 'Rollback to previous firmware failed after failed flash attempt',
    symptom: 'After an initial flash attempt failed, the ECU\'s automatic rollback to the previous firmware also failed, leaving the ECU non-responsive to normal diagnostic requests.',
    rootCause: 'The backup partition holding the previous firmware image was corrupted, so the rollback mechanism had no valid image to restore.',
    resolution: 'Recovered the ECU via the hardware-level recovery procedure, then re-flashed and verified the backup partition\'s integrity before returning the ECU to service.',
    component: 'Rollback Mechanism', severity: 'critical',
    sourceSystem: 'Jira Defect Management (sample)',
    keywords: ['rollback failure', 'backup partition', 'ECU recovery'],
  },
  {
    defectId: 'DEF-OTA-0014',
    title: 'ECU stuck in bootloader after failed rollback — invalid recovery image',
    symptom: 'ECU remained in bootloader mode after a failed flash and subsequent rollback attempt; it did not return to normal operating mode.',
    rootCause: 'The recovery image used by the rollback mechanism failed its own checksum validation, so the bootloader halted rather than risk loading a corrupted image.',
    resolution: 'Re-provisioned the ECU\'s recovery image from a verified source via the bench-level recovery tool, restoring normal boot.',
    component: 'Rollback Mechanism', severity: 'critical',
    sourceSystem: 'Flash Log Repository (sample)',
    keywords: ['rollback failure', 'recovery image', 'bootloader stuck'],
  },
];

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to MongoDB');

  for (const r of RECORDS) {
    const record = {
      ...r,
      orgName: ORG_NAME,
      industry: INDUSTRY,
      system: SYSTEM,
    };

    await DefectRecord.findOneAndUpdate(
      { defectId: record.defectId },
      record,
      { upsert: true, new: true }
    );

    const { inserted, skipped } = await syncDefectRecordToChunk(record);
    console.log(`${record.defectId} — upserted (chunk: ${inserted ? 'embedded' : 'unchanged'})`);
  }

  console.log(`\nDone. ${RECORDS.length} defect records seeded/updated.`);
  await mongoose.disconnect();
}

run().catch(err => {
  console.error('Script failed:', err.message);
  process.exit(1);
});
