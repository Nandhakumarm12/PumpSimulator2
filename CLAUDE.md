# ALARIS GP SIMULATOR — CLAUDE CODE MASTER INSTRUCTIONS
# Read this file completely before writing any code.
# This is the single source of truth for the entire project.

---

## 1. PROJECT OVERVIEW

### What This Is
A research-grade simulator of the **Alaris GP Volumetric Infusion Pump** (BD/CareFusion),
built for an AI-driven safety and security ranking system for medical devices.

### Funding Context
QR Seed Pilot Study: "An AI-Empowered Safety and Security Ranking System for
Infusion Pump Medical Devices" — University pilot, 6-month timeline.

### The Two Goals Running in Parallel
1. **Behavioural fidelity** — the simulator must behave exactly like the real Alaris GP
   as documented in the official Directions For Use (DFU) manual (BD document
   1000DF00152 Issue 1 and BDDF00535 Issue 4).
2. **Data generation** — every session produces a structured record that feeds directly
   into a baseline AI risk model. The simulator IS the dataset generator.

### Research Basis
Primary paper: Cauchi et al. (2011) "Towards Dependable Number Entry for Medical Devices"
EICS4Med Workshop. CHI-MED Project. www.chi-med.ac.uk
Formal models: PVSio-web — http://www.pvsioweb.org/demos/AlarisGP (full model)
Source: https://github.com/pvsioweb/pvsio-web/tree/master/examples/demos/AlarisGP

---

## 2. DIRECTORY STRUCTURE

```
alaris-simulator/
│
├── CLAUDE.md                    ← THIS FILE — read first, always
│
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   │
│   ├── pump/                    ← Pure state machine — NO React imports allowed here
│   │   ├── types.ts             ← All shared types and interfaces
│   │   ├── constants.ts         ← All magic numbers from the DFU manual
│   │   ├── drugLibrary.ts       ← Drug database with Guardrail limits
│   │   ├── stateMachine.ts      ← Core pump state transitions
│   │   ├── guardrails.ts        ← Guardrail logic (soft/hard limits)
│   │   ├── display.ts           ← Display state computation
│   │   └── alarms.ts            ← Alarm conditions and triggers
│   │
│   ├── hooks/
│   │   ├── usePump.ts           ← React hook wrapping state machine
│   │   ├── useLogger.ts         ← Session logging hook
│   │   └── useHoldRepeat.ts     ← Hold-to-accelerate logic
│   │
│   ├── components/
│   │   ├── AlarisGP.tsx         ← Main pump component (already built: AlarisGP.jsx)
│   │   ├── Display/
│   │   │   ├── LcdScreen.tsx    ← LCD display renderer
│   │   │   └── ScreenViews.tsx  ← All 10 screen states
│   │   ├── Controls/
│   │   │   ├── ChevronKeys.tsx  ← «« « » »» buttons
│   │   │   ├── PumpButtons.tsx  ← RUN HOLD BOLUS etc
│   │   │   └── Softkeys.tsx     ← Context-sensitive softkeys
│   │   └── Research/
│   │       ├── SessionLogger.tsx   ← Live log table
│   │       ├── MetricsPanel.tsx    ← Live research metrics
│   │       ├── TaskMode.tsx        ← Target-value task mode
│   │       └── ExportPanel.tsx     ← CSV/JSON export
│   │
│   ├── ai/
│   │   ├── featureExtractor.ts  ← Converts session log → feature record
│   │   ├── labellingRules.ts    ← Rule-based risk label assignment
│   │   ├── datasetBuilder.ts    ← Assembles training records
│   │   └── scenarioGenerator.ts ← Synthetic scenario generator
│   │
│   └── tests/
│       ├── stateMachine.test.ts ← Behavioural correctness tests
│       ├── guardrails.test.ts   ← Guardrail logic tests
│       └── featureExtractor.test.ts ← AI feature extraction tests
│
├── data/
│   ├── sessions/                ← Raw session JSON files
│   ├── dataset/                 ← Assembled training records (CSV)
│   └── scenarios/               ← Predefined scenario configs
│
├── package.json
├── tsconfig.json
└── vite.config.ts
```

---

## 3. PUMP HARDWARE SPECIFICATION
### Source: Alaris GP DFU Manual (BD 1000DF00152 Issue 1, BDDF00535 Issue 4)

### 3.1 Physical Controls
Every control must be modelled exactly as the manual describes:

