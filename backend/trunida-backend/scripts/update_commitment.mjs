/**
 * Write Commitment section to KPIT Enterprise Blueprint
 * and update governanceNodes in all KPIT CompanyBlueprints.
 *
 * Usage:
 *   MONGO_URI="mongodb+srv://..." node scripts/update_commitment.mjs
 */

import mongoose from 'mongoose';
import { updateCapabilitySections } from '../services/enterpriseBlueprintService.js';

const VISION = `Our AI vision is to position AI as a core driver of growth, innovation, and competitive differentiation across the automotive value chain. We will adopt an AI-first approach to engineering, product development, validation, and service delivery, enabling faster execution, higher quality, and continuous innovation.

By embedding AI into our platforms, products, and engineering processes, we will accelerate the development of intelligent mobility solutions, software-defined vehicles, connected services, and next-generation customer experiences. We will continuously invest in AI talent, technology, and innovation capabilities to strengthen our leadership position and create sustainable value for customers, partners, and stakeholders.

Our aspiration is to build an AI-enabled ecosystem that combines engineering excellence, intelligent software platforms, and complementary technologies to deliver differentiated solutions across the entire vehicle lifecycle.`;

const ALIGNMENT = `Purpose
Ensure AI initiatives are aligned across business leadership, product organizations, service delivery organizations, and engineering teams. AI transformation requires coordinated decision-making, ownership, and execution across all levels of the organization.

Common AI Vocabulary
A shared AI language is the foundation of alignment. Across all levels of KPIT, the following definitions apply: an AI Initiative is a funded program with a named owner and defined business outcome; an AI Pilot is a time-boxed experiment with measurable success criteria and a scale decision due within 12 months; AI Adoption is achieved when a capability is embedded in a production workflow and actively used by the intended team; and AI Value is measured in engineering effort saved, quality improved, delivery accelerated, or customer outcome delivered. Leaders, product managers, program managers, and engineering teams are expected to use this vocabulary consistently across all governance and reporting forums.

Leadership Alignment Structure
Business Leader — Owns domain AI strategy and business outcomes.
Delivery Director (Product) — Drives AI adoption across product organizations.
Product Manager — Identifies AI opportunities and business value.
Product Owner — Integrates AI initiatives into product roadmap.
Delivery Director (Services) — Drives AI adoption across customer programs.
Program Manager — Aligns AI initiatives with customer objectives.
Project Manager — Executes AI initiatives within programs.
Engineering Teams — Implement and adopt AI-enabled practices.

AI Decision Flow

Business Leader
Responsible for: AI vision, strategic priorities, investment decisions, success metrics.

Delivery Directors
Responsible for: Portfolio alignment, AI roadmap execution, resource allocation, adoption tracking.

Product and Program Leadership
Responsible for: Use case identification, value realization, customer alignment, initiative prioritization.

Engineering Teams
Responsible for: AI implementation, adoption, feedback, and continuous improvement.

Engineering Domain Alignment
KPIT's AI alignment spans six core engineering domains, each with a named AI program lead and a defined AI integration roadmap tied to delivery milestones:
Diagnostics — AI-assisted defect analysis, incident classification, and root-cause assessment.
ADAS — AI-enabled validation, scenario generation, and safety verification.
Connected Vehicles — AI for telematics, over-the-air intelligence, and connected services.
Software-Defined Vehicles (SDV) — AI-accelerated software development, integration, and continuous delivery.
Infotainment — AI-driven personalization, voice intelligence, and user experience optimization.
Aftersales — AI-powered support ticket routing, predictive maintenance, and service intelligence.
Each domain lead reports AI initiative status and adoption progress to the Domain AI Leadership Council on a monthly cadence.

Platform Alignment — Beacon
The Beacon mobility intelligence platform serves as the common AI backbone for development, integration, and validation across programs. All domain teams align to Beacon as the standard deployment and validation environment, ensuring consistency, reuse, and governed AI execution.

Ecosystem Alignment — Cymotive
AI initiatives in connected vehicle and cybersecurity domains are coordinated with Cymotive's capabilities to deliver end-to-end intelligent and secure solutions across the vehicle lifecycle. A joint program alignment between KPIT AI engineering and Cymotive cybersecurity is reviewed as part of the Domain AI Leadership Council on a quarterly basis.

Shared OKRs
AI initiatives are tied to shared OKRs with joint accountability across Business and Engineering leadership. Priority OKR themes for the current planning horizon: reduction in engineering analysis and validation effort, improvement in defect classification and ticket routing accuracy, acceleration of software delivery cycles, and increase in customer-measurable AI value delivery. OKR progress is reviewed at every governance forum and reported to the CTO quarterly.

AI Governance Forums

Domain AI Leadership Council
Members: Business Leader, Product Delivery Director, Service Delivery Director, AI Program Liaison.
Frequency: Monthly, with quarterly escalation report to the CTO.
Purpose: Review AI initiatives, remove blockers, prioritize investments, track adoption, and govern shared OKRs.

AI Portfolio Review
Members: Product Managers, Program Managers, Project Managers.
Frequency: Monthly.
Purpose: Review AI opportunities, track active initiatives, share lessons learned, and surface blockers for escalation.

Executive Education and Continuous Learning
KPIT invests in building AI literacy across all leadership levels. Business leaders and delivery directors participate in structured AI capability programs covering AI strategy, use case evaluation, and value measurement. Engineering teams receive continuous enablement through Beacon platform training, AI tooling adoption programs, and cross-domain knowledge sharing forums. Learning progress is tracked as an alignment health indicator alongside initiative and adoption metrics.

Alignment Target State
KPIT achieves alignment when:
Every engineering domain has a documented AI strategy and a named AI program lead.
Business leaders sponsor and actively govern AI initiatives.
Delivery directors own domain-level adoption targets tied to shared OKRs.
Product managers identify and prioritize AI-driven opportunities within product roadmaps.
Program managers align AI initiatives with OEM customer objectives and delivery milestones.
Engineering teams actively leverage AI capabilities through Beacon and domain tooling.
A common AI vocabulary is used consistently across all governance and reporting forums.
Progress is reviewed through a structured governance process with CTO-level visibility.`;

