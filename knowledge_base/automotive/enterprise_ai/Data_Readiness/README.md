# Data Readiness

**Domain:** Enterprise AI Transformation  
**Status:** Active

---

## Purpose

Assess and improve the data foundations required to implement AI use cases within enterprise programs and delivery teams. The Data Readiness domain helps project managers identify critical data, prepare it for AI consumption, and ensure the data architecture can reliably support AI implementation.

---

## Structure

### Core

Industry-agnostic Data Readiness knowledge, applicable across all enterprise AI programs.

- `Core/Data_Readiness_Intelligence_Specification.md` — capability overview and pipeline
- `Core/Critical_Data_Identification.md`
- `Core/AI_Data_Preparation.md`
- `Core/Data_Architecture_Enablement.md`

### Automotive

Automotive-specific extensions covering vehicle telemetry, ECU data, ADAS datasets, supplier data, and regulatory compliance.

- `Automotive/Automotive_Critical_Data_Identification.md`
- `Automotive/Automotive_AI_Data_Preparation.md`
- `Automotive/Automotive_Data_Architecture_Enablement.md`

---

## Capability Pipeline

```text
Critical Data Identification
        ↓
AI Data Preparation
        ↓
Data Architecture Enablement
```

## Dependencies

- `../AI_Strategy/`
- `../../shared/Regulations.md` — Data privacy regulations (GDPR, CCPA, UN R155)
