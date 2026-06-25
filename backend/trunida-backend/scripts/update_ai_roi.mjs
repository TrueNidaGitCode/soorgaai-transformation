/**
 * Write AI ROI sections to KPIT Enterprise Blueprint.
 *
 * Usage:
 *   MONGO_URI="mongodb+srv://..." node scripts/update_ai_roi.mjs
 */

import mongoose from 'mongoose';
import { updateCapabilitySections } from '../services/enterpriseBlueprintService.js';

const FINANCIAL_PERFORMANCE = `KPIT operates primarily on fixed-price OEM program contracts. In this model, revenue is contracted upfront — every hour saved on defect triage, rework, ASPICE documentation, and test preparation is margin, not just efficiency. AI is KPIT's primary lever for improving program profitability without renegotiating scope.

Fixed-Price Margin Protection
In fixed-price delivery, program profitability is determined by how well KPIT controls delivery cost within committed scope and time. Rework is the single largest margin risk — defects found late, at integration, system validation, or vehicle testing, are absorbed entirely by KPIT with no commercial recovery. AI-assisted early defect detection, triage automation, and requirements validation reduce the probability and cost of late-stage rework, directly protecting gross margin on each program.

Beacon Reuse Multiplier
AI capabilities built on the Beacon platform for one OEM customer program are available for adaptation across other engagements. Diagnostic intelligence models, defect classification logic, and test automation built for one customer can be configured for another without full rebuild. This spreads development investment across multiple fixed-price programs, improving overall portfolio margin and reducing the cost of entry for new AI-enabled service offerings.

Competitive Bidding with AI Efficiency
When KPIT's AI tooling reduces the person-hours required to deliver a program, it enables more competitive fixed-price bids while maintaining or improving margin. A delivery team augmented with AI triage and automation can price the same scope at lower cost and higher confidence. AI efficiency becomes a commercial advantage at the bid stage — not just an internal operational gain.

New AI-Native Service Lines
AI-powered diagnostics intelligence, predictive maintenance, and Beacon platform services create billable service lines beyond traditional engineering staffing. These create margin profiles that are not constrained by person-hour pricing, diversifying KPIT's revenue composition beyond fixed-price program delivery.

Financial ROI Targets:
Program gross margin per fixed-price engagement.
Rework cost as a percentage of contracted program revenue.
Beacon reuse ratio across customer programs.
Win rate on competitive fixed-price bids where Beacon AI capabilities were included in the proposal.`;

const OPERATIONAL_EXCELLENCE = `KPIT's operational ROI from AI is measured against the cost structure of fixed-price program delivery. In fixed-price contracts, operational efficiency translates directly to margin — there is no mechanism to pass cost overruns to the customer. The operational targets are prevention of expensive rework, reduction of compliance overhead, and compression of high-cost delivery phases.

Defect Triage Throughput
In fixed-price maintenance and development programs, defect volume is unpredictable but cost is absorbed by KPIT. Automated defect triage — classification, severity scoring, and routing — reduces the analyst hours required per ticket. For high-volume maintenance programs, this is the single highest-leverage operational improvement: triage cost per ticket drives program cost structure directly.

Rework Prevention Over Rework Speed
In a fixed-price model, faster rework still costs money. The operational target is defect prevention upstream. AI-assisted code review, requirements validation, test coverage analysis, and integration risk flagging catch issues before they reach expensive ASPICE review gates or vehicle validation milestones. Preventing a defect in development is an order of magnitude cheaper than fixing it in system validation.

ASPICE Compliance Efficiency
ASPICE process compliance is a contractual requirement on most OEM programs, not an optional quality gate. AI-assisted requirements traceability, review checklist generation, and engineering documentation reduce the person-hours required for compliance without relaxing rigour. This converts a fixed overhead cost into a managed, predictable, and reducible cost line across all governed programs.

V-Model Validation Acceleration
The integration, system validation, and release phases of the V-Model are the highest cost phases of KPIT's fixed-price delivery. AI-assisted test generation, coverage optimisation, and validation reporting compress the duration and person-effort of these phases. For programs where validation timelines are fixed by OEM milestones, this frees capacity within the phase rather than shortening it — reducing cost without changing schedule.

PI Planning Quality
Scope errors and dependency conflicts discovered during PI Planning cost hours to resolve. The same issues discovered mid-increment in a fixed-price program cost days and erode margin. AI tooling that surfaces conflicts, capacity risks, and scope inconsistencies during planning improves increment predictability and reduces the mid-program surprises that are most damaging to fixed-price profitability.

Operational ROI Targets:
Triage cost per ticket on fixed-price maintenance programs.
Defect escape rate to ASPICE review and validation phases.
ASPICE documentation hours per program.
Validation phase person-effort per PI.
Mid-increment scope and rework events per program.`;

