# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers

import io
import json
import shutil
import warnings

import keras
import numpy as np
import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app import main

GENERAL_CLASSES = ["Tomato___Late_blight", "Tomato___healthy", "Potato___Early_blight"]
GENERAL_PROBS = [0.5, 0.3, 0.2]  # below the tea threshold on purpose: it must not apply to the general model
TEA_CLASSES = ["brown_blight", "healthy", "gray_blight"]
TEA_PROBS = [0.7, 0.2, 0.1]
TEA_NAMES_VI = {
    "brown_blight": {"vi": "Tên thử brown blight", "needs_officer_review": True},
    "healthy": {"vi": "Tên thử lá khoẻ", "needs_officer_review": True},
    "gray_blight": {"vi": "Tên thử chấm xám", "needs_officer_review": True},
}


def _save_stand_in(path, probs):
    """Tiny model whose softmax output is `probs` for any image."""
    model = keras.Sequential(
        [
            keras.Input((224, 224, 3)),
            keras.layers.GlobalAveragePooling2D(),
            keras.layers.Dense(
                len(probs),
                activation="softmax",
                kernel_initializer="zeros",
                bias_initializer=keras.initializers.Constant(np.log(np.array(probs, dtype=np.float32))),
            ),
        ]
    )
    # Keras 3.15 on TF 2.21 warns about numpy 2's __array__ copy keyword while saving; not our code.
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", DeprecationWarning)
        model.save(path)


@pytest.fixture(scope="module")
def model_dir(tmp_path_factory):
    path = tmp_path_factory.mktemp("models")
    _save_stand_in(path / "leaf_disease_model.keras", GENERAL_PROBS)
    (path / "class_names.txt").write_text("\n".join(GENERAL_CLASSES) + "\n", encoding="utf-8")
    _save_stand_in(path / "tea_leaf_model.keras", TEA_PROBS)
    (path / "tea_class_names.txt").write_text("\n".join(TEA_CLASSES) + "\n", encoding="utf-8")
    (path / "tea_class_names_vi.json").write_text(json.dumps(TEA_NAMES_VI, ensure_ascii=False), encoding="utf-8")
    return path


@pytest.fixture
def start_client(model_dir, monkeypatch):
    monkeypatch.setattr(main, "MODEL_DIR", model_dir)
    monkeypatch.delenv("TEA_CONFIDENCE_THRESHOLD", raising=False)

    def start(threshold=None):
        if threshold is not None:
            monkeypatch.setenv("TEA_CONFIDENCE_THRESHOLD", threshold)
        return TestClient(main.app)

    return start


def _post(client, query=""):
    buffer = io.BytesIO()
    Image.new("RGB", (224, 224), (40, 160, 60)).save(buffer, "PNG")
    return client.post(f"/predict{query}", files={"file": ("leaf.png", buffer.getvalue(), "image/png")})


def test_default_model_is_general(start_client):
    with start_client() as client:
        body = _post(client).json()
    assert body["model"] == "general"
    assert body["uncertain"] is False
    assert body["disease_name_en"] == "Tomato___Late_blight"
    assert body["disease_name_vi"] == "Cà chua - Bệnh mốc sương"
    assert body["confidence"] == pytest.approx(0.5, abs=1e-4)


def test_tea_model_selected(start_client):
    with start_client() as client:
        response = _post(client, "?model=tea")
    assert response.status_code == 200
    body = response.json()
    assert body["model"] == "tea"
    assert body["uncertain"] is False
    assert body["disease_name_en"] == "Brown blight"
    assert body["disease_name_vi"] == "Tên thử brown blight"
    assert body["confidence"] == pytest.approx(0.7, abs=1e-4)
    assert [item["label"] for item in body["top3"]] == TEA_CLASSES


def test_unknown_model_is_400(start_client):
    with start_client() as client:
        response = _post(client, "?model=rice")
    assert response.status_code == 400
    assert "rice" in response.json()["detail"]["error"]


def test_below_threshold_is_uncertain(start_client):
    with start_client(threshold="0.8") as client:
        body = _post(client, "?model=tea").json()
    assert body["model"] == "tea"
    assert body["uncertain"] is True
    assert body["disease_name_vi"] is None
    assert body["disease_name_en"] is None
    assert body["confidence"] == pytest.approx(0.7, abs=1e-4)
    assert [item["label"] for item in body["top3"]] == TEA_CLASSES


def test_existing_callers_unchanged(start_client):
    with start_client(threshold="0.9") as client:
        default_body = _post(client).json()
        general_body = _post(client, "?model=general").json()
    assert default_body == general_body
    # The original four fields keep their meaning; the tea threshold never blanks a general result.
    assert {"disease_name_vi", "disease_name_en", "confidence", "top3"} <= set(default_body)
    assert default_body["disease_name_en"] == "Tomato___Late_blight"
    assert default_body["uncertain"] is False
    assert [item["label"] for item in default_body["top3"]] == GENERAL_CLASSES


def test_health_reports_both_models(start_client):
    with start_client() as client:
        body = client.get("/health").json()
    assert body == {"status": "ok", "model_loaded": True, "models": {"general": True, "tea": True}}


def test_general_keeps_serving_without_tea_files(start_client, model_dir, tmp_path, monkeypatch):
    general_only = tmp_path / "models"
    general_only.mkdir()
    for name in ("leaf_disease_model.keras", "class_names.txt"):
        shutil.copy(model_dir / name, general_only / name)
    monkeypatch.setattr(main, "MODEL_DIR", general_only)
    with start_client() as client:
        health = client.get("/health").json()
        tea_status = _post(client, "?model=tea").status_code
        default_status = _post(client).status_code
    assert health["models"] == {"general": True, "tea": False}
    assert tea_status == 503
    assert default_status == 200


def test_tea_disabled_when_a_vietnamese_name_is_missing(start_client, model_dir, tmp_path, monkeypatch, caplog):
    incomplete = tmp_path / "models"
    shutil.copytree(model_dir, incomplete)
    names_vi = {key: value for key, value in TEA_NAMES_VI.items() if key != "brown_blight"}
    (incomplete / "tea_class_names_vi.json").write_text(json.dumps(names_vi, ensure_ascii=False), encoding="utf-8")
    monkeypatch.setattr(main, "MODEL_DIR", incomplete)
    with start_client() as client:
        health = client.get("/health").json()
        tea_status = _post(client, "?model=tea").status_code
    assert health["models"] == {"general": True, "tea": False}
    assert tea_status == 503
    assert "['brown_blight']" in caplog.text


@pytest.mark.parametrize("value", ["abc", "0", "-0.1", "1.5", "nan", ""])
def test_invalid_threshold_is_rejected_at_startup(start_client, value):
    with pytest.raises(ValueError, match="TEA_CONFIDENCE_THRESHOLD"):
        with start_client(threshold=value):
            pass
