# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers

import io
import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app import main

# Real committed models: the container mounts ai-models at /models; locally fall back to the repo copy.
REAL_MODEL_DIR = Path("/models") if Path("/models").exists() else Path(__file__).resolve().parents[3] / "ai-models"


@pytest.fixture(scope="module")
def client():
    with pytest.MonkeyPatch.context() as patch:
        patch.setattr(main, "MODEL_DIR", REAL_MODEL_DIR)
        patch.delenv("TEA_CONFIDENCE_THRESHOLD", raising=False)
        with TestClient(main.app) as test_client:
            yield test_client


def test_health_reports_general_model_loaded(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "model_loaded": True, "models": {"general": True, "tea": True}}


def test_predict_returns_existing_response_shape(client):
    buffer = io.BytesIO()
    Image.new("RGB", (224, 224), (40, 160, 60)).save(buffer, "PNG")
    response = client.post("/predict", files={"file": ("leaf.png", buffer.getvalue(), "image/png")})
    assert response.status_code == 200
    body = response.json()
    assert {"disease_name_vi", "disease_name_en", "confidence", "top3"} <= set(body)
    assert 0.0 <= body["confidence"] <= 1.0
    assert len(body["top3"]) == 3
    assert all(set(item) == {"label", "confidence"} for item in body["top3"])
    # Golden value of the committed 46-class model on this image (TF 2.21.0).
    assert body["disease_name_en"] == "Tomato___Late_blight"
    assert body["confidence"] == pytest.approx(0.9471, abs=1e-3)
    assert body["model"] == "general"
    assert body["uncertain"] is False


def test_tea_model_matches_its_class_files(client):
    class_ids = [
        line.strip()
        for line in (REAL_MODEL_DIR / "tea_class_names.txt").read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]
    names_vi = json.loads((REAL_MODEL_DIR / "tea_class_names_vi.json").read_text(encoding="utf-8"))
    tea_model, loaded_ids = main._models["tea"]
    assert tea_model.output_shape[-1] == 8 == len(class_ids)
    assert loaded_ids == class_ids
    assert all(names_vi[class_id]["vi"] for class_id in class_ids)
