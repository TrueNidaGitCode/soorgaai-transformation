# SoorgaAI — Automotive Requirements Intelligence Layer Specification

## Document Purpose

This specification defines the intelligence layer used by the SoorgaAI Assessment Engine to evaluate an automotive organization's maturity in applying Generative AI to requirements engineering workflows.

The assessment engine uses this document to:
- Generate automotive requirements-engineering-specific assessment questions
- Identify AI transformation opportunities within requirements workflows
- Evaluate organizational maturity in automating requirements processes
- Produce maturity-aligned insights and recommendations

Domain: **Automotive Software Engineering**
Focus Area: **Requirements Engineering**

---

## Industry Context — Why Requirements Engineering Is the Biggest Opportunity

Automotive vehicles contain:
- 100,000+ engineering requirements per vehicle program
- Hundreds of sub-system specifications across powertrain, chassis, ADAS, body, infotainment
- Multi-supplier requirement chains with strict traceability obligations
- Safety-critical requirements governed by ISO 26262, ASPICE, and AUTOSAR standards

Manual requirement processing at this scale is:
- Time-consuming
- Error-prone
- Difficult to trace across system boundaries
- A significant bottleneck in vehicle program delivery

Industry surveys confirm that requirements engineering automation represents the **largest underexploited GenAI opportunity** in automotive software development — yet it remains one of the areas with the lowest current adoption due to data privacy concerns.

---

## Core Requirements Engineering Challenges

| Challenge | Description |
|-----------|-------------|
| Scale | A single vehicle program may contain 100k+ requirements |
| Manual analysis | Requirement analysis, classification, and traceability are largely done by hand |
| Complex traceability | Requirements must be traced from customer needs → system specs → software specs → test cases |
| Confidentiality | Engineering requirements often contain IP that cannot be sent to public cloud LLM APIs |
| Validation burden | Safety-critical requirements require human sign-off — automation cannot replace this |
| Legacy formats | Requirements exist in Word, Excel, DOORS, and proprietary formats; no unified structure |

---

## GenAI Transformation Opportunities in Requirements Engineering

### 1. Requirement Question Answering

Engineers ask natural-language questions against large requirement databases.

- **Without AI:** Engineer manually searches DOORS or Excel for the relevant requirement, reads across multiple documents
- **With AI (RAG):** Engineer types the question; the system retrieves the relevant requirements and synthesizes an answer
- **Maturity Indicator:** Has the organization deployed an internal RAG system against its requirement corpus?

---

### 2. Engineering Document Summarization

Long specification documents are automatically summarized into engineering-readable formats.

- **Without AI:** Engineers read 200-page specifications and manually extract key requirements
- **With AI:** LLM produces structured summaries of functional, non-functional, and safety requirements
- **Maturity Indicator:** Are summarization workflows integrated into the engineering toolchain?

---

### 3. Requirement-to-Model Generation

Requirements are automatically converted into structured engineering models (UML, SysML, state machines).

- Pipeline: `Requirement text → Intermediate Representation → Formal Model`
- The indirect approach (requirement → model → code) is preferred over direct code generation for safety-critical systems because the intermediate model can be validated before implementation
- **Maturity Indicator:** Has the organization piloted or deployed requirement-to-model generation pipelines?

---

### 4. Traceability Support

AI maintains bidirectional traceability between requirements, design decisions, implementation, and test cases.

- **Without AI:** Traceability matrices maintained manually in spreadsheets; frequently out of date
- **With AI:** LLM-assisted traceability generation flags broken links and suggests trace assignments
- **Maturity Indicator:** Does the organization use AI to generate or verify traceability links?

---

### 5. Intelligent Engineering Search

Semantic search across heterogeneous requirement repositories (DOORS, Confluence, SharePoint, PDFs).

- Unlike keyword search, semantic search retrieves requirements by meaning rather than exact phrase
- Critical for cross-supplier requirements where terminology varies
- **Maturity Indicator:** Has semantic search been deployed over internal requirement repositories?

---