| Control     | Code | Manual Description                                              | Simulator Behaviour                          |
|-------------|------|-----------------------------------------------------------------|----------------------------------------------|
| ON/OFF      | `a`  | Press once ON; hold 3 seconds OFF                               | Click = ON; hold 3s shows confirm dialog     |
| RUN         | `b`  | Start infusion; green LED flashes during infusion               | Starts infusion; triggers guardrail check    |
| HOLD        | `h`  | Put infusion on hold; amber LED lit                             | Pauses infusion; amber indicator             |
| MUTE        | `c`  | Silence alarm for ~2 minutes; resounds after                    | Silences for 120s; logs mute event           |
| BOLUS       | `i`  | Press and HOLD softkey to operate; adds to volume infused       | Hold-to-deliver; stops on release            |
| OPTIONS     | `d`  | Access optional features                                        | Opens options menu                           |
| PRESSURE    | `e`  | Display pumping pressure and adjust alarm limit                 | Shows pressure bar L0–L8; adjustable         |
| CHEVRONS    | `f`  | Double=faster, Single=slower increase/decrease of values        | «« = -10, « = -1, » = +1, »» = +10          |
| SOFTKEYS    | `g`  | Context-sensitive; label shown on display above each key        | Change per screen (3 softkeys total)         |

### 3.2 Indicators
| Indicator        | Behaviour                                               |
|------------------|---------------------------------------------------------|
| AC Power (S)     | Lit when connected to mains; battery charging          |
| Battery (j)      | Lit on battery power; flashes when <30 min remaining   |
| Run LED (green)  | Flashes during infusion                                 |
| Hold LED (amber) | Steady during hold                                     |

### 3.3 Chevron Hold-to-Accelerate
- First press: immediate single step
- Hold 500ms: begin repeat at 80ms intervals
- This mirrors the physical pump behaviour documented in Section 3

---

## 4. FACTORY DEFAULT PARAMETERS
### Source: DFU Manual "Factory Default Data Set" table (exact values, do not change)

```typescript
// src/pump/constants.ts — use these exact values
export const FACTORY_DEFAULTS = {
  // Rate limits
  RATE_MIN:              0.1,      // ml/h — minimum infusion rate
  RATE_MAX:              1200,     // ml/h — "Infusion Rate Max"
  RATE_DEFAULT:          0.0,      // ml/h — starts at zero

  // VTBI
  VTBI_MAX:              9999,     // ml — "VTBI Max"
  VTBI_MIN:              0.1,      // ml
  VTBI_DEFAULT:          null,     // not set by default (flow sensor required)

  // KVO (Keep Vein Open)
  KVO_RATE:              1.0,      // ml/h — runs after VTBI complete

  // Bolus
  BOLUS_RATE_DEFAULT:    500,      // ml/h — "Bolus Rate Default"
  BOLUS_RATE_MAX:        1200,     // ml/h — "Bolus Rate Max"
  BOLUS_VOLUME_MAX:      5,        // ml   — "Bolus Volume Max"
  BOLUS_MODE:            true,     // "Bolus Mode Enabled" by default

  // Pressure alarm
  PRESSURE_DEFAULT:      5,        // L5 — "Pressure Default L5"
  PRESSURE_MAX:          8,        // L8 — "Pressure Max L8"
  PRESSURE_LEVELS:       8,        // 0–8

  // Air-in-line
  AIL_LIMIT_MAX:         100,      // µl — "AIL Limit Max 100µl"

  // Weight (for dose/kg calculations)
  WEIGHT_DEFAULT:        70,       // kg — clinical standard (manual says 1kg factory; use 70kg for realism)

  // Alarm
  ALARM_VOLUME:          "medium", // "Alarm Volume Medium"
  AC_FAIL_WARNING:       true,     // "AC Fail Warning Enabled"

  // Secondary infusion
  SECONDARY_INFUSION:    false,    // "Secondary Infusion Disabled"

  // Rate titration
  RATE_TITRATION:        false,    // "Rate Titration Disabled"

  // Chevron steps (from manual "faster/slower" description)
  STEP_LARGE:            10,       // double chevron
  STEP_SMALL:            1,        // single chevron
};
```

---

## 5. DRUG LIBRARY
### Source: DFU Manual default dosing units + clinical standard concentrations

Every drug has these fields. Do NOT invent values — use clinically validated ones.

