# Product Context: SoorgaAI

## Product Name
SoorgaAI

## Vision
Transform organizations into **AI-Fueled Enterprises**.

## Mission
Help companies move from AI experimentation to AI as a core operating capability.

## Problem We Solve
Today most organizations:
- use AI in isolated pockets
- buy random AI tools
- run disconnected pilots
- struggle to scale AI

Result:
AI chaos, not AI transformation.

Primary customer question:
"How do we become an AI organization?"

## Solution Overview
SoorgaAI is an **AI Transformation Platform + Advisory Layer**.

It helps organizations through four core capabilities:

### 1. Assess
Measure where they are today.

Framework:
5 maturity stages:
- Stage 1: AI Scramble
- Stage 2: AI Pivot
- Stage 3: AI Alignment
- Stage 4: AI Transform
- Stage 5: AI-Fueled Enterprise

Across 7 domains:
- AI Strategy
- Leadership
- AI Use Cases
- Data Readiness
- Technology Infrastructure
- Skills & Workforce
- Governance & Security

Output:
- AI maturity scorecard

### 2. Recommend
Generate a transformation roadmap.

Outputs:
- top 3 priorities
- 90-day actions
- 12-month roadmap
- use case roadmap

### 3. Guide
AI Transformation Agent

Chat interface helps answer:
- what should we do next
- recommended investments
- capability gaps
- milestones
- risks

### 4. Track
Transformation dashboard.

Tracks:
- maturity progression
- AI adoption
- ROI
- department scores

## MVP (Version 1)

Product:
- AI Maturity Assessment
- AI Report

User flow:
User visits SoorgaAI → takes assessment → receives maturity score → gets AI-generated roadmap → books advisory session

## Target Customer (Phase 1)

Primary segment:
- software startups
- IT service firms

Company size:
- 50–500 employees

Buyer personas:
- Founder
- CTO
- Engineering Head

Primary pain:
"How do we become AI-native fast?"

Why this segment:
- easier sales
- faster decisions
- stronger ROI story

Future:
- mid-market → enterprise

## Product Principles
- low effort, high insight
- executive-first UX
- outcome-driven
- MVP first
- fast iteration

## Brand Strategy
- Current brand: **SoorgaAI**
- Future brand: **Inceptly** after product-market fit validation
- Same product, same strategy; branding evolves later.

---

# PROJECT: Inceptly Agent OS

## Purpose
Internal multi-agent operating system used to build SoorgaAI today and support the eventual Inceptly rebrand.

---

# Current Agent
Product Owner Agent (PO Agent)

Purpose:
Convert product ideas into Jira-ready requirements.

---

# Current Scope

PO Agent includes:
- simple web UI
- Node.js backend
- Claude integration
- Jira integration
- draft approval workflow

---

# Tech Stack

Frontend:
- React

Backend:
- Node.js
- Express

Integrations:
- Jira REST API
- Claude API

Storage:
- local JSON (temporary)

IDE:
- VS Code + Claude

---

# Current Workflow

PM enters feature request
→ PO Agent generates EPIC
→ Jira draft created
→ PM reviews
→ approve/reject

---

# Repository Strategy

Repo 1:
inceptly-agent-os
(pipeline + agents)

Repo 2:
inceptly-platform
(product code; later)

---

# Delivery Principle

Start simple.
Validate quickly.
Iterate fast.

## Approved EPIC: Enhance AI Transformation Assessment Engine (KAN-6)
**Approved:** 2026-05-28T15:24:57.721Z

# EPIC Draft: Knowledge-Driven Dynamic AI Maturity Assessment Engine

**Epic ID:** SOORGA-EPIC-ASMT-002
**Epic Owner:** PO Agent
**Product:** SoorgaAI (future Inceptly)
**Target Release:** MVP v1.1 — Assessment Intelligence Layer
**Priority:** P0 (Highest — core MVP differentiator)
**T-Shirt Size:** L

---

## 1. Title
**Enhance AI Maturity Assessment Engine with Knowledge-Base–Driven, Domain-Specific Question Generation**

---

## 2. Problem Statement
The current SoorgaAI AI Maturity Assessment uses a generic, static question set. CTOs and engineering leaders evaluating their organization's AI maturity find the experience:

- Not personalized to their industry or company
- Disconnected from real domain pain points and AI opportunities
- Lacking executive-level relevance, making the assessment feel like a checklist rather than a strategic diagnostic

As a result, the assessment fails to demonstrate SoorgaAI's deep domain intelligence — weakening trust, perceived value, and conversion into the advisory funnel.

---

## 3. Business Objective
Transform the SoorgaAI Maturity Assessment into a **knowledge-driven, domain-aware intelligence engine** that:

- Personalizes assessment to each company's industry and context
- Demonstrates SoorgaAI's strategic depth and credibility within 10 minutes
- Establishes an extensible architecture for multi-domain rollout (Automotive first; Healthcare, Finance, Manufacturing, Retail later)
- Drives higher completion rates and qualified advisory bookings

**Success metric targets:**
- Assessment completion rate ≥ 80%
- Median completion time ≤ 10 minutes
- ≥ 70% of users rate the assessment as "personalized and relevant"

---

## 4. Product Capability
**Capability Name:** *Dynamic Assessment Intelligence Engine*