### 6. Regulation-to-Scenario Conversion

Legal and regulatory text is automatically converted into executable test scenarios.

Three-level scenario hierarchy:

| Level | Description |
|-------|-------------|
| Functional Scenario | High-level behavior definition from regulatory intent |
| Logical Scenario | Parameterized behavior with variable ranges |
| Concrete Scenario | Exact executable values for simulation or test |

Tools operating in this space: **Chat2Scenario**, **TARGET**, **LEADE**, **LeGEND**

- **Maturity Indicator:** Has the organization explored GenAI for regulation-to-scenario automation?

---

### 7. RFQ / Supplier Requirements Processing

Incoming customer requirements (RFQs) processed and matched against internal capability databases.

- RAG-based systems retrieve internal engineering knowledge to assess feasibility
- LLMs draft initial responses and flag requirements that conflict with existing specifications
- **Maturity Indicator:** Has GenAI been applied to RFQ analysis or supplier requirement intake?

---

## Technology Stack Supporting Requirements Engineering AI

### Large Language Models (LLMs)

LLMs are the core reasoning engine for requirements workflows.

| Model Type | Best For |
|------------|----------|
| Encoder models | Requirement classification, similarity search, anomaly detection |
| Decoder models | Requirement generation, summarization, scenario drafting |
| Encoder-Decoder | End-to-end requirement transformation |

**Automotive LLM Trade-Off:**

| Factor | GPT / Frontier Models | Local Models (LLaMA, Mistral) |
|--------|-----------------------|-------------------------------|
| Reasoning quality | High | Lower |
| Privacy protection | Low (data leaves org) | High (runs on-premise) |
| Cost | API-based | Infrastructure investment |
| Automotive suitability | Piloting only | Production-preferred |

Due to IP sensitivity of engineering requirements, organizations increasingly prefer **local LLM deployment** for requirements processing workflows.

---

### Retrieval-Augmented Generation (RAG)

RAG is the foundational architecture for requirements intelligence systems.

**Offline (Indexing) Phase:**
1. Load engineering documents (Word, PDF, DOORS exports, Excel)
2. Split documents into semantic chunks
3. Generate vector embeddings and store in a vector database

**Runtime (Query) Phase:**
1. Engineer submits natural-language query
2. System retrieves semantically relevant requirement chunks
3. LLM generates a contextual, grounded response
4. Source requirements are cited for traceability

**Why RAG over Fine-Tuning for Automotive Requirements:**
- Requirements change frequently — RAG retrieves from updated sources without retraining
- Fine-tuned models risk hallucinating obsolete requirement values
- RAG provides citation of source documents, supporting audit and compliance

---

### Vision-Language Models (VLMs)

Automotive requirements are often expressed in visual formats:
- UML diagrams
- System architecture flowcharts
- State machine diagrams
- Interface control documents with tables and schematics

VLMs process both images and text, enabling:
- Understanding of UML/SysML diagrams embedded in requirement documents
- Extraction of requirements from legacy visual specifications
- Interpretation of architecture schematics for impact analysis

---

### Prompting Techniques for Requirements Workflows

| Technique | Application in Requirements Engineering |
|-----------|-----------------------------------------|
| Chain-of-Thought | Step-by-step requirement decomposition and logic tracing |
| Specification-Driven | Grounding LLM responses in specific standards (ISO 26262, ASPICE) |
| RAG-Based | Domain knowledge retrieval over internal requirement corpora |
| Identifier-Aware | Correctly handling requirement IDs (e.g., `SYS-REQ-0042`) in prompts |
| Long-Duration | Maintaining engineering context across multi-step requirement analysis sessions |

**Critical Warning:** Poor prompting produces incorrect requirement analysis outputs and hallucinated traceability links. Prompt engineering discipline is as important as model selection.

---

## Hallucination Risk in Requirements Contexts

Hallucination is the primary risk when applying GenAI to safety-critical requirements engineering.

**Types of Hallucination:**

