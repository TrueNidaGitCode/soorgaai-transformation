/**
 * Write AI Governance & Ethics sections to KPIT Enterprise Blueprint.
 *
 * Usage:
 *   MONGO_URI="mongodb+srv://..." node scripts/update_ai_governance.mjs
 */

import mongoose from 'mongoose';
import { updateCapabilitySections } from '../services/enterpriseBlueprintService.js';

const DATA_PRIVACY_SECURITY = `KPIT recognises that AI tools and platforms introduce distinct data security and confidentiality risks. All AI usage within KPIT — by employees, subcontractors, vendors, and representatives — is subject to KPIT's data protection obligations, regardless of the device or location from which AI is accessed.

Confidential and Proprietary Information
No confidential, sensitive, or proprietary information may be entered into any AI tool. This prohibition applies to all Company Data, which is defined broadly to include: all business information and internal communications, personal data of employees, contractors, customers, and customers' customers, source code, technical specifications, product plans, design documents, roadmaps, financial data, strategic analyses, and all third-party proprietary information received under contract or non-disclosure obligations.

Company Data includes information in any form — written, electronic, audio, or video. AI Users must ensure that Company Data is never used to train external AI models, which may require following specific opt-out procedures associated with the tools in use.

Data Security Obligations
All AI usage must comply with KPIT's Data Privacy and Security Policy. AI Users are responsible for ensuring that any AI tool or platform they use handles data in a manner consistent with applicable data protection laws and any contractual data security obligations to OEM customers and other third parties.

Where KPIT handles data under OEM customer programs, the data security obligations of the relevant customer contract take precedence and must be evaluated before using any AI tool in connection with that program.`;

const ETHICAL_AI_GUIDELINES = `KPIT recognises that AI can reflect bias, incomplete training data, and reasoning errors that are not immediately visible. All AI-generated outputs must be treated as first drafts requiring human review — not final deliverables. AI Users are accountable for the content they produce with AI assistance in the same way they would be accountable for content they created directly.

Human Review Requirement
Every AI-generated output used in a Company context must be reviewed by a qualified AI User before use. Review must confirm accuracy and completeness, identify potential bias or reasoning errors, and verify that the output does not infringe third-party intellectual property rights. AI-generated content must not be used as the sole source of information for answering important inquiries or performing critical tasks.

AI shall not be used as the sole or automatic basis for decision-making. This applies particularly to decisions affecting people, programs, customers, or contractual commitments. Where AI informs a decision, human judgement must validate the outcome before it is acted upon.

Personnel Decisions
AI shall not be used for personnel decision-making purposes without explicit authorisation from both the Head of Human Resources and the Legal function. This includes screening, performance assessment, role assignment, or any other decision that affects an individual's employment.

Anti-Discrimination
AI tools must not be used in any manner that could result in unlawful discrimination on the basis of protected characteristics. AI Users must be aware that AI models can encode and amplify bias present in training data. Any output that raises concerns about bias or discriminatory effect must be escalated through the AI governance reporting channel before further use.

Transparency and Attribution
Where AI-generated content is used in deliverables, documentation, or communications to external parties, the use of AI assistance should be disclosed where applicable and appropriate. AI Users remain responsible for the accuracy and integrity of all content they produce.`;

const MODEL_VALIDATION_MONITORING = `KPIT requires that AI models and AI-generated outputs used in engineering programs and business operations are subject to active validation and monitoring. This is particularly important in automotive engineering contexts where AI outputs may inform safety-relevant decisions, customer-facing deliverables, or ASPICE-governed engineering artefacts.

Output Validation
All AI-generated outputs used in program delivery must be validated for accuracy, completeness, and fitness for the specific use case. Validation responsibility sits with the AI User and the delivery team — not with the AI tool provider. For AI outputs used in ASPICE-governed engineering processes, validation must be documented and traceable in the same manner as other engineering review activities.

AI outputs used in safety-relevant contexts — including diagnostics, ADAS, SDV integration, and cybersecurity — must be subject to additional domain-expert review before use. The complexity and risk profile of the use case determines the depth of validation required.

Monitoring for Drift and Failure
AI models deployed in production — including on the Beacon platform — must be monitored for performance drift over time. Model accuracy, output confidence, and error rates must be tracked against defined baselines. Where a model's performance degrades below the defined threshold, the model must be retrained, replaced, or taken offline pending review.

Incident Reporting
All AI system failures, unexpected outputs, and concerns about AI tool behaviour must be reported through the designated AI governance reporting channel. Reportable incidents include outputs that are incorrect, incomplete, offensive, discriminatory, misleading, or in conflict with KPIT policies or customer obligations. Incidents must be reviewed by the information security and governance function within a defined response window.

The AI governance function maintains a record of reported incidents and uses this information to inform AI tool approval decisions and policy updates.`;

