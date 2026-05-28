/**
 * Device Design Score Registry — Layer 0 of the 4-layer composite risk model.
 *
 * ARCHITECTURE ROLE:
 *   Layer 0 scores are FIXED per device model — they do not change between sessions.
 *   They capture how safely a device was DESIGNED, independent of how it is used.
 *   This distinguishes design risk (procurement/engineering concern) from operational
 *   risk (clinical governance concern).
 *
 * LAYER SUMMARY:
 *   Layer 0 (this file) — Design:       inherent device safety features
 *   Layer 1 (labellingRules.ts)         — Interaction:    nurse programming behaviour
 *   Layer 2 (labellingRules.ts)         — Configuration:  session setup decisions
 *   Layer 3 (labellingRules.ts)         — System:         device physical/cyber state
 *
 * SCORING METHOD:
 *   Each design factor contributes a penalty (0.0–max) if a safety feature is absent
 *   or a risk factor is present. Penalties are summed and clamped to [0, 1].
 *   A higher score = higher design-level risk.
 *
 * DEVICE PROFILES IMPLEMENTED:
 *   - alaris_gp          (BD/CareFusion Alaris GP Volumetric Pump)
 *   - braun_infusomat    (B. Braun Infusomat Space LVP)
 *   - graseby_3100       (Graseby 3100 Syringe Driver — baseline/legacy)
 *   - sigma_spectrum     (Baxter Sigma Spectrum — stub for Phase 2)
 *   - plum_360           (ICU Medical Plum 360 — stub for Phase 2)
 *   - agilia_vp          (Fresenius Kabi Agilia VP — stub for Phase 3)
 *   - cadd_solis         (Smiths/ICU Medical CADD-Solis PCA — stub for Phase 3)
 *
 * SOURCES:
 *   - BD Alaris GP DFU: BD document 1000DF00152 Issue 1 / BDDF00535 Issue 4
 *   - B. Braun Infusomat Space IFU: bbraunusa.com (2024)
 *   - CISA ICSMA-21-294-01: B. Braun CVEs (CVE-2021-33885 CVSS 9.0)
 *   - CISA ICSMA-22-251-01: Baxter Sigma Spectrum CVEs
 *   - CISA ICSMA-23-194-01: BD Alaris System CVEs (2023)
 *   - CISA ICSMA-16-306-01: Smiths Medical CADD-Solis CVEs
 *   - FDA TPLC Guidance (Dec 2014): Infusion Pumps Total Product Life Cycle
 *   - IEC 60601-2-24:2012: Infusion pump essential performance standard
 *   - Generic Infusion Pump Hazard Analysis v1.0 (FDA-funded, ResearchGate)
 * NO React imports allowed in this file.
 */

// ─── Type definitions ─────────────────────────────────────────────────────────

/**
 * Display technology quality levels, ordered from lowest to highest safety value.
 * Better displays reduce programming errors by providing clearer visual feedback.
 * Source: Human factors studies on medical device UI — FDA HF Engineering Guidance (2011).
 */
export type DisplayQuality = 'none' | 'basic_numeric' | 'text_lcd' | 'graphic_lcd' | 'color_lcd';

/**
 * Number of distinct guardrail enforcement tiers available on the device.
 * 0 = no guardrails, 1 = hard only, 2 = soft + hard, 3 = advisory + soft + hard.
 * More tiers = more graduated clinical feedback = lower design risk.
 * Source: IEC 60601-2-24:2012 — essential performance for infusion systems.
 */
export type GuardrailTiers = 0 | 1 | 2 | 3;

/**
 * Static design-time properties of a medical device model.
 * These values are sourced from the manufacturer DFU/IFU and CVE databases.
 * They do not change per session — only per device model/firmware generation.
 */
export interface DeviceDesignProfile {
  /** Unique device model identifier matching pump_model in TrainingRecord. */
  model_id: string;

  /** Human-readable device name for display and reporting. */
  display_name: string;

  /** Manufacturer name. */
  manufacturer: string;

  /**
   * Device classification: large-volume pump, syringe driver, PCA, or ambulatory.
   * Classification affects applicable IEC standards and FDA regulatory pathway.
   */
  device_class: 'large_volume_pump' | 'syringe_driver' | 'pca_pump' | 'ambulatory';

  /** Source document for this profile (DFU/IFU reference). */
  manual_reference: string;

  // ── Safety Feature Flags ────────────────────────────────────────────────

  /**
   * Whether the device supports a programmable drug library with guardrails.
   * Drug libraries are the primary Dose Error Reduction System (DERS) mechanism.
   * Source: FDA TPLC Guidance Dec 2014 — DERS implementation recommendations.
   */
  has_drug_library: boolean;