| Type | Example in Requirements Context |
|------|--------------------------------|
| Textual | LLM generates a plausible but incorrect requirement value |
| Logical | LLM traces a requirement to the wrong system component |
| Traceability | LLM creates a trace link that does not logically exist |

**Root Cause — Degeneration of Thought (DoT):** When the LLM's reasoning chain starts incorrectly (e.g., misidentifies the requirement type), subsequent reasoning compounds the error.

**Mitigation Techniques:**

| Technique | How It Works |
|-----------|-------------|
| Multi-Agent Debate (MAD) | Multiple LLM agents independently analyze the requirement; a judge agent selects the most consistent response |
| ReConcile Framework | Agents assign confidence scores and build consensus on the correct interpretation |
| Self-Consistency | Multiple reasoning paths generated; most consistent answer selected |
| RECSIP | Multiple outputs clustered; statistically best candidate selected |
| Uncertainty Evaluation | Confidence thresholds filter low-reliability outputs before returning to engineers |

**Industry Conclusion:** No single technique fully eliminates hallucinations. Requirements engineering AI systems require:
- Human-in-the-loop validation for all safety-critical requirements
- Multi-agent verification for complex traceability tasks
- Confidence scoring on all generated outputs
- Mandatory engineering review before any AI-generated requirement enters a controlled baseline

---

## Assessment Engine Usage Instructions

When generating questions for an automotive organization's requirements engineering maturity, the assessment engine should probe:

1. **Awareness** — Does the organization understand GenAI's potential for requirements workflows?
2. **Piloting** — Has the organization run any GenAI pilots in requirements analysis, summarization, or traceability?
3. **Deployment** — Are any GenAI-assisted requirements tools in active use by engineers?
4. **Governance** — Does the organization have validation processes for AI-generated requirement artifacts?
5. **Privacy posture** — Has the organization addressed data confidentiality for requirements in AI workflows?
6. **Tool integration** — Is GenAI integrated into the existing toolchain (DOORS, Polarion, Codebeamer)?
7. **Measurement** — Does the organization measure time savings or quality improvements from requirements AI?

**Focus Area Alignment:**

| Focus Area | Requirements Engineering Angle |
|------------|-------------------------------|
| AI Strategy & Vision | Is requirements automation part of the AI roadmap? |
| Leadership & Culture | Do engineering leads champion requirements AI? |
| AI Use Cases & Applications | Which specific requirements workflows have been targeted? |
| Data Readiness | Are requirements available in machine-readable, accessible formats? |
| Technology & Infrastructure | Is RAG infrastructure deployed for requirements search? |
| Skills & Workforce | Are requirements engineers trained to work with AI tools? |
| Governance, Ethics & Security | Are AI-generated requirements subject to validation gates? |

---

## Maturity Stage Indicators — Requirements Engineering

| Maturity Stage | Requirements Engineering Profile |
|----------------|----------------------------------|
| AI Scramble (0–20) | No structured awareness of AI in requirements; purely manual workflows |
| AI Exploration (21–40) | Experimentation with LLMs for requirement search or summarization; no production use |
| AI Alignment (41–60) | At least one requirements AI tool in active use; leadership aware and engaged |
| AI Integration (61–80) | RAG or semantic search deployed; traceability AI in pilot or production; privacy posture addressed |
| AI Mastery (81–100) | End-to-end requirements intelligence pipeline operational; multi-agent validation; local LLM deployment for IP-sensitive workflows; measured productivity gains |

---

## Key Industry Insights for Recommendation Generation

- **Biggest opportunity:** Requirements engineering automation has the highest potential ROI but lowest current adoption in automotive
- **Primary barrier:** Data privacy — most organizations cannot send requirements to public cloud APIs
- **Recommended first step:** Deploy a local RAG system over internal requirement repositories (no cloud exposure, high immediate value)
- **Second priority:** Semantic search to replace manual DOORS/Polarion queries
- **Long-term target:** Multi-agent requirement-to-model pipelines with simulation-first validation
- **Non-negotiable:** Human review remains mandatory for all safety-critical requirement outputs regardless of AI maturity level