const CUSTOMER_VALUE = `KPIT's customer value in AI is measured by the outcomes OEM customers experience on fixed-price programs — delivery predictability, software quality at integration milestones, and the capability differentiators that influence contract renewal and competitive wins.

Delivery Within Committed Scope and Time
Fixed-price OEM customers measure KPIT primarily on whether the committed scope is delivered on time and at the agreed quality level. AI tooling that improves schedule predictability, reduces late defect escapes, and maintains ASPICE compliance without slippage directly improves the metric that drives program satisfaction, extension, and renewal. In fixed-price delivery, on-time and in-scope completion is the primary customer value proposition.

Higher Quality at Integration Milestones
Fewer defects reaching the customer's integration or vehicle testing milestones reduces customer cost, rework friction, and program timeline pressure. KPIT's reputation in each OEM relationship is built on the quality of deliverables at these milestones. AI-assisted defect prevention and early triage improves this quality systematically, not just on individual programs.

Beacon as a Competitive Differentiator in Fixed-Price Bids
When KPIT competes for fixed-price OEM programs, Beacon's AI capabilities signal a lower delivery risk profile. A platform with demonstrated defect triage automation, ASPICE process support, and validation acceleration is a credible argument that KPIT can deliver the committed scope more reliably than a pure staffing model. This is increasingly important in competitive automotive engineering bid environments where OEM customers evaluate delivery confidence alongside price.

Engineering Capacity for Higher-Complexity Work
AI automation of routine defect triage, documentation, and test coverage work frees KPIT engineers to focus on the domain-complex problems — systems architecture, safety analysis, cybersecurity integration — that OEM customers pay premium rates for. This shifts the value composition of fixed-price programs upward and strengthens KPIT's position as a strategic engineering partner rather than a capacity provider.

Program Health Transparency
AI-assisted delivery metrics — defect velocity, triage resolution time, coverage trends, and PI commitment accuracy — give OEM customers real-time visibility into program health. Transparency strengthens trust in fixed-price engagements where customers have limited visibility into daily delivery operations. It also enables KPIT to surface risks early and manage customer expectations proactively, reducing the friction of late-program surprises.

Customer Value Targets:
On-time delivery rate on fixed-price programs.
Defect escape rate at customer integration and validation milestones.
Program renewal and extension rate.
Beacon capability included in won fixed-price bids.
Customer satisfaction score on active fixed-price programs.`;

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to MongoDB');

  const doc = await updateCapabilitySections('KPIT', 'ai-roi', [
    { title: 'Financial Performance',  content: FINANCIAL_PERFORMANCE },
    { title: 'Operational Excellence', content: OPERATIONAL_EXCELLENCE },
    { title: 'Customer Value',         content: CUSTOMER_VALUE },
  ], null);

  console.log('AI ROI written. Blueprint status:', doc.status);
  await mongoose.disconnect();
  console.log('Done.');
}

run().catch(err => {
  console.error('Script failed:', err.message);
  process.exit(1);
});
