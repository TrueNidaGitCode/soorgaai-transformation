# Critical Data Identification

## Purpose

Critical Data Identification helps project managers determine the minimum data required to successfully implement an AI use case.

Rather than cataloging every available dataset, this capability focuses on identifying the information that directly enables the desired business outcome. By understanding what data is required, why it is needed, and how it relates to other datasets, project teams can reduce implementation risk and build a strong foundation for AI.

---

# Consultant Guidance

Many AI initiatives fail because teams begin by collecting every available dataset instead of identifying the information required to solve the business problem.

As an AI consultant, your objective is not to perform a technical assessment of existing systems. Instead, guide the project manager by answering four practical questions:

1. What information does this AI use case require?
2. Why is each dataset important?
3. How are the datasets connected?
4. What additional data should be considered before implementation?

The output should act as a blueprint that gives the project manager a clear direction for data collection before moving into AI Data Preparation.

---

# 1. Critical Data Identification

## Definition

Critical Data Identification determines the minimum business, product, system, engineering, operational, and supporting data required to implement the selected AI use case successfully.

Rather than documenting every available repository, the capability focuses on identifying the data that directly contributes to business outcomes while preserving the relationships that enable AI reasoning.

---

## Framework

The AI identifies critical data across six dimensions.

### Business Data

Business information that explains why the AI solution exists and what outcome it should achieve.

Typical examples

- Business objectives
- Business processes
- KPIs
- Customer information
- Financial metrics
- Service requests

---

### Product Data

Information describing what is being developed, delivered, or supported.

Typical examples

- Products
- Features
- Modules
- Product hierarchy
- Product variants
- Releases
- Configurations

---

### System Data

Information describing how the product or solution is designed and integrated.

Typical examples

- Architecture
- Components
- Interfaces
- APIs
- Dependencies
- Communication flows

---

### Engineering Data

Artifacts generated throughout the engineering lifecycle.

Typical examples

- Requirements
- Design documents
- Source code
- Test cases
- Test execution
- Defort reports
- Change requests
- Build history

---

### Operational Data

Information generated while operating or supporting the product.

Typical examples

- Logs
- Telemetry
- Runtime metrics
- Production incidents
- User feedback
- Monitoring information

---

### Supporting Knowledge

Knowledge sources that improve AI reasoning.

Typical examples

- Standards
- Procedures
- User manuals
- Best practices
- Knowledge articles
- Engineering documentation
- Reference material

---

## Critical Data Relationships

AI produces better recommendations when relationships between datasets are preserved.

Typical relationships include

Business Process
→ Product Feature

Product Feature
→ System Component

System Component
→ Requirement

Requirement
→ Design

Requirement
→ Test Case

Test Case
→ Test Result

Test Result
→ Defect

Defect
→ Change Request

Operational Data
→ Business KPI

---

# Consultant Output

For every AI use case, generate the following blueprint.

## 1. Business Objective

What business problem is being solved?

---

## 2. Required Datasets

For each dataset identify

- Dataset Name
- Data Category
- Why it is required
- Business value enabled

Reject a "why it is required" that would apply to any AI project (e.g. "Needed for AI analysis" alone is not acceptable). Name the specific reasoning step or output the selected AI initiative's technique performs with this data.

---

## 3. Data Relationship Overview

Describe how the identified datasets interact to support the AI solution.

Focus on preserving business context and engineering traceability.

---

## 4. Additional Data to Consider

Recommend datasets that may further improve AI performance.

Examples

- Historical information
- Feedback loops
- External reference data
- Industry standards
- Operational metrics

---

## 5. Data Collection Priorities

Recommend where the project manager should begin collecting information.

Prioritize activities according to

High

Medium

Low

based on expected implementation value.

---

# Key Principles

- Continue from the specific AI initiative already selected in AI Opportunity Discovery — do not identify data for a different or generic AI use case.
- Identify only the data required for the AI use case.
- Preserve relationships between datasets.
- Prioritize business value over data volume.
- Build reusable datasets for future AI initiatives.
- Think in terms of information needed rather than systems available.

---

# Leadership Question

**Have we identified the minimum information required to successfully implement this AI use case?**

---

# AI Reasoning Process

Business Objective

↓

Understand AI Use Case

↓

Identify Required Decisions

↓

Determine Required Information

↓

Group into Critical Datasets

↓

Map Relationships

↓

Recommend Data Collection Priorities

↓

Generate Critical Data Blueprint

---

# Blueprint Output

The generated blueprint includes

- Business Objective
- Required Datasets
- Data Categories
- Why Each Dataset Matters
- Data Relationship Overview
- Additional Data Recommendations
- Data Collection Priorities
- AI Recommendation

---

# Expected Outcome

After completing this capability the project team should have

- A clear understanding of what information the AI solution requires
- A prioritized list of datasets
- Understanding of relationships between datasets
- Practical guidance for collecting the required information
- A solid foundation for AI Data Preparation

---

# AI Prompt Guidance

When generating the blueprint, the AI should

- Begin with the selected AI use case.
- Infer the required information.
- Explain why each dataset is needed.
- Preserve business and engineering context.
- Recommend practical data collection activities.
- Avoid assessing existing systems or implementation status.
- Produce guidance that a project manager can immediately execute.