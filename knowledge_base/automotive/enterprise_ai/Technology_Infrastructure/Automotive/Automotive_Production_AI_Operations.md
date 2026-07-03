# Automotive Layer – Production AI Operations

## Purpose

Extend the Core Asset with automotive-specific production operations knowledge covering the long-lifecycle operational requirements of AI in automotive programs — including embedded in-vehicle AI, connected vehicle fleet analytics, engineering intelligence tools, and safety-compliant model lifecycle management.

> For the universal framework, refer to: `Core/Production_AI_Operations.md`

---

## Production AI Operations in Automotive

### Model Monitoring

Automotive AI monitoring requirements differ significantly by deployment type:

**In-Vehicle AI Monitoring**

- Inference performance monitoring via OBD/telematics — track prediction confidence, error rates, and output distributions across connected fleet
- Safe state monitoring — confirm AI functions are falling back to safe state correctly when confidence is below threshold
- Edge case detection — monitor for inputs outside the model's training distribution (ODD — Operational Design Domain) using telemetry
- Power and latency monitoring — track inference latency and power consumption against ECU budget constraints

**Engineering Intelligence AI Monitoring**

- Model prediction accuracy monitored against a rolling validation dataset updated with new engineering artifacts
- Data drift monitoring — detect when the distribution of incoming requirements, defects, or test data shifts from the training distribution
- API health monitoring — track error rates and latency on AI endpoints consumed by ALM and engineering tools
- Business metric monitoring — track downstream impact metrics (e.g., defect escape rate, test coverage) to measure AI solution effectiveness

**Fleet Analytics AI Monitoring**

- Fleet telemetry ingestion rate and completeness monitoring
- Model output distribution monitoring across vehicle segments, markets, and software versions
- Anomaly detection on model outputs to identify unexpected predictions at fleet scale

### Alerting & Incident Response

Automotive AI incidents have safety implications for in-vehicle deployments:

- **Safety-relevant AI incidents** — must follow the ISO 26262 field monitoring and incident reporting process; requires notification to functional safety management and potential SOTIF (ISO 21448) assessment
- **Engineering intelligence incidents** — standard IT incident management with AI-specific triage steps; lower safety risk but can affect engineering productivity and schedule
- **Fleet analytics incidents** — alert thresholds must account for expected variation across vehicle markets and software versions to avoid false-positive escalations

Automotive AI incident response should include:

- Pre-approved rollback procedures for in-vehicle AI (requires OTA update pipeline)
- Safe state activation procedure for AI functions with functional safety relevance
- Supplier notification process if AI incident affects supplier-developed components

### Model Lifecycle Management

Automotive model lifecycle management must align with vehicle program structure:

- **Engineering intelligence models** — retrained on a quarterly or milestone-aligned schedule; can be updated independently of vehicle software releases
- **In-vehicle AI models** — updated only as part of a vehicle software release or OTA update; retraining must be completed and validated before the software release gate
- **Fleet analytics models** — retrained as fleet data accumulates; model update cadence driven by data volume and market/software segment changes

ISO 26262 and ASPICE requirements for model lifecycle:

- Model versions must be baselined and change-controlled as software work products
- Changes to safety-relevant AI models require a change impact assessment under ISO 26262 Part 6
- Model retirement must be documented and communicated to downstream users (calibration teams, diagnostics teams)

### Operational SLAs

Automotive operational SLAs by deployment type:

- **In-vehicle inference** — latency SLAs are hard real-time constraints defined by AUTOSAR RTE scheduling; typically < 10ms for safety functions, < 100ms for comfort functions
- **Engineering intelligence tools** — typically soft real-time; SLAs of < 2 seconds for interactive queries, < 30 minutes for batch analysis
- **Fleet analytics** — near-real-time to batch; SLAs defined by operational use case (e.g., overnight fleet health report vs real-time anomaly alert)

### Key Principles

- Plan field monitoring for in-vehicle AI before deployment — ISO 26262 requires evidence of ongoing field monitoring for safety-relevant AI functions.
- Align retraining schedules with vehicle software release gates — late retraining delays program milestones.
- Define safe state behaviour for in-vehicle AI before launch — the model must degrade gracefully when it encounters ODD violations.
- Apply automotive change management to all model updates in safety-relevant functions — even parameter updates may require a change impact assessment.
- Monitor business impact metrics in addition to technical model metrics — engineering intelligence AI that is technically healthy but no longer improving business outcomes needs intervention.

### Leadership Question

**Can we operate automotive AI reliably across in-vehicle, engineering, and fleet deployments throughout the vehicle program lifecycle while maintaining safety compliance and SLA commitments?**

---

## Automotive Best Practices

- Establish field monitoring processes aligned with ISO 26262 Part 7 (production and operation) before in-vehicle AI deployment.
- Integrate AI model lifecycle milestones into the vehicle program plan — treat model retraining as a planned program event.
- Use the same change management process for AI model updates as for embedded software changes in safety-relevant systems.
- Define ODD boundaries explicitly and monitor for ODD violations in production — ODD monitoring is a functional safety requirement for many ADAS AI functions.
- Establish a cross-functional AI operations team including software, systems, functional safety, and data science roles.

---

## AI Blueprint Generation

The generated automotive blueprint includes:

- Model Monitoring Plan by Deployment Type
- Automotive Incident Response Process Design
- Model Lifecycle Management Plan aligned with Program Milestones
- Operational SLA Definition by Deployment Type
- ISO 26262 Compliance Checklist for Production AI
- Recommended Operations Improvements

---

## Expected Outcome

The project team receives an automotive production operations plan that covers all AI deployment types in the program — in-vehicle, engineering intelligence, and fleet analytics — with safety-compliant monitoring, lifecycle management, and incident response procedures that can be maintained throughout the vehicle program lifecycle.