```typescript
// src/pump/drugLibrary.ts
export interface Drug {
  id: string;
  name: string;                  // Display name (max 12 chars for LCD)
  unit: DoseUnit;                // Dosing unit from manual's default list
  concentration: number;         // mg/ml, U/ml, mmol/ml etc.
  concentrationUnit: string;     // unit of concentration
  softMin: number;               // Guardrails soft minimum (warning)
  softMax: number;               // Guardrails soft maximum (warning)
  hardMin: number;               // Guardrails hard minimum (blocked)
  hardMax: number;               // Guardrails hard maximum (blocked)
  defaultRate: number;           // Pre-loaded default rate
  bolusAllowed: boolean;         // Can bolus be delivered?
  weightBased: boolean;          // Is dose per kg?
  rateUnit: string;              // What unit the chevrons adjust (ml/h internally)
  clinicalContext: string;       // For research annotation
}

// The 14 default dosing units listed in DFU manual:
export type DoseUnit =
  | "ml/h"
  | "µg/min" | "µg/h"
  | "mg/h"
  | "g/h"
  | "U/h"
  | "mmol/h"
  | "ng/kg/min"
  | "µg/kg/min" | "µg/kg/h"
  | "mg/kg/min" | "mg/kg/h"
  | "U/kg/h"
  | "mmol/kg/min" | "mmol/kg/h";

export const DRUG_LIBRARY: Drug[] = [
  // MANUAL mode — bypasses drug library entirely
  {
    id: "manual",
    name: "MANUAL ml/h",
    unit: "ml/h",
    concentration: 1,
    concentrationUnit: "ml/ml",
    softMin: 1, softMax: 1200, hardMin: 0.1, hardMax: 1200,
    defaultRate: 100,
    bolusAllowed: true, weightBased: false,
    rateUnit: "ml/h",
    clinicalContext: "Direct rate entry without drug library — highest risk profile"
  },
  {
    id: "adrenaline",
    name: "ADRENALINE",
    unit: "µg/kg/min",
    concentration: 4,          // 4mg in 50ml = 0.08mg/ml
    concentrationUnit: "mg/ml",
    softMin: 0.01, softMax: 0.5, hardMin: 0.001, hardMax: 1.0,
    defaultRate: 0.1,
    bolusAllowed: true, weightBased: true,
    rateUnit: "µg/kg/min",
    clinicalContext: "Vasopressor — narrow therapeutic window, ICU use"
  },
  {
    id: "morphine",
    name: "MORPHINE",
    unit: "mg/h",
    concentration: 1,          // 1mg/ml
    concentrationUnit: "mg/ml",
    softMin: 1, softMax: 10, hardMin: 0.5, hardMax: 20,
    defaultRate: 2,
    bolusAllowed: true, weightBased: false,
    rateUnit: "mg/h",
    clinicalContext: "Opioid analgesic — respiratory depression risk above soft max"
  },
  {
    id: "heparin",
    name: "HEPARIN",
    unit: "U/h",
    concentration: 1000,       // 1000 U/ml (25,000 U in 25ml)
    concentrationUnit: "U/ml",
    softMin: 500, softMax: 2000, hardMin: 100, hardMax: 5000,
    defaultRate: 1000,
    bolusAllowed: false, weightBased: false,
    rateUnit: "U/h",
    clinicalContext: "Anticoagulant — bleeding risk, requires monitoring"
  },
  {
    id: "dopamine",
    name: "DOPAMINE",
    unit: "µg/kg/min",
    concentration: 3.2,        // 160mg in 50ml
    concentrationUnit: "mg/ml",
    softMin: 2, softMax: 20, hardMin: 1, hardMax: 50,
    defaultRate: 5,
    bolusAllowed: false, weightBased: true,
    rateUnit: "µg/kg/min",
    clinicalContext: "Vasopressor/inotrope — dose-dependent receptor activity"
  },
  {
    id: "noradrenaline",
    name: "NORADRENLN",
    unit: "µg/kg/min",
    concentration: 4,          // 4mg in 50ml
    concentrationUnit: "mg/ml",
    softMin: 0.01, softMax: 0.3, hardMin: 0.001, hardMax: 2.0,
    defaultRate: 0.05,
    bolusAllowed: false, weightBased: true,
    rateUnit: "µg/kg/min",
    clinicalContext: "Vasopressor — septic shock, ICU use, extreme narrow window"
  },
  {
    id: "propofol",
    name: "PROPOFOL",
    unit: "mg/kg/h",
    concentration: 10,         // 10mg/ml
    concentrationUnit: "mg/ml",
    softMin: 1, softMax: 6, hardMin: 0.5, hardMax: 12,
    defaultRate: 2,
    bolusAllowed: false, weightBased: true,
    rateUnit: "mg/kg/h",
    clinicalContext: "Sedative/anaesthetic — PRIS risk above 4mg/kg/h prolonged"
  },
  {
    id: "insulin",
    name: "INSULIN",
    unit: "U/h",
    concentration: 1,          // 1 U/ml (50U in 50ml saline)
    concentrationUnit: "U/ml",
    softMin: 1, softMax: 10, hardMin: 0.5, hardMax: 50,
    defaultRate: 2,
    bolusAllowed: false, weightBased: false,
    rateUnit: "U/h",
    clinicalContext: "Hypoglycaemia risk — requires glucose monitoring protocol"
  },
  {
    id: "amiodarone",
    name: "AMIODARONE",
    unit: "mg/h",
    concentration: 1.8,        // 900mg in 500ml 5% glucose
    concentrationUnit: "mg/ml",
    softMin: 10, softMax: 100, hardMin: 5, hardMax: 150,
    defaultRate: 30,
    bolusAllowed: false, weightBased: false,
    rateUnit: "mg/h",
    clinicalContext: "Antiarrhythmic — phlebitis risk, incompatibilities"
  },
  {
    id: "kcl",
    name: "KCl 20mmol",
    unit: "mmol/h",
    concentration: 1,          // 1mmol/ml
    concentrationUnit: "mmol/ml",
    softMin: 5, softMax: 20, hardMin: 1, hardMax: 40,
    defaultRate: 10,
    bolusAllowed: false, weightBased: false,
    rateUnit: "mmol/h",
    clinicalContext: "Electrolyte — cardiac arrest risk if rapid infusion"
  },
];
```

