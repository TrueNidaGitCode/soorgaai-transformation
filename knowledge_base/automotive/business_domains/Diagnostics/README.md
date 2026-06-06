# Diagnostics

**Business Domain:** Automotive  
**Status:** Planned

---

## Domain Overview

Vehicle diagnostics encompasses fault detection, health monitoring, predictive maintenance,
and remote diagnostics for passenger and commercial vehicles.

AI is transforming diagnostics from reactive (fault codes after failure) to predictive
(anomaly detection before failure) and prescriptive (recommended actions and parts).

---

## Key AI Opportunities

- **Predictive fault detection** — ML models trained on vehicle telemetry to predict component failure
- **Anomaly detection** — Unsupervised learning on CAN bus and sensor data
- **Remote diagnostics** — AI-assisted over-the-air vehicle health assessment
- **Warranty analysis** — Pattern recognition on warranty claims to identify systemic issues
- **Diagnostic assistant** — AI support for workshop technicians (fault triage and repair guidance)

---

## Relevant Data Sources

- CAN bus and OBD-II data
- ECU logs and diagnostic trouble codes (DTCs)
- Vehicle telemetry (connected vehicles)
- Warranty and field return data
- Workshop repair records

---

## Regulatory and Standards Context

- ISO 14229 (UDS — Unified Diagnostic Services)
- AUTOSAR diagnostic stack
- OBD-II / EOBD compliance
- GDPR for vehicle and driver data

---

## Enterprise AI Strategy Adaptation

AI Strategy for Diagnostics should prioritize:
1. Data pipeline from vehicle to cloud for training
2. Model governance for safety-adjacent diagnostic recommendations
3. Workshop technician adoption and trust-building

---

## Planned Documents

- AI_Strategy_Adaptation.md
- Use_Cases.md
- Data_Sources.md
- Technology_Considerations.md
- Regulatory_Context.md