const COMMITMENT = `Purpose
Commitment transforms KPIT's AI strategy into sustained execution through individual accountability, meaningful investment, and active leadership participation. AI transformation is not a one-time initiative — it requires long-term organisational commitment to people, platforms, processes, and continuous innovation.

Executive Commitment
The CTO holds primary ownership of KPIT's AI transformation. Business Leaders own domain-level AI strategy and outcomes. Delivery Directors are accountable for adoption targets within their portfolios. This leadership chain ensures AI transformation is driven from the top and embedded at every delivery level — not delegated to a single team or function.

Investment Commitment
KPIT commits to sustained investment across three dimensions:
Platform — Beacon is the primary AI infrastructure investment. Continued development, integration, and domain enablement of Beacon is a non-negotiable commitment for the planning horizon.
Talent — Investment in AI talent acquisition, upskilling, and cross-domain capability development across all six engineering domains. A minimum of 15–25% of the engineering organisation should be actively engaged in AI-adjacent programs.
Innovation — Dedicated R&D budget for AI experimentation, pilot funding, and ecosystem partnerships including Cymotive. Target: 10–20% of engineering R&D budget allocated to AI capability building.

Pilot and Scale Commitment
Every AI initiative begins as a funded pilot with defined success criteria agreed before kickoff. Pilots run for a maximum of six months. A scale decision — proceed, pivot, or stop — is made within twelve months. No pilot runs indefinitely without a business value decision. This discipline protects investment and accelerates learning.

Customer Commitment
KPIT's AI commitment extends to its OEM customers. AI-driven improvements in defect analysis, ticket routing, validation effort, and delivery speed are commitments made to customers — not internal targets only. Program Managers are accountable for demonstrating AI value in customer-facing delivery metrics and communicating AI progress as part of regular program reviews.

Governance Structure
KPIT's AI governance structure is built on four pillars of oversight, ensuring accountability from executive level to engineering delivery:

CTO and Executive Sponsor — Owns AI transformation strategy, chairs quarterly governance reviews, and approves investment decisions and scale commitments. The CTO is the ultimate accountability holder for KPIT's AI outcomes.

Domain AI Leadership Council — Cross-functional governance body with representation from Business Leaders, Product Delivery Director, Service Delivery Director, and AI Program Liaison. Reviews AI initiatives, removes blockers, governs shared OKRs, and coordinates Cymotive ecosystem alignment on a monthly cadence with quarterly escalation to the CTO.

AI Portfolio Review Board — Operational governance forum comprising Product Managers, Program Managers, and Project Managers. Tracks active initiatives, pilot-to-scale decisions, customer delivery metrics, and lessons learned on a monthly cadence.

Engineering Domain Leads — Named AI program leads across Diagnostics, ADAS, Connected Vehicles, SDV, Infotainment, and Aftersales. Accountable for Beacon platform adoption, domain-level AI implementation milestones, and engineering team enablement within their respective programs.

Commitment Signals
KPIT demonstrates commitment through:
Active CTO sponsorship with quarterly AI governance reviews.
Named AI program leads across all six engineering domains.
Funded AI pilots with defined success criteria active at all times.
Cross-functional participation in AI governance forums.
Recognition and visibility of teams demonstrating successful AI adoption.
Transparent quarterly reporting of AI outcomes to executive leadership.

Automotive Commitment Benchmarks
Investment: 10–20% of engineering R&D budget allocated to AI capability building.
Engineering Engagement: 15–25% of engineering organisation engaged in AI-adjacent programs.
Governance: CTO-chaired AI governance review on minimum quarterly cadence.
Pilot Discipline: AI pilots with success criteria defined within 6 months; scale decision within 12 months.
Measurement: Quarterly AI outcome reporting to executive leadership with business value attribution.

Measurement and Accountability
AI commitment is measured — not assumed. Quarterly reporting covers: number of active AI initiatives per domain, pilot-to-scale conversion rate, engineering effort reduction achieved, customer delivery metrics improved, and Beacon adoption depth across programs. Results are presented to the CTO and Business Leaders every quarter.

Commitment Target State
KPIT achieves commitment when:
The CTO chairs a minimum quarterly AI governance review with full business and engineering leadership attendance.
Every engineering domain has at least one funded AI pilot active with defined success criteria.
Beacon adoption is tracked and reported as a platform commitment metric across all domains.
AI talent investment is funded and tracked against the 15–25% engineering engagement benchmark.
Quarterly AI outcome reports are delivered to executive leadership with business value attribution.
Customer programs include AI delivery metrics as part of standard program reporting.
No AI pilot runs beyond twelve months without a formal scale or stop decision.`;

