# From Manual to Model: Simulation-Enabled Safety and Security Research for Infusion Pumps

**Nandhakumar Samy**  
University [Institution Name]  
samynandhakumar82@gmail.com

---

## Abstract

Infusion pump safety research is constrained by a fundamental access problem: the devices implicated in the most serious medication errors are also the most expensive and operationally restricted to acquire. This paper presents an open-source simulation platform comprising three behaviorally faithful software replicas of clinical infusion pumps — the BD Alaris GP volumetric pump, the B. Braun Infusomat Space large-volume pump, and the Graseby 3100 syringe driver — constructed directly from manufacturer Directions for Use (DFU) manuals and validated against a published formal model. The methodology follows four reproducible steps: DFU analysis, state machine encoding, guardrail logic implementation, and automated data pipeline construction. Each simulator captures device-specific safety-critical behaviors: the Alaris GP's two-tier guardrail system, the Infusomat Space's three-tier system and known firmware vulnerabilities (CVE-2021-33885, CVE-2021-33882), and the Graseby 3100's complete absence of dosing safeguards. A 58-test behavioral fidelity validation suite, in which every assertion is traceable to a specific DFU section or cybersecurity advisory, achieves 100% pass rate across all three devices. The platform generates labeled training datasets for AI-based safety and security ranking research without requiring physical device access, and enables the kind of cross-device comparative analysis that would be logistically infeasible with real hardware. The simulator codebase (~18,000 lines of TypeScript) is available as open-source software.

**Keywords:** infusion pump safety, medical device simulation, behavioral fidelity, guardrail systems, cybersecurity, AI safety research

---

## 1. Introduction

Between 2005 and 2009, infusion pumps were the medical device category most frequently cited in FDA adverse event reports [1]. The contributing factors are well-documented: nurses programming rates under time pressure, drug library guardrails that are routinely overridden, and a device interaction model that has changed little since the 1990s despite the introduction of networked connectivity. Cauchi et al. [2] demonstrated formally that the number entry interfaces on devices including the Alaris GP are susceptible to systematic input errors arising from the cognitive demands of hold-to-accelerate rate entry. Thimbleby and Cairns [3] modeled these interaction patterns mathematically and showed that the probability of a ten-fold dose error is non-negligible under realistic clinical conditions.

These findings raise an obvious question: if the failure modes are understood, why has research-driven redesign been slow? Part of the answer is practical. Infusion pumps are tightly controlled medical devices. Acquiring multiple models for comparative study requires institutional purchase, regulatory permissions for research use, and access to trained clinical staff for operation. The cost of a single modern volumetric pump with a drug library license can exceed £10,000. A research program comparing three or more device families across hundreds of simulated clinical scenarios is, for most academic groups, simply not feasible with physical hardware.

Simulation offers an alternative, but previous computational approaches to infusion pump research have typically produced highly abstracted models — state diagrams, Petri nets, or Z specifications — that capture formal properties without reproducing the full operational behavior a researcher or clinical system needs to interact with [4]. What has been missing is a middle layer: a device simulator that is faithful enough to generate ecologically valid interaction data, accessible enough to run without clinical infrastructure, and extensible enough to serve as a platform for multiple research questions.

This paper presents exactly that: a simulation platform built for a funded AI safety and security ranking program, containing three fully operational infusion pump simulators constructed by systematic translation of manufacturer documentation into executable state machines. The contribution is not the simulators themselves but the methodology that produced them and the research capability they enable. We describe a four-step process — DFU analysis, state machine encoding, guardrail logic implementation, and automated dataset construction — that any research group can apply to any infusion device for which a manufacturer manual is publicly available.

---

## 2. Background and Related Work

### 2.1 Formal Modeling of Infusion Pumps

