# Critical Data Identification

## Purpose

Identify the minimum business and engineering data required to successfully implement the selected AI use case.

Rather than cataloging every available dataset, this capability helps project managers determine **what data is required**, **why it is needed**, and **where it is likely to exist**. The outcome is a practical data blueprint that guides data collection and prepares the project for AI implementation.

---

# 1. Critical Data Identification

## Definition

Critical Data Identification determines the minimum set of datasets required to deliver the selected AI use case.

The AI analyses the business objective and proposed solution, identifies the data needed to support that solution, explains the purpose of each dataset, recommends likely source systems, and highlights important relationships that must be maintained.

The objective is not to perform a system assessment, but to provide a clear roadmap for collecting the right data before AI implementation begins.

---

## Consultant Guidance

When facilitating this capability, the consultant should:

- Understand the selected AI use case and expected business outcome.
- Identify only the datasets that directly contribute to delivering the solution.
- Explain why each dataset is required.
- Recommend where the data is likely to exist.
- Highlight dependencies between datasets.
- Avoid requesting exhaustive inventories of project data.
- Focus on providing a practical starting point for implementation.

---

## Framework

The AI identifies critical data across six dimensions.

### 1. Business Data

Information that explains **why** the AI solution is required and how success will be measured.

Typical examples

- Business objectives
- Business processes
- Customer requests
- Service tickets
- Business KPIs
- Financial measures

---

### 2. Product Data

Information describing **what** is being developed, delivered, or supported.

Typical examples

- Products
- Features
- Modules
- Product hierarchy
- Releases
- Configurations
- Variants

---

### 3. System Data

Information describing **how** the product is organised and integrated.

Typical examples

- Architecture
- Components
- Interfaces
- APIs
- Communication flows
- Dependencies

---

### 4. Engineering Data

Engineering artefacts created during delivery.

Typical examples

- Requirements
- Design documents
- Source code
- Test cases
- Test results
- Defects
- Build history
- Change requests

---

### 5. Operational Data

Information generated while operating or supporting the product.

Typical examples

- Runtime logs
- Telemetry
- Monitoring data
- Performance metrics
- User feedback
- Production incidents

---

### 6. Supporting Knowledge

Reference information that improves AI reasoning.

Typical examples

- Standards
- Procedures
- Best practices
- User manuals
- Knowledge articles
- Reference documentation

---

## Data Blueprint

For every required dataset, the AI recommends:

- Dataset Name
- Business Purpose
- Why AI Needs It
- Likely Source System
- Primary Owner
- Downstream Dependencies

Example

| Dataset | Purpose | Likely Source | Owner |
|---------|----------|---------------|-------|
| Requirements | Defines expected functionality | Requirements Management Tool | Business Analyst |
| Test Cases | Validates requirements | Test Management Tool | Test Lead |
| Defects | Identifies quality issues | Defect Tracking Tool | QA Lead |

---

## Critical Relationships

The AI identifies relationships that preserve business context.

Typical examples

Business Objective

↓

Business Process

↓

Requirement

↓

Design

↓

Implementation

↓

Test Case

↓

Test Result

↓

Defect

↓

Change Request

↓

Business KPI

Maintaining these relationships enables more accurate AI reasoning, impact analysis, and recommendations.

---

## Key Principles

- Start with the AI use case.
- Identify only the minimum data required.
- Explain why each dataset is important.
- Recommend likely source systems.
- Preserve relationships between datasets.
- Build a reusable data foundation for future AI initiatives.

---

## Leadership Question

**Have we identified the minimum data required to successfully implement this AI use case?**

---

# Decision Criteria

The AI prioritises datasets using the following criteria:

- Business value
- Relevance to the AI use case
- Importance for AI reasoning
- Reusability
- Relationship with other datasets
- Ease of collection

---

# AI Reasoning Process

```text
Business Objective
        ↓
Understand AI Use Case
        ↓
Identify Required Decisions
        ↓
Identify Critical Data
        ↓
Recommend Data Sources
        ↓
Map Relationships
        ↓
Generate Data Collection Blueprint
```

---

# Blueprint Output

The generated blueprint includes:

- Business Objective
- AI Use Case
- Required Business Data
- Required Product Data
- Required System Data
- Required Engineering Data
- Required Operational Data
- Supporting Knowledge
- Recommended Source Systems
- Data Relationships
- Data Collection Priorities
- AI Recommendations

---

# Expected Outcome

After completing this capability, the project team should have:

- A clear understanding of the data required for the AI use case.
- A prioritized list of datasets.
- Recommended source systems for each dataset.
- Identified ownership responsibilities.
- Preserved relationships between datasets.
- A practical data collection blueprint.
- A strong foundation for AI Data Preparation.

---

# AI Prompt Guidance

When generating the blueprint, the AI should:

- Start with the selected AI use case.
- Infer the required datasets.
- Explain why each dataset is needed.
- Recommend likely source systems.
- Preserve relationships between datasets.
- Focus on implementation rather than assessment.
- Tailor recommendations to the project context.