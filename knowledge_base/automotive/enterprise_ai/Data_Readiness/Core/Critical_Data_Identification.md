# Critical Data Identification

## Purpose

Identify the minimum set of data required to successfully implement the selected AI use case.

Rather than collecting all available information, this capability helps project managers focus on the data that directly contributes to achieving the intended business outcome. The goal is to ensure AI initiatives are built on the right data, reducing implementation risk while maximizing business value.

---

# 1. Critical Data Identification

## Definition

Critical Data Identification determines the minimum business, product, system, engineering, operational, and supporting data required to successfully implement the selected AI use case.

Rather than cataloging all available data, this capability identifies only the information that directly contributes to achieving the desired business outcome. The AI analyses the selected AI use case, identifies the required data, explains why it is needed, and highlights dependencies that must be preserved to enable effective AI implementation.

## Framework

The AI identifies critical data by analysing the following dimensions.

### 1. Business Data

Business context that explains **why** the AI solution is needed and the business outcomes it is expected to achieve.

**Typical examples**

- Business objectives
- Business processes
- Customer information
- Service requests
- Financial metrics
- Business KPIs

---

### 2. Product Data

Information describing **what** is being developed, delivered, or supported.

**Typical examples**

- Product hierarchy
- Features
- Modules
- Product variants
- Product configurations
- Product releases
- Product lifecycle

---

### 3. System Data

Information describing **how** the product is designed, organized, and integrated.

**Typical examples**

- Functional architecture
- Logical architecture
- Physical architecture
- Components
- Interfaces
- Dependencies
- Communication flows

---

### 4. Engineering Data

Artifacts generated throughout the engineering lifecycle.

**Typical examples**

- Requirements
- Design documents
- Source code
- Test plans
- Test cases
- Test results
- Defects
- Build history
- Change requests

---

### 5. Operational Data

Information generated while operating, monitoring, or supporting the product.

**Typical examples**

- Runtime logs
- Telemetry
- Performance metrics
- Production incidents
- Monitoring data
- User feedback

---

### 6. Supporting Data

Additional knowledge that improves AI reasoning and decision-making.

**Typical examples**

- Standards
- Procedures
- Best practices
- User manuals
- Knowledge articles
- Reference documentation
- External datasets

---

### 7. Critical Relationships

Relationships between datasets that provide context for AI reasoning.

**Typical examples**

- Business Process → Product Feature
- Product Feature → System Component
- System Component → Requirement
- Requirement → Design
- Requirement → Test Case
- Test Case → Test Result
- Test Result → Defect
- Defect → Change Request
- Product → Operational Data

Maintaining these relationships preserves business and engineering context, enabling AI to generate more accurate insights, recommendations, and decisions.

## Key Principles

- **Start with Business Value** — Identify data based on the business outcome the AI solution is expected to deliver rather than the data that is most readily available.
- **Focus on Critical Data** — Prioritize the minimum viable data required to successfully implement the AI use case. Avoid unnecessary data collection.
- **Preserve Business Context** — Maintain relationships between datasets so the AI can understand the complete business and engineering context.
- **Enable Data Reuse** — Prepare data in a standardized and reusable manner so it can support multiple AI initiatives instead of a single implementation.
- **Enable AI Consumption** — Organize data in a format that can be efficiently prepared and consumed by AI solutions.

## Leadership Question

**Have we identified all critical data required to successfully implement this AI use case?**

---

# Decision Criteria

The AI prioritizes critical data based on the following criteria:

- Business value
- Relevance to the selected AI use case
- Data availability
- Data quality
- Dependencies between datasets
- Expected impact on AI performance
- Reusability across future AI initiatives

---

# AI Reasoning Process

The AI follows a structured reasoning process to identify the critical data required for the selected AI use case.

```text
Business Objective
        ↓
Understand the AI Use Case
        ↓
Identify Business Decisions
        ↓
Determine Critical Data
        ↓
Classify Data
        ↓
Map Critical Relationships
        ↓
Identify Missing Data
        ↓
Generate Data Collection Recommendations
```

---

# Blueprint Output

For every AI use case, the AI generates a project-specific **Critical Data Identification Blueprint** containing:

- Business Objective
- Critical Business Data
- Critical Product Data
- Critical System Data
- Critical Engineering Data
- Critical Operational Data
- Supporting Data
- Critical Relationships
- Missing or Unavailable Data
- Data Collection Recommendations
- AI Recommendation

---

# Expected Outcome

After completing this capability, the project team should have:

- A clear understanding of the minimum data required for the selected AI use case.
- Identification of missing or unavailable data.
- A structured view of business, product, system, engineering, operational, and supporting data.
- Traceability between related datasets.
- Prioritized data collection recommendations.
- A strong foundation for the next capability: **AI Data Preparation**.

---

# AI Prompt Guidance

When generating the Critical Data Identification blueprint, the AI should:

- Start with the business objective and AI use case.
- Infer the required data rather than asking users to list all available data.
- Prioritize critical data over exhaustive data inventories.
- Explain why each dataset is required.
- Highlight missing data and associated implementation risks.
- Preserve relationships and traceability between datasets.
- Recommend practical next steps for data collection.
- Tailor all recommendations to the user's project context.