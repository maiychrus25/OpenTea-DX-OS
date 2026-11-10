# Copyright (c) 2026 OpenTea Developers
# Licensed under the MIT License. See LICENSE file in the project root for full license information.

# Disease detection model: leaf_disease_model.keras
# Source: CuongKenn/ICTU-OpenAgri (https://github.com/CuongKenn/ICTU-OpenAgri)
# Original License: MIT — Copyright (c) 2025 CuongKenn and ICTU-OpenAgri Contributors
# See ai-models/ATTRIBUTION.md for full license text

import asyncio
import io
import json
import logging
import math
import os
from contextlib import asynccontextmanager
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Dict, List, Optional

import numpy as np
from fastapi import FastAPI, File, HTTPException, UploadFile
from PIL import Image
from pydantic import BaseModel

logger = logging.getLogger(__name__)

# ── Configuration ────────────────────────────────────────────────────────────

MODEL_DIR = Path(os.getenv("MODEL_DIR", "/models"))
# Model name -> (model file, class names file); "general" stays the default for existing callers.
MODEL_FILES = {
    "general": ("leaf_disease_model.keras", "class_names.txt"),
    "tea": ("tea_leaf_model.keras", "tea_class_names.txt"),
}
TEA_NAMES_VI_FILE = "tea_class_names_vi.json"
# From ai-models/tea/MODEL_CARD.md; override with TEA_CONFIDENCE_THRESHOLD.
DEFAULT_TEA_CONFIDENCE_THRESHOLD = 0.60
IMAGE_SIZE = (224, 224)
ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png"}

# Thread pool for blocking TF inference in async context
_executor = ThreadPoolExecutor(max_workers=2)

# ── Vietnamese name mapping ──────────────────────────────────────────────────
# Vietnamese disease name translations below are sourced from:
#   CuongKenn/ICTU-OpenAgri (https://github.com/CuongKenn/ICTU-OpenAgri)
#   License: MIT — Copyright (c) 2025 CuongKenn and ICTU-OpenAgri Contributors

VIETNAMESE_NAMES = {
    "Apple___Apple_scab": "Táo - Bệnh vảy táo",
    "Apple___Black_rot": "Táo - Bệnh thối đen",
    "Apple___Cedar_apple_rust": "Táo - Bệnh gỉ sắt tuyết tùng",
    "Apple___healthy": "Táo - Khỏe mạnh",
    "Bacterial Leaf Blight": "Lúa - Bệnh bạc lá vi khuẩn",
    "Blueberry___healthy": "Việt quất - Khỏe mạnh",
    "Brown Spot": "Lúa - Bệnh đốm nâu",
    "Cherry_(including_sour)___Powdery_mildew": "Anh đào - Bệnh phấn trắng",
    "Cherry_(including_sour)___healthy": "Anh đào - Khỏe mạnh",
    "Corn_(maize)___Cercospora_leaf_spot Gray_leaf_spot": "Ngô - Bệnh đốm lá xám",
    "Corn_(maize)___Common_rust_": "Ngô - Bệnh gỉ sắt thường",
    "Corn_(maize)___Northern_Leaf_Blight": "Ngô - Bệnh cháy lá lớn",
    "Corn_(maize)___healthy": "Ngô - Khỏe mạnh",
    "Grape___Black_rot": "Nho - Bệnh thối đen",
    "Grape___Esca_(Black_Measles)": "Nho - Bệnh Esca (Sởi đen)",
    "Grape___Leaf_blight_(Isariopsis_Leaf_Spot)": "Nho - Bệnh cháy lá",
    "Grape___healthy": "Nho - Khỏe mạnh",
    "Healthy Rice Leaf": "Lúa - Khỏe mạnh",
    "Leaf Blast": "Lúa - Bệnh đạo ôn lá",
    "Leaf scald": "Lúa - Bệnh cháy bìa lá",
    "Narrow Brown Leaf Spot": "Lúa - Bệnh đốm nâu hẹp",
    "Orange___Haunglongbing_(Citrus_greening)": "Cam - Bệnh vàng lá gân xanh",
    "Peach___Bacterial_spot": "Đào - Bệnh đốm vi khuẩn",
    "Peach___healthy": "Đào - Khỏe mạnh",
    "Pepper,_bell___Bacterial_spot": "Ớt chuông - Bệnh đốm vi khuẩn",
    "Pepper,_bell___healthy": "Ớt chuông - Khỏe mạnh",
    "Potato___Early_blight": "Khoai tây - Bệnh đốm vòng",
    "Potato___Late_blight": "Khoai tây - Bệnh mốc sương",
    "Potato___healthy": "Khoai tây - Khỏe mạnh",
    "Raspberry___healthy": "Mâm xôi - Khỏe mạnh",
    "Rice Hispa": "Lúa - Sâu cuốn lá nhỏ",
    "Sheath Blight": "Lúa - Bệnh khô vằn",
    "Soybean___healthy": "Đậu nành - Khỏe mạnh",
    "Squash___Powdery_mildew": "Bí - Bệnh phấn trắng",
    "Strawberry___Leaf_scorch": "Dâu tây - Bệnh cháy lá",
    "Strawberry___healthy": "Dâu tây - Khỏe mạnh",
    "Tomato___Bacterial_spot": "Cà chua - Bệnh đốm vi khuẩn",
    "Tomato___Early_blight": "Cà chua - Bệnh đốm vòng",
    "Tomato___Late_blight": "Cà chua - Bệnh mốc sương",
    "Tomato___Leaf_Mold": "Cà chua - Bệnh mốc lá",
    "Tomato___Septoria_leaf_spot": "Cà chua - Bệnh đốm lá Septoria",
    "Tomato___Spider_mites Two-spotted_spider_mite": "Cà chua - Nhện đỏ hai chấm",
    "Tomato___Target_Spot": "Cà chua - Bệnh đốm vòng đồng tâm",
    "Tomato___Tomato_Yellow_Leaf_Curl_Virus": "Cà chua - Virus xoăn vàng lá",
    "Tomato___Tomato_mosaic_virus": "Cà chua - Virus khảm lá",
    "Tomato___healthy": "Cà chua - Khỏe mạnh",
}


