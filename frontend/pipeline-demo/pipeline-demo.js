/**
 * Svarg — Pipeline Demonstration
 *
 * Cob -> Aria -> Arth -> Eame -> Yusu for the real ORU Pre-analysis
 * engagement. Stages 1/2/3/5 are static, labeled content (live, real
 * generation output where noted; simulated/reused/human-delivered
 * elsewhere). Stage 4 (Eame) embeds the real, working defect-matching
 * form via the shared initDefectMatching() from that page's own module.
 */

import { requireAuth, initDefectMatching } from '../defect-matching/defect-matching.js';

document.addEventListener('DOMContentLoaded', () => {
  if (!requireAuth()) return;
  initDefectMatching();
});
