/**
 * Drug library for the Alaris GP pump simulator.
 * All values are clinically validated — DO NOT change them.
 * Source: DFU Manual default dosing units + clinical standard concentrations.
 * NO React imports allowed in this file.
 */

import type { Drug } from './types';

export const DRUG_LIBRARY: Drug[] = [
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
    concentration: 0.08,          // 4mg in 50ml = 0.08 mg/ml
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
    concentration: 1,
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
    concentration: 1000,
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
    concentration: 3.2,
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
    concentration: 0.08,          // 4mg in 50ml = 0.08 mg/ml
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
    concentration: 10,
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
    concentration: 1,
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
    concentration: 1.8,
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
    concentration: 1,
    concentrationUnit: "mmol/ml",
    softMin: 5, softMax: 20, hardMin: 1, hardMax: 40,
    defaultRate: 10,
    bolusAllowed: false, weightBased: false,
    rateUnit: "mmol/h",
    clinicalContext: "Electrolyte — cardiac arrest risk if rapid infusion"
  },
];
