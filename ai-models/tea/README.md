<!--
SPDX-License-Identifier: MIT
SPDX-FileCopyrightText: 2026 OpenTea Developers
-->

# Tea leaf disease model

Training code for `ai-models/tea_leaf_model.keras`, a MobileNetV2 transfer-learning classifier for tea leaves.
Results, limits and the confidence threshold are in [`MODEL_CARD.md`](MODEL_CARD.md) (Vietnamese).

## Files

| File | Purpose |
| --- | --- |
| `datasets.json` | The three CC BY 4.0 source datasets: DOI, download URL, SHA-256, licence, and the mapping from each source label to a unified class id (`null` = dropped). |
| `train.py` | `download`, `prepare`, `train`, `evaluate`; each step is idempotent and writes only to `.work/` (git-ignored). |
| `requirements.txt` | Exact pins; `tensorflow` and `keras` match `apps/disease-api/requirements.txt`. |
| `../tea_leaf_model.keras` | Exported model. Input: float32 `(n, 224, 224, 3)`, RGB resized to 224x224 with PIL and divided by 255 (the same preprocessing as `apps/disease-api/app/main.py`). MobileNetV2's `[-1, 1]` scaling is a layer inside the model. Output: softmax over the classes below. |
| `../tea_class_names.txt` | One class id per line, in output order. |
| `../tea_class_names_vi.json` | Vietnamese label per class id; every entry has `needs_officer_review: true`. |

## Retrain

```sh
cd ai-models/tea
docker run --rm -v "$PWD:/tea" -w /tea python:3.12.15-slim-bookworm sh -c '
  pip install --no-cache-dir -r requirements.txt &&
  python -I train.py download && python -I train.py prepare &&
  python -I train.py train && python -I train.py evaluate' &&
  cp .work/tea_leaf_model.keras .work/tea_class_names.txt ..
```

`evaluate` exits non-zero with `BLOCKED: ...` when test accuracy is below 0.80 or no confidence threshold reaches 0.90
precision on validation, so the `cp` above never ships a failing model.

`prepare` crops the bounding boxes of the Roboflow (YOLO) dataset, removes exact duplicates, keeps near-duplicates and
Roboflow's flipped copies in the same split group, drops classes with fewer than 100 images, and splits 70/15/15 per
class with seed `20261110`. `evaluate` writes `.work/metrics.json`: test accuracy and per-class precision, recall and
F1, the confidence threshold chosen on the validation split, and a leave-one-source-out check. Pass `--force` to redo a
step whose output already exists.

## Licences

- Code in this folder: MIT.
- JSON files (`datasets.json`, `../tea_class_names_vi.json`) cannot carry a licence comment; they are MIT,
  `SPDX-FileCopyrightText: 2026 OpenTea Developers`.
- Training data: CC BY 4.0, credited in [`../ATTRIBUTION.md`](../ATTRIBUTION.md). No images are committed.
- MobileNetV2 ImageNet weights: downloaded by Keras at training time, Apache License 2.0 (see `../ATTRIBUTION.md`).