---

## 6. PUMP STATE MACHINE
### Source: DFU Manual workflow + PVSio-web formal model

### 6.1 Screen States (all 10 must be implemented)
```typescript
// src/pump/types.ts
export type PumpScreen =
  | "LANGUAGE_SELECT"     // First boot — language selection
  | "DRUG_SELECT"         // Choose drug from library or MANUAL
  | "RATE_ENTRY"          // Main number entry screen — chevrons active here
  | "VTBI_ENTRY"          // Optional VTBI setting
  | "GUARDRAIL_WARNING"   // Soft limit exceeded — can override
  | "GUARDRAIL_BLOCKED"   // Hard limit exceeded — must re-enter
  | "RUNNING"             // Infusion active
  | "ON_HOLD"             // Infusion paused
  | "ALARM"               // Alarm condition active
  | "OPTIONS"             // Options menu (VTBI, KVO, Event Log)
  | "PRESSURE_VIEW";      // Pressure display and adjustment
```

### 6.2 Valid Screen Transitions
```
LANGUAGE_SELECT  →  DRUG_SELECT
DRUG_SELECT      →  RATE_ENTRY
RATE_ENTRY       →  GUARDRAIL_WARNING  (soft limit hit on RUN)
RATE_ENTRY       →  GUARDRAIL_BLOCKED  (hard limit hit on RUN)
RATE_ENTRY       →  RUNNING            (rate OK on RUN)
RATE_ENTRY       →  VTBI_ENTRY         (VTBI softkey)
VTBI_ENTRY       →  RATE_ENTRY         (OK or BACK)
GUARDRAIL_WARNING → RUNNING            (OVERRIDE softkey — MUST LOG)
GUARDRAIL_WARNING → RATE_ENTRY         (RE-ENTER softkey)
GUARDRAIL_BLOCKED → RATE_ENTRY         (RE-ENTER softkey — only option)
RUNNING          →  ON_HOLD            (HOLD button)
RUNNING          →  ALARM              (alarm condition triggered)
RUNNING          →  OPTIONS            (OPTIONS button)
ON_HOLD          →  RUNNING            (RUN button)
ON_HOLD          →  RATE_ENTRY         (RE-PROG softkey)
ON_HOLD          →  OPTIONS            (OPTIONS button)
ALARM            →  ON_HOLD            (SILENCE softkey)
OPTIONS          →  VTBI_ENTRY         (SET VTBI option)
OPTIONS          →  previous           (BACK)
PRESSURE_VIEW    →  previous           (BACK)
Any screen       →  LANGUAGE_SELECT    (ON/OFF hold 3s — full reset)
```

### 6.3 Chevron Rate Entry Logic
```
RATE_ENTRY screen only (plus VTBI_ENTRY for VTBI, PRESSURE_VIEW for level):

»»  (double up):   rate += STEP_LARGE (10)
»   (single up):   rate += STEP_SMALL (1)
«   (single down): rate -= STEP_SMALL (1)
««  (double down): rate -= STEP_LARGE (10)

Clamping: ABSOLUTE (no stateful memory)
  - If rate + delta > RATE_MAX: rate = RATE_MAX, log boundary_hit
  - If rate + delta < RATE_MIN: rate = RATE_MIN, log boundary_hit

Hold-to-accelerate:
  - mousedown/touchstart: immediate press + set 500ms timer
  - After 500ms: fire every 80ms until mouseup/touchend/mouseleave
```