The most substantial prior work in this space is the PVSio-web project, which produced a formally verified model of the Alaris GP using the PVS theorem prover [4]. The PVSio-web model defines state transitions as formal specifications and provides a web-based prototype interface for user testing. It has been used to study number entry errors and to demonstrate the gap between formal specification and observed user behavior. Our Alaris GP simulator was developed independently and then cross-checked against the PVSio-web state transition definitions; 10 of our 25 Alaris GP validation tests explicitly verify alignment with the PVSio-web formal model.

The critical limitation of PVSio-web for our purpose is that it models a single device and does not extend to AI training data generation. The platform was designed for formal verification and protocol testing, not for systematic simulation of thousands of clinical scenarios across multiple device families.

### 2.2 Guardrail Research

Drug library guardrails — rate limits stored in a device's onboard drug database that warn or block when a programmed rate exceeds clinical thresholds — are the primary software safety mechanism in modern infusion pumps [5]. Research on guardrail effectiveness has documented a persistent and troubling pattern: guardrail override rates in hospitals typically range from 35% to 95% depending on drug and unit, with the highest override rates observed for drugs with the narrowest therapeutic windows [6]. This suggests that the behavioral response to a guardrail alert — whether nurses override, re-enter, or simply ignore — is as safety-relevant as whether the guardrail fires at all.

Studying this behavior with physical devices requires controlled clinical studies with attendant ethical approvals, patient risk, and operational disruption. Simulation-based research can generate this data at scale without those constraints.

### 2.3 Medical Device Cybersecurity

The cybersecurity vulnerability profile of networked infusion pumps has become a significant research and regulatory concern since the publication of CISA advisory ICSMA-21-294-01 in 2021 [7], which disclosed two critical vulnerabilities in the B. Braun Infusomat Space: CVE-2021-33885 (CVSS 9.0 — unauthenticated remote firmware replacement due to absence of cryptographic signature verification) and CVE-2021-33882 (CVSS 8.2 — missing authentication for critical commands sent via the SpaceCom2 network module). These vulnerabilities have not been fully remediated: B. Braun's firmware update protocol has not subsequently introduced signature verification for any firmware version in the affected series [7]. A simulation platform that models network state, firmware integrity, and connectivity alongside clinical programming behavior enables combined safety-security risk analysis that no prior simulator has supported.

---

## 3. From Manual to Model: The Methodology

The methodology for building each simulator follows four sequential steps. The steps are described abstractly here; Section 4 describes their application to each device.

### Step 1: DFU Analysis

Every parameter, state, and transition in the simulator is derived from the device's official Directions For Use (DFU) manual. The DFU is the legally binding document describing how the device operates; any behavior it specifies must be replicated exactly. The analysis extracts: (a) the complete set of device states and the physical controls that trigger transitions between them; (b) all factory-default parameter values; (c) guardrail logic including tier structure, threshold definitions, and override behavior; and (d) alarm conditions, priority ordering, and response behaviors.

Where manufacturer documents contain ambiguity — for example, the Alaris GP DFU describes chevron acceleration behavior qualitatively without specifying exact timing parameters — the PVSio-web formal model [4] was used as a secondary reference. Where neither source resolved an ambiguity, the interpretation most consistent with clinical safety practice was adopted and documented.

### Step 2: State Machine Encoding

Each device's behavior is encoded as a pure functional state machine: a collection of functions that each accept the current device state and return a new state plus a log of events generated by the transition. The state machine contains no React or UI code; it is pure TypeScript. This architectural separation is enforced by the project build system and ensures that the clinical behavior logic is independently testable.

State types are defined in TypeScript interfaces with strict typing. No implicit state exists: every aspect of the device's condition — current screen, programmed rate, guardrail status, alarm state, battery level, network connectivity — is a field in the state record.

### Step 3: Guardrail Logic Implementation