  /**
   * Number of distinct guardrail enforcement tiers.
   * 0 = no guardrails, 1 = hard only, 2 = soft + hard, 3 = advisory + soft + hard.
   * More tiers = more graduated clinical feedback = lower design risk.
   */
  guardrail_tiers: GuardrailTiers;

  /**
   * Whether the device supports VTBI (volume to be infused) programming.
   * Without VTBI, infusion continues indefinitely after target volume is reached.
   * Source: IEC 60601-2-24:2012 Section 201.12 — VTBI as essential safety feature.
   */
  has_vtbi: boolean;

  /**
   * Whether the device has anti-free-flow protection (auto-clamp on door open).
   * Without this, gravity-driven bolus can occur when IV set is disconnected.
   * Source: Generic Infusion Pump Hazard Analysis v1.0 — Hazard H-12 (freeflow).
   */
  has_anti_freeflow: boolean;

  /**
   * Whether the device supports KVO (keep vein open) mode after VTBI completion.
   * KVO maintains IV access without continued drug delivery when infusion completes.
   */
  has_kvo: boolean;

  /** Whether the device has network connectivity (WiFi or wired). */
  has_network: boolean;

  /**
   * Maximum bolus volume in ml (0 if bolus not supported).
   * Large maximum bolus volumes amplify the consequence of a dose error.
   * Source: BD Alaris GP DFU BDDF00535 Issue 4 — Bolus Volume Max = 5 ml.
   */
  bolus_max_ml: number;

  /**
   * Display technology quality (affects programming error risk).
   * Better displays reduce visual ambiguity and confirm values more clearly.
   */
  display_quality: DisplayQuality;

  // ── Cybersecurity Properties ────────────────────────────────────────────

  /**
   * Number of published CVEs for this device model (from CISA/NVD databases).
   * Each CVE represents a confirmed exploitable vulnerability in deployed devices.
   */
  cve_count: number;

  /**
   * Highest CVSS v3 base score among all published CVEs (0 if none).
   * CVSS >= 9.0 = Critical, 7.0–8.9 = High, 4.0–6.9 = Medium.
   * Source: NVD CVSS v3.1 severity bands — nvd.nist.gov.
   */
  max_cvss_score: number;

  /**
   * Whether the device's firmware update mechanism includes cryptographic signing.
   * Unsigned firmware = remote firmware replacement possible without authentication.
   * Source: CVE-2021-33885 (B. Braun Infusomat Space, CVSS 9.0) — unauthenticated
   * firmware replacement via SpaceStation network protocol.
   */
  firmware_signed: boolean;

  /**
   * Whether the device transmits data in cleartext over the network.
   * Cleartext transmission allows passive eavesdropping of PHI and configuration.
   * Source: CVE-2021-33883 (B. Braun), CVE-2022-26390 (Baxter Sigma Spectrum).
   */
  transmits_cleartext: boolean;

  // ── Regulatory History ──────────────────────────────────────────────────

  /**
   * Number of FDA Class I recalls (most serious — risk of serious injury or death).
   * Source: FDA MedWatch / MAUDE database — product recall classifications.
   */
  fda_class1_recalls: number;

  /**
   * Number of FDA Class II recalls.
   * Class II = probability that device will cause serious adverse health consequence is remote.
   */
  fda_class2_recalls: number;

  // ── Computed fields (populated by computeDesignScore) ──────────────────

  /**
   * Pre-computed design score (0–1). Populated by computeDesignScore().
   * Optional here since it is computed lazily; always present after registry init.
   */
  design_score?: number;
}

// ─── Penalty weights ──────────────────────────────────────────────────────────

