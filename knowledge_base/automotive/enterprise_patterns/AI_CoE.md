# AI Center of Excellence — Enterprise Pattern

**Type:** Enterprise Pattern  
**Reusable across:** All business domains

---

## Pattern Overview

The AI CoE pattern defines how to structure, operate, and evolve a Center of Excellence
that drives AI transformation across the enterprise.

This pattern is referenced by the AI Strategy domain and adapted for each business domain.

---

## Core CoE Models

### Centralized
Single team owns all AI engineering. Fast to start, bottleneck at scale.

### Hub-and-Spoke (Recommended for Automotive)
Central hub provides platform, standards, and expertise.
Domain spokes execute domain-specific AI initiatives.

### Federated
Minimal central governance. Domains operate independently with shared standards.
Requires high organizational maturity.

---

## Hub Functions (Non-Negotiable)

1. **AI Platform** — Shared MLOps, data pipelines, model registry
2. **Standards** — Enterprise AI development, deployment, and governance standards
3. **Governance** — Risk classification, deployment approval, ethics board support
4. **Enablement** — Training, coaching, and tooling for domain AI teams

---

## Spoke Functions

1. **Use case delivery** — Domain AI initiative execution
2. **Domain adaptation** — Translating enterprise standards to domain constraints
3. **Feedback** — Informing the hub of emerging domain needs

---

## Maturity Progression

Start centralized → Evolve to hub-and-spoke as domain teams mature → Consider federation at scale.

---

## Common Failure Patterns

- CoE too theoretical, no hands-on delivery credibility
- Hub too controlling, domains bypass it
- No clear boundary between CoE and domain team responsibilities
- CoE lacks domain engineering knowledge (especially in safety-critical domains)

---

## Related

- `../enterprise_ai/AI_Strategy/AI_Center_of_Excellence.md` — Automotive-specific CoE guidance
