# Automotive AI Opportunity Discovery

**Layer:** Automotive
**Extends:** Core/AI_Opportunity_Discovery.md
**Version:** 3.1

---

# Purpose

This layer enriches the Core AI Opportunity Discovery capability with automotive industry knowledge, covering two distinct company types: automotive engineering organisations (OEMs, Tier-1/2 suppliers) and automotive/mobility technology vendors (autonomy, AI, and fleet product companies).

It provides domain-specific business challenges, workflows, and common AI opportunities for each — from the automotive software development lifecycle to autonomy product deployment and fleet operations.

The discovery methodology, consultant reasoning process, and output structure are inherited from the Core Asset.

---

# Automotive Business Context

This capability serves two distinct kinds of automotive companies. Use whichever
context below actually matches the company being analysed — Company Intelligence
(the company's own products and business model) determines which applies, not
the industry label alone. A company can also be a hybrid of both.

## A. Automotive Engineering Organisations (OEMs, Tier-1/2 suppliers)

Companies that design, build, and maintain vehicle software internally.
Characterised by:

- Complex software-defined vehicle architectures
- Safety-critical engineering processes
- Large volumes of engineering knowledge
- Cross-functional collaboration
- Multi-supplier ecosystems
- Strict quality and compliance requirements
- Long product development lifecycles

These characteristics create significant opportunities for AI-assisted engineering.

## B. Automotive & Mobility Technology Vendors (autonomy, AI, fleet products)

Companies that build and sell an AI/autonomy product or platform to other
automotive, industrial, or mobility operators — e.g. autonomous retrofit
kits, fleet management platforms, ADAS/perception software, EV charging
optimisation. These companies are not optimising their own internal vehicle
SDLC; their business is building and deploying a product for customers.
Characterised by:

- Hardware-software product deployed at customer sites, not just internal engineering
- Field deployment, installation, and commissioning cycles
- Customer fleet operations across varied facility/environment conditions
- Perception, navigation, and edge AI as core product technology, not tooling
- Remote fleet monitoring, performance, and support as an ongoing service
- ROI and total-cost-of-ownership are central to the customer's buying decision
- Retrofit/incremental-adoption models compete against full fleet replacement

These characteristics create significant opportunities for AI that strengthens
the product itself and the speed/cost of delivering it to customers — not just
internal engineering productivity.

---

# Typical Automotive Business Challenges

Common business problems include:

## A. Automotive Engineering Organisations

### Requirements Engineering

- Requirement ambiguity
- Requirement traceability
- Requirement impact analysis
- Change management

---

### Software Development

- Code understanding
- Legacy software maintenance
- Documentation effort
- Architecture consistency

---

### Software Testing

- Manual test case design
- Test coverage visibility
- Regression planning
- Test result analysis
- Traceability validation

---

### Defect Management

- Defect triage
- Duplicate defect detection
- Root cause analysis
- Defect prioritisation
- Ticket assignment

---

### Diagnostics

- Vehicle log analysis
- Fault pattern recognition
- Customer issue investigation
- ECU diagnostics

---

### Project Management

- Delivery risk assessment
- Resource planning
- Project health monitoring
- Engineering productivity
- Knowledge sharing

---

## B. Automotive & Mobility Technology Vendors

These are the *customer's* industry challenges — the problems that exist in
the environment where the vendor's product gets deployed. This is the side
of the equation an opportunity should be validated against: which of the
company's own products or capabilities already addresses one of these.
(The vendor's own operational effort — installation, calibration, customer
support — is a separate concern; see "Common High-Effort Activities" below.)

Automotive & mobility technology vendors (autonomy, AI, fleet products)
typically sell into one or more of the following customer environments:

### Warehousing

- Labour shortage and rising labour cost for picking, put-away and replenishment
- Throughput and SLA pressure from e-commerce order volumes
- Coordinating manual and autonomous equipment across multiple shifts and zones
- Dock-to-stock cycle time and space utilisation
- Damage and safety incidents from manual forklift/tow operations

### Manufacturing

- Material handling and line-side delivery (kitting, WIP movement between stations)
- Maintaining consistent takt time despite material flow variability
- Coordinating AMRs/AGVs safely alongside human operators on the shop floor
- Production downtime caused by material shortages or delivery delays
- Rapid redeployment of automation when facility layouts change

### Distribution & Logistics

- Cross-dock and yard operations throughput
- Labour-intensive trailer loading/unloading
- Last-mile staging and outbound consolidation
- Real-time visibility into in-transit and in-facility inventory movement
- Peak-season volume spikes straining fixed labour capacity

### Cross-Cutting (any customer environment above)

- Fleet utilisation and downtime visibility
- Labour shortage broadly driving demand for autonomy
- Retrofit economics vs. full new-equipment purchase decisions
- Coordinating multiple autonomous units safely on a shared site

---

# Typical Engineering Workflows

Examples include:

Requirements
→ Design
→ Development
→ Testing
→ Integration
→ Release

or

Customer Issue
→ Defect Analysis
→ Root Cause
→ Fix
→ Validation
→ Release

or

User Story
→ Acceptance Criteria
→ Test Design
→ Traceability
→ Test Execution
→ Coverage Analysis

or (technology/product vendors)

Site Assessment
→ Facility Mapping
→ Hardware Installation
→ Calibration
→ Supervised Operation
→ Autonomous Handover
→ Remote Monitoring

These workflows provide context for AI Opportunity Discovery.

---

# Common High-Effort Activities

Examples include:

## A. Automotive Engineering Organisations

- Requirements analysis
- Manual traceability
- Test case design
- Coverage calculation
- Defect investigation
- Root cause analysis
- Log analysis
- Engineering documentation
- Knowledge retrieval
- Release reporting

## B. Automotive & Mobility Technology Vendors

- Site assessment and facility mapping
- Field installation and commissioning
- Calibration and sensor tuning
- Fleet performance and health monitoring
- Customer onboarding and enablement
- ROI/savings reporting for customers
- Support ticket triage and resolution

---

# Typical AI Opportunities

Common AI opportunities include:

## A. Automotive Engineering Organisations

### Requirements

- Requirement summarisation
- Requirement classification
- Traceability analysis

### Testing

- AI Test Case Recommendation
- Traceability Mapping
- Coverage Analytics
- Regression Impact Analysis

### Defect Management

- Defect Summarisation
- Duplicate Detection
- Root Cause Recommendation
- Intelligent Assignment

### Diagnostics

- Log Analysis
- Fault Classification
- Diagnostic Recommendation

### Project Management

- Project Health Insights
- Delivery Risk Prediction
- AI Status Reporting
- Knowledge Assistant

## B. Automotive & Mobility Technology Vendors

### Product & Perception

- Perception/Navigation Edge-Case Detection
- Predictive Maintenance on Deployed Fleets
- Anomaly and Safety Event Detection
- Autonomous Coordination/Scheduling Optimisation

### Field Deployment

- Automated Site Mapping Assistance
- Calibration Recommendation
- Installation Workflow Guidance

### Fleet & Remote Operations

- Fleet Health Dashboards and Alerts
- Remote Diagnostic Recommendation
- Utilisation and Downtime Analytics

### Customer Success & Commercial

- ROI/Savings Report Generation
- Customer Onboarding Assistant
- Support Ticket Summarisation and Routing

---

# Automotive Principles

When generating recommendations:

- Identify whether the company is an engineering organisation (A), a
  technology/product vendor (B), or a hybrid — based on Company Intelligence,
  not the industry label alone — and ground recommendations in the matching
  context above.
- For engineering organisations: use automotive engineering terminology,
  recommend AI that augments engineering teams, and consider ASPICE, ISO
  26262 and engineering governance where relevant.
- For technology/product vendors: ground opportunities in the company's
  actual deployed products and the customer value they create, not internal
  engineering workflow. Favour opportunities that strengthen the product
  itself, speed up deployment, or improve fleet/customer outcomes.
- For technology/product vendors specifically: identify which customer
  environment(s) the company actually serves — Warehousing, Manufacturing,
  Distribution & Logistics, or a mix — from Company Intelligence, and draw
  industry challenges only from that environment's list. Do not blend in
  challenges from environments the company doesn't serve.
- Prioritise improvements in quality, productivity and delivery performance.
- Recommend opportunities that fit naturally into the company's existing
  workflows rather than generic AI use cases.

---

# Leadership Question

**Engineering organisations:** Which engineering activities create the
greatest delivery risk, quality concerns or engineering effort, and where can
AI create the highest measurable value?

**Technology/product vendors:** Which product, deployment, or fleet
operations activities most limit how fast and profitably the company can
scale its customer base, and where can AI create the highest measurable
value?