The engine combines three knowledge layers + identified company domain to dynamically generate executive-friendly maturity questions and compute an overall AI maturity stage.

**Intelligence Layers:**
1. **AI Maturity Stages KB** — scoring framework (Scramble → AI-Fueled Enterprise)
2. **Assessment Focus Areas KB** — 7 capability domains
3. **Domain-Specific AI Study Documents** — industry intelligence (starting with Automotive)
4. **Company Context** — discovered via public information lookup

---

## 5. User Journey

### Step 1 — User Registration
User clicks **"Take Assessment"** and provides:
- Name
- Role
- Company Name

### Step 2 — Company Context Discovery
On clicking **"Next"**, the engine:
- Searches publicly available company information
- Identifies the company's primary domain (e.g., Automotive)
- Generates a personalized welcome message

> *"Welcome to the Soorga AI Transformation Assessment. Based on our analysis, your organization operates in the automotive engineering domain with focus areas in embedded software and validation engineering."*

### Step 3 — Dynamic Assessment
- Engine generates **up to 20 questions** based on:
  - Identified domain
  - AI Maturity Stages
  - 7 Assessment Focus Areas
  - Domain-specific AI Study (Automotive for MVP)
- Questions are executive-fri

## Approved EPIC: Enhance AI Transformation Assessment Engine (KAN-6)
**Approved:** 2026-05-28T15:36:38.730Z

# EPIC Draft: Knowledge-Driven Dynamic AI Maturity Assessment Engine

**Epic ID:** SOORGA-EPIC-ASMT-002
**Epic Owner:** PO Agent
**Product:** SoorgaAI (future Inceptly)
**Target Release:** MVP v1.1 — Assessment Intelligence Layer
**Priority:** P0 (Highest — core MVP differentiator)
**T-Shirt Size:** L

---

## 1. Title
**Enhance AI Maturity Assessment Engine with Knowledge-Base–Driven, Domain-Specific Question Generation**

---

## 2. Problem Statement
The current SoorgaAI AI Maturity Assessment uses a generic, static question set. CTOs and engineering leaders evaluating their organization's AI maturity find the experience:

- Not personalized to their industry or company
- Disconnected from real domain pain points and AI opportunities
- Lacking executive-level relevance, making the assessment feel like a checklist rather than a strategic diagnostic

As a result, the assessment fails to demonstrate SoorgaAI's deep domain intelligence — weakening trust, perceived value, and conversion into the advisory funnel.

---

## 3. Business Objective
Transform the SoorgaAI Maturity Assessment into a **knowledge-driven, domain-aware intelligence engine** that:

- Personalizes assessment to each company's industry and context
- Demonstrates SoorgaAI's strategic depth and credibility within 10 minutes
- Establishes an extensible architecture for multi-domain rollout (Automotive first; Healthcare, Finance, Manufacturing, Retail later)
- Drives higher completion rates and qualified advisory bookings

**Success metric targets:**
- Assessment completion rate ≥ 80%
- Median completion time ≤ 10 minutes
- ≥ 70% of users rate the assessment as "personalized and relevant"

---

## 4. Product Capability
**Capability Name:** *Dynamic Assessment Intelligence Engine*

The engine combines three knowledge layers + identified company domain to dynamically generate executive-friendly maturity questions and compute an overall AI maturity stage.

**Intelligence Layers:**
1. **AI Maturity Stages KB** — scoring framework (Scramble → AI-Fueled Enterprise)
2. **Assessment Focus Areas KB** — 7 capability domains
3. **Domain-Specific AI Study Documents** — industry intelligence (starting with Automotive)
4. **Company Context** — discovered via public information lookup

---

## 5. User Journey

### Step 1 — User Registration
User clicks **"Take Assessment"** and provides:
- Name
- Role
- Company Name

### Step 2 — Company Context Discovery
On clicking **"Next"**, the engine:
- Searches publicly available company information
- Identifies the company's primary domain (e.g., Automotive)
- Generates a personalized welcome message

> *"Welcome to the Soorga AI Transformation Assessment. Based on our analysis, your organization operates in the automotive engineering domain with focus areas in embedded software and validation engineering."*

### Step 3 — Dynamic Assessment
- Engine generates **up to 20 questions** based on:
  - Identified domain
  - AI Maturity Stages
  - 7 Assessment Focus Areas
  - Domain-specific AI Study (Automotive for MVP)
- Questions are executive-fri

---

## Implementation Status: SOORGA-EPIC-ASMT-002

**Status:** Implemented — v1.1 Dynamic Assessment Intelligence Engine
**Implemented:** 2026-05-29

### What Was Built

The static 35-question assessment has been enhanced with a parallel dynamic engine (v2) that:

1. Captures Name, Role, Company Name at registration
2. Discovers the company industry domain using Claude (claude-sonnet-4-6)
3. Personalizes a welcome message referencing the discovered domain
4. Generates up to 20 executive-level questions from KB + domain study + company context
5. Scores answers into focus-area scores and overall maturity stage
6. Displays a personalized AI Maturity Scorecard

### Entry Point

Landing page: Start Personalized Assessment -> /dynamic-assessment/start.html

### Existing v1 Assessment

Unchanged and fully operational at /assessment/assessment.html
