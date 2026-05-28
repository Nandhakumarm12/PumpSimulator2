# ALARIS GP SIMULATOR — BUILD STATUS & DOCUMENTATION
# Last updated: 2026-03-23

---

## PROJECT OVERVIEW

Research-grade simulator of the **Alaris GP Volumetric Infusion Pump** (BD/CareFusion).

**Two parallel goals:**
1. Behavioural fidelity — simulator behaves exactly as documented in the official DFU manuals
2. Data generation — every session produces a structured record for AI model training

---

## MANUALS & REFERENCES FOLLOWED

| Document | Role in build |
|---|---|
| BD document **1000DF00152 Issue 1** — Alaris GP Volumetric Pump DFU | Primary spec: screen states, controls, factory defaults, alarms |
| BD document **BDDF00535 Issue 4** — Alaris GP with Guardrails DFU | Guardrail soft/hard limit structure, override workflow, KVO behaviour |
| BD document **1000SM00013 Iss. 4** — Alaris GP Technical Service Manual | Hardware button layout, indicator LEDs, pressure alarm levels |
| **PVSio-web formal model** — github.com/pvsioweb/pvsio-web (AlarisGP demo) | State transition validation; used to verify screen flow correctness |
| **Cauchi et al. (2011)** — "Towards Dependable Number Entry for Medical Devices", EICS4Med | Source for interaction features: correction_count, boundary_hit_count, golden_path_ratio |
| **Thimbleby & Cairns (2010)** — J. Royal Society Interface 7(51):1429–1439 | Dose error analysis; basis for risk labelling rules R01–R08 |
| **ISMP High-Alert Medications list** | Clinical context for drug library entries |
| **FDA Infusion Pump Safety guidance** | Alarm hierarchy, safety-critical event logging requirements |

### Values taken DIRECTLY from DFU manual (not approximated)

| Parameter | Value | DFU source |
|---|---|---|
| RATE_MIN | 0.1 ml/h | Factory Default Data Set table |
| RATE_MAX | 1200 ml/h | Factory Default Data Set table |
| KVO_RATE | 1.0 ml/h | Factory Default Data Set table |
| BOLUS_RATE_DEFAULT | 500 ml/h | Factory Default Data Set table |
| BOLUS_VOLUME_MAX | 5 ml | Factory Default Data Set table |
| VTBI_MAX | 9999 ml | Factory Default Data Set table |
| PRESSURE_DEFAULT | L5 | Factory Default Data Set table |
| PRESSURE_LEVELS | L0–L8 (8 levels) | Factory Default Data Set table |
| AIL_LIMIT_MAX | 100 µl | Factory Default Data Set table |
| ALARM_VOLUME | medium | Factory Default Data Set table |
| ON/OFF hold duration | 3 seconds | DFU Section 3 — Controls |
| MUTE silence duration | ~120 seconds | DFU Section 3 — Controls |
| Chevron single step | 1 unit | DFU Section 3 — "faster/slower" |
| Chevron double step | 10 units | DFU Section 3 — "faster/slower" |
| Hold-to-accelerate delay | 500 ms | DFU Section 3 |
| Hold-to-accelerate repeat | 80 ms | DFU Section 3 |
| 10 screen states | See list below | DFU workflow + PVSio-web |
| 10 alarm types | See list below | DFU Alarms section pp.24–26 |
| 14 dose unit types | See types.ts | DFU default dosing units list |

### Values APPROXIMATED (not directly from DFU — documented here for transparency)

| Item | What we used | Why approximated |
|---|---|---|
| Drug guardrail limits | Clinical literature + ISMP | DFU only defines structure; actual limits are hospital-specific |
| Drug concentrations | Standard ICU concentrations | Real hospitals program their own libraries |
| Risk rules R01–R21 | Cauchi/Thimbleby papers + research judgment | Not from manufacturer; this is the research contribution |
| Weight entry UI | Chevron-based integer kg stepping | DFU mentions weight input but doesn't specify exact UI |
| CVE firmware versions | Plausible versions based on BD security advisories | Not verified against official CVE database |
| Network packet format | Synthetic, structured like BD Alaris comms | Real protocol not publicly documented |

