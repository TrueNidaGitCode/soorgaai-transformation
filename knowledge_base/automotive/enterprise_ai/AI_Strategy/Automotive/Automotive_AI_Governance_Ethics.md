# Automotive AI Governance and Ethics

**Layer:** Automotive  
**Extends:** Core/AI_Governance_Ethics.md  
**Version:** 1.0

---

## Purpose

This document applies the Core AI Governance and Ethics framework — Risk Management, Policies and Standards, Operational Controls, and Digital Trust Culture — to the regulatory, safety, and organizational context of automotive enterprises.

> For the universal governance framework, refer to: `Core/AI_Governance_Ethics.md`

---

## Automotive Governance Context

Automotive AI governance operates within one of the most demanding regulatory and safety environments of any industry.

The governance requirements of the EU AI Act, ISO 26262, SOTIF, and IATF 16949 are not optional constraints — they are non-negotiable operating conditions for automotive AI programs.

Effective automotive AI governance integrates these requirements into a unified governance framework rather than treating them as separate compliance obligations.

---

## 1. Risk Management in Automotive

The Core framework requires organizations to identify, assess, and continuously monitor AI-related risks.

In automotive, risk classification must extend to include:

**Safety Risk**
AI systems integrated into safety functions (braking, steering, ADAS) require ASIL-level risk assessment under ISO 26262. AI components in SOTIF scope require scenario-based risk analysis under ISO 21448.

**Regulatory Risk**
The EU AI Act classifies AI in safety-critical vehicle systems as high-risk. Non-compliance exposes the organization to market withdrawal and significant financial penalties.

**Data Risk**
Vehicle telemetry and driver monitoring data require GDPR compliance. Cross-border data flows for training require documented legal basis.

**Cybersecurity Risk**
AI systems in connected vehicles expand the attack surface. ISO 21434 requires threat analysis and risk assessment (TARA) for AI components in connected systems.

### Automotive Risk Classification Extension

Building on the Core risk levels:

| Risk Level | Automotive Scope | Approval |
|-----------|-----------------|----------|
| Low | Internal productivity AI with human review | Team lead + AI CoE |
| Medium | Customer-facing or quality-critical AI | AI Risk Committee |
| High | Safety-adjacent AI (informed safety decisions) | AI Ethics Board + Safety Engineering |
| Critical | Safety-critical AI (ASIL-rated functions) | ISO 26262 process, formal safety case |

---

## 2. Policies and Standards in Automotive

Core policies must be extended with automotive-specific standards:

| Policy Area | Automotive Standard | Requirement |
|------------|---------------------|-------------|
| Functional safety | ISO 26262 | ASIL classification, safety case documentation |
| Intended functionality | ISO 21448 (SOTIF) | Scenario analysis for AI-driven systems |
| Cybersecurity | ISO 21434 + UNECE WP.29 R155 | TARA, security by design |
| OTA software | ISO 24089 + UNECE WP.29 R156 | Validated update processes |
| Data privacy | GDPR | Consent management, data minimization |
| AI regulation | EU AI Act | Conformity assessment for high-risk AI systems |
| Quality management | IATF 16949 | AI tool validation within QMS |

---

## 3. Operational Controls in Automotive

The Core framework requires embedding governance into AI delivery.

In automotive, operational controls must integrate with established quality and safety processes:

**Integration with ASPICE**
AI development activities should be mapped to ASPICE process reference model requirements.
AI-generated artefacts (requirements, test cases) require traceability and review records.

**Integration with the V-Cycle**
AI governance gates should align with V-cycle milestone reviews.
AI tool qualification requirements (ISO 26262 Part 8) must be addressed before AI tools are used in safety-related development.

**Integration with Functional Safety Management**
The safety plan should reference AI components and their governance requirements.
AI-related hazards must appear in the HARA and be traced to safety goals.

**EU AI Act Operational Requirements**
High-risk automotive AI systems require:
- Post-market monitoring plan
- Incident reporting to authorities
- Continuous conformity assurance

---

## 4. Digital Trust Culture in Automotive

Building digital trust in automotive requires addressing the industry's safety-first culture directly.

### Working With Automotive Safety Culture

Automotive engineers are trained to be conservative about unproven technologies in safety contexts.

This conservatism is appropriate — and AI governance should reinforce it, not bypass it.

Effective trust-building in automotive:
- Start with AI in non-safety domains to build organizational experience
- Demonstrate governance rigor before asking safety engineers to accept AI-assisted outputs
- Involve safety engineers in AI CoE governance from the start
- Share AI performance data transparently — including limitations and failure cases

### Automotive Trust Milestones

| Milestone | Signal |
|-----------|--------|
| AI accepted in engineering productivity tools | Engineers use AI-assisted requirements and testing without mandate |
| AI integrated into quality management | Quality teams approve AI-generated inspection data |
| AI in safety-adjacent functions | Safety engineers approve AI tools as development aids under human oversight |
| AI in ASIL-rated functions | Formal safety case accepted by functional safety management |

---

## Key Takeaways

- Automotive AI governance must integrate with — not sit alongside — ISO 26262, SOTIF, ASPICE, and IATF 16949.
- Safety-critical AI requires a formal safety case, not just an AI risk register entry.
- EU AI Act compliance for high-risk automotive AI is a mandatory, time-bounded obligation.
- Automotive safety culture is an asset for responsible AI governance — engage safety engineers early.
- Trust is built progressively: start with low-risk domains and build credibility before expanding into safety-critical AI.
