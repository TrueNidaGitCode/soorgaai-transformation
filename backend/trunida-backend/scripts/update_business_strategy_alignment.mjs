/**
 * Write Business Strategy Alignment sections to KPIT Enterprise Blueprint.
 *
 * Usage:
 *   MONGO_URI="mongodb+srv://..." node scripts/update_business_strategy_alignment.mjs
 */

import mongoose from 'mongoose';
import { updateCapabilitySections } from '../services/enterpriseBlueprintService.js';

const BUSINESS_LED_ROADMAP = `KPIT's AI investments are driven by business outcomes, not technology adoption. Every AI initiative is tied to a named business priority and a business sponsor outside of engineering. The primary business drivers for AI investment are: accelerating software delivery, reducing engineering effort in defect analysis and validation, improving classification and routing accuracy across support and maintenance programs, and strengthening competitive positioning as an AI-first engineering services partner.

All AI programs are evaluated against three criteria before funding: a named business problem with a measurable baseline, a business sponsor with accountability for the outcome, and a defined value target achievable within twelve months. At least 80% of active AI initiatives must be directly linked to a named business priority at any point in the portfolio. Portfolio alignment is reviewed quarterly by the Domain AI Leadership Council and reported to the CTO.`;

const STRATEGIC_ROADMAP_DESIGN = `KPIT's AI roadmap is structured across three horizons, balancing near-term delivery wins with longer-term platform and capability building:

Horizon 1 (0–12 months) — Deliver measurable value in high-impact, lower-risk areas. Priority: AI-assisted defect triage, incident classification, ticket routing, and test case generation across active customer programs. All Horizon 1 initiatives run as funded pilots with a scale decision checkpoint at six months.

Horizon 2 (12–24 months) — Scale proven pilots and expand Beacon platform adoption across engineering domains. Priority: AI-enabled validation acceleration, requirements engineering productivity, and connected vehicle intelligence across Diagnostics, ADAS, and SDV programs.

Horizon 3 (24+ months) — Transformational AI programs aligned with KPIT's long-term vision. Priority: Full Beacon-enabled AI development lifecycle, autonomous validation pipelines, and AI-infused aftersales and mobility intelligence platforms.

Roadmap priorities are reviewed quarterly against business value delivered, customer feedback, and organisational readiness. Beacon platform maturity and engineering domain capability are the primary readiness factors that determine horizon progression.`;

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to MongoDB');

  const doc = await updateCapabilitySections('KPIT', 'business-strategy-alignment', [
    { title: 'Business-Led Roadmap',    content: BUSINESS_LED_ROADMAP },
    { title: 'Strategic Roadmap Design', content: STRATEGIC_ROADMAP_DESIGN },
  ], null);

  console.log('Business Strategy Alignment written. Blueprint status:', doc.status);
  await mongoose.disconnect();
  console.log('Done.');
}

run().catch(err => {
  console.error('Script failed:', err.message);
  process.exit(1);
});
