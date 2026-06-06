# Business Domains — Automotive

This folder contains automotive business domain adaptations of the enterprise AI transformation framework.

## Purpose

Each business domain folder contains the domain-specific intelligence that adapts
enterprise AI strategy to the unique engineering and operational context of that domain.

## Domains

| Domain | Description |
|--------|-------------|
| Diagnostics | Vehicle health monitoring, fault detection, and predictive maintenance |
| ADAS | Advanced Driver Assistance Systems — perception, sensor fusion, decision-making |
| Connectivity | Vehicle connectivity, telematics, OTA, and connected services |
| Infotainment | In-vehicle user experience, voice, HMI, and entertainment systems |
| Validation | Software and system validation, test automation, simulation |
| Manufacturing | Production line AI, quality control, supply chain, and factory automation |
| SDV | Software-Defined Vehicle platform, compute architecture, and OS strategy |

## Domain Structure (per domain)

Each domain will contain adaptations of the enterprise AI domains:

```
[Domain]/
├── README.md
├── AI_Strategy_Adaptation.md       # How enterprise AI strategy applies in this domain
├── Use_Cases.md                    # Domain-specific AI use cases
├── Data_Sources.md                 # Key data assets in this domain
├── Technology_Considerations.md   # Domain-specific technology requirements
└── Regulatory_Context.md          # Domain-specific regulations and standards
```

## Retrieval Guidance

When generating domain-specific AI guidance, retrieve:
1. Enterprise AI domain intelligence from `../enterprise_ai/`
2. Domain-specific adaptation from the relevant domain folder here
3. Reusable patterns from `../enterprise_patterns/`
4. Shared context from `../shared/`