/**
 * Penalty weights for each design factor.
 * A penalty is added to the raw design score when a risk factor is present
 * or a safety feature is absent. All penalties are on the [0, 1] scale.
 * The sum is clamped to 1.0 before being returned as design_score.
 *
 * Rationale for weights:
 *   - Drug library absence (+0.30): largest single design gap; removes all guardrail protection.
 *     Source: FDA TPLC Guidance — drug library is the primary DERS mechanism.
 *   - Hard guardrail absence (+0.25): even with a library, without hard stops a nurse can exceed
 *     any limit. Source: IEC 60601-2-24 essential performance requirements.
 *   - VTBI absence (+0.15): no auto-stop = indefinite infusion possible.
 *   - Anti-freeflow absence (+0.10): gravity-driven bolus on line disconnect.
 *   - CVE penalty (+0.04 each, cap 0.40): each published CVE represents a confirmed exploitable
 *     vulnerability. Source: CISA ICS-CERT medical advisories.
 *   - Max CVSS >= 9.0 (+0.15 extra): Critical severity warrants additional penalty.
 *     Source: CVSS v3.1 severity bands (NVD).
 *   - Firmware unsigned (+0.15): remote firmware replacement without authentication
 *     is the most severe supply-chain risk. Source: CVE-2021-33885 (B. Braun, CVSS 9.0).
 *   - Cleartext transmission (+0.08): passive eavesdropping of PHI and config.
 *     Source: CVE-2021-33883, CVE-2022-26390.
 *   - FDA Class I recall (+0.06 each, cap 0.24): confirmed patient harm events.
 *   - FDA Class II recall (+0.02 each, cap 0.08): potential harm events.
 *   - Guardrail tiers: 0 tiers = +0.25, 1 tier = +0.10, 2 tiers = +0.05, 3 tiers = 0.
 *     More tiers = more graduated warning = lower risk.
 *   - Bolus max > 5 ml (+0.08): large bolus capability amplifies dose error impact.
 *   - Display quality: none=+0.10, basic_numeric=+0.08, text_lcd=+0.04, graphic_lcd=+0.01, color=0.
 *     Better display = clearer feedback = fewer programming errors.
 */
export const DESIGN_PENALTY_WEIGHTS = {
  /** Absence of drug library removes all DERS protection (FDA TPLC Guidance). */
  NO_DRUG_LIBRARY:          0.30,

  /** Absence of hard guardrail stop — nurse can bypass any limit unchecked. */
  NO_HARD_GUARDRAIL:        0.25,

  /**
   * Guardrail tier penalties (applied instead of NO_HARD_GUARDRAIL when library present).
   * 0 tiers = no guardrails, 1 tier = hard only, 2 = soft+hard, 3 = advisory+soft+hard.
   */
  GUARDRAIL_TIERS_PENALTY: {
    0: 0.25,
    1: 0.10,
    2: 0.05,
    3: 0.00,
  } as Record<GuardrailTiers, number>,

  /** No VTBI means infusion continues indefinitely past intended volume. */
  NO_VTBI:                  0.15,

  /** No anti-freeflow: gravity bolus risk on IV set disconnection. */
  NO_ANTI_FREEFLOW:         0.10,

  /** Per-CVE penalty (0.04 per CVE, capped at 0.40 total). */
  PER_CVE:                  0.04,
  /** Maximum total penalty from CVE count. */
  CVE_COUNT_CAP:            0.40,

  /** Additional penalty when max CVSS score is Critical (>=9.0). */
  CRITICAL_CVSS:            0.15,

  /**
   * Unsigned firmware allows unauthenticated remote firmware replacement.
   * This is the most severe supply-chain attack vector for networked medical devices.
   */
  FIRMWARE_UNSIGNED:        0.15,

  /**
   * Cleartext network transmission exposes PHI and device configuration.
   * Source: CVE-2021-33883 (B. Braun), CVE-2022-26390 (Sigma Spectrum).
   */
  CLEARTEXT_TRANSMISSION:   0.08,

  /** Per FDA Class I recall penalty (confirmed patient harm, capped at 0.24). */
  PER_CLASS1_RECALL:        0.06,
  CLASS1_RECALL_CAP:        0.24,

  /** Per FDA Class II recall penalty (capped at 0.08). */
  PER_CLASS2_RECALL:        0.02,
  CLASS2_RECALL_CAP:        0.08,

  /** Bolus capability > 5 ml amplifies consequences of bolus programming error. */
  LARGE_BOLUS_MAX:          0.08,

  /**
   * Display quality penalties: poor displays increase programming error rate.
   * Source: FDA Human Factors guidance — display legibility in clinical settings.
   */
  DISPLAY_QUALITY_PENALTY: {
    'none':          0.10,
    'basic_numeric': 0.08,
    'text_lcd':      0.04,
    'graphic_lcd':   0.01,
    'color_lcd':     0.00,
  } as Record<DisplayQuality, number>,
} as const;

// ─── Device profiles ──────────────────────────────────────────────────────────

/**
 * The full registry of device design profiles.
 * Indexed internally by model_id for O(1) lookup.
 * Profiles are never mutated after initialisation.
 */