### 6.4 Guardrail Logic
```typescript
// src/pump/guardrails.ts

function checkGuardrail(
  rate: number,       // rate in DRUG UNITS (not ml/h)
  drug: Drug
): GuardrailResult {
  if (!drug || drug.id === "manual") return { status: "ok" };
  if (rate > drug.hardMax || rate < drug.hardMin) return { status: "blocked" };
  if (rate > drug.softMax || rate < drug.softMin) return {
    status: "warning",
    message: rate > drug.softMax
      ? `RATE TOO HIGH\n${rate.toFixed(2)} > ${drug.softMax} ${drug.unit}`
      : `RATE TOO LOW\n${rate.toFixed(2)} < ${drug.softMin} ${drug.unit}`
  };
  return { status: "ok" };
}

type GuardrailResult =
  | { status: "ok" }
  | { status: "warning"; message: string }
  | { status: "blocked"; message?: string };
```

### 6.5 Display Layout (exact from DFU manual page 7)
```
Without VTBI:                    With VTBI:
┌─────────────────────┐         ┌─────────────────────┐
│ ON HOLD             │         │ ADRENALINE*          │
│ RATE                │         │ RATE                 │
│ 25.0  ml/h          │         │ 25.0 ml/h            │
│                     │         │ 16.7 µg/kg/24h       │
│ VOLUME VTBI [btn]   │         │ VTBI    45.0 ml      │
│ VOLUME ml           │         │ VOLUME  50.0 ml      │
│ 50.0                │         │ 1h 48m 00s           │
├──────┬──────┬───────┤         ├──────┬──────┬────────┤
│SK1   │SK2   │SK3    │         │SK1   │SK2   │SK3     │
└──────┴──────┴───────┘         └──────┴──────┴────────┘

* = drug protocol active indicator
Pressure bar: top-right, 8 segments, colour-coded L1-L4=green L5-L6=amber L7-L8=red
Time remaining: shown as "24+" if > 24 hours
```

---

## 7. ALARM SYSTEM
### Source: DFU Manual "Alarms" section (pages 24–26 original, pages 33–38 new edition)

### 7.1 Alarm Hierarchy
```typescript
export type AlarmType =
  | "OCCLUSION"          // High pressure — stops infusion — CRITICAL
  | "AIR_IN_LINE"        // Air detected — stops infusion — CRITICAL
  | "INFUSION_COMPLETE"  // VTBI reached — informational
  | "BATTERY_LOW"        // < 30 min remaining — WARNING
  | "AC_FAIL"            // Mains power lost — WARNING (if enabled)
  | "RATE_TOO_HIGH"      // Above soft max — advisory
  | "RATE_TOO_LOW"       // Below soft min — advisory
  | "KVO"                // Running at KVO rate after VTBI complete
  | "UPSTREAM_OCCLUSION" // No flow detected (if flow sensor fitted)
  | "SET_NOT_PRIMED";    // Infusion set not detected
```

### 7.2 Alarm Conditions (when each triggers in simulator)
```
OCCLUSION:          pressureLevel >= 7 during running (simulate at random or on trigger)
AIR_IN_LINE:        synthetic trigger (research button) or auto after 500ml
INFUSION_COMPLETE:  volumeInfused >= vtbi
BATTERY_LOW:        batteryLevel < 15% (synthetic)
AC_FAIL:            networkConnected = false AND on battery
RATE_TOO_HIGH:      guardrail soft max exceeded (advisory, not stop)
RATE_TOO_LOW:       guardrail soft min exceeded (advisory, not stop)
KVO:                VTBI complete → rate drops to KVO automatically
```

---

## 8. AI FEATURE SCHEMA
### This is what the simulator generates for AI model training.
### Every session MUST produce a complete record with ALL these fields.

