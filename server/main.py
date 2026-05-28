"""
Alaris GP Simulator — ML Training Pipeline Backend
FastAPI server providing dataset management and model training endpoints.

Data is stored in project_root/data/ (two levels up from this file's server/ directory).
"""

from __future__ import annotations

import json
import os
import secrets
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Literal

import joblib
import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    confusion_matrix,
    f1_score,
)
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder
from sklearn.tree import DecisionTreeClassifier

# ── Paths ─────────────────────────────────────────────────────────────────────

# server/main.py → server/ → project root → data/
DATA_ROOT = Path(__file__).parent.parent / "data"
DATASETS_DIR = DATA_ROOT / "datasets"
MODELS_DIR = DATA_ROOT / "models"
DATASETS_DIR.mkdir(parents=True, exist_ok=True)
MODELS_DIR.mkdir(parents=True, exist_ok=True)

# ── Feature columns to drop before training ───────────────────────────────────

DROP_COLS = {
    "record_id",
    "session_id",
    "timestamp_iso",
    "firmware_version",
    "drug_id",
    "drug_name",
    "drug_unit_used",
    "risk_label",
    "risk_score",
    "risk_reasons",
    # Layered score outputs — derived, not inputs
    "design_score",
    "interaction_score",
    "configuration_score",
    "system_score",
    "composite_score",
    "grade",
    "design_reasons",
    "interaction_reasons",
    "configuration_reasons",
    "system_reasons",
}

# Known device types for one-hot encoding.
# pump_model is categorical — convert to binary indicator columns so the
# classifier can treat each device as a separate signal.
# New devices must be added here when their records are included in training.
KNOWN_PUMP_MODELS = ["alaris_gp", "braun_infusomat"]

# Label order used consistently for confusion matrix and encoding
LABEL_ORDER = ["low", "medium", "high"]

# ── FastAPI app ───────────────────────────────────────────────────────────────