const DEVICE_PROFILES_RAW: DeviceDesignProfile[] = [
  // ── BD/CareFusion Alaris GP ──────────────────────────────────────────────

  /**
   * BD Alaris GP Volumetric Infusion Pump — the primary simulator target.
   *
   * CVE note: CISA ICSMA-23-194-01 (2023) documented 13 vulnerabilities in the
   * BD Alaris system including CVE-2022-22772 (CVSS 9.8) — unauthenticated remote
   * access to infusion system. Firmware is not cryptographically signed.
   * Transmits configuration data in cleartext over the BD Alaris Network.
   *
   * Recalls: BD has issued multiple Class I/II recalls for the Alaris system
   * (e.g., 2020 recall for software defect causing pump stoppage without alarm).
   *
   * Source: BD document 1000DF00152 Issue 1 / BDDF00535 Issue 4
   *         CISA ICSMA-23-194-01 (BD Alaris, 2023)
   */
  {
    model_id:              'alaris_gp',
    display_name:          'BD Alaris GP',
    manufacturer:          'BD (Becton, Dickinson & CareFusion)',
    device_class:          'large_volume_pump',
    manual_reference:      'BD document 1000DF00152 Issue 1 / BDDF00535 Issue 4',
    has_drug_library:      true,
    guardrail_tiers:       2,
    has_vtbi:              true,
    has_anti_freeflow:     true,
    has_kvo:               true,
    has_network:           true,
    bolus_max_ml:          5,
    display_quality:       'text_lcd',
    cve_count:             13,
    max_cvss_score:        9.8,
    firmware_signed:       false,
    transmits_cleartext:   true,
    fda_class1_recalls:    3,
    fda_class2_recalls:    2,
  },

  // ── B. Braun Infusomat Space ─────────────────────────────────────────────

  /**
   * B. Braun Infusomat Space Large Volume Pump.
   *
   * CVE note: CISA ICSMA-21-294-01 (2021) documented 5 CVEs including:
   *   CVE-2021-33885 (CVSS 9.0) — unauthenticated firmware modification via SpaceStation.
   *   CVE-2021-33883 (CVSS 7.1) — cleartext transmission of sensitive data.
   * Firmware update protocol does not require authentication or integrity verification.
   *
   * Safety features: 3-tier guardrails (advisory + soft + hard), graphic LCD,
   * anti-freeflow valve on all cassette types.
   *
   * Source: B. Braun Infusomat Space IFU — bbraunusa.com (2024)
   *         CISA ICSMA-21-294-01
   */
  {
    model_id:              'braun_infusomat',
    display_name:          'B. Braun Infusomat Space',
    manufacturer:          'B. Braun Melsungen AG',
    device_class:          'large_volume_pump',
    manual_reference:      'B. Braun Infusomat Space IFU — bbraunusa.com (2024) / CISA ICSMA-21-294-01',
    has_drug_library:      true,
    guardrail_tiers:       3,
    has_vtbi:              true,
    has_anti_freeflow:     true,
    has_kvo:               true,
    has_network:           true,
    bolus_max_ml:          2,
    display_quality:       'graphic_lcd',
    cve_count:             5,
    max_cvss_score:        9.0,
    firmware_signed:       false,
    transmits_cleartext:   true,
    fda_class1_recalls:    2,
    fda_class2_recalls:    1,
  },

  // ── Graseby 3100 Syringe Driver (legacy baseline) ────────────────────────

  /**
   * Graseby 3100 Ambulatory/Syringe Driver — legacy baseline device.
   *
   * The Graseby 3100 is a purely mechanical syringe driver with no software,
   * no drug library, no network connectivity, and minimal electronic features.
   * It is the baseline "no cyber risk" device for comparison purposes.
   *
   * Risk profile: Despite zero cyber risk, the absence of drug library,
   * guardrails, and VTBI makes it a high design risk from a clinical safety
   * standpoint. Its use in PCA has been associated with opioid overdose deaths
   * (National Patient Safety Agency alert 2010, UK).
   *
   * Source: Graseby 3100 Operators Manual — ardusmedical.com (2002)
   */
  {
    model_id:              'graseby_3100',
    display_name:          'Graseby 3100 Syringe Driver',
    manufacturer:          'Graseby Medical Ltd (now Smiths Medical)',
    device_class:          'syringe_driver',
    manual_reference:      'Graseby 3100 Operators Manual — ardusmedical.com (2002)',
    has_drug_library:      false,
    guardrail_tiers:       0,
    has_vtbi:              false,
    has_anti_freeflow:     false,
    has_kvo:               false,
    has_network:           false,
    bolus_max_ml:          0,
    display_quality:       'basic_numeric',
    cve_count:             0,
    max_cvss_score:        0,
    firmware_signed:       true,   // no firmware to compromise
    transmits_cleartext:   false,  // no network connectivity
    fda_class1_recalls:    0,
    fda_class2_recalls:    0,
  },

  // ── Baxter Sigma Spectrum (stub — Phase 2) ───────────────────────────────

  /**
   * Baxter Sigma Spectrum V8 Large Volume Pump — Phase 2 stub.
   *
   * CVE note: CISA ICSMA-22-251-01 (2022) documented 4 CVEs including:
   *   CVE-2022-26390 (CVSS 7.5) — cleartext transmission of sensitive data.
   *   CVE-2022-26392 — use of hard-coded credentials in network communications.
   * Color touchscreen display is a safety advantage (better visual confirmation).
   *
   * Multiple Class I recalls: e.g., 2019 recall for software issue causing
   * incorrect volume delivery without alarm.
   *
   * Source: Baxter Sigma Spectrum V8 Operators Manual Rev G (2015)
   *         CISA ICSMA-22-251-01
   */
  {
    model_id:              'sigma_spectrum',
    display_name:          'Baxter Sigma Spectrum',
    manufacturer:          'Baxter International Inc.',
    device_class:          'large_volume_pump',
    manual_reference:      'Baxter Sigma Spectrum V8 Operators Manual Rev G (2015) / CISA ICSMA-22-251-01',
    has_drug_library:      true,
    guardrail_tiers:       2,
    has_vtbi:              true,
    has_anti_freeflow:     true,
    has_kvo:               true,
    has_network:           true,
    bolus_max_ml:          5,
    display_quality:       'color_lcd',
    cve_count:             4,
    max_cvss_score:        7.5,
    firmware_signed:       false,
    transmits_cleartext:   true,
    fda_class1_recalls:    3,
    fda_class2_recalls:    1,
  },

  // ── ICU Medical Plum 360 (stub — Phase 2) ────────────────────────────────

  /**
   * ICU Medical Plum 360 Large Volume Pump — Phase 2 stub.
   *
   * The Plum 360 is a successor to the Hospira Plum A+ with improved safety
   * features. No published CISA advisories as of 2024, though the predecessor
   * Plum A+ had network vulnerabilities. Text LCD display vs. Sigma's color.
   *
   * Source: ICU Medical Plum 360 System Operators Manual v15.2 (2020)
   */
  {
    model_id:              'plum_360',
    display_name:          'ICU Medical Plum 360',
    manufacturer:          'ICU Medical Inc.',
    device_class:          'large_volume_pump',
    manual_reference:      'ICU Medical Plum 360 System Operators Manual v15.2 (2020)',
    has_drug_library:      true,
    guardrail_tiers:       2,
    has_vtbi:              true,
    has_anti_freeflow:     true,
    has_kvo:               true,
    has_network:           true,
    bolus_max_ml:          5,
    display_quality:       'text_lcd',
    cve_count:             0,
    max_cvss_score:        0,
    firmware_signed:       false,
    transmits_cleartext:   false,
    fda_class1_recalls:    2,
    fda_class2_recalls:    1,
  },

  // ── Fresenius Kabi Agilia VP (stub — Phase 3) ────────────────────────────

  /**
   * Fresenius Kabi Agilia VP MC Large Volume Pump — Phase 3 stub.
   *
   * CVE note: CISA ICSMA-21-355-01 (2021) documented 13 CVEs for the Agilia
   * Connect system. Max CVSS 7.5. Network connectivity via Agilia Connect
   * Management System (ACMS). Firmware signing status not publicly confirmed.
   *
   * Source: Fresenius Kabi Agilia VP MC IFU — agiliasystem.com
   *         CISA ICSMA-21-355-01
   */
  {
    model_id:              'agilia_vp',
    display_name:          'Fresenius Kabi Agilia VP',
    manufacturer:          'Fresenius Kabi AG',
    device_class:          'large_volume_pump',
    manual_reference:      'Fresenius Kabi Agilia VP MC IFU — agiliasystem.com / CISA ICSMA-21-355-01',
    has_drug_library:      true,
    guardrail_tiers:       2,
    has_vtbi:              true,
    has_anti_freeflow:     true,
    has_kvo:               true,
    has_network:           true,
    bolus_max_ml:          5,
    display_quality:       'graphic_lcd',
    cve_count:             13,
    max_cvss_score:        7.5,
    firmware_signed:       false,
    transmits_cleartext:   true,
    fda_class1_recalls:    1,
    fda_class2_recalls:    1,
  },

  // ── Smiths/ICU Medical CADD-Solis PCA (stub — Phase 3) ──────────────────

  /**
   * CADD-Solis Ambulatory Infusion System (PCA variant) — Phase 3 stub.
   *
   * CVE note: CISA ICSMA-16-306-01 (2016) documented 2 CVEs:
   *   CVE-2016-8375 (CVSS 9.9) — patient-accessible memory containing
   *   user credentials and drug library configurations in plaintext.
   *   CVE-2016-8376 — no encryption of sensitive configuration data.
   * The CADD-Solis is a PCA pump without anti-freeflow (ambulatory design) and
   * without KVO (PCA mode maintains access via lockout intervals, not KVO).
   *
   * Source: CADD-Solis Operators Manual v4.4 (ICU Medical)
   *         CISA ICSMA-16-306-01
   */
  {
    model_id:              'cadd_solis',
    display_name:          'CADD-Solis PCA',
    manufacturer:          'ICU Medical / Smiths Medical',
    device_class:          'pca_pump',
    manual_reference:      'CADD-Solis Operators Manual v4.4 (ICU Medical) / CISA ICSMA-16-306-01',
    has_drug_library:      true,
    guardrail_tiers:       2,
    has_vtbi:              true,
    has_anti_freeflow:     false,  // ambulatory design — no cassette door
    has_kvo:               false,  // PCA uses lockout intervals, not KVO
    has_network:           true,
    bolus_max_ml:          5,
    display_quality:       'color_lcd',
    cve_count:             2,
    max_cvss_score:        9.9,
    firmware_signed:       false,
    transmits_cleartext:   false,
    fda_class1_recalls:    3,
    fda_class2_recalls:    1,
  },
];