```typescript
// src/ai/featureExtractor.ts

export interface TrainingRecord {
  // ── Metadata ──────────────────────────────────────────────────────
  record_id:              string;   // e.g. "alaris_001_task_03"
  session_id:             string;   // UUID
  timestamp_iso:          string;   // ISO datetime of session
  pump_model:             string;   // "alaris_gp"
  firmware_version:       string;   // from FACTORY_DEFAULTS or scenario

  // ── INTERACTION FEATURES (extracted from session log) ─────────────
  entry_time_ms:          number;   // ms from first keypress to RUN confirmation
  total_keypresses:       number;   // all chevron presses during rate entry
  large_up_count:         number;   // »» presses
  small_up_count:         number;   // » presses
  small_down_count:       number;   // « presses
  large_down_count:       number;   // «« presses
  correction_count:       number;   // direction reversals during entry
  boundary_hit_count:     number;   // times hit RATE_MIN or RATE_MAX
  large_btn_ratio:        number;   // (large_up + large_down) / total_keypresses
  golden_path_ratio:      number;   // actual_keypresses / minimum_possible_keypresses
  final_rate_ml_h:        number;   // actual programmed rate in ml/h
  intended_rate_ml_h:     number;   // target rate (in task mode) in ml/h
  error_magnitude_ml_h:   number;   // abs(final - intended) in ml/h
  relative_error:         number;   // error_magnitude / intended (0 = perfect, 1 = 100% off)
  confirmed_incorrect:    0 | 1;    // 1 if confirmed with wrong value
  drug_unit_used:         string;   // the unit displayed during entry

  // ── CONFIGURATION FEATURES (pump setup state) ──────────────────────
  drug_id:                string;   // drug.id from DRUG_LIBRARY
  drug_name:              string;   // drug.name
  drug_library_used:      0 | 1;    // 1 if drug selected from library, 0 if MANUAL
  guardrail_soft_min:     number;   // drug.softMin (in drug units)
  guardrail_soft_max:     number;   // drug.softMax (in drug units)
  guardrail_hard_min:     number;   // drug.hardMin
  guardrail_hard_max:     number;   // drug.hardMax
  guardrail_warning_shown: 0 | 1;  // 1 if soft limit warning appeared
  guardrail_override:     0 | 1;    // 1 if nurse clicked OVERRIDE on warning
  guardrail_blocked:      0 | 1;    // 1 if hard limit was hit at any point
  rate_within_soft_limits: 0 | 1;  // 1 if final rate is within soft limits
  vtbi_set:               0 | 1;    // 1 if VTBI was programmed
  vtbi_value_ml:          number;   // VTBI in ml (0 if not set)
  kvo_rate_ml_h:          number;   // KVO rate configured
  bolus_delivered:        0 | 1;    // 1 if bolus was used during session
  bolus_volume_ml:        number;   // total bolus volume delivered
  secondary_infusion:     0 | 1;    // 1 if secondary configured
  patient_weight_kg:      number;   // weight used for dose/kg calculations
  pressure_alarm_level:   number;   // 1–8, L5 is default

  // ── DEVICE / SYSTEM FEATURES (synthetic per scenario) ─────────────
  days_since_maintenance: number;   // 0–730 (2 years max)
  battery_level_pct:      number;   // 0–100
  firmware_version_risk:  0 | 1;    // 1 if firmware in known CVE list
  network_connected:      0 | 1;    // 1 if connected to Gateway
  drug_library_age_days:  number;   // days since library last updated
  config_drift_score:     number;   // 0.0–1.0 (how far from hospital standard)
  recent_occlusion_alarms: number;  // count in simulated last 24h
  alarms_during_session:  number;   // alarms triggered in this session

  // ── RISK LABEL (assigned by labellingRules.ts) ─────────────────────
  risk_label:             "low" | "medium" | "high";
  risk_score:             number;   // 0.0–1.0 continuous score
  risk_reasons:           string[]; // which rules triggered (for explainability)
}
```

---

## 9. RISK LABELLING RULES
### These are the rules that assign risk_label to each training record.
### Source: Clinical literature + Cauchi et al. (2011) + Thimbleby & Cairns (2010)

```typescript
// src/ai/labellingRules.ts

// HIGH RISK — any single trigger is sufficient
const HIGH_RISK_RULES = [
  { id: "R01", label: "10x dose error",         test: r => r.relative_error >= 0.9 },
  { id: "R02", label: "50% dose error",          test: r => r.relative_error >= 0.5 },
  { id: "R03", label: "Hard limit override att", test: r => r.guardrail_blocked === 1 },
  { id: "R04", label: "No drug library + high rate", test: r => r.drug_library_used === 0 && r.final_rate_ml_h > 200 },
  { id: "R05", label: "Firmware CVE",            test: r => r.firmware_version_risk === 1 },
  { id: "R06", label: "No maintenance >1 year",  test: r => r.days_since_maintenance > 365 },
  { id: "R07", label: "KCl above hard limit",    test: r => r.drug_id === "kcl" && r.rate_within_soft_limits === 0 },
  { id: "R08", label: "Confirmed wrong value",   test: r => r.confirmed_incorrect === 1 && r.relative_error > 0.1 },
];

// MEDIUM RISK — any single trigger (without High risk triggers)
const MEDIUM_RISK_RULES = [
  { id: "R10", label: "10% dose error",          test: r => r.relative_error >= 0.1 },
  { id: "R11", label: "Soft limit override",     test: r => r.guardrail_override === 1 },
  { id: "R12", label: "No drug library",         test: r => r.drug_library_used === 0 },
  { id: "R13", label: "No VTBI set",             test: r => r.vtbi_set === 0 },
  { id: "R14", label: "Many corrections (>5)",   test: r => r.correction_count > 5 },
  { id: "R15", label: "Boundary hit during entry", test: r => r.boundary_hit_count > 0 },
  { id: "R16", label: "Outdated drug library",   test: r => r.drug_library_age_days > 90 },
  { id: "R17", label: "Low battery",             test: r => r.battery_level_pct < 20 },
  { id: "R18", label: "Disconnected from gateway", test: r => r.network_connected === 0 },
  { id: "R19", label: "High config drift",       test: r => r.config_drift_score > 0.5 },
  { id: "R20", label: "Recent occlusion alarms", test: r => r.recent_occlusion_alarms >= 3 },
  { id: "R21", label: "Slow entry (>60s)",       test: r => r.entry_time_ms > 60000 },
];
// LOW RISK = none of the above
```