app = FastAPI(title="Alaris GP ML Pipeline", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5174"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Pydantic models ───────────────────────────────────────────────────────────


class SaveDatasetRequest(BaseModel):
    name: str
    records: list[dict[str, Any]]


class SaveDatasetResponse(BaseModel):
    id: str
    filename: str
    record_count: int


class DistributionCounts(BaseModel):
    low: int
    medium: int
    high: int


class DatasetMeta(BaseModel):
    id: str
    name: str
    filename: str
    record_count: int
    created_at: str
    distribution: DistributionCounts


class TrainRequest(BaseModel):
    dataset_filenames: list[str]
    algorithm: Literal["random_forest", "decision_tree", "logistic_regression"]
    test_split: float = 0.2
    version_name: str | None = None


class F1PerClass(BaseModel):
    low: float
    medium: float
    high: float


class FeatureImportanceItem(BaseModel):
    feature: str
    importance: float


class ModelMeta(BaseModel):
    id: str
    version_name: str
    algorithm: str
    created_at: str
    training_datasets: list[str]
    total_records: int
    train_records: int
    test_records: int
    accuracy: float
    f1_macro: float
    f1_per_class: F1PerClass
    confusion_matrix: list[list[int]]
    feature_importance: list[FeatureImportanceItem]
    feature_cols: list[str]


class PredictRequest(BaseModel):
    model_id: str
    features: dict[str, float]


class ConfidenceScores(BaseModel):
    low: float
    medium: float
    high: float


class FeatureContributionItem(BaseModel):
    feature: str
    value: float
    importance: float
    contribution: float


class PredictResult(BaseModel):
    label: Literal["low", "medium", "high"]
    confidence: float
    probabilities: ConfidenceScores
    top_features: list[FeatureContributionItem]
    model_id: str
    grade: str  # Energy-label grade (A+ to F) based on predicted label


# ── Helpers ───────────────────────────────────────────────────────────────────


def _make_filename(name: str) -> str:
    """
    Build a unique dataset filename:
    {safeName}_{YYYYMMDD_HHMMSS}_{6hex}
    """
    safe = "".join(c if c.isalnum() or c in "-_" else "_" for c in name)
    ts = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    rand_hex = secrets.token_hex(3)
    return f"{safe}_{ts}_{rand_hex}"


def _distribution(records: list[dict[str, Any]]) -> DistributionCounts:
    low = sum(1 for r in records if r.get("risk_label") == "low")
    medium = sum(1 for r in records if r.get("risk_label") == "medium")
    high = sum(1 for r in records if r.get("risk_label") == "high")
    return DistributionCounts(low=low, medium=medium, high=high)


def _load_dataset_meta(filename: str) -> DatasetMeta | None:
    meta_path = DATASETS_DIR / f"{filename}_meta.json"
    if not meta_path.exists():
        return None
    with open(meta_path, "r", encoding="utf-8") as f:
        return DatasetMeta(**json.load(f))


def _load_model_meta(model_id: str) -> ModelMeta | None:
    meta_path = MODELS_DIR / f"{model_id}_meta.json"
    if not meta_path.exists():
        return None
    with open(meta_path, "r", encoding="utf-8") as f:
        return ModelMeta(**json.load(f))


def _build_feature_matrix(
    df: pd.DataFrame,
) -> tuple[pd.DataFrame, list[str]]:
    """
    Drop non-feature columns, one-hot encode pump_model, and return (X, feature_cols).

    pump_model is categorical and carries predictive signal when training on a
    combined multi-device dataset — e.g. 'braun_infusomat' always has
    firmware_signed=0 (CVE-2021-33885) which pushes risk higher.
    One-hot encoding with KNOWN_PUMP_MODELS prevents unseen-category leakage.

    Missing columns are filled with 0. Non-numeric columns dropped after encoding.
    """
    # One-hot encode pump_model before dropping — creates pump_model_alaris_gp,
    # pump_model_braun_infusomat, etc. as binary indicator columns.
    if "pump_model" in df.columns:
        for model_id in KNOWN_PUMP_MODELS:
            col_name = f"pump_model_{model_id}"
            df = df.copy()
            df[col_name] = (df["pump_model"] == model_id).astype(int)

    drop = [c for c in df.columns if c in DROP_COLS]
    X = df.drop(columns=drop, errors="ignore")
    # Drop raw pump_model string column (now encoded)
    X = X.drop(columns=["pump_model"], errors="ignore")
    # Keep only numeric columns
    X = X.select_dtypes(include=[np.number])
    X = X.fillna(0)
    return X, list(X.columns)


def _get_feature_importance(
    model: Any,
    feature_cols: list[str],
    top_n: int = 20,
) -> list[FeatureImportanceItem]:
    """Extract top-N feature importances from any supported model type."""
    if hasattr(model, "feature_importances_"):
        importances = model.feature_importances_
    elif hasattr(model, "coef_"):
        coef = np.array(model.coef_)
        importances = np.abs(coef).mean(axis=0)
    else:
        return []

    items = sorted(
        zip(feature_cols, importances),
        key=lambda x: x[1],
        reverse=True,
    )[:top_n]
    return [FeatureImportanceItem(feature=f, importance=float(i)) for f, i in items]


# ── Dataset endpoints ─────────────────────────────────────────────────────────


@app.get("/health")
def health_check() -> dict[str, str]:
    """Health check endpoint."""
    return {"status": "ok"}


@app.post("/api/datasets/save", response_model=SaveDatasetResponse)
def save_dataset(req: SaveDatasetRequest) -> SaveDatasetResponse:
    """
    Save a dataset as both JSON and CSV with a unique filename.
    Never overwrites — always generates a new unique filename.
    """
    if not req.records:
        raise HTTPException(status_code=400, detail="records list is empty")

    filename = _make_filename(req.name)
    dist = _distribution(req.records)

    # Save JSON
    json_path = DATASETS_DIR / f"{filename}.json"
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(req.records, f, indent=2)

    # Save CSV via pandas
    df = pd.DataFrame(req.records)
    csv_path = DATASETS_DIR / f"{filename}.csv"
    df.to_csv(csv_path, index=False)

    # Save metadata
    meta = DatasetMeta(
        id=str(uuid.uuid4()),
        name=req.name,
        filename=filename,
        record_count=len(req.records),
        created_at=datetime.utcnow().isoformat() + "Z",
        distribution=dist,
    )
    meta_path = DATASETS_DIR / f"{filename}_meta.json"
    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump(meta.model_dump(), f, indent=2)

    return SaveDatasetResponse(
        id=meta.id,
        filename=filename,
        record_count=meta.record_count,
    )


@app.get("/api/datasets", response_model=list[DatasetMeta])
def list_datasets() -> list[DatasetMeta]:
    """List all saved datasets with metadata."""
    metas: list[DatasetMeta] = []
    for meta_file in sorted(DATASETS_DIR.glob("*_meta.json")):
        filename = meta_file.stem.removesuffix("_meta")
        meta = _load_dataset_meta(filename)
        if meta is not None:
            metas.append(meta)
    # Sort newest first
    metas.sort(key=lambda m: m.created_at, reverse=True)
    return metas


@app.get("/api/datasets/{filename}/download/csv")
def download_csv(filename: str) -> FileResponse:
    """Download dataset as CSV."""
    path = DATASETS_DIR / f"{filename}.csv"
    if not path.exists():
        raise HTTPException(status_code=404, detail="Dataset CSV not found")
    return FileResponse(
        path=str(path),
        media_type="text/csv",
        filename=f"{filename}.csv",
    )


@app.get("/api/datasets/{filename}/download/json")
def download_json(filename: str) -> FileResponse:
    """Download dataset as JSON."""
    path = DATASETS_DIR / f"{filename}.json"
    if not path.exists():
        raise HTTPException(status_code=404, detail="Dataset JSON not found")
    return FileResponse(
        path=str(path),
        media_type="application/json",
        filename=f"{filename}.json",
    )


@app.delete("/api/datasets/{filename}")
def delete_dataset(filename: str) -> dict[str, str]:
    """Delete all files associated with a dataset."""
    deleted = []
    for ext in [".json", ".csv", "_meta.json"]:
        p = DATASETS_DIR / f"{filename}{ext}"
        if p.exists():
            p.unlink()
            deleted.append(p.name)
    if not deleted:
        raise HTTPException(status_code=404, detail="Dataset not found")
    return {"deleted": ", ".join(deleted)}


# ── Model training endpoints ──────────────────────────────────────────────────


@app.post("/api/models/train", response_model=ModelMeta)
def train_model(req: TrainRequest) -> ModelMeta:
    """
    Load and combine datasets, train a classifier, evaluate, save model.
    Returns full metrics.
    """
    if not req.dataset_filenames:
        raise HTTPException(status_code=400, detail="No datasets specified")
    if not 0.05 <= req.test_split <= 0.5:
        raise HTTPException(status_code=400, detail="test_split must be between 0.05 and 0.5")

    # Load and combine datasets
    all_dfs: list[pd.DataFrame] = []
    for fname in req.dataset_filenames:
        json_path = DATASETS_DIR / f"{fname}.json"
        csv_path = DATASETS_DIR / f"{fname}.csv"
        if json_path.exists():
            with open(json_path, "r", encoding="utf-8") as f:
                records = json.load(f)
            all_dfs.append(pd.DataFrame(records))
        elif csv_path.exists():
            all_dfs.append(pd.read_csv(csv_path))
        else:
            raise HTTPException(status_code=404, detail=f"Dataset '{fname}' not found")

    df = pd.concat(all_dfs, ignore_index=True)
    total_records = len(df)

    if "risk_label" not in df.columns:
        raise HTTPException(status_code=400, detail="Dataset missing 'risk_label' column")

    # Build feature matrix
    X, feature_cols = _build_feature_matrix(df)
    y = df["risk_label"].fillna("low")

    # Encode labels in consistent order
    le = LabelEncoder()
    le.classes_ = np.array(LABEL_ORDER)
    y_enc = le.transform(y)

    # Train/test split (stratified)
    X_train, X_test, y_train, y_test = train_test_split(
        X,
        y_enc,
        test_size=req.test_split,
        random_state=42,
        stratify=y_enc,
    )

    # Instantiate model
    if req.algorithm == "random_forest":
        model = RandomForestClassifier(
            n_estimators=100, random_state=42, class_weight="balanced"
        )
    elif req.algorithm == "decision_tree":
        model = DecisionTreeClassifier(
            max_depth=10, random_state=42, class_weight="balanced"
        )
    else:  # logistic_regression
        model = LogisticRegression(
            max_iter=500, random_state=42, class_weight="balanced"
        )

    model.fit(X_train, y_train)
    y_pred = model.predict(X_test)

    # Metrics
    accuracy = float(accuracy_score(y_test, y_pred))
    f1_macro = float(f1_score(y_test, y_pred, average="macro", zero_division=0))
    f1_per = f1_score(y_test, y_pred, average=None, labels=[0, 1, 2], zero_division=0)
    cm = confusion_matrix(y_test, y_pred, labels=[0, 1, 2]).tolist()

    feature_importance = _get_feature_importance(model, feature_cols, top_n=20)

    # Version name
    version_name = req.version_name or (
        f"{req.algorithm[:2]}_{total_records}rec_{datetime.utcnow().strftime('%H%M%S')}"
    )

    model_id = str(uuid.uuid4()).replace("-", "")[:16]
    created_at = datetime.utcnow().isoformat() + "Z"

    meta = ModelMeta(
        id=model_id,
        version_name=version_name,
        algorithm=req.algorithm,
        created_at=created_at,
        training_datasets=req.dataset_filenames,
        total_records=total_records,
        train_records=len(X_train),
        test_records=len(X_test),
        accuracy=round(accuracy, 4),
        f1_macro=round(f1_macro, 4),
        f1_per_class=F1PerClass(
            low=round(float(f1_per[0]), 4),
            medium=round(float(f1_per[1]), 4),
            high=round(float(f1_per[2]), 4),
        ),
        confusion_matrix=cm,
        feature_importance=feature_importance,
        feature_cols=feature_cols,
    )

    # Compute feature means from training data (used in predict for contribution scoring)
    feature_means = {col: float(X[col].mean()) for col in feature_cols}

    # Save model + metadata
    joblib.dump(
        {"model": model, "label_encoder": le, "feature_cols": feature_cols},
        MODELS_DIR / f"{model_id}.pkl",
    )
    meta_dict = meta.model_dump()
    meta_dict["feature_means"] = feature_means
    with open(MODELS_DIR / f"{model_id}_meta.json", "w", encoding="utf-8") as f:
        json.dump(meta_dict, f, indent=2)

    return meta


@app.get("/api/models", response_model=list[ModelMeta])
def list_models() -> list[ModelMeta]:
    """List all trained model versions with metadata."""
    metas: list[ModelMeta] = []
    for meta_file in sorted(MODELS_DIR.glob("*_meta.json")):
        model_id = meta_file.stem.removesuffix("_meta")
        meta = _load_model_meta(model_id)
        if meta is not None:
            metas.append(meta)
    metas.sort(key=lambda m: m.created_at, reverse=True)
    return metas


@app.delete("/api/models/{model_id}")
def delete_model(model_id: str) -> dict[str, str]:
    """Delete a trained model and its metadata."""
    deleted = []
    for suffix in [".pkl", "_meta.json"]:
        p = MODELS_DIR / f"{model_id}{suffix}"
        if p.exists():
            p.unlink()
            deleted.append(p.name)
    if not deleted:
        raise HTTPException(status_code=404, detail="Model not found")
    return {"deleted": ", ".join(deleted)}


# ── Prediction endpoint ───────────────────────────────────────────────────────


@app.post("/api/models/predict", response_model=PredictResult)
def predict(req: PredictRequest) -> PredictResult:
    """
    Run prediction using a trained model.
    Missing feature values default to 0.
    Returns label, confidence, per-class probabilities, and top-8 feature contributions.
    """
    pkl_path = MODELS_DIR / f"{req.model_id}.pkl"
    if not pkl_path.exists():
        raise HTTPException(status_code=404, detail="Model not found")

    # Load raw meta dict so we can access feature_means (may not be in ModelMeta schema)
    meta_path = MODELS_DIR / f"{req.model_id}_meta.json"
    if not meta_path.exists():
        raise HTTPException(status_code=404, detail="Model metadata not found")
    with open(meta_path, "r", encoding="utf-8") as f:
        meta_dict = json.load(f)

    meta = _load_model_meta(req.model_id)
    if meta is None:
        raise HTTPException(status_code=404, detail="Model metadata not found")

    feature_means: dict[str, float] = meta_dict.get("feature_means", {})

    bundle = joblib.load(pkl_path)
    model = bundle["model"]
    feature_cols: list[str] = bundle["feature_cols"]

    # Build feature row in correct column order, fill missing with 0
    row = {col: req.features.get(col, 0.0) for col in feature_cols}
    X_pred = pd.DataFrame([row], columns=feature_cols).fillna(0)

    y_enc = model.predict(X_pred)[0]
    proba = model.predict_proba(X_pred)[0]

    # Map probabilities to label order [low, medium, high]
    conf_map: dict[str, float] = {LABEL_ORDER[i]: float(proba[i]) for i in range(len(LABEL_ORDER))}

    predicted_label: Literal["low", "medium", "high"] = LABEL_ORDER[int(y_enc)]  # type: ignore[assignment]
    confidence = float(max(proba))

    # Extract raw importances (normalised for LR so all model types are comparable)
    if hasattr(model, "feature_importances_"):
        raw_importances: list[float] = list(model.feature_importances_)
    elif hasattr(model, "coef_"):
        coef = np.abs(np.array(model.coef_))
        mean_coef = coef.mean(axis=0)
        coef_sum = float(mean_coef.sum())
        raw_importances = [float(v) / (coef_sum + 1e-10) for v in mean_coef]
    else:
        raw_importances = [0.0] * len(feature_cols)

    # Compute feature contributions: importance * deviation from mean
    contributions: list[FeatureContributionItem] = []
    for idx, col in enumerate(feature_cols):
        val = float(row[col])
        mean_val = feature_means.get(col, 0.0)
        importance = raw_importances[idx] if idx < len(raw_importances) else 0.0
        deviation = abs(val - mean_val) / (abs(mean_val) + 1e-4)
        contribution = importance * min(deviation, 5.0)  # cap deviation at 5x
        contributions.append(FeatureContributionItem(
            feature=col,
            value=round(val, 6),
            importance=round(importance, 6),
            contribution=round(contribution, 6),
        ))

    # Sort by contribution descending, return top 8
    contributions.sort(key=lambda x: x.contribution, reverse=True)
    top_features = contributions[:8]

    # Map predicted label to approximate grade (placeholder — exact grade requires full feature computation)
    _LABEL_GRADE_MAP: dict[str, str] = {"low": "B", "medium": "C", "high": "E"}
    predicted_grade = _LABEL_GRADE_MAP.get(predicted_label, "C")

    return PredictResult(
        label=predicted_label,
        confidence=round(confidence, 4),
        probabilities=ConfidenceScores(
            low=round(conf_map.get("low", 0.0), 4),
            medium=round(conf_map.get("medium", 0.0), 4),
            high=round(conf_map.get("high", 0.0), 4),
        ),
        top_features=top_features,
        model_id=req.model_id,
        grade=predicted_grade,
    )