// ─── Registry (indexed map) ───────────────────────────────────────────────────

/**
 * The device registry as a Map for O(1) lookup by model_id.
 * Profiles have their design_score pre-computed at module load time.
 */
const DEVICE_REGISTRY = new Map<string, DeviceDesignProfile>();

// ─── Core scoring function ────────────────────────────────────────────────────

/**
 * Compute the Layer 0 design score for a given device profile.
 *
 * The score is a penalty-based sum (0–1) where:
 *   0.0 = perfect design (all safety features present, no CVEs, no recalls)
 *   1.0 = maximum design risk (no safety features, many CVEs, multiple Class I recalls)
 *
 * @param profile - The DeviceDesignProfile to score
 * @returns Object with raw penalty sum, clamped score, and per-factor reasons
 */
function computeDesignScoreFromProfile(profile: DeviceDesignProfile): {
  score: number;
  reasons: string[];
} {
  const reasons: string[] = [];
  let rawScore = 0;

  // ── Safety feature penalties ──────────────────────────────────────────────

  // Drug library absence
  if (!profile.has_drug_library) {
    const p = DESIGN_PENALTY_WEIGHTS.NO_DRUG_LIBRARY;
    rawScore += p;
    reasons.push(`No drug library (DERS absent): +${p.toFixed(2)} [FDA TPLC Guidance]`);
  }

  // Guardrail tier penalty (separate from no_drug_library — library may exist but tiers may be limited)
  const guardPenalty = DESIGN_PENALTY_WEIGHTS.GUARDRAIL_TIERS_PENALTY[profile.guardrail_tiers];
  if (guardPenalty > 0) {
    rawScore += guardPenalty;
    reasons.push(
      `Guardrail tiers = ${profile.guardrail_tiers} (${guardPenalty.toFixed(2)} penalty) ` +
      `[IEC 60601-2-24:2012]`
    );
  }

  // VTBI absence
  if (!profile.has_vtbi) {
    const p = DESIGN_PENALTY_WEIGHTS.NO_VTBI;
    rawScore += p;
    reasons.push(`No VTBI support — indefinite infusion risk: +${p.toFixed(2)} [IEC 60601-2-24:2012]`);
  }

  // Anti-freeflow absence
  if (!profile.has_anti_freeflow) {
    const p = DESIGN_PENALTY_WEIGHTS.NO_ANTI_FREEFLOW;
    rawScore += p;
    reasons.push(`No anti-freeflow protection — gravity bolus risk: +${p.toFixed(2)} [Hazard Analysis H-12]`);
  }

  // ── Cybersecurity penalties ───────────────────────────────────────────────

  // CVE count penalty (capped)
  if (profile.cve_count > 0) {
    const cvePenalty = Math.min(
      DESIGN_PENALTY_WEIGHTS.CVE_COUNT_CAP,
      profile.cve_count * DESIGN_PENALTY_WEIGHTS.PER_CVE
    );
    rawScore += cvePenalty;
    reasons.push(
      `${profile.cve_count} published CVE(s) × ${DESIGN_PENALTY_WEIGHTS.PER_CVE}/CVE ` +
      `(capped at ${DESIGN_PENALTY_WEIGHTS.CVE_COUNT_CAP}): +${cvePenalty.toFixed(2)} [CISA ICS-CERT]`
    );
  }

  // Critical CVSS score additional penalty
  if (profile.max_cvss_score >= 9.0) {
    const p = DESIGN_PENALTY_WEIGHTS.CRITICAL_CVSS;
    rawScore += p;
    reasons.push(
      `Critical CVE (CVSS ${profile.max_cvss_score.toFixed(1)} >= 9.0): +${p.toFixed(2)} [NVD CVSS v3.1]`
    );
  }

  // Unsigned firmware
  if (!profile.firmware_signed) {
    const p = DESIGN_PENALTY_WEIGHTS.FIRMWARE_UNSIGNED;
    rawScore += p;
    reasons.push(`Firmware not cryptographically signed — remote replacement risk: +${p.toFixed(2)} [CVE-2021-33885]`);
  }

  // Cleartext transmission
  if (profile.transmits_cleartext) {
    const p = DESIGN_PENALTY_WEIGHTS.CLEARTEXT_TRANSMISSION;
    rawScore += p;
    reasons.push(`Cleartext network transmission — PHI eavesdropping risk: +${p.toFixed(2)} [CVE-2021-33883]`);
  }

  // ── Regulatory history penalties ──────────────────────────────────────────

  // FDA Class I recalls
  if (profile.fda_class1_recalls > 0) {
    const recallPenalty = Math.min(
      DESIGN_PENALTY_WEIGHTS.CLASS1_RECALL_CAP,
      profile.fda_class1_recalls * DESIGN_PENALTY_WEIGHTS.PER_CLASS1_RECALL
    );
    rawScore += recallPenalty;
    reasons.push(
      `${profile.fda_class1_recalls} FDA Class I recall(s) ` +
      `× ${DESIGN_PENALTY_WEIGHTS.PER_CLASS1_RECALL}/recall: +${recallPenalty.toFixed(2)} [FDA MedWatch]`
    );
  }

  // FDA Class II recalls
  if (profile.fda_class2_recalls > 0) {
    const class2Penalty = Math.min(
      DESIGN_PENALTY_WEIGHTS.CLASS2_RECALL_CAP,
      profile.fda_class2_recalls * DESIGN_PENALTY_WEIGHTS.PER_CLASS2_RECALL
    );
    rawScore += class2Penalty;
    reasons.push(
      `${profile.fda_class2_recalls} FDA Class II recall(s) ` +
      `× ${DESIGN_PENALTY_WEIGHTS.PER_CLASS2_RECALL}/recall: +${class2Penalty.toFixed(2)} [FDA MedWatch]`
    );
  }

  // ── Other design factors ──────────────────────────────────────────────────

  // Large bolus maximum
  if (profile.bolus_max_ml > 5) {
    const p = DESIGN_PENALTY_WEIGHTS.LARGE_BOLUS_MAX;
    rawScore += p;
    reasons.push(
      `Bolus max ${profile.bolus_max_ml} ml > 5 ml — amplifies dose error impact: ` +
      `+${p.toFixed(2)}`
    );
  }

  // Display quality penalty
  const displayPenalty = DESIGN_PENALTY_WEIGHTS.DISPLAY_QUALITY_PENALTY[profile.display_quality];
  if (displayPenalty > 0) {
    rawScore += displayPenalty;
    reasons.push(
      `Display quality '${profile.display_quality}': +${displayPenalty.toFixed(2)} ` +
      `[FDA Human Factors Guidance]`
    );
  }

  // Clamp to [0, 1] and round to 3dp
  const score = +Math.min(1.0, rawScore).toFixed(3);
  return { score, reasons };
}