---

## 10. SCENARIO GENERATOR
### Produces synthetic device states for Layer 3 features (no physical device needed)

```typescript
// src/ai/scenarioGenerator.ts

export interface ScenarioProfile {
  id: string;
  name: string;              // Human-readable label
  description: string;
  // Ranges for random generation within this profile
  device: {
    firmware_version:        string | "random_cve";
    days_since_maintenance:  [number, number];  // [min, max]
    battery_level_pct:       [number, number];
    network_connected:       boolean | "random";
    drug_library_age_days:   [number, number];
    config_drift_score:      [number, number];
    recent_occlusion_alarms: [number, number];
  };
}

export const SCENARIO_PROFILES: ScenarioProfile[] = [
  {
    id: "ideal",
    name: "Well-maintained, connected",
    description: "Pump in perfect condition, connected to Gateway, library current",
    device: {
      firmware_version: "9.12",
      days_since_maintenance: [0, 30],
      battery_level_pct: [80, 100],
      network_connected: true,
      drug_library_age_days: [0, 14],
      config_drift_score: [0, 0.05],
      recent_occlusion_alarms: [0, 0],
    }
  },
  {
    id: "neglected",
    name: "Overdue maintenance, isolated",
    description: "Common ward scenario — pump not maintained, library out of date",
    device: {
      firmware_version: "8.05",
      days_since_maintenance: [180, 730],
      battery_level_pct: [10, 40],
      network_connected: false,
      drug_library_age_days: [90, 365],
      config_drift_score: [0.3, 0.8],
      recent_occlusion_alarms: [1, 5],
    }
  },
  {
    id: "cyber_risk",
    name: "Known vulnerable firmware",
    description: "Firmware version with known CVE — security risk scenario",
    device: {
      firmware_version: "random_cve",
      days_since_maintenance: [30, 180],
      battery_level_pct: [50, 90],
      network_connected: true,
      drug_library_age_days: [0, 30],
      config_drift_score: [0, 0.3],
      recent_occlusion_alarms: [0, 2],
    }
  },
  {
    id: "emergency",
    name: "Emergency use, no library",
    description: "Pump used in emergency without drug library — MANUAL mode only",
    device: {
      firmware_version: "9.12",
      days_since_maintenance: [0, 365],
      battery_level_pct: [30, 80],
      network_connected: "random",
      drug_library_age_days: [0, 60],
      config_drift_score: [0.1, 0.5],
      recent_occlusion_alarms: [0, 3],
    }
  },
];

// Known vulnerable firmware versions (for R05 rule)
export const CVE_FIRMWARE_VERSIONS = ["6.0.2", "7.1.0", "8.05", "8.1.3"];
```

---

## 11. SESSION LOG SCHEMA
### Every event logged to sessionLog[] must have this shape exactly.

```typescript
// src/pump/types.ts
export interface SessionLogEntry {
  timestamp:      number;       // ms since session start
  screen:         PumpScreen;   // which screen when event occurred
  event:          EventType;    // what happened
  // Optional fields — include when relevant to event type
  rate?:          number;       // current rate buffer at time of event
  delta?:         number;       // chevron delta (+10, -1 etc)
  newRate?:       number;       // rate after this event
  drug?:          string;       // drug name
  vtbi?:          number;       // VTBI value if set
  guardrailStatus?: "ok" | "warning" | "blocked";
  overrideChoice?: "override" | "re-enter";
  alarmType?:     AlarmType;
  bolusVolume?:   number;
  pressureLevel?: number;
}

export type EventType =
  | "session_start"
  | "language_selected"
  | "drug_selected"
  | "rate_adjust"          // chevron press — most common event
  | "boundary_hit"         // tried to go past RATE_MIN or RATE_MAX
  | "correction"           // direction reversal detected
  | "guardrail_warning"    // soft limit hit on RUN
  | "guardrail_override"   // nurse chose OVERRIDE — HIGH IMPORTANCE
  | "guardrail_blocked"    // hard limit hit on RUN
  | "guardrail_re_entered" // nurse chose RE-ENTER after warning
  | "vtbi_set"
  | "vtbi_cleared"
  | "infusion_started"     // RUN pressed, infusion begins
  | "infusion_held"
  | "infusion_resumed"
  | "infusion_complete"
  | "bolus_started"
  | "bolus_ended"
  | "alarm_triggered"
  | "alarm_silenced"
  | "mute_pressed"
  | "pressure_viewed"
  | "pressure_adjusted"
  | "options_opened"
  | "volume_cleared"
  | "session_end";
```

