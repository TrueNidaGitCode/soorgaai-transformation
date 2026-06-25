/**
 * Write AI Operating Model sections to KPIT Enterprise Blueprint.
 *
 * Usage:
 *   MONGO_URI="mongodb+srv://..." node scripts/update_operating_model.mjs
 */

import mongoose from 'mongoose';
import { updateCapabilitySections } from '../services/enterpriseBlueprintService.js';

const SOLUTION_CENTRIC_ORG = `KPIT organises AI initiatives around business solutions — not technology projects or isolated team assignments. AI programs are structured along two dimensions: engineering domain solutions (Diagnostics, ADAS, Connected Vehicles, SDV, Infotainment, Aftersales) and customer program solutions aligned to specific OEM engagements. Each solution has a named business owner accountable for outcomes.

KPIT operates across two delivery contexts:

Customer Program Solutions — AI initiatives delivered within OEM-governed engineering programs. For customers such as CARIAD, AI initiatives are scoped as Features within Agile Release Trains (ARTs), planned through Program Increment (PI) cycles, and governed through ASPICE-compliant engineering processes and V-Model verification. For each OEM customer, KPIT adapts its solution organisation to the customer's operating model — the AI solution fits into the customer's delivery rhythm, not the other way around.

Own Product Solutions — AI capabilities built on KPIT's proprietary Beacon platform, owned entirely by KPIT from concept through production. These follow KPIT's internal delivery model with full end-to-end ownership and independent roadmap authority.

Priority solution areas for KPIT's current planning horizon:
Engineering Productivity Solutions — AI-assisted defect triage, incident classification, and ticket routing across maintenance and development programs.
Software-Defined Vehicle Solutions — AI-accelerated integration, testing, and validation through the Beacon platform.
Connected Vehicle and Aftersales Solutions — AI-powered diagnostics intelligence and service automation.
Enterprise Productivity Solutions — AI tooling adoption across engineering teams to reduce manual effort and improve delivery efficiency.

In both contexts, solutions are not initiated as standalone technology experiments. Every AI solution must have a named business problem, a measurable baseline, and a business owner before it enters delivery.`;

const CROSS_FUNCTIONAL_TEAMS = `KPIT's AI delivery teams are multidisciplinary by design, combining business, domain engineering, AI/data engineering, and customer program expertise in a single team. Team composition adapts to the delivery context.

For OEM Customer Programs (e.g. CARIAD, BMW, Mercedes):
KPIT's delivery teams embed within the customer's Agile Release Train structure. The team follows the customer's PI Planning cadence and governance layer. The operating model layers are:
Agile Execution Layer — SAFe Agile, Agile Release Trains (ARTs), Program Increments (PIs), Features and User Stories, backlog-driven execution.
Engineering Governance Layer — ASPICE process compliance, engineering reviews, quality gates, traceability, requirements management, and change management.
Development Lifecycle Layer — V-Model development, systems engineering, software engineering, integration testing, system validation, and release management.
Ecosystem Collaboration Layer — OEM supplier collaboration, shared ownership models, joint validation activities, and contractual governance.

A minimum viable embedded delivery team includes: Domain SME providing automotive engineering expertise, AI/ML Engineer building and maintaining models and Beacon integrations, ASPICE-aware delivery lead ensuring engineering quality gate compliance, and a Product Owner operating within the customer's ART backlog. For connected vehicle and ADAS programs, a Cymotive cybersecurity liaison participates to ensure security is built in from the start.

For Own Product Delivery:
KPIT leads cross-functional teams independently through the Beacon platform. Team composition: Domain SME, AI/ML Engineer, Data Engineer, Program Manager, and V&V Engineer — with full authority over the solution roadmap and delivery decisions.

Across both contexts, teams operate on a 2–4 week sprint cadence with demonstrable output each sprint, and are expected to deliver a working AI capability within 90 days of formation.`;

const END_TO_END_OWNERSHIP = `KPIT's AI delivery teams own their solutions from business opportunity through production and continuous improvement — not just through initial deployment. Solution teams are not disbanded after go-live. Ownership model adapts to delivery context.

For OEM Customer Programs:
KPIT maintains ownership within the bounds of the customer's engineering lifecycle. An AI initiative flows through:
AI Opportunity Identification → Feature Definition → PI Planning → User Stories → Development → ASPICE Reviews → Testing and Validation → Vehicle Release.
KPIT's team owns the full AI development and validation chain within this lifecycle. Customer governance gates — ASPICE checkpoints, V-Model verification milestones — are not handoffs. They are quality milestones owned by the same delivery team throughout the program.

For Own Product Solutions:
KPIT maintains full end-to-end ownership from business opportunity through production and continuous improvement. The Beacon platform is the continuity mechanism — solutions are deployed, monitored, and improved through Beacon, giving the delivery team a single operational surface throughout the solution lifecycle.

Product Owner Continuity
The Product Owner is KPIT's single most critical knowledge carrier on an AI delivery team. They hold the business context, the decision history, the customer relationship, and the evolving understanding of what the solution must become. KPIT treats Product Owner continuity as a governance commitment — not an HR default.

Product Owners are assigned for the full planned lifecycle of each solution, from opportunity identification through production and the first improvement cycle. Rotation or reassignment during active delivery requires a formal knowledge transfer period of at least 6–8 weeks with the incoming Product Owner shadowing before taking ownership. Unplanned Product Owner changes must be escalated to the Delivery Director and reviewed at the next Domain AI Leadership Council.

In both contexts, each solution maintains:
A named solution owner accountable from concept through production.
A named Product Owner committed for the full solution lifecycle.
A defined improvement backlog reviewed on a monthly cadence.
A quarterly business value assessment presented to the Domain AI Leadership Council.

Handoffs between development, deployment, and operations are eliminated where possible — the delivery team owns all three. Where handoffs are unavoidable, they remain within the same domain team.

Ownership Target State:
Every AI solution has a named owner accountable from concept through production.
Product Owners remain on solutions for the full lifecycle — mid-program rotation requires formal escalation and a structured handover.
Solution teams are not disbanded after initial deployment — they own the solution through continuous improvement cycles.
Each solution has a defined improvement backlog and quarterly business value assessment.

Continuity Benchmarks:
Over 80% of AI solutions maintained by their original delivery team through production.
Product Owner continuity maintained on 100% of active AI solutions without unplanned rotation.
Average time from issue identification to deployed fix under 30 days.
Quarterly capability and business value review for all production AI solutions.`;

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to MongoDB');

  const doc = await updateCapabilitySections('KPIT', 'ai-operating-model', [
    { title: 'Solution-Centric Organization',   content: SOLUTION_CENTRIC_ORG },
    { title: 'Cross-Functional Delivery Teams', content: CROSS_FUNCTIONAL_TEAMS },
    { title: 'End-to-End Ownership',            content: END_TO_END_OWNERSHIP },
  ], null);

  console.log('AI Operating Model written. Blueprint status:', doc.status);
  await mongoose.disconnect();
  console.log('Done.');
}

run().catch(err => {
  console.error('Script failed:', err.message);
  process.exit(1);
});
