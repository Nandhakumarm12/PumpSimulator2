# B. Braun Infusomat Space — Extracted Specifications
# Compiled for PumpSimulator2 Research Project
# Date: 2026-04-14

---

## SOURCE DOCUMENTS

### PDFs Successfully Downloaded and Saved

1. **IFU (GB, Software 686N)** — `braun_infusomat_space_ifu_686N_GB.pdf`
   - Source: https://woodleytrialsolutions.com/img/products/user-guides/Infusomat%20Space%20-%20EN.pdf
   - 86 pages, text-extractable, B. Braun Melsungen AG, Document No. 38911794N, dated 05/2020
   - Marked "Valid for software 686N"

2. **IFU (US, Software 586U)** — `braun_infusomat_space_ifu_586U_US.pdf`
   - Source: https://www.bbraunusa.com/content/dam/catalog/bbraun/bbraunProductCatalog/S/AEM2015/en-us/b154/infusomat-space-largevolumepumpifu-softwareuitemnumbers8713051u8.pdf
   - 88 pages, text-extractable, US Rx-only edition
   - Marked "Valid for software 586U"
   - Item numbers: 8713051U, 8713052U (wireless models)

3. **Service Manual (Version 1.1)** — `braun_infusomat_service_manual.pdf`
   - Source: http://www.frankshospitalworkshop.com/equipment/documents/infusion_pumps/service_manuals/B.Braun_Infusomat_Space_-_Service_manual.pdf
   - 130 pages, text-extractable
   - Part No. 8713 9120 (English), covers Infusomat Space 0871 3050

### Additional Sources (Web, Not Saved as PDF)

- CISA Advisory ICSMA-21-294-01: https://www.cisa.gov/news-events/ics-medical-advisories/icsma-21-294-01
- B. Braun Security Advisory (05/2021): https://www.bbraun.com/en/products-and-solutions/b--braun-product-security/05-2021-spacecom--battery-pack-sp-with-wifi--data-module-compact.html
- FDA Recall Notice (faulty occlusion alarm): https://www.fda.gov/medical-devices/medical-device-recalls-and-early-alerts/infusion-pump-correction-b-braun-medical-inc-issues-correction-lnfusomat-space-infusion-systemlarge

---

## 1. DEVICE OVERVIEW