const GOVERNANCE_NODES = [
  { title: 'CTO — Executive Sponsor',     description: 'Owns AI transformation strategy, chairs quarterly governance reviews, and approves investment and scale decisions.' },
  { title: 'AI Portfolio Review Board',    description: 'Product, Program, and Project Managers tracking active initiatives, pilot-to-scale decisions, and customer delivery metrics monthly.' },
  { title: 'Domain AI Leadership Council', description: 'Cross-functional body governing AI initiatives, shared OKRs, and Cymotive ecosystem alignment on a monthly cadence.' },
  { title: 'Engineering Domain Leads',     description: 'Named AI program leads across Diagnostics, ADAS, Connected Vehicles, SDV, Infotainment, and Aftersales accountable for Beacon adoption.' },
];

const KPIT_USER_IDS = [
  '6a12c928cc0a94585dd5d50e',
  '6a2fe56122ea865518e3a940',
  '6a37f4ee1e384120a872a06a',
];

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to MongoDB');

  // 1. Enterprise Blueprint — all three sections
  const ebDoc = await updateCapabilitySections('KPIT', 'ai-initiative-leadership', [
    { title: 'Vision',     content: VISION },
    { title: 'Alignment',  content: ALIGNMENT },
    { title: 'Commitment', content: COMMITMENT },
  ], null);
  console.log('Enterprise Blueprint — Commitment written. Status:', ebDoc.status);

  // 2. CompanyBlueprints — governanceNodes in Commitment section
  const col = mongoose.connection.db.collection('companyblueprints');
  const blueprints = await col.find({
    userId: { $in: KPIT_USER_IDS.map(id => new mongoose.Types.ObjectId(id)) },
  }).toArray();

  console.log(`CompanyBlueprints found for KPIT users: ${blueprints.length}`);

  for (const bp of blueprints) {
    const cap = bp.capabilities?.find(c => c.capabilityId === 'ai-initiative-leadership');
    if (!cap) {
      console.log(` - Blueprint ${bp._id}: no ai-initiative-leadership capability — skipping`);
      continue;
    }

    const hasCommitment = cap.sections?.some(s => s.title === 'Commitment');
    if (!hasCommitment) {
      console.log(` - Blueprint ${bp._id}: no Commitment section — skipping`);
      continue;
    }

    const updatedSections = cap.sections.map(s =>
      s.title === 'Commitment'
        ? { ...s, brief: { ...s.brief, governanceNodes: GOVERNANCE_NODES }, updatedAt: new Date() }
        : s
    );

    await col.updateOne(
      { _id: bp._id, 'capabilities.capabilityId': 'ai-initiative-leadership' },
      { $set: { 'capabilities.$.sections': updatedSections } }
    );
    console.log(` - Blueprint ${bp._id} (userId: ${bp.userId}) — governanceNodes updated`);
  }

  await mongoose.disconnect();
  console.log('Done.');
}

run().catch(err => {
  console.error('Script failed:', err.message);
  process.exit(1);
});
