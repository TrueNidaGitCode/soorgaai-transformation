# Automotive Layer – Critical Data Identification

## Purpose

Extend the Core Asset with automotive-specific engineering knowledge to help identify the critical data required for implementing AI use cases across the automotive product development lifecycle.

This layer specializes the generic Data Readiness methodology by mapping it to automotive engineering artifacts, tools, processes, and traceability relationships.

---

## Critical Data Identification in Automotive

## Definition

Critical Data Identification for Automotive determines the engineering, product, vehicle, software, validation, manufacturing, and field data required to successfully implement an automotive AI use case.

The AI maps the selected AI use case to the relevant engineering lifecycle and identifies the minimum automotive data required for successful implementation.

## Framework

The AI identifies critical automotive data by analysing the following dimensions.

### 1. Business Data

Business information that defines project objectives and business outcomes.

**Typical examples**

- Business objectives
- Program milestones
- Project KPIs
- Cost targets
- Quality objectives
- Customer requirements
- Warranty cost
- Service metrics

---

### 2. Product Data

Information describing the vehicle or product being developed.

**Typical examples**

- Vehicle platform
- Vehicle model
- Vehicle variant
- Product hierarchy
- Features
- ECU allocation
- Software release
- Hardware version
- Vehicle configuration

---

### 3. System Data

Information describing the system architecture and technical design.

**Typical examples**

- Functional architecture
- System architecture
- Software architecture
- AUTOSAR architecture
- ECU architecture
- Network topology
- Interface specifications
- CAN/LIN/FlexRay/Ethernet communication
- Signal definitions

---

### 4. Engineering Data

Engineering artifacts generated throughout the product development lifecycle.

**Typical examples**

#### Requirements Engineering

- Customer Requirements
- System Requirements
- Software Requirements
- Safety Requirements
- Cybersecurity Requirements

#### Design

- System Design
- Software Design
- Architecture Models
- UML/SysML Models

#### Development

- Source Code
- Git Commits
- Merge Requests
- Code Reviews
- Build History

#### Verification & Validation

- Test Plans
- Test Cases
- Test Execution Results
- Validation Reports
- Coverage Reports

#### Quality

- Defects
- Root Cause Analysis
- Change Requests
- Problem Reports

---

### 5. Operational Data

Data generated during product operation and field usage.

**Typical examples**

- Vehicle telemetry
- ECU logs
- CAN logs
- Diagnostic Trouble Codes (DTCs)
- Runtime logs
- Calibration data
- OTA update history
- Manufacturing quality data
- Warranty claims
- Service history
- Customer complaints

---

### 6. Supporting Data

Knowledge sources that improve AI reasoning.

**Typical examples**

- Engineering standards
- ISO 26262
- ASPICE work products
- Cybersecurity guidelines
- Design guidelines
- Coding standards
- Lessons learned
- Engineering wiki
- Technical documentation

---

### 7. Critical Relationships

Automotive engineering depends heavily on traceability between artifacts.

The AI identifies and preserves these relationships.

**Typical examples**

- Customer Requirement → System Requirement
- System Requirement → Software Requirement
- Requirement → Architecture
- Architecture → Software Component
- Software Component → Source Code
- Requirement → Test Case
- Test Case → Test Result
- Test Result → Defect
- Defect → Root Cause
- Defect → Change Request
- Change Request → Software Release
- Software Release → Vehicle Variant
- Vehicle → ECU
- ECU → Diagnostic Log
- Diagnostic Log → Warranty Claim
- Warranty Claim → Service Record

Maintaining end-to-end traceability significantly improves AI reasoning, root cause analysis, impact analysis, and decision support.

---

## Automotive Best Practices

The AI follows these automotive-specific principles when identifying critical data.

- Begin with the engineering problem rather than the available tools.
- Identify only the engineering artifacts required for the selected AI use case.
- Preserve end-to-end traceability across the V-Model or Agile development lifecycle.
- Combine product, system, software, validation, and field data to provide complete engineering context.
- Reuse engineering artifacts wherever possible to support multiple AI use cases.
- Include historical engineering data to improve AI learning and prediction accuracy.

---

## Common Automotive Engineering Tools

The AI should recognize common engineering repositories and map the required data accordingly.

### Requirements Management

- IBM DOORS
- Polarion
- Codebeamer

### Project & Defect Management

- Jira
- Azure DevOps

### Source Code Management

- GitHub
- GitLab
- Bitbucket

### Continuous Integration

- Jenkins
- GitLab CI
- Azure Pipelines

### Test Management

- Polarion Test
- TestRail
- Vector vTESTstudio
- dSPACE AutomationDesk

### Diagnostics & Vehicle Engineering

- Vector CANoe
- Vector CANalyzer
- ETAS INCA
- ETAS MDA
- ATI Vision

### Product Lifecycle Management

- Siemens Teamcenter
- PTC Windchill
- Dassault 3DEXPERIENCE

---

# AI Blueprint Generation

For every automotive AI use case, the AI generates an automotive-specific Critical Data Identification blueprint containing:

- Business Objective
- Required Automotive Business Data
- Required Product Data
- Required System Data
- Required Engineering Data
- Required Operational Data
- Supporting Engineering Knowledge
- Engineering Traceability Map
- Missing Engineering Data
- Recommended Data Collection Activities
- AI Recommendation

---

# Expected Outcome

After completing this capability, the project team should have:

- A complete view of the automotive engineering data required for the selected AI use case.
- Identification of missing engineering artifacts and repositories.
- End-to-end traceability between product, system, software, testing, and field data.
- A prioritized engineering data collection plan.
- A strong foundation for AI Data Preparation and subsequent AI implementation.