# ── Response schemas ─────────────────────────────────────────────────────────


class Top3Item(BaseModel):
    label: str
    confidence: float


class PredictResponse(BaseModel):
    # Null when uncertain: the tea model's top confidence is below the threshold.
    disease_name_vi: Optional[str]
    disease_name_en: Optional[str]
    confidence: float
    top3: List[Top3Item]
    model: str
    uncertain: bool


class HealthResponse(BaseModel):
    status: str
    model_loaded: bool  # the general model, as before
    models: Dict[str, bool]


class ErrorResponse(BaseModel):
    error: str


# ── Model loading ────────────────────────────────────────────────────────────

# Model name -> (Keras model, class names); a model missing here answers 503.
_models: Dict[str, tuple] = {}
_tea_names_vi: Dict[str, str] = {}
_tea_threshold = DEFAULT_TEA_CONFIDENCE_THRESHOLD


def _read_tea_threshold() -> float:
    """TEA_CONFIDENCE_THRESHOLD as a float in (0, 1]; anything else stops startup."""
    raw = os.getenv("TEA_CONFIDENCE_THRESHOLD")
    if raw is None:
        return DEFAULT_TEA_CONFIDENCE_THRESHOLD
    try:
        value = float(raw)
    except ValueError:
        value = math.nan
    if not 0.0 < value <= 1.0:
        raise ValueError(f"TEA_CONFIDENCE_THRESHOLD must be a number in (0, 1], got {raw!r}")
    return value


def _load_model_sync(model_file: str, class_names_file: str) -> Optional[tuple]:
    """Load one TF/Keras model and its class names from disk; None when missing or broken."""
    model_path = MODEL_DIR / model_file
    class_names_path = MODEL_DIR / class_names_file

    # Load class names
    if not class_names_path.exists():
        logger.error("Class names file not found: %s", class_names_path)
        return None
    class_names = [
        line.strip()
        for line in class_names_path.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]
    logger.info("Loaded %d class names from %s", len(class_names), class_names_path)

    # Load Keras model
    if not model_path.exists():
        logger.error("Model file not found: %s", model_path)
        return None

    try:
        # Lazy import to avoid slow startup if TF not needed for health-only mode
        import tensorflow as tf

        model = tf.keras.models.load_model(str(model_path))
        logger.info("Model loaded successfully from %s", model_path)
        return model, class_names
    except Exception as exc:
        logger.error("Failed to load model %s: %s", model_path, exc)
        return None


def _load_tea_names_vi() -> Optional[Dict[str, str]]:
    """Vietnamese tea class names (AI labels an officer must confirm); None when missing or broken."""
    path = MODEL_DIR / TEA_NAMES_VI_FILE
    try:
        return {class_id: entry["vi"] for class_id, entry in json.loads(path.read_text(encoding="utf-8")).items()}
    except Exception as exc:
        logger.error("Failed to load tea Vietnamese names %s: %s", path, exc)
        return None


# ── Image preprocessing ──────────────────────────────────────────────────────


def _preprocess_image(image_bytes: bytes) -> np.ndarray:
    """Resize and normalize image for model input."""
    img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    img = img.resize(IMAGE_SIZE)
    img_array = np.array(img, dtype=np.float32) / 255.0
    return np.expand_dims(img_array, axis=0)  # batch dimension


def _run_inference(model, img_array: np.ndarray) -> np.ndarray:
    """Run model prediction (blocking — call in executor)."""
    return model.predict(img_array, verbose=0)


