/**
 * Research API client — communicates with the FastAPI backend at localhost:8000.
 * NO React imports. Pure TypeScript fetch wrappers.
 *
 * Source: CLAUDE.md Section 8 (TrainingRecord) + ML pipeline spec.
 */

const BASE = "http://localhost:8000";

// ── Response types ────────────────────────────────────────────────────────────

export interface DatasetMeta {
  id: string;
  name: string;
  filename: string;
  record_count: number;
  created_at: string;
  distribution: { low: number; medium: number; high: number };
}

export interface ModelMeta {
  id: string;
  version_name: string;
  algorithm: string;
  created_at: string;
  training_datasets: string[];
  total_records: number;
  train_records: number;
  test_records: number;
  accuracy: number;
  f1_macro: number;
  f1_per_class: { low: number; medium: number; high: number };
  /** 3×3 confusion matrix — rows = Actual, cols = Predicted, order: low/medium/high */
  confusion_matrix: number[][];
  feature_importance: Array<{ feature: string; importance: number }>;
  feature_cols: string[];
}

export interface FeatureContribution {
  feature: string;
  value: number;
  importance: number;
  contribution: number;
}

export interface PredictResult {
  label: "low" | "medium" | "high";
  confidence: number;
  probabilities: { low: number; medium: number; high: number };
  top_features: FeatureContribution[];
  model_id: string;
  /** Energy-label grade derived from predicted label (A+ to F). */
  grade: "A+" | "A" | "B" | "C" | "D" | "E" | "F";
}

export interface TrainRequest {
  dataset_filenames: string[];
  algorithm: "random_forest" | "decision_tree" | "logistic_regression";
  test_split: number;
  version_name?: string;
}

// ── Internal fetch helper ─────────────────────────────────────────────────────

async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...options.headers },
    ...options,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`API ${res.status}: ${text}`);
  }
  // 204 No Content — return undefined cast to T
  if (res.status === 204) return undefined as unknown as T;
  return res.json() as Promise<T>;
}

// ── API surface ───────────────────────────────────────────────────────────────

export const api = {
  /**
   * Save a generated dataset to the backend.
   * Returns id, filename, and record_count.
   */
  saveDataset: (
    name: string,
    records: object[]
  ): Promise<{ id: string; filename: string; record_count: number }> =>
    apiFetch("/api/datasets/save", {
      method: "POST",
      body: JSON.stringify({ name, records }),
    }),

  /** List all saved datasets. */
  listDatasets: (): Promise<DatasetMeta[]> =>
    apiFetch("/api/datasets"),

  /** Direct URL for in-browser CSV download. */
  downloadCSVUrl: (filename: string): string =>
    `${BASE}/api/datasets/${encodeURIComponent(filename)}/download/csv`,

  /** Direct URL for in-browser JSON download. */
  downloadJSONUrl: (filename: string): string =>
    `${BASE}/api/datasets/${encodeURIComponent(filename)}/download/json`,

  /** Delete a dataset and all its associated files. */
  deleteDataset: (filename: string): Promise<void> =>
    apiFetch(`/api/datasets/${encodeURIComponent(filename)}`, { method: "DELETE" }),

  /** List all trained model versions. */
  listModels: (): Promise<ModelMeta[]> =>
    apiFetch("/api/models"),

  /**
   * Train a new model version on selected datasets.
   * Returns full metrics including confusion matrix and feature importance.
   */
  trainModel: (req: TrainRequest): Promise<ModelMeta> =>
    apiFetch("/api/models/train", {
      method: "POST",
      body: JSON.stringify(req),
    }),

  /** Delete a trained model. */
  deleteModel: (modelId: string): Promise<void> =>
    apiFetch(`/api/models/${encodeURIComponent(modelId)}`, { method: "DELETE" }),

  /**
   * Run a prediction using a trained model.
   * Missing feature values default to 0 on the server.
   */
  predict: (
    modelId: string,
    features: Record<string, number>
  ): Promise<PredictResult> =>
    apiFetch("/api/models/predict", {
      method: "POST",
      body: JSON.stringify({ model_id: modelId, features }),
    }),

  /** Returns true if the backend is reachable, false otherwise. */
  healthCheck: async (): Promise<boolean> => {
    try {
      await apiFetch<{ status: string }>("/health");
      return true;
    } catch {
      return false;
    }
  },
};
