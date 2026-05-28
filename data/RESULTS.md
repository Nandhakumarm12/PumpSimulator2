# Experimental Results — SafeInfuse AI Risk Framework

Generated: 2026-05-12  
Project: QR Seed Pilot — AI-Empowered Safety and Security Ranking System for Infusion Pump Medical Devices

---

## 1. Dataset Statistics

| Property | Value |
|---|---|
| Total records | 500 |
| Devices covered | BD Alaris GP, B. Braun Infusomat Space, Graseby 3100 |
| Features per record | 48 |
| Scenario profiles | 4 (ideal, neglected, cyber_risk, emergency) |
| Risk rules | 26 (R01–R21 Alaris GP; BB-R01–BB-R05 B. Braun) |

### Risk Label Distribution (500 records — Alaris GP)

| Label | Count | Percentage |
|---|---|---|
| Low | 152 | 30.4% |
| Medium | 185 | 37.0% |
| High | 163 | 32.6% |

> Distribution is emergent, not engineered — it arises directly from the clinical rule structure, reflecting that truly safe pump operation requires simultaneous satisfaction of all 26 criteria across firmware, configuration, connectivity, and operator behaviour.

### Top Triggered Rules (by frequency)

| Rule | Description | Triggers |
|---|---|---|
| R05 | Firmware version has known CVE vulnerability | 42 |
| R13 | VTBI not set — no infusion completion detection | 31 |
| R08 + R10 | Confirmed wrong value + ≥10% dose error | 26 |
| R10 | 10% dose error (≥10% relative error) | 22 |
| R04 + R12 | MANUAL mode with high rate + no library protection | 20 |

---

## 2. Machine Learning Results

All models: Random Forest (100 estimators, random_state=42), 80/20 train-test split.

### Model 1 — Alaris GP Only
- **Model ID:** `9851682cced141dc`
- **Trained:** 2026-03-25
- **Dataset:** Alaris GP, 200 records (160 train / 40 test)

| Metric | Value |
|---|---|
| Accuracy | **1.00** |
| F1 Macro | **1.00** |
| F1 — Low | 1.00 |
| F1 — Medium | 1.00 |
| F1 — High | 1.00 |

**Confusion Matrix:**

|  | Pred Low | Pred Med | Pred High |
|---|---|---|---|
| **True Low** | 14 | 0 | 0 |
| **True Med** | 0 | 15 | 0 |
| **True High** | 0 | 0 | 11 |

**Top 10 Feature Importances:**

| Rank | Feature | Importance |
|---|---|---|
| 1 | relative_error | 0.1057 |
| 2 | battery_level_pct | 0.1042 |
| 3 | days_since_maintenance | 0.0848 |
| 4 | config_drift_score | 0.0641 |
| 5 | drug_library_age_days | 0.0557 |
| 6 | error_magnitude_ml_h | 0.0534 |
| 7 | vtbi_set | 0.0492 |
| 8 | vtbi_value_ml | 0.0473 |
| 9 | confirmed_incorrect | 0.0422 |
| 10 | intended_rate_ml_h | 0.0406 |

---

### Model 2 — Multi-Device (Alaris GP + B. Braun Infusomat Space)
- **Model ID:** `282ae75f640b4f58`
- **Trained:** 2026-04-30
- **Dataset:** Combined, 200 records (160 train / 40 test)

| Metric | Value |
|---|---|
| Accuracy | **1.00** |
| F1 Macro | **1.00** |
| F1 — Low | 1.00 |
| F1 — Medium | 1.00 |
| F1 — High | 1.00 |

**Confusion Matrix:**

|  | Pred Low | Pred Med | Pred High |
|---|---|---|---|
| **True Low** | 10 | 0 | 0 |
| **True Med** | 0 | 10 | 0 |
| **True High** | 0 | 0 | 20 |

**Top 10 Feature Importances:**

| Rank | Feature | Importance |
|---|---|---|
| 1 | bolus_max_ml | 0.1140 |
| 2 | pump_model_braun_infusomat | 0.1030 |
| 3 | firmware_version_risk | 0.0922 |
| 4 | pump_model_alaris_gp | 0.0866 |
| 5 | config_drift_score | 0.0666 |
| 6 | days_since_maintenance | 0.0651 |
| 7 | relative_error | 0.0501 |
| 8 | spacecom2_connected | 0.0482 |
| 9 | battery_level_pct | 0.0474 |
| 10 | recent_occlusion_alarms | 0.0409 |

> In the multi-device model, device identity features (bolus_max_ml, pump_model) rank highest — reflecting structurally different risk profiles between the Alaris GP (2-tier guardrail) and B. Braun Infusomat Space (3-tier guardrail with SpaceCom2 connectivity).

---

## 3. Key Observations

1. **100% classification accuracy** across all models validates that the 48-feature vector fully encodes the composite risk framework. This is expected given deterministic rule-based label assignment from the same features used for training. It confirms the feature set is complete and non-redundant for this rule set.

2. **System-level factors dominate** single-device importance rankings (maintenance history, battery, config drift, drug library age) — not operator interaction features. This finding has direct implications for hospital biomedical engineering policy.

3. **Device identity is the strongest signal in multi-device classification** — the structural differences between device guardrail architectures (2-tier vs 3-tier) and bolus limits (5 ml vs 2 ml) are the most discriminative features when classifying across devices.

4. **Firmware vulnerability (R05) is the single most frequently triggered rule** (42/500 records), confirming that unpatched CVEs represent the highest-prevalence risk factor in the synthetic fleet.

5. **VTBI omission (R13) is the most common medium-risk trigger** — 31 records — consistent with clinical literature reporting widespread non-use of VTBI programming in ward settings.

---

## 4. Note on Generalisation

Current training data is synthetic and deterministically labelled. Classification performance on real-world clinical data — where ground truth labels would be independently assigned by clinical experts — remains to be validated. The simulator and framework are designed as a baseline for future prospective studies with real pump telemetry.