---

## ARCHITECTURE

```
alaris-simulator/
├── CLAUDE.md                  ← Master spec (read before all code changes)
├── BUILT.md                   ← This file
├── index.html
├── package.json               ← Vite + React 18 + TypeScript strict
├── tsconfig.json
├── vite.config.ts
│
├── src/
│   ├── main.tsx               ← React root
│   ├── App.tsx                ← Tab navigation: PUMP | NETWORK | RESEARCH
│   │
│   ├── contexts/
│   │   └── PumpContext.tsx    ← Shared pump state across all panels
│   │
│   ├── pump/                  ← PURE TYPESCRIPT — zero React imports
│   │   ├── types.ts           ← All shared types (PumpState, SessionLogEntry, etc.)
│   │   ├── constants.ts       ← FACTORY_DEFAULTS — all DFU magic numbers
│   │   ├── drugLibrary.ts     ← 10-drug DRUG_LIBRARY (clinically validated)
│   │   ├── guardrails.ts      ← checkGuardrail() — soft/hard limit logic
│   │   ├── display.ts         ← rateToMlH() all 14 units, formatTime(), clamps
│   │   ├── alarms.ts          ← ALARM_DEFINITIONS — 10 alarm types
│   │   └── stateMachine.ts    ← Pure state transition functions
│   │
│   ├── hooks/
│   │   ├── usePump.ts         ← React bridge to state machine
│   │   ├── useLogger.ts       ← Session log + derived counters
│   │   └── useHoldRepeat.ts   ← Hold-to-accelerate chevron timing
│   │
│   ├── network/               ← PURE TYPESCRIPT — zero React imports
│   │   ├── networkTypes.ts    ← NetworkState, NetworkPacket, AttackScenario types
│   │   ├── connectionMachine.ts ← Connection state transitions (OFFLINE→CONNECTED)
│   │   └── packetGenerator.ts ← Synthetic packet construction from pump events
│   │
│   ├── components/
│   │   ├── AlarisGP.tsx       ← Main pump UI (render only, uses PumpContext)
│   │   ├── NetworkSimulator.tsx ← Plan A: topology + packet log + attack panel
│   │   └── Research/
│   │       └── ResearchPanel.tsx ← Plan E: Task Mode + live metrics
│   │
│   ├── ai/                    ← (PLANNED — not yet built)
│   │   ├── featureExtractor.ts
│   │   ├── labellingRules.ts
│   │   ├── scenarioGenerator.ts
│   │   └── datasetBuilder.ts
│   │
│   └── tests/                 ← (PLANNED — not yet built)
│       └── stateMachine.test.ts
│
└── data/
    ├── sessions/              ← Raw session JSON (written by simulator)
    ├── dataset/               ← Training CSV + JSON (written by datasetBuilder)
    └── scenarios/             ← Predefined scenario configs
```

---

## COMPLETED FEATURES

### Pump Core (src/pump/)