# ── Application lifecycle ────────────────────────────────────────────────────


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Load both models on startup, cleanup on shutdown."""
    global _tea_threshold, _tea_names_vi
    _tea_threshold = _read_tea_threshold()
    logger.info("Starting Disease API — loading models...")
    _models.clear()
    for name, (model_file, class_names_file) in MODEL_FILES.items():
        loaded = _load_model_sync(model_file, class_names_file)
        if loaded is not None:
            _models[name] = loaded
    names_vi = _load_tea_names_vi() if "tea" in _models else None
    missing = [] if names_vi is None else [i for i in _models["tea"][1] if i not in names_vi]
    if missing:
        logger.error("Tea model disabled: %s lacks Vietnamese names for %s", TEA_NAMES_VI_FILE, missing)
    if names_vi is None or missing:
        _models.pop("tea", None)
    else:
        _tea_names_vi = names_vi
    yield
    logger.info("Disease API shutting down")


app = FastAPI(
    title="DX-AgriMarket Disease API",
    description="Crop disease detection via TF/Keras inference. "
    "AI Invariant: returns disease name + confidence ONLY — NO treatment.",
    version="1.0.0",
    lifespan=lifespan,
)


# ── Endpoints ────────────────────────────────────────────────────────────────


@app.get("/health", response_model=HealthResponse)
def health_check():
    """Health check — reports which TF models are loaded and ready."""
    return {
        "status": "ok",
        "model_loaded": "general" in _models,
        "models": {name: name in _models for name in MODEL_FILES},
    }


@app.post(
    "/predict",
    response_model=PredictResponse,
    responses={400: {"model": ErrorResponse}, 503: {"model": ErrorResponse}},
)
async def predict(file: UploadFile = File(...), model: str = "general"):
    """
    Classify crop disease from a leaf image with the `general` (default) or `tea` model.

    Accepts JPEG/PNG. Returns disease name (vi + en) and confidence; a tea result
    below the confidence threshold is `uncertain` with null names and top3 kept.
    AI Invariant: response NEVER contains treatment recommendations.
    """
    if model not in MODEL_FILES:
        raise HTTPException(
            status_code=400,
            detail={"error": f"Unknown model: {model}. Use one of: {', '.join(MODEL_FILES)}."},
        )

    # ── Validate content type ────────────────────────────────────────────
    if file.content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=400,
            detail={"error": f"Unsupported image format: {file.content_type}. Only JPEG and PNG are accepted."},
        )

    # ── Check model availability ─────────────────────────────────────────
    if model not in _models:
        raise HTTPException(
            status_code=503,
            detail={"error": "Model not loaded. Check /health endpoint."},
        )
    keras_model, class_names = _models[model]

    # ── Read and validate image ──────────────────────────────────────────
    try:
        image_bytes = await file.read()
    except Exception:
        raise HTTPException(
            status_code=400,
            detail={"error": "Failed to read uploaded file."},
        )

    # Verify it's actually a valid image via Pillow
    try:
        img = Image.open(io.BytesIO(image_bytes))
        img.verify()
    except Exception:
        raise HTTPException(
            status_code=400,
            detail={"error": "Unsupported image format"},
        )

    # ── Preprocess ───────────────────────────────────────────────────────
    try:
        img_array = _preprocess_image(image_bytes)
    except Exception as exc:
        logger.error("Image preprocessing failed: %s", exc)
        raise HTTPException(
            status_code=400,
            detail={"error": "Failed to preprocess image."},
        )

    # ── Inference (run in thread pool to not block event loop) ────────────
    loop = asyncio.get_running_loop()
    try:
        predictions = await loop.run_in_executor(_executor, _run_inference, keras_model, img_array)
    except Exception as exc:
        logger.error("Model inference failed: %s", exc)
        raise HTTPException(
            status_code=500,
            detail={"error": "Model inference failed."},
        )

    # ── Build response ───────────────────────────────────────────────────
    scores = predictions[0]
    top3_indices = np.argsort(scores)[-3:][::-1]

    top_idx = top3_indices[0]
    label = class_names[top_idx]
    confidence = float(scores[top_idx])
    uncertain = False

    if model == "tea":
        # Faithful to the model, `healthy` included; the web app sends every tea result to an officer.
        uncertain = confidence < _tea_threshold
        disease_name_en = None if uncertain else label.replace("_", " ").capitalize()
        disease_name_vi = None if uncertain else _tea_names_vi[label]
    else:
        disease_name_en = label
        disease_name_vi = VIETNAMESE_NAMES.get(disease_name_en, disease_name_en)

    top3 = [
        Top3Item(label=class_names[i], confidence=float(scores[i]))
        for i in top3_indices
    ]

    # AI INVARIANT: response contains ONLY disease name + confidence
    # NO treatment, NO recommendation — ever
    return PredictResponse(
        disease_name_vi=disease_name_vi,
        disease_name_en=disease_name_en,
        confidence=confidence,
        top3=top3,
        model=model,
        uncertain=uncertain,
    )
