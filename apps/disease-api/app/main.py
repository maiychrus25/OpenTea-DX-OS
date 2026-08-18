# Copyright (c) 2026 OpenTea Developers
# Licensed under the MIT License. See LICENSE file in the project root for full license information.

# Disease detection model: leaf_disease_model.keras
# Source: CuongKenn/ICTU-OpenAgri (https://github.com/CuongKenn/ICTU-OpenAgri)
# Original License: MIT — Copyright (c) 2025 CuongKenn and ICTU-OpenAgri Contributors
# See ai-models/ATTRIBUTION.md for full license text

import asyncio
import io
import logging
import os
from contextlib import asynccontextmanager
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import List, Optional

import numpy as np
from fastapi import FastAPI, File, HTTPException, UploadFile
from PIL import Image
from pydantic import BaseModel

logger = logging.getLogger(__name__)

# ── Configuration ────────────────────────────────────────────────────────────

MODEL_DIR = Path(os.getenv("MODEL_DIR", "/models"))
MODEL_FILE = "leaf_disease_model.keras"
CLASS_NAMES_FILE = "class_names.txt"
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
    disease_name_vi: str
    disease_name_en: str
    confidence: float
    top3: List[Top3Item]


class HealthResponse(BaseModel):
    status: str
    model_loaded: bool


class ErrorResponse(BaseModel):
    error: str


# ── Model loading ────────────────────────────────────────────────────────────

_model = None
_class_names: Optional[List[str]] = None
_model_loaded = False


def _load_model_sync():
    """Load TF/Keras model and class names from disk. Called once at startup."""
    global _model, _class_names, _model_loaded

    model_path = MODEL_DIR / MODEL_FILE
    class_names_path = MODEL_DIR / CLASS_NAMES_FILE

    # Load class names
    if not class_names_path.exists():
        logger.error("Class names file not found: %s", class_names_path)
        return
    _class_names = [
        line.strip()
        for line in class_names_path.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]
    logger.info("Loaded %d class names", len(_class_names))

    # Load Keras model
    if not model_path.exists():
        logger.error("Model file not found: %s", model_path)
        return

    try:
        # Lazy import to avoid slow startup if TF not needed for health-only mode
        import tensorflow as tf

        _model = tf.keras.models.load_model(str(model_path))
        _model_loaded = True
        logger.info("Model loaded successfully from %s", model_path)
    except Exception as exc:
        logger.error("Failed to load model: %s", exc)
        _model_loaded = False


# ── Image preprocessing ──────────────────────────────────────────────────────


def _preprocess_image(image_bytes: bytes) -> np.ndarray:
    """Resize and normalize image for model input."""
    img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    img = img.resize(IMAGE_SIZE)
    img_array = np.array(img, dtype=np.float32) / 255.0
    return np.expand_dims(img_array, axis=0)  # batch dimension


def _run_inference(img_array: np.ndarray) -> np.ndarray:
    """Run model prediction (blocking — call in executor)."""
    return _model.predict(img_array, verbose=0)


# ── Application lifecycle ────────────────────────────────────────────────────


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Load model on startup, cleanup on shutdown."""
    logger.info("Starting Disease API — loading model...")
    _load_model_sync()
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
    """Health check — reports whether the TF model is loaded and ready."""
    return {"status": "ok", "model_loaded": _model_loaded}


@app.post(
    "/predict",
    response_model=PredictResponse,
    responses={400: {"model": ErrorResponse}, 503: {"model": ErrorResponse}},
)
async def predict(file: UploadFile = File(...)):
    """
    Classify crop disease from a leaf image.

    Accepts JPEG/PNG. Returns disease name (vi + en) and confidence.
    AI Invariant: response NEVER contains treatment recommendations.
    """
    # ── Validate content type ────────────────────────────────────────────
    if file.content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=400,
            detail={"error": f"Unsupported image format: {file.content_type}. Only JPEG and PNG are accepted."},
        )

    # ── Check model availability ─────────────────────────────────────────
    if not _model_loaded or _model is None or _class_names is None:
        raise HTTPException(
            status_code=503,
            detail={"error": "Model not loaded. Check /health endpoint."},
        )

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
        predictions = await loop.run_in_executor(_executor, _run_inference, img_array)
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
    disease_name_en = _class_names[top_idx]
    disease_name_vi = VIETNAMESE_NAMES.get(disease_name_en, disease_name_en)
    confidence = float(scores[top_idx])

    top3 = [
        Top3Item(label=_class_names[i], confidence=float(scores[i]))
        for i in top3_indices
    ]

    # AI INVARIANT: response contains ONLY disease name + confidence
    # NO treatment, NO recommendation — ever
    return PredictResponse(
        disease_name_vi=disease_name_vi,
        disease_name_en=disease_name_en,
        confidence=confidence,
        top3=top3,
    )