| Field                    | Value                                                        |
|--------------------------|--------------------------------------------------------------|
| Device name              | Infusomat® Space                                             |
| Manufacturer             | B. Braun Melsungen AG, 34209 Melsungen, Germany              |
| Device type              | Volumetric infusion pump (peristaltic / linear)              |
| IEC/EN 60601-1 class     | Defibrillator-proof; CF equipment; Protective Class II       |
| EC Directive class       | IIb (Directive 93/42 EEC)                                    |
| US FDA class             | Class II (21 CFR 880.5725, Product codes FRN and FPA)        |
| Moisture protection      | IP 22 (drip-protected for horizontal usage)                  |
| Dimensions (W x H x D)  | 214 mm x 68 mm x 124 mm (8.4" x 2.6" x 4.8")               |
| Weight                   | Approximately 1.4 kg (3 lbs)                                 |
| Primary part number      | 0871 3050 (standard); 8713051U / 8713052U (US wireless)      |
| Technical safety check   | Every 2 years                                                |
| Device lifespan          | Minimum 10 years under continuous duty conditions             |

---

## 2. INFUSION RATE PARAMETERS

| Parameter                | Value                                                        |
|--------------------------|--------------------------------------------------------------|
| **Minimum rate**         | **0.1 ml/h**                                                 |
| **Maximum rate**         | **1200 ml/h**                                                |
| Rate increment 0.1–99.99 | 0.01 ml/h steps                                              |
| Rate increment 100–999.9 | 0.1 ml/h steps                                               |
| Rate increment 1000–1200 | 1 ml/h steps                                                 |
| Delivery accuracy        | ± 5% according to IEC/EN 60601-2-24                          |
| Mechanical accuracy      | ± 0.5%                                                       |
| Note on low rates        | "Consider startup characteristics before using low rates (0.1 ml/h)" |
| Hard upper limit         | 1200 ml/h — cannot be exceeded by any means                  |

---

## 3. VTBI (VOLUME TO BE INFUSED) PARAMETERS

| Parameter                | Value                                                        |
|--------------------------|--------------------------------------------------------------|
| **VTBI minimum**         | **0.1 ml**                                                   |
| **VTBI maximum (GB)**    | **99999 ml** (IFU 686N — 1000–99999 ml in 1 ml increments)  |
| **VTBI maximum (US)**    | **9999 ml** (IFU 586U — 1000–9999 ml in 1 ml increments)    |
| Volume increment 0.1–99.99 | 0.01 ml steps                                              |
| Volume increment 100–999.9 | 0.1 ml steps                                               |
| Volume increment 1000+   | 1 ml steps                                                   |
| Time selection range     | 00:01 to 99:59 h                                             |
| Note                     | VTBI required to start infusion (except with SafeSet line)   |

---

## 4. KVO (KEEP VEIN OPEN) PARAMETERS

| Parameter                | Value                                                        |
|--------------------------|--------------------------------------------------------------|
| KVO rate (rate ≥ 10 ml/h) | **3 ml/h** (default)                                        |
| KVO rate (rate < 10 ml/h) | **1 ml/h** (default)                                        |
| KVO rate (rate < 1 ml/h) | **= Set rate** (default minimum 0.1 ml/h)                    |
| KVO configurable range   | 0.5–3.8 ml/h in 0.1 ml/h increments (via service program)   |
| KVO duration             | Set in service program                                       |
| KVO activation           | Options menu → Yes/No toggle                                 |
| KVO termination alarm    | "KVO time finished" operating alarm                          |
| KVO pre-alarm            | "KVO mode" pre-alarm fires when VTBI/time reached, before KVO ends |
| Note                     | KVO function disabled during Dose Over Time mode             |
| Note                     | Pump will not infuse KVO rate above current infusion rate     |

---

## 5. BOLUS PARAMETERS

| Parameter                        | Value                                                   |
|----------------------------------|---------------------------------------------------------|
| **Maximum bolus rate**           | **1200 ml/h**                                           |
| **Maximum bolus volume (manual)**| Limited to **10 seconds** at set bolus rate             |
| Example at 1200 ml/h             | 1 ml delivered in ~1 second; 2 ml in ~2 seconds         |
| Maximum post-occlusion bolus     | **2 ml** (after occlusion bolus reduction)              |
| Max bolus after bolus reduction  | ≤ 0.2 ml                                                |
| Bolus accuracy (> 1 ml)          | Typically ± 5%                                          |
| Manual bolus hold-to-deliver     | User must hold BOLUS button continuously; stops on release |
| Manual bolus time limit          | **10 seconds maximum** — pump auto-stops                |
| Programmed bolus                 | Dose + time entered in drug library; press BOL to start  |
| Drug library limits on bolus     | Hard and soft limits apply to programmed bolus          |
| Drug library limits on manual bolus | **Do NOT apply** to manual bolus                     |
| Bolus rate setting               | Options menu → Bolus Rate → adjustable with q           |
| Note on manual bolus             | Audible tone optional every 1 ml delivered               |

---

## 6. PRESSURE ALARM SYSTEM (OCCLUSION)

### 6.1 Downstream Occlusion Pressure (Patient Side)

| Parameter                        | Value                                                   |
|----------------------------------|---------------------------------------------------------|
| Pressure level count             | **9 levels** selectable                                 |
| Level 1 (lowest)                 | typ. 226 mmHg (typ. 0.3 bar) — GB IFU                  |
| Level 5 (mid)                    | typ. 563 mmHg (typ. 0.7 bar) — GB IFU                  |
| Level 9 (highest)                | typ. 900 mmHg (typ. 1.2 bar) — GB IFU                  |
| Pressure range (US version)      | **225 mmHg to 900 mmHg** across 9 levels                |
| Pressure range (bar, GB version) | 9 levels up to 1.2 bar                                  |
| Mechanical limit (fault)         | **2.1 bar / 1575 mmHg** (pump auto-shuts off)           |
| Default level                    | Not explicitly stated; configurable via service program  |
| Adjustment path                  | Options menu → Downstream Occlusion Pressure            |
| Alarm name                       | "Downstream occlusion" (US) / "Pressure high" (GB)      |
| Alarm action                     | Stops infusion; post-occlusion bolus reduction activated |

**Time to occlusion alarm table (GB IFU, Level 1/5/9):**

| Pressure Level | At 1 ml/h  | At 25 ml/h | At 100 ml/h |
|----------------|------------|------------|-------------|
| Level 1 (0.3 bar) | 09:07 min | 00:33 min | 00:07 min |
| Level 5 (0.7 bar) | 25:53 min | 01:14 min | 00:15 min |
| Level 9 (1.2 bar) | 46:50 min | 02:06 min | 00:24 min |

Note: At 0.01 ml/h, time to occlusion alarm is > 3 hours.

### 6.2 Upstream Pressure (Container Side)

| Parameter                        | Value                                                   |
|----------------------------------|---------------------------------------------------------|
| Sensor location                  | Between infusion container and pump                     |
| Sensitivity range (GB)           | 9 levels from -120 mbar to -200 mbar (negative pressure) |
| Sensitivity range (US)           | 9 levels from -90 mmHg to -160 mmHg                    |
| Alarm name                       | "Check upstream" (GB) / "Upstream occlusion above pump" (US) |
| Note                             | At rates < 10 ml/h, closed roller clamp may not always be detected |
| Note                             | If drop sensor connected, upstream alarm is deactivated  |

---

## 7. AIR-IN-LINE DETECTION

| Parameter                        | Value                                                   |
|----------------------------------|---------------------------------------------------------|
| Sensor type                      | Ultrasonic air detection sensor                         |
| Minimum detectable bubble        | ≥ 0.01 ml (10 µl)                                      |
| Single bubble alarm range        | 0.02–0.3 ml (configurable, default 0.3 ml)              |
| Single bubble alarm increment    | 0.01 ml                                                 |
| Cumulative air alarm range       | 0.5–3.8 ml/h (configurable, default 1.5 ml/h)           |
| Cumulative air increment         | 0.1 ml/h                                                |
| Standard (IEC)                   | IEC 60601-2-24: accumulation not to exceed 1 ml/15 min  |
| Note                             | Display distinguishes "Air bubble alarm" vs "Accumulated air exceeds limit" |
| Note                             | During priming, all air-in-line alarms are inactive      |

---

## 8. BATTERY SPECIFICATIONS

### Li-Ion Battery (Battery Pack SP with WiFi, Part No. 8713182A / 8713182U)

| Condition                        | Operating Time                                          |
|----------------------------------|---------------------------------------------------------|
| Wireless active at 100 ml/h      | typ. 4 hours                                            |
| Wireless active at 1200 ml/h     | typ. 2.5 hours                                          |
| Wireless active at 25 ml/h       | typ. 4 hours                                            |
| Wireless inactive at 100 ml/h    | typ. 12 hours                                           |
| Wireless inactive at 1200 ml/h   | 5 hours                                                 |
| Wireless inactive at 25 ml/h     | 15 hours                                                |
| Recharge time                    | Approximately 6 hours                                   |
| Voltage                          | 11–16 V DC via SpaceStation or Connection Lead SP 12 V  |
| Recharging temp limit (WiFi)     | ≤ 35°C (95°F) ambient for assured recharge during WiFi active |

### NiMH Battery (Battery Pack SP, Part No. 8713180 / 8713180A)

| Condition                        | Operating Time                                          |
|----------------------------------|---------------------------------------------------------|
| At 100 ml/h                      | typ. 13 hours                                           |
| At 1200 ml/h                     | typ. 5 hours                                            |
| At 25 ml/h                       | typ. 16 hours                                           |
| Recharge time                    | Approximately 6 hours                                   |
| Battery maintenance interval     | Every 30 days (pump prompts user)                       |
| Low battery pre-alarm            | "Battery nearly empty" — fires before battery empties   |
| Empty battery alarm              | "Battery empty" — pump auto-shuts off after 3 minutes   |

---

## 9. DRUG LIBRARY AND GUARDRAIL SYSTEM

| Parameter                        | Value                                                   |
|----------------------------------|---------------------------------------------------------|
| Maximum drug names               | **1,200** (US IFU 586U) / **1,500** (some product pages)|
| Drug concentrations per drug     | Up to **10 concentrations**                             |
| Drug categories                  | Up to **30 categories**                                 |
| Care units                       | Up to **50 care units**                                 |
| Patient profiles                 | Up to **16 patient profiles**                           |
| Dosing units available           | See Section 9.1 below                                   |

### 9.1 Dosing Unit Families (from Technical Data chapter)

**Drug units (mass):** ng, mcg, mg, g
**Drug units (volume):** mL
**Drug units (biological):** mU, U, kU, MU
**Drug units (electrolyte):** mEq, mmol
**Drug units (energy):** kcal
**Patient metrics:** none (flat), /kg, /m², /BSA
**Time units:** /min, /h, /24h, /sec (bolus only)

Note: kU and MU do not support /m² or per-minute dosing. kcal does not support /m², per-minute, or per-hour dosing.

**Conversion (Gram family):** 10⁶ ng = 10³ mcg = 1 mg = 10⁻³ g
**Conversion (Unit family):** 10³ mU = 1 U = 10⁻³ kU = 10⁻⁶ MU

**Rate formula:**
```
Infusion rate (mL/hr) = Dose / concentration × (patient weight or BSA)
```

### 9.2 Guardrail Limit Tiers

The drug library implements a two-tier limit system:

| Tier        | Name       | Behaviour on Violation                                       |
|-------------|------------|--------------------------------------------------------------|
| Tier 1      | Soft Limit | Warning shown; user may override or re-enter per policy      |
| Tier 2      | Hard Limit | Cannot be exceeded; pump displays limit value; editor reverts on repeated attempt |

**Soft Limit display symbols on run screen:**
- Infusion within soft limits = checkmark symbol
- Infusion below lower soft limit = downward arrow symbol
- Infusion above upper soft limit = upward arrow symbol
- No limits set = dash symbol

**Hard Limit behaviour:**
- Pump displays the hard limit value when user attempts to exceed it
- On second attempt past hard limit: hard limit message displayed, remains until confirmed with K
- On pressing K: editor reverts to last confirmed value before violation
- Maximum pump rate of 1200 ml/h is a universal hard limit — always enforced
- Drug library allows additional per-drug hard limits on rate/doserate and dose/time

**Clinical advisory:** Drugs may have free-text clinical advisory messages requiring user confirmation before infusion starts. Advisory viewable any time via Status menu → Drug Info.

**Bypassing the library:** User selecting "No" when asked "Use preset values?" enters drug name only — limits and advisories do NOT apply. This is the documented safety concern raised in ECRI (2013) alert.

---

## 10. SCREEN STATES / OPERATING MODES

### 10.1 Primary Infusion Modes

| Mode                   | Description                                                         |
|------------------------|---------------------------------------------------------------------|
| Basic Infusion         | Rate ± VTBI ± Time entry without drug library                       |
| Drug Library Mode      | Drug selection → dose/rate entry with library limits enforced        |
| Dose Rate Calculation  | Entry in dose units (mcg/kg/min etc); pump calculates ml/h rate     |
| Dose Over Time         | Fixed total dose delivered over fixed time; rate auto-calculated     |
| Loading Dose           | Initial bolus-like dose before main infusion; library limits apply  |
| Programmed Bolus       | Dose + time defined; delivered on BOL press                         |
| Manual Bolus           | Hold BOL button; delivers at bolus rate; stops on release or 10 sec |

### 10.2 Infusion Types (Special Functions)

| Function               | Description                                                         |
|------------------------|---------------------------------------------------------------------|
| Piggyback (Secondary)  | SECondary infusion runs; reverts to PRIMary on completion           |
| Ramp Mode              | Rate increases linearly from start rate to target rate              |
| Taper Mode             | Rate decreases linearly from start rate to KVO rate                 |
| Program Mode           | Pre-programmed multi-step infusion sequence                         |
| Intermittent Mode      | Cyclic infusion with defined on/off periods                         |
| PCA (optional)         | Patient Controlled Analgesia with demand button                     |
| TCI (optional)         | Target Controlled Infusion (pharmacokinetic modelling)              |
| TIVA (optional)        | Total Intravenous Anaesthesia                                        |
| Barcoding              | Scan drug barcode to select from library (optional, inactive by default) |

### 10.3 Display Screens / Operational States

| Screen / State         | Description                                                         |
|------------------------|---------------------------------------------------------------------|
| Start-up / Boot        | Pump powers on; last infusion prompt "Continue last infusion? Yes/No" |
| Drug Selection         | Library drug category and name selection                            |
| Parameter Entry        | Rate / VTBI / Time / Dose entry screens                             |
| Confirm / Start        | "Start" appears top right; press Start/Stop to begin                |
| Running                | Scrolling arrows on display; rate and drug shown; wireless status   |
| On Hold / Standby      | Infusion paused; standby time countdown                             |
| KVO Mode               | Pre-alarm then KVO rate running after VTBI/time complete            |
| Options Menu           | Downstream occlusion, upstream, alarm volume, KVO, bolus rate, etc. |
| Status Menu            | Battery time, last bolus, drug info, software version, wireless     |
| Alarm Screen           | "Alarm" + alarm reason; confirm with K or mute with C               |
| Pre-alarm Screen       | Yellow LED lit; alarm message; audible tone; staff call optional    |
| Macro Mode             | Rate displayed large; drug name displayed small                     |
| Service Mode           | Wrench icon displayed; yellow/red/blue LEDs blink; NOT for patient use |

### 10.4 Key Navigation

| Key   | Code | Function                                                            |
|-------|------|---------------------------------------------------------------------|
| o     | On/Off | Hold 3 seconds to turn off (white progress bar counts down)      |
| f     | Start/Stop | Begin or stop infusion                                        |
| s     | Door open | Opens pump door                                               |
| b / n | Bolus | Press and hold to deliver manual bolus                           |
| C     | Clear/Back | Go back; clear value; mute alarm for 2 minutes                |
| K     | OK   | Select, confirm values, acknowledge alarms                          |
| Q / q | Keypad arrows | Up/down/left/right for value editing                      |
| l / r | Left/Right | Open editor field; move digit cursor                        |
| u / d | Up/Down | Increase/decrease current digit                                |
| m     | Auto-prog | Initiate autoprogramming order                               |

---

## 11. ALARM SYSTEM

### 11.1 Alarm Categories (5 Tiers)

| Category        | LED           | Audible | Staff Call | Stops Infusion | User Action            |
|-----------------|---------------|---------|------------|----------------|------------------------|
| Alarm Hint/Advice | Off          | Beep    | No         | No             | Disappears automatically |
| Pre-Alarm       | Yellow steady | Yes     | Optional   | No             | Press C to mute; yellow LED stays until operating alarm |
| Reminder Alarm  | Yellow steady | Yes     | Optional   | No             | Press K to confirm      |
| Operating Alarm | Red flashing  | Yes     | Optional   | **YES**        | Press K to acknowledge (C to mute 2 min) |
| Device Alarm    | Red flashing  | Unique  | Yes        | **YES**        | Press O to power off; send for service if repeated |

### 11.2 Pre-Alarms

| Display Message       | Trigger                                                    |
|-----------------------|------------------------------------------------------------|
| "VTBI near end"       | Preselected volume almost infused (configurable lead time) |
| "Time near end"       | Preselected time almost over                               |
| "Battery nearly empty"| Battery almost discharged                                  |
| "KVO mode"            | VTBI/time reached; pump converted to KVO rate              |

### 11.3 Operating Alarms

| Display Message                   | Trigger / Action                                           |
|-----------------------------------|------------------------------------------------------------|
| "VTBI infused"                    | Programmed volume delivered; hang new bag / reset VTBI     |
| "Time expired"                    | Programmed time ended; reset or new therapy                |
| "Battery empty"                   | Battery discharged; on 3 min then auto-off; plug in immediately |
| "Downstream occlusion" / "Pressure high" | Downstream pressure exceeded set level; auto bolus reduction |
| "KVO time finished" / "KVO finished" | KVO time ended; program new settings                    |
| "Battery cover removed"           | Battery cover not locked; push until click                 |
| "Standby time expired"            | Standby time ended; set new time or resume therapy         |
| "No battery inserted"             | Pump requires battery to operate                           |
| "Drive blocked"                   | Excess pressure or motor failure; remove and reinsert line |
| "Calibrate device"                | Calibration data changed (e.g. after software update)      |
| "Check upstream" / "Upstream occlusion above pump" | Upstream sensor triggered; check roller clamp / line kinks |
| "Air bubble alarm"                | Single air bubble exceeds configured limit                 |
| "Accumulated air exceeds limit"   | Cumulative air accumulation exceeds limit                  |
| "No drops"                        | Drop sensor: container empty, clamp closed, or condensation |
| "Too few drops"                   | Drop sensor: insufficient drops detected                   |
| "Pump set back to default settings" | Settings could not be restored; re-enter parameters     |
| "Infusion values were cleared"    | Infusion data could not be restored; re-enter              |
| "Data lock"                       | Locked keypad; enter code                                  |
| "Danger of FreeFlow Clamp IV line" | Anti-free-flow clip not properly inserted                 |

### 11.4 Reminder Alarms

| Trigger                                                              | Action                        |
|----------------------------------------------------------------------|-------------------------------|
| Line inserted, not infusing, no interaction for 2 minutes            | "Reminder alarm" + reason     |
| Editor open but no values confirmed after timeout (20 seconds)       | "Value not confirmed"         |
| BOL pressed to program bolus but BOL not pressed to start            | "Bolus NOT running"           |
| Autoprogramming order sent but not confirmed                         | "Order still pending"         |

### 11.5 Device Alarms (Error Codes)

Device alarms use unique audible signal and stop all delivery. Codes (from Service Manual):

| Error Code  | Definition                                 |
|-------------|--------------------------------------------|
| 2001–2013   | Internal Error (function processor)        |
| 2014        | Loudspeaker not off                        |
| 2015        | Loudspeaker lost                           |
| 2016        | Loudspeaker shorted                        |
| 2017        | KUP no work (software defective/obsolete)  |
| 2018        | FUP-KUP OS Cycle Timeout                   |
| 2019        | FUP Flash Memory Error                     |
| 2020        | FUP different version KuP to FuP           |

---

## 12. SPACECOM2 / WIRELESS MODULE

### 12.1 SpaceStation and SpaceCom Architecture

| Component             | Part No.     | Description                                                   |
|-----------------------|--------------|---------------------------------------------------------------|
| SpaceStation          | 8713140 / 8713140U | Holds up to 4 pumps; power supply; CAN bus connectivity  |
| SpaceStation + SpaceCom | 8713142U   | SpaceStation with data communication module (SpaceCom)        |
| Up to 6 SpaceStations | —            | Max 24 pumps in 3 columns                                     |
| SpaceCover Comfort    | 8713145      | Top unit; alarm LEDs; loudspeaker; central alarm management   |
| Battery Pack SP (WiFi)| 8713182A / 8713182U | Pump-internal Wi-Fi module; Li-Ion battery               |
| WLAN USB Stick        | 8713185      | Alternative WiFi path via SpaceCom                            |

### 12.2 Wireless Network Specifications

| Parameter             | Value                                                           |
|-----------------------|-----------------------------------------------------------------|
| Wireless standard     | IEEE 802.11 a/b/g/n                                            |
| Network modes         | Infrastructure (preferred) or Ad-hoc                            |
| IP address            | Static or DHCP                                                  |
| SSID length           | Up to 32 characters                                             |
| Configuration tool    | HiBaSeD service software (sets SSID, security, IP)              |
| SpaceCom web server   | Hosts configuration interface; supports IE 7+ and Firefox 3+    |
| EMC classification    | Group 1, Class B RF emissions (CISPR 11) — Class A when SpaceStation attached |
| Integration           | PDMS (Patient Data Management System) or third-party via SpaceCom |

### 12.3 Wireless Status Indicators on Display

| Symbol                              | Meaning                                               |
|-------------------------------------|-------------------------------------------------------|
| Wireless antenna icon, no X         | Wireless active, connected to network                 |
| Wireless antenna icon with X        | Wireless active but connection lost                   |
| No wireless icon                    | Wireless switched off                                 |

---

## 13. FIRMWARE VERSIONS IDENTIFIED

| Version     | Document / Context                                                  |
|-------------|---------------------------------------------------------------------|
| **686N**    | GB IFU (current/mainstream European release, dated 05/2020)         |
| **686F**    | Older GB IFU (earlier version, smaller feature set)                 |
| **586U**    | US IFU (current US release, Rx only)                                |
| **695F**    | SpaceStation/SpaceCom IFU (compatible version for SpaceStation)     |
| **028U000061** | Battery Pack SP with WiFi — VULNERABLE (CISA ICSMA-21-294-01) |
| **028U000093** | Battery Pack SP with WiFi — PATCHED version (US/Canada)         |
| **012U000061** | SpaceStation with SpaceCom 2 — VULNERABLE                       |
| **012U000093** | SpaceStation with SpaceCom 2 — PATCHED (US/Canada)              |
| **L81**     | Non-US/Canada vulnerable version (Battery Pack + SpaceCom)          |
| **L83/L92/L93** | Non-US/Canada patched versions                                 |
| **I0050A0010** | Data module compactPlus — VULNERABLE version                    |
| **011L0000L81** | SpaceCom software — VULNERABLE (B. Braun security advisory)    |
| **027L0000L81** | Battery Pack SP with WiFi — VULNERABLE (B. Braun security advisory) |

**Software M:** Referenced in 686N IFU as parallel-compatible version.

---

## 14. OPERATING CONDITIONS

| Parameter                    | Operating             | Storage                 |
|------------------------------|-----------------------|-------------------------|
| Relative humidity            | 30%–90% (no condensation) | 20%–90% (no condensation) |
| Temperature (GB)             | +5°C to +40°C         | -20°C to +55°C          |
| Temperature (US)             | +60°F to +105°F (+15°C to +40°C) | -4°F to +131°F (-20°C to +55°C) |
| Atmospheric pressure         | 500–1060 mbar         | 500–1060 mbar           |
| EMC standard                 | IEC/EN 60601-1-2 / 60601-2-24 | —                  |
| Time of operation            | 100% (continuous)     | —                       |

---

## 15. PHYSICAL CONTROLS (BUTTON BEHAVIOUR)

| Control                      | Behaviour                                                       |
|------------------------------|-----------------------------------------------------------------|
| On/Off (o)                   | Press to power on; hold 3 seconds to power off (white progress bar) |
| Start/Stop (f)               | Press to start infusion; press again to stop                    |
| Bolus (b/n)                  | **Hold continuously** to deliver manual bolus; stops on release or 10 sec limit |
| Clear/Back (C)               | Go back; clear value; mute audible alarm for **2 minutes**      |
| OK (K)                       | Confirm values; acknowledge alarms                              |
| Arrow keys (Q/q)             | Navigate menus; adjust values with u (up) / d (down)           |
| Left/Right (l/r)             | Open editor field; move digit cursor position                   |

**Hold-to-repeat behaviour:**
- No explicit timing specification found in IFU text for rate entry keys
- Value entry uses digit-by-digit entry (cursor highlights digit; u/d change that digit)
- Hold BOL button: continuous delivery at bolus rate; counter increments on display
- Manual bolus hard limit: **10 seconds maximum** regardless of hold duration

**Power-off confirmation:**
- White progress bar stretches left-to-right over 3 seconds
- Pump goes to standby if IV line not removed when attempting power-off

**Alarm mute:**
- Press C to mute audible alarm for **2 minutes**
- If not confirmed with K within 2 minutes, audible alarm resumes

---

## 16. CISA ADVISORY ICSMA-21-294-01 — FULL DETAILS

**Advisory title:** B. Braun Infusomat Space Large Volume Pump (Update A)
**Alert code:** ICSMA-21-294-01
**Original publication:** October 21, 2021
**Last revised:** October 20, 2022
**Source:** https://www.cisa.gov/news-events/ics-medical-advisories/icsma-21-294-01

### 16.1 Affected Products

**United States and Canada:**
- Battery pack SP with WiFi: Software versions **028U000061 and earlier**
- SpaceStation with SpaceCom 2: Software versions **012U000061 and earlier**

**Outside US and Canada:**
- Battery Pack SP with WiFi: Software versions **L81 and earlier**
- SpaceStation with SpaceCom 2: Software versions **L81 and earlier**
- Data module compactPlus: Software versions **A10 and A11**

### 16.2 Vulnerabilities (5 CVEs)

| CVE            | CWE   | Type                                      | CVSS v3 Score | CVSS Vector                               |
|----------------|-------|-------------------------------------------|---------------|-------------------------------------------|
| CVE-2021-33885 | CWE-345 | Insufficient Verification of Data Authenticity | **9.0**  | AV:N/AC:H/PR:N/UI:N/S:C/C:H/I:H/A:H      |
| CVE-2021-33882 | CWE-306 | Missing Authentication for Critical Function | **6.8**  | AV:N/AC:H/PR:N/UI:N/S:C/C:N/I:H/A:N      |
| CVE-2021-33886 | CWE-20  | Improper Input Validation                  | **6.8**   | AV:A/AC:H/PR:N/UI:N/S:U/C:H/I:H/A:N      |
| CVE-2021-33884 | CWE-434 | Unrestricted File Upload                   | **6.5**   | AV:N/AC:L/PR:N/UI:N/S:U/C:L/I:L/A:N      |
| CVE-2021-33883 | CWE-319 | Cleartext Sensitive Data Transmission      | **5.9**   | AV:N/AC:H/PR:N/UI:N/S:U/C:N/I:H/A:N      |
| CVE-2020-25150 | CWE-23  | Relative Path Traversal (B. Braun advisory)| **7.6**   | —                                          |

### 16.3 Vulnerability Descriptions

**CVE-2021-33885 (CVSS 9.0 — CRITICAL):**
Insufficient verification of data authenticity in the SpaceCom and Battery Pack SP with WiFi components. A remote unauthenticated attacker can upload specific files to the communication devices that may reset the pump to service mode. Affects pumps in offline/standby mode only. Attack vector: Network, complexity: High (requires network proximity and man-in-the-middle position).

**CVE-2021-33882 (CVSS 6.8):**
Missing authentication for critical function. Network commands sent to SpaceCom require no authentication, enabling file uploads to communication devices. B. Braun stated remote infusion rate changes are NOT possible via this vulnerability.

**CVE-2021-33883 (CVSS 5.9):**
Network commands transmitted in cleartext. Allows interception and potentially enables uploading of malicious files. Does not directly affect connected pump infusion delivery.

**CVE-2021-33884 (CVSS 6.5):**
Unrestricted file upload capability. Enables arbitrary file uploads affecting device availability (not patient safety via infusion rate change).

**CVE-2021-33886 (CVSS 6.8):**
Improper input validation enabling command-line access. Requires network proximity (adjacent network). Could allow access to sensitive system information.

**CVE-2020-25150 (CVSS 7.6 — B. Braun advisory only):**
Relative path traversal vulnerability enabling service-level privilege exploitation and arbitrary command execution.

### 16.4 Combined Attack Scenario

Per McAfee Enterprise ATR research (2021):
An attacker could exploit these vulnerabilities in combination to:
1. Gain initial access to SpaceCom via missing auth (CVE-2021-33882)
2. Upload malicious firmware/configuration (CVE-2021-33884)
3. Bypass integrity checks (CVE-2021-33885)
4. Intercept and modify cleartext network commands (CVE-2021-33883)
5. Reset pump to service mode, potentially causing unexpected dosing on next use

**Key B. Braun clarification:** Modifying infusion rate remotely while pump is actively delivering is NOT possible. The risk is on next-use after device has been manipulated in standby.

### 16.5 Mitigations

**Software updates (apply immediately):**
- Battery pack SP with WiFi: Update to version **028U000093** (US/Canada)
- SpaceStation with SpaceCom 2: Update to version **012U000093** (US/Canada)
- Non-US/Canada: Update to **L83/L92/L93** equivalents

**Network controls:**
- Implement network zoning with firewalls and/or VLANs
- Isolate infusion pumps from direct internet access
- Deploy intrusion detection/prevention systems (IDS/IPS)
- Use VPNs for any remote access
- Encrypt all wireless communications

**Contact:**
- B. Braun Technical Support: 800-627-PUMP
- Email: AISTechSupport@bbraunusa.com

---

## 17. FDA RECALLS / CORRECTIONS

### FDA Correction — Faulty Occlusion Alarm (2024)

**Issue:** The upstream occlusion sensor may trigger "UPSTREAM OCCLUSION" alarm indicating a blockage when no occlusion exists, causing the pump to halt medication delivery.

**Risk:** Particularly dangerous for vasopressor medications and other time-critical therapies. Reported consequences: haemodynamic instability, reported injury, and one reported fatality.

**Affected models (UDI):**
- Infusomat Space Infusion System/Large Volume Pump: 04046963716752
- Infusomat Space Large Volume Pump Wireless: 04046964660887
- Infusomat Space Large Volume Pump Non-Wireless BATTERY PACK: 04046964708626

**FDA source:** https://www.fda.gov/medical-devices/medical-device-recalls-and-early-alerts/infusion-pump-correction-b-braun-medical-inc-issues-correction-lnfusomat-space-infusion-systemlarge

---

## 18. SYSTEM ARCHITECTURE NOTES (SERVICE MANUAL)

### Physical Construction

- Peristaltic pump mechanism (linear peristaltic)
- Two pressure sensors:
  - Upstream sensor (container side): spring-mounted, measures negative pressure
  - Downstream sensor (patient side): spring-mounted, measures overpressure
- Independent circuit in battery module monitors battery status
- USB connection (via Interface Lead CAN SP 8713230) for service program (HiBaSeD)
- Battery module in rear of housing upper part; emergency unlocking crank stored inside battery compartment cover

### SpaceCom Integration

- Pumps connect to optional SpaceCom via connectors in SpaceStation
- SpaceCom hosts web server for configuration
- Communication protocol: CAN bus between pumps within SpaceStation; TCP/IP (802.11) via SpaceCom to hospital network
- Service software: HiBaSeD (configures SSID, security, drug library upload, service settings)
- History log: > 3000 entries (GB IFU); 1000 entries alarm/keystroke log (US IFU)
- Service mode entry: Wrench icon on display; yellow + red + blue LEDs blink simultaneously

### Modular Stacking

- Up to 3 pumps on pole clamp (ambulance: 1 pump)
- Up to 4 pumps per SpaceStation
- Up to 6 SpaceStations per column = maximum **24 pumps**

---

## 19. KEY COMPARISON: ALARIS GP vs. INFUSOMAT SPACE

| Parameter              | Alaris GP (from CLAUDE.md)       | B. Braun Infusomat Space             |
|------------------------|----------------------------------|--------------------------------------|
| Rate min               | 0.1 ml/h                         | 0.1 ml/h                             |
| Rate max               | 1200 ml/h                        | 1200 ml/h                            |
| VTBI max               | 9999 ml                          | 9999 ml (US) / 99999 ml (GB)         |
| KVO rate               | 1.0 ml/h (fixed)                 | 1 or 3 ml/h (rate-dependent, configurable) |
| Bolus max rate         | 1200 ml/h                        | 1200 ml/h                            |
| Bolus max volume       | 5 ml                             | ~2 ml (limited by 10 sec at rate)    |
| Pressure display       | L0–L8 (8 levels, abstract)       | 9 levels (mmHg/bar, adjustable)      |
| Pressure default       | L5                               | Service-configurable                 |
| Drug library           | Guardrails (3-tier advisory/soft/hard) | 2-tier (soft/hard) + advisory text |
| Drug library capacity  | Not specified in CLAUDE.md       | Up to 1,200 drugs, 10 concentrations |
| Network module         | Not specified                    | SpaceCom2 / Battery Pack SP WiFi     |
| Alarm mute duration    | 120 seconds (2 min)              | 120 seconds (2 min)                  |
| Hold-to-off duration   | 3 seconds                        | 3 seconds                            |
| Air-in-line            | 100 µl limit                     | 0.02–0.3 ml single; 0.5–3.8 ml/h cumulative |

---

## 20. NOTES FOR SIMULATOR IMPLEMENTATION

1. **Rate entry uses digit-by-digit editing** (not chevron-style increments). The cursor moves to each digit; up/down keys increment/decrement that digit. This differs fundamentally from the Alaris GP chevron approach.

2. **Drug library is the default startup mode** — pump always boots to drug library for new infusions. Basic infusion (no library) must be explicitly selected.

3. **VTBI is required** to start infusion in library mode (except with SafeSet line which bypasses requirement).

4. **Soft limit symbols** appear on the run screen at all times during infusion, providing continuous visual feedback.

5. **Hard limits revert** — when user tries to exceed hard limit twice, editor field returns to last confirmed value. There is no "override" path for hard limits.

6. **SpaceCom vulnerabilities** are specifically in the communication modules (Battery Pack WiFi, SpaceCom), NOT in the pump delivery mechanism. The pump firmware itself was not directly compromised.

7. **The 10-second bolus limit** is enforced in hardware/firmware — no configuration option to extend it.

8. **Alarm mute** (C key): 2 minutes of silence, then audible resumes. Visual alarm persists until K is pressed.

---

*End of extracted specifications.*
*Sources: B. Braun Infusomat Space IFU 686N (GB), IFU 586U (US), Service Manual v1.1, CISA ICSMA-21-294-01, B. Braun Security Advisory 05/2021, FDA recall notice.*