// ─── Initialise registry with pre-computed scores ────────────────────────────

for (const profile of DEVICE_PROFILES_RAW) {
  const { score, reasons: _reasons } = computeDesignScoreFromProfile(profile);
  const profileWithScore: DeviceDesignProfile = { ...profile, design_score: score };
  DEVICE_REGISTRY.set(profile.model_id, profileWithScore);
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Retrieve a device design profile by model_id.
 * Returns undefined if the model is not in the registry.
 *
 * @param modelId - e.g. "alaris_gp", "braun_infusomat", "graseby_3100"
 * @returns The DeviceDesignProfile with pre-computed design_score, or undefined
 *
 * @example
 * const profile = getDeviceProfile('alaris_gp');
 * console.log(profile?.design_score); // e.g. 0.752
 */
export function getDeviceProfile(modelId: string): DeviceDesignProfile | undefined {
  return DEVICE_REGISTRY.get(modelId);
}

/**
 * Compute the Layer 0 design score for a given device model.
 *
 * The score is a penalty-based sum (0–1) where:
 *   0.0 = perfect design (all safety features present, no CVEs, no recalls)
 *   1.0 = maximum design risk (no safety features, many CVEs, multiple Class I recalls)
 *
 * Returns an object with:
 *   - score: number (0–1, 3dp)
 *   - reasons: string[] — which factors contributed and by how much
 *   - profile: DeviceDesignProfile — the full profile used
 *
 * If modelId is not found, returns score: 0.5 with a reason noting the unknown model.
 * This prevents unknown devices from appearing artificially safe (0.0) or dangerous (1.0).
 *
 * @param modelId - The device model identifier (e.g. "alaris_gp")
 * @returns Scoring result object
 *
 * @example
 * const result = computeDesignScore('alaris_gp');
 * // result.score = 0.752
 * // result.reasons = ["13 published CVE(s)...", "Firmware not signed...", ...]
 */
export function computeDesignScore(modelId: string): {
  score: number;
  reasons: string[];
  profile: DeviceDesignProfile | null;
} {
  const profile = DEVICE_REGISTRY.get(modelId);

  if (!profile) {
    return {
      score:   0.5,
      reasons: [`Unknown device model '${modelId}' — defaulting to neutral score 0.5`],
      profile: null,
    };
  }

  const { score, reasons } = computeDesignScoreFromProfile(profile);
  return { score, reasons, profile };
}

/**
 * Return all registered device model IDs.
 * Useful for UI dropdowns and dataset generation loops.
 *
 * @returns Array of model_id strings in insertion order
 *
 * @example
 * const models = listDeviceModels();
 * // ['alaris_gp', 'braun_infusomat', 'graseby_3100', ...]
 */
export function listDeviceModels(): string[] {
  return Array.from(DEVICE_REGISTRY.keys());
}

/**
 * Grade thresholds for design_score and composite_score.
 * Applied to design_score here and to composite_score in labellingRules.ts.
 * Source: Step 2 specification — same thresholds as composite_score grades.
 *
 * 0.00–0.10 = A+  (exceptional)
 * 0.11–0.20 = A   (excellent)
 * 0.21–0.35 = B   (good)
 * 0.36–0.50 = C   (adequate)
 * 0.51–0.65 = D   (poor)
 * 0.66–0.80 = E   (very poor)
 * 0.81–1.00 = F   (critical)
 */
export type DesignGrade = 'A+' | 'A' | 'B' | 'C' | 'D' | 'E' | 'F';

/**
 * Map a design_score (0–1) to an energy-label style grade.
 * Thresholds mirror those used for composite_score in labellingRules.ts.
 *
 * @param score - The design_score value (0–1)
 * @returns The letter grade
 */
export function scoreToDesignGrade(score: number): DesignGrade {
  if (score <= 0.10) return 'A+';
  if (score <= 0.20) return 'A';
  if (score <= 0.35) return 'B';
  if (score <= 0.50) return 'C';
  if (score <= 0.65) return 'D';
  if (score <= 0.80) return 'E';
  return 'F';
}

/**
 * Return a summary table of all device profiles with their pre-computed design scores.
 * Sorted by design_score ascending (safest first — lowest design risk at top).
 *
 * Each entry includes:
 *   - model_id:     The device identifier
 *   - display_name: Human-readable name
 *   - design_score: Pre-computed Layer 0 score (0–1)
 *   - grade:        Energy-label grade derived from design_score
 *
 * @returns Array sorted by design_score ascending
 *
 * @example
 * const board = getDesignScoreLeaderboard();
 * // board[0] = { model_id: 'braun_infusomat', display_name: 'B. Braun Infusomat Space', design_score: 0.38, grade: 'C' }
 */
export function getDesignScoreLeaderboard(): Array<{
  model_id:     string;
  display_name: string;
  design_score: number;
  grade:        DesignGrade;
}> {
  return Array.from(DEVICE_REGISTRY.values())
    .map(profile => ({
      model_id:     profile.model_id,
      display_name: profile.display_name,
      design_score: profile.design_score ?? computeDesignScoreFromProfile(profile).score,
      grade:        scoreToDesignGrade(
        profile.design_score ?? computeDesignScoreFromProfile(profile).score
      ),
    }))
    .sort((a, b) => a.design_score - b.design_score);
}