Guardrail logic is implemented as a separate module that receives a rate (in the drug's native units, not ml/h) and a drug object, and returns a guardrail status result. For the Alaris GP this is a two-value enum (warning, blocked); for the B. Braun it is a three-value enum (advisory, warning, blocked); for the Graseby the function is not invoked at all, since the device has no guardrails. This separation allows the guardrail subsystem to be tested independently of the state machine and to be replaced or modified for future devices without touching the transition logic.

Drug library data is stored as clinically validated typed objects. Guardrail thresholds are not computed — they are hard-coded from clinical literature and manufacturer documentation. Changing them requires a deliberate code modification with a traceable justification, not a parameter adjustment.

### Step 4: Automated Dataset Construction

Each state machine is connected to a programmatic scenario generator that drives the simulator through hundreds of clinical scenarios without requiring human interaction. Each scenario applies a device profile (maintenance history, battery level, firmware version, network state) and a clinical programming sequence (drug, target rate, guardrail response choices), records the resulting session log, and extracts a feature vector for AI training. This pipeline runs as a Node.js script and can produce thousands of labeled training records in seconds.

---

## 4. Device Simulators

### 4.1 Alaris GP Volumetric Infusion Pump

The BD Alaris GP (CareFusion, now BD) is one of the most widely deployed large-volume infusion pumps in UK NHS hospitals. It implements a two-tier guardrail system sourced from the Guardrails Edition of the DFU (BDDF00535 Issue 4): a soft limit that triggers a warning screen requiring the nurse to explicitly override or re-enter; and a hard limit that blocks infusion and allows only re-entry with no override option. This asymmetry is the device's core safety mechanism — it creates a behavioral distinction between "clinically unusual but defensible" rates (soft zone) and "unambiguously dangerous" rates (hard zone).

The simulator implements all ten documented screen states: LANGUAGE_SELECT, DRUG_SELECT, WEIGHT_ENTRY, RATE_ENTRY, VTBI_ENTRY, GUARDRAIL_WARNING, GUARDRAIL_BLOCKED, RUNNING, ON_HOLD, ALARM, OPTIONS, and PRESSURE_VIEW. All valid transitions between screens are enforced; invalid transitions are no-ops that return the state unchanged. A drug library of ten clinically representative agents is included, ranging from narrow-window vasopressors (adrenaline: softMax 0.5 µg/kg/min, hardMax 1.0 µg/kg/min) to anticoagulants (heparin: softMax 2,000 U/h, hardMax 5,000 U/h). Guardrail limit values are sourced from clinical practice guidelines rather than manufacturer-supplied defaults, which are not publicly disclosed.

The chevron-based rate entry system is implemented with hold-to-accelerate behavior matching the DFU specification: a 500ms initial hold delay before repeat firing at 80ms intervals [DFU §3.1]. This timing behavior is clinically significant because it affects the total entry time and correction count metrics used in AI feature extraction. Alarm priority ordering follows the DFU exactly: OCCLUSION takes precedence over AIR_IN_LINE, which takes precedence over BATTERY_LOW, which takes precedence over INFUSION_COMPLETE.

The Alaris GP simulator is cross-validated against the PVSio-web formal model [4] for all state transitions involving the core programming workflow (language select, drug select, rate entry, RUN). Ten of the 25 Alaris GP validation tests are marked as PVSio-web aligned, meaning the expected behavior was verified against the published formal specification in addition to the DFU.

### 4.2 B. Braun Infusomat Space Large-Volume Pump

The B. Braun Infusomat Space introduces three significant differences from the Alaris GP that are directly relevant to safety and security research.

**Three-tier guardrail system.** The Infusomat Space adds an advisory tier below the soft limit: when the programmed rate falls within 20% of the soft limit boundary (either above softMax or below softMin), an advisory notice is displayed. The nurse acknowledges it with a single keypress and infusion begins — no active override is required. This behavioral distinction matters because advisory acknowledgement is qualitatively different from override: overriding a soft limit requires the nurse to accept clinical responsibility for exceeding the recommended range, while acknowledging an advisory merely confirms awareness of proximity to that range. The three-tier system thus provides a graduated behavioral signal that the two-tier system does not.

**SpaceCom2 network module.** The Infusomat Space includes the SpaceCom2 WiFi/data module as a factory-standard component, enabling connection to B. Braun's SpaceStation for drug library updates and remote monitoring. The simulator models the connection state of this module and its interaction with CVE-2021-33882 [7]: when the SpaceCom2 is connected, an unauthenticated attacker on the same network can issue device commands without authentication. The simulator flags this exposure as a configuration risk factor in the generated training data.

**Unsigned firmware (CVE-2021-33885).** All current and historical firmware versions for the Infusomat Space lack cryptographic signature verification. The firmware update protocol used by SpaceStation does not authenticate the source or integrity of firmware packages [7]. This is a design property of the device, not a fixable configuration issue, and it applies regardless of firmware version. The simulator encodes `firmwareSigned: false` as a permanent property of the device state and uses this flag in risk labeling. At CVSS 9.0, this vulnerability represents the highest-severity cybersecurity exposure in our three-device comparison set.

Two additional behavioral differences from the Alaris GP are captured: bolus volume is capped at 2.0 ml (versus 5.0 ml on the Alaris GP, per the Infusomat Space IFU [8]), and the device starts at a STARTUP self-test screen rather than a language selection screen, reflecting the different boot sequences documented in each manufacturer's manual.

### 4.3 Graseby 3100 Syringe Driver

The Graseby 3100 occupies a distinctive position in the device set: it is operationally simpler than either volumetric pump, has no network connectivity, and has no documented cybersecurity vulnerabilities. It is also, from a pure dosing-safety standpoint, the most dangerous of the three devices, because it has no guardrail system of any kind. Any rate between 0.1 and 199.9 ml/h is accepted without warning. This design was standard for syringe drivers of its era, but the consequences were serious: the UK National Patient Safety Agency [9] documented fatal overdose incidents attributable to syringe driver programming errors and issued a safety alert in 2010 calling for device replacement and stronger procedural controls.

The simulator captures the Graseby 3100's reduced interaction model faithfully: there is no drug selection step (rate is always entered in ml/h directly), no VTBI (infusion terminates when the selected syringe is exhausted), and no bolus mode. The state machine has five screens — BOOT, RATE_ENTRY, RUNNING, ON_HOLD, ALARM — versus eleven for the Alaris GP. The rate maximum of 199.9 ml/h reflects the syringe driver form factor; it is not configurable.

The Graseby 3100 simulator exists to serve two research purposes. First, it provides a baseline against which guardrail effectiveness can be measured by comparing training records generated by the same clinical scenarios across guardrailed and un-guardrailed devices. Second, it demonstrates that the four-step methodology applies even to simple legacy devices for which formal models do not exist, extending the platform's coverage to the long tail of devices in active clinical use.

---

## 5. Behavioural Fidelity Validation

A simulator that does not behave like the real device generates invalid data. Validating behavioral fidelity without access to physical hardware requires a structured argument from documentation rather than device-to-device comparison. We operationalize this as a test suite in which every assertion is explicitly anchored to a DFU section, a formal model specification, or a manufacturer-published cybersecurity advisory.

### 5.1 Validation Framework

Each test case in the Behavioural Fidelity Validation (BFV) suite has five components: a unique identifier (e.g., BFV-AG-009), a human-readable description of the behavior under test, the specific DFU section or other primary source that specifies the expected behavior, the expected outcome expressed in terms of simulator state or log content, and an executable assertion that evaluates the actual simulator output. Tests are written as pure functions that accept no external state, ensuring deterministic, repeatable results. The full suite runs in under one second.

For Alaris GP tests, a sixth component indicates whether the behavior is also validated against the PVSio-web formal model [4], providing a secondary authoritative reference for the core programming workflow.

### 5.2 Results

The suite comprises 58 test cases across four groups. Table 1 summarizes the results.

**Table 1: Behavioural Fidelity Validation Results**

| Device Group | Tests | Passed | Failed | Pass Rate |
|---|---|---|---|---|
| Alaris GP (BD 1000DF00152 / BDDF00535) | 25 | 25 | 0 | 100% |
| B. Braun Infusomat Space (IFU 686N-GB) | 18 | 18 | 0 | 100% |
| Graseby 3100 (Operators Manual 2002) | 10 | 10 | 0 | 100% |
| Cross-device comparison | 5 | 5 | 0 | 100% |
| **Total** | **58** | **58** | **0** | **100%** |

The Alaris GP tests cover: initial state, all valid screen transitions in the core programming workflow, chevron step magnitudes (STEP_LARGE=10, STEP_SMALL=1), boundary clamping at RATE_MIN (0.1 ml/h) and RATE_MAX (1200 ml/h), two-tier guardrail activation, guardrail override logging, direction-reversal correction detection, VTBI programming, INFUSION_COMPLETE alarm triggering, KVO rate activation (1.0 ml/h), alarm priority ordering, and MANUAL mode guardrail bypass.

The B. Braun tests cover: STARTUP boot sequence, all three guardrail tiers, advisory zone boundary precision (20% of soft limit), advisory acknowledgement versus override, bolus clamping at 2.0 ml, SpaceCom2 connect/disconnect event logging, INFUSION_COMPLETE, KVO rate, rate-direct-editing behavior (no rateBuffer field), firmware unsigned flag, and MANUAL mode bypass.

The Graseby tests cover: immediate RATE_ENTRY on power-on, zero-guardrail acceptance of any valid rate, rejection of rate=0, RATE_MAX=199.9 ml/h, SYRINGE_EMPTY alarm, and structural verification that the state contains no drug library, VTBI, or bolus fields.

### 5.3 Scope and Limitations

The validation suite demonstrates that the simulators match their documentary specifications. It does not demonstrate that the simulators match the actual hardware. Three categories of discrepancy are possible and should be acknowledged.

First, manufacturer documentation is sometimes incomplete or ambiguous. Where our interpretation of a DFU section differs from the device's actual behavior, the simulator will be wrong in a way that the documentation-grounded test suite cannot detect. For the Alaris GP, alignment with the independently published PVSio-web formal model [4] provides partial mitigation for this risk; no equivalent formal model exists for the B. Braun or Graseby.

Second, firmware variations across device generations may introduce behavioral differences not captured in any single DFU version. The DFU documents referenced are the most recent publicly available editions; earlier versions may have had different guardrail behaviors or interaction flows.

Third, physical device behaviors involving timing, haptic feedback, and display rendering are not captured. The simulator models the logical state machine, not the human-perceptual experience of operating the device. Research questions that depend on the physical interaction context — such as studies of alarm fatigue under realistic clinical noise conditions — require physical devices.

Despite these limitations, the documentation-grounded validation approach provides stronger evidence of fidelity than is typically reported for medical device simulators used in safety research, where validation is often described qualitatively rather than with traceable, executable test cases.

---

## 6. Research Enabled by the Platform

### 6.1 AI Safety and Security Dataset Generation

The primary research application driving this platform is an AI-powered safety and security ranking system for infusion pump fleets [10]. Each simulator is connected to a scenario generator that applies synthetic device profiles — representing the range of real-world fleet states from well-maintained and connected to overdue maintenance and isolated — and programmatic clinical sequences, then extracts a 48-feature vector describing the interaction, configuration, and system-level properties of the session. Risk labels are assigned by a deterministic rule engine implementing 26 evidence-based rules derived from the clinical and cybersecurity literature.

The platform can generate 1,000 fully labeled training records across all three devices in under 30 seconds on consumer hardware. This volume and speed would be unattainable with physical devices.

### 6.2 Cross-Device Comparative Analysis

The platform enables direct comparison of safety properties across device families under identical clinical scenarios. Table 2 illustrates the structural differences captured by the simulator.

**Table 2: Cross-Device Comparison (Simulator)**

| Property | Alaris GP | B. Braun Infusomat | Graseby 3100 |
|---|---|---|---|
| Guardrail tiers | 2 (warning, blocked) | 3 (advisory, warning, blocked) | 0 |
| Drug library | Yes (10 drugs) | Yes (1,500 entries, 10 in sim.) | No |
| Bolus maximum | 5.0 ml | 2.0 ml | N/A |
| Rate maximum | 1200 ml/h | 1200 ml/h | 199.9 ml/h |
| Network module | No | SpaceCom2 (WiFi) | No |
| Firmware CVEs | None documented | CVE-2021-33885, CVE-2021-33882 | None documented |
| VTBI | Yes | Yes | No (syringe capacity) |
| Initial screen | LANGUAGE_SELECT | STARTUP | RATE_ENTRY |

This comparison is made possible by the shared state machine architecture: because all three simulators implement the same event log schema and feature extraction pipeline, their outputs are directly comparable. A researcher can ask, for example, what happens to the risk label distribution when the same clinical scenario is run on a device with no guardrails versus a device with a three-tier system — and get an answer in seconds without clinical access.

### 6.3 Guardrail Override Behavior Analysis

The platform captures guardrail override events as first-class log entries, enabling analysis of override patterns across drugs, rate levels, and device types. Every guardrail override — the event in which a nurse actively accepts clinical responsibility for exceeding a soft limit — is logged with a timestamp, the rate at time of override, the drug name, and the guardrail tier involved. This data supports analysis questions that have been difficult to study in hospital settings due to observational access constraints [6].

---

## 7. Discussion

### 7.1 The Case for Open-Source Device Simulation

Physical infusion pump access creates a structural barrier that concentrates medical device safety research in well-funded clinical institutions and manufacturers. The methodology described in this paper — DFU to state machine — is available to any researcher with access to a device manual and basic programming skills. Manufacturer DFU documents for the Alaris GP, B. Braun Infusomat Space, and Graseby 3100 are all publicly available through hospital equipment archives, the FDA 510(k) database, and equipment servicing resources. The tools required (TypeScript, Node.js, Vitest) are free. The resulting simulator is open-source.

This democratization argument must be tempered by the validation limitation identified in Section 5.3: a simulator built from documentation cannot guarantee behavioral equivalence with the hardware. Researchers using simulation-generated data to draw conclusions about real clinical behavior should treat the simulation as a hypothesis generator rather than a ground truth. Findings should be interpreted as "if the simulator is faithful, then..." and validated against real device data where possible.

### 7.2 Extending to Other Devices

The four-step methodology is not specific to the three devices described here. Any infusion pump with a publicly available DFU manual can be added to the platform using the same process. The main variable is documentation quality: modern devices with detailed DFUs (like the Alaris GP) yield more confident simulators than legacy devices with sparse documentation (like the Graseby 3100, whose 2002 manual contains minimal detail on alarm behavior).

The shared event log schema and feature extraction pipeline are the key enabling mechanism for multi-device extension. When a new simulator is added, it inherits the same dataset generation and AI pipeline infrastructure immediately, without requiring changes to downstream components.

### 7.3 Synthetic vs. Real Data

The dataset generated by this platform is entirely synthetic: it is produced by a programmatic scenario generator, not by humans operating the simulators. The 100% AI classification accuracy achievable on this dataset [10] is therefore not a meaningful benchmark — the model that generates labels and the model that predicts them share the same rule logic. The value of the synthetic dataset is not accuracy but coverage: it exercises the feature space systematically in ways that real session data, dominated by routine safe programming, would not. Synthetic-to-real transfer will require real session data collected from clinical studies or user research, which remains future work.

---

## 8. Conclusion

This paper has described an open-source simulation platform for infusion pump safety and security research, and the methodology — DFU analysis, state machine encoding, guardrail logic implementation, automated dataset construction — by which it was built. Three device simulators, each behaviorally faithful to its manufacturer documentation, together capture a representative cross-section of the infusion pump design space: from the Alaris GP's two-tier guardrail and formal model alignment, through the B. Braun Infusomat Space's three-tier system and network-layer cybersecurity vulnerabilities, to the Graseby 3100's complete absence of dosing safeguards. A 58-test behavioral fidelity validation suite with 100% pass rate, every assertion traceable to a DFU section or CVE advisory, provides evidence of simulator correctness to a standard not commonly reported in related work.

The primary contribution is methodological: the demonstration that high-fidelity, research-grade infusion pump simulators can be constructed from publicly available documentation by a small research team without physical device access. This opens infusion pump safety research to groups who would otherwise be excluded by equipment cost and availability, and provides a reproducible foundation for AI-based safety and security analysis at scale.

---

## References

[1] U.S. Food and Drug Administration, "Infusion Pump Improvement Initiative," Center for Devices and Radiological Health, FDA White Paper, April 2010.

[2] M. Cauchi, P. Curzon, A. Blandford, and P. Masci, "Towards Dependable Number Entry for Medical Devices," in *Proc. EICS4Med Workshop at ACM CHI*, 2011. CHI-MED Project, www.chi-med.ac.uk.

[3] H. Thimbleby and P. Cairns, "Reducing number entry errors: Solving a widespread, serious problem," *Journal of the Royal Society Interface*, vol. 7, no. 51, pp. 1429–1439, 2010.

[4] P. Masci, A. Ayoub, P. Curzon, I. Lee, O. Sokolsky, and H. Thimbleby, "Model-based development of the generic PCA infusion pump user interface prototype in PVS," in *Proc. Formal Methods for Interactive Systems (FMIS)*, 2013. PVSio-web demo: http://www.pvsioweb.org/demos/AlarisGP.

[5] M. Litman and J. Harris, "Smart pump technology: Reducing medication error," *Nursing Management*, vol. 36, no. 3, pp. 20–24, 2005.

[6] T. J. Cassano-Piché, K. Fan, J. Sabovitch, M. Elke, and K. J. Easty, "Multiple intravenous infusions phase 1b: Practice and training scan," *Ontario Health Technology Assessment Series*, vol. 12, no. 16, pp. 1–132, 2012.

[7] Cybersecurity and Infrastructure Security Agency (CISA), "B. Braun Infusomat Space Large Volume Pump and SpaceCom2," ICS Medical Advisory ICSMA-21-294-01, October 2021.

[8] B. Braun Medical, *Infusomat Space Large Volume Pump — Instructions for Use*, Document 686N-GB, B. Braun Melsungen AG, 2024.

[9] National Patient Safety Agency (NPSA), "Safer use of syringe drivers in palliative care," NPSA Patient Safety Alert NPSA/2010/RRR019, UK, November 2010.

[10] N. Samy, "An AI-Empowered Safety and Security Ranking System for Infusion Pump Medical Devices," QR Seed Pilot Study, University [Institution], 2025–2026.

[11] BD Medical, *Alaris GP Volumetric Infusion Pump — Directions For Use (Guardrails Edition)*, Document BDDF00535 Issue 4, Becton Dickinson, 2019.

[12] BD Medical, *Alaris GP Volumetric Infusion Pump — Directions For Use*, Document 1000DF00152 Issue 1, Becton Dickinson, 2017.

[13] Graseby Medical Ltd, *Graseby 3100 Syringe Driver — Operators Manual*, Ardus Medical, 2002.

---

*Acknowledgements: This work is supported by [University] QR Seed Pilot funding. The simulator codebase is available at [repository URL].*