---

## 12. WHAT CLAUDE CODE MUST BUILD NEXT

The existing file `AlarisGP.jsx` is a working prototype. Claude Code must now:

### Step 1 — Refactor into proper architecture
Split `AlarisGP.jsx` into the files listed in Section 2. The state machine logic
must be extracted into `src/pump/stateMachine.ts` as pure functions.
The React component should only call hooks and render — no business logic.

### Step 2 — Write behavioural tests
Create `src/tests/stateMachine.test.ts`. Every test must reference a specific
section of the DFU manual or a rule number from Section 9 of this file.
Minimum tests required:
- Rate entry: chevron steps match FACTORY_DEFAULTS exactly
- Boundary clamping: cannot exceed RATE_MIN or RATE_MAX
- Guardrail: correct screen transition for warning vs blocked
- Guardrail override: correct logging when nurse overrides
- Alarm: INFUSION_COMPLETE triggers when volumeInfused >= vtbi
- Feature extraction: a known session log produces correct feature values

### Step 3 — Build the AI pipeline
Create `src/ai/featureExtractor.ts` — function that takes a completed
SessionLogEntry[] and the final pump state and returns a TrainingRecord.
Create `src/ai/labellingRules.ts` — implements all rules from Section 9.
Create `src/ai/scenarioGenerator.ts` — implements Section 10 profiles.
Create `src/ai/datasetBuilder.ts` — generates N training records by running
scenario profiles through the simulator non-interactively.

### Step 4 — Build the research UI
Add to the research panel:
- Task mode: researcher sets target rate, measures accuracy
- Scenario runner: automatically runs 100 scenarios and exports CSV
- Dataset inspector: shows distribution of risk labels generated

### Step 5 — Validate
Run `npm test`. All tests must pass.
Run the dataset generator for 500 records.
Verify CSV has all TrainingRecord fields.
Verify risk_label distribution is roughly: 30% low, 40% medium, 30% high.

---

## 13. CODE RULES — NEVER VIOLATE THESE

1. `src/pump/` files must have ZERO React imports. Pure TypeScript only.
2. All numbers come from FACTORY_DEFAULTS in constants.ts. Never hardcode.
3. Every risk rule must have a unique ID (R01–R99) for traceability.
4. Session log entries must be immutable — never mutate past entries.
5. The TrainingRecord must be serialisable to JSON and CSV without transformation.
6. Drug library values must not be changed — they are clinically validated.
7. Guardrail overrides must ALWAYS be logged — this is the most safety-critical event.
8. TypeScript strict mode — no `any` types anywhere.
9. Every function in `src/pump/` and `src/ai/` must have a JSDoc comment.

---

## 14. RUNNING THE PROJECT

```bash
npm install
npm run dev          # Development server — localhost:5173
npm test             # Run all tests (must all pass)
npm run build        # Production build
npm run generate     # Run dataset generator (creates data/dataset/training.csv)
```

---

## 15. KEY REFERENCES

- Official DFU: BD document 1000DF00152 Issue 1 (Frank's Hospital Workshop archive)
- Official DFU (Guardrails version): BDDF00535 Issue 4 (ifixit CDN)
- Technical Service Manual: 1000SM00013 Iss. 4 (Frank's Hospital Workshop)
- PVSio-web formal model: https://github.com/pvsioweb/pvsio-web
- Live formal model demo: http://www.pvsioweb.org/demos/AlarisGP
- CHI-MED paper: Cauchi et al. (2011) EICS4Med Workshop
- Thimbleby & Cairns (2010) J. Royal Society Interface 7(51):1429–1439
- FDA Infusion Pump Safety: https://www.fda.gov/medical-devices/infusion-pumps/
- ISMP Error-Prone Abbreviations: www.ismp.org/tools/abbreviations

---

END OF CLAUDE.md