| Feature | Status | DFU Reference |
|---|---|---|
| All 10 screen states | ✅ Complete | DFU workflow |
| All 12 valid screen transitions | ✅ Complete | DFU workflow + PVSio-web |
| Chevron rate entry (1 / 10 step) | ✅ Complete | DFU Section 3 |
| Hold-to-accelerate (500ms / 80ms) | ✅ Complete | DFU Section 3 |
| Rate clamping to RATE_MIN / RATE_MAX | ✅ Complete | DFU Factory Defaults |
| Guardrail soft limit warning + override | ✅ Complete | DFU BDDF00535 |
| Guardrail hard limit blocked | ✅ Complete | DFU BDDF00535 |
| VTBI entry and tracking | ✅ Complete | DFU |
| KVO mode after VTBI complete | ✅ Complete | DFU — rate drops to 1.0 ml/h |
| INFUSION_COMPLETE alarm | ✅ Complete | DFU Alarms |
| Bolus hold-to-deliver | ✅ Complete | DFU Section 3 |
| Bolus volume → volumeInfused | ✅ Complete | DFU |
| MUTE 120-second silence window | ✅ Complete | DFU Section 3 |
| ON/OFF 3-second hold-to-power-off | ✅ Complete | DFU Section 3 |
| Drug library with 10 drugs | ✅ Complete | DFU unit list + clinical sources |
| rateToMlH() for all 14 dose units | ✅ Complete | DFU dosing units |
| Weight entry screen (WEIGHT_ENTRY) | ✅ Complete | DFU weight-based dosing |
| Drug cursor navigation (↑/↓ softkeys) | ✅ Complete | DFU softkey spec |
| Pressure alarm view (L1–L8) | ✅ Complete | DFU pressure section |
| OPTIONS menu (interactive) | ✅ Complete | DFU |
| Time remaining display (24+ cap) | ✅ Complete | DFU display spec |
| Immutable session log | ✅ Complete | Research requirement |
| Alarm flash on screen transition | ✅ Complete | DFU indicator spec |

### Hooks

| Hook | Status | Purpose |
|---|---|---|
| usePump.ts | ✅ Complete | Bridges React to pure state machine |
| useLogger.ts | ✅ Complete | Immutable session log + derived counters |
| useHoldRepeat.ts | ✅ Complete | Hold-to-accelerate timer logic |

### Bugs Fixed (from original prototype AlarisGP.jsx)

| # | Bug | Fix |
|---|---|---|
| 1 | Duplicate `adjustRate` function (second silently overrode first) | Eliminated — single pure function in stateMachine.ts |
| 2 | `guardrailOverride` never reset between drug selections | Reset in `selectDrug()` |
| 3 | `entryStartTime` set at RUN press, not at drug selection | Set in `handleDrugSelect` |
| 4 | `logEvent` captured stale screen via closure | `makeLogEntry` takes `screen` as explicit parameter |
| 5 | `rateToMlH` only handled ml/h and weight-based kg/min | Complete for all 14 DFU dose units |

---

## IN PROGRESS

- **Plan A — Network & Gateway Simulator** (src/components/NetworkSimulator.tsx)
- **Plan E — Research Panel / Task Mode** (src/components/Research/ResearchPanel.tsx)

---

## PLANNED (not yet built)

| Item | Files | Priority |
|---|---|---|
| AI feature extraction | src/ai/featureExtractor.ts | High |
| Risk labelling rules R01–R21 | src/ai/labellingRules.ts | High |
| Scenario generator (4 profiles) | src/ai/scenarioGenerator.ts | High |
| Dataset builder (N synthetic sessions) | src/ai/datasetBuilder.ts | High |
| Behavioural tests | src/tests/stateMachine.test.ts | Medium |
| Multi-pump Gateway dashboard | src/components/GatewayDashboard.tsx | Medium |
| CVE scenario replayer | src/components/CveReplayer.tsx | Medium |
| Compliance audit dashboard | src/components/ComplianceDashboard.tsx | Low |

---

## KNOWN APPROXIMATIONS FOR PAPER DISCLOSURE

1. Drug guardrail limits are from clinical literature, not a specific hospital's Alaris library
2. Risk rules R01–R21 are the research contribution (not from manufacturer)
3. Bolus uses a hardware button; real device uses a softkey hold
4. Weight entry uses chevron stepping; real device may use digit-by-digit entry
5. CVE firmware versions are plausible but not verified against official BD CVE disclosures
6. Network packet format is synthetic (real BD Alaris protocol is not publicly documented)

---

END OF BUILT.md