const REGULATORY_COMPLIANCE = `KPIT and all AI Users must comply with all applicable laws and regulations governing the use of AI. KPIT will monitor the evolving AI regulatory landscape and update its policies accordingly. Compliance obligations apply to all AI usage performed on behalf of KPIT, regardless of the device or location of the AI User.

Applicable Legal Frameworks
Compliance requirements include, but are not limited to, the following areas: data privacy and protection laws applicable to the jurisdictions in which KPIT operates and processes data, intellectual property laws governing the ownership and use of AI-generated content, employment and labour laws applicable to AI-assisted workforce decisions, and anti-discrimination laws applicable to AI-assisted processes affecting individuals.

OEM Customer Contract Obligations
For AI used within OEM customer programs, the contractual obligations of the relevant customer agreement take precedence. This includes data residency requirements, restrictions on the use of customer data in external AI systems, ASPICE-required traceability and review obligations, and any customer-specific AI usage policies. AI Users must evaluate these obligations before using any AI tool in connection with a customer program.

Approved AI Tools
AI Users shall only use AI tools that have been reviewed and approved through KPIT's information security governance process. The approval process evaluates tools against data security requirements, applicable legal obligations, and the specific use case in which the tool will be used.

AI Users who require a tool that has not been approved must submit a formal exception request through the security governance process and obtain explicit approval from the information security function before use. Use of an unapproved AI tool without authorisation is a violation of this policy.

Policy Maintenance
KPIT will review and update its AI governance policies in response to changes in applicable law, regulatory guidance, and the evolving capabilities of AI systems. Policy updates will be communicated to all AI Users.`;

const TRUST_ADOPTION = `Responsible AI adoption at KPIT requires that all AI Users understand their obligations, feel confident using AI within approved boundaries, and have clear channels for raising concerns. Trust in AI systems is built through consistent governance, transparent reporting, and continuous improvement — not through unrestricted access or uncritical adoption.

Organisational Commitment
KPIT's leadership is committed to AI adoption that protects the Company, its employees, its customers, and the people whose data KPIT processes. AI governance is not a barrier to adoption — it is the foundation that makes responsible, scalable adoption possible. Every AI User who follows these guidelines contributes to an AI environment that the organisation can trust.

Reporting and Escalation
All AI-related concerns, policy questions, and incident reports must be directed to the designated AI governance reporting channel. Reportable matters include: suspected or confirmed violations of this policy, AI system failures or concerning outputs, uncertainty about whether a tool qualifies as AI under KPIT's policy, and requests to evaluate a new AI tool for approval.

Reports will be reviewed by the information security and governance function. AI Users who report concerns in good faith will not face adverse consequences. Anonymous reporting is available where the organisation's reporting mechanisms support it.

Building Confidence Through Responsible Use
KPIT's approach to AI trust is practical: AI Users gain confidence in AI tools by seeing them used responsibly, by receiving clear guidance on boundaries, and by observing that governance mechanisms work. The following practices build trust across the organisation:
Transparency about how AI is used in programs and deliverables.
Clear accountability — AI Users are responsible for what they produce with AI assistance.
Visible governance — incidents are reported, reviewed, and resolved through a defined process.
Continuous improvement — governance policies are updated as AI capabilities and risks evolve.

Adoption Support
KPIT will provide guidance and learning resources to help AI Users understand approved tools, apply responsible use practices, and navigate the governance process. The goal is an organisation where AI is used widely, confidently, and responsibly — with every AI User equipped to make sound judgements about how and when to use AI in their work.`;

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to MongoDB');

  const doc = await updateCapabilitySections('KPIT', 'ai-governance-ethics', [
    { title: 'Data Privacy & Security',        content: DATA_PRIVACY_SECURITY },
    { title: 'Ethical AI Guidelines',          content: ETHICAL_AI_GUIDELINES },
    { title: 'Model Validation & Monitoring',  content: MODEL_VALIDATION_MONITORING },
    { title: 'Regulatory Compliance',          content: REGULATORY_COMPLIANCE },
    { title: 'Trust & Adoption',               content: TRUST_ADOPTION },
  ], null);

  console.log('AI Governance & Ethics written. Blueprint status:', doc.status);
  await mongoose.disconnect();
  console.log('Done.');
}

run().catch(err => {
  console.error('Script failed:', err.message);
  process.exit(1);
});
