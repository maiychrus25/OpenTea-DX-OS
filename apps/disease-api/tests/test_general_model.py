# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers

import io
import os
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from PIL import Image

# Real model: the container mounts ai-models at /models; locally fall back to the repo copy.
os.environ.setdefault(
    "MODEL_DIR",
    "/models" if Path("/models").exists() else str(Path(__file__).resolve().parents[3] / "ai-models"),
)

from app import main  # noqa: E402


@pytest.fixture(scope="module")
def client():
    with TestClient(main.app) as test_client:
        yield test_client


def test_health_reports_general_model_loaded(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "model_loaded": True}


def test_predict_returns_existing_response_shape(client):
    buffer = io.BytesIO()
    Image.new("RGB", (224, 224), (40, 160, 60)).save(buffer, "PNG")
    response = client.post("/predict", files={"file": ("leaf.png", buffer.getvalue(), "image/png")})
    assert response.status_code == 200
    body = response.json()
    assert set(body) == {"disease_name_vi", "disease_name_en", "confidence", "top3"}
    assert 0.0 <= body["confidence"] <= 1.0
    assert len(body["top3"]) == 3
    assert all(set(item) == {"label", "confidence"} for item in body["top3"])
