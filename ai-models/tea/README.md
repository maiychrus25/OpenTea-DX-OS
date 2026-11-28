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
| `train.py` | `download`, `fetch-field`, `prepare`, `train`, `evaluate`; each step is idempotent and writes only to `.work/` (git-ignored). |
| `requirements.txt` | Exact pins; `tensorflow` and `keras` match `apps/disease-api/requirements.txt`. |
| `requirements-test.txt`, `tests/` | pytest on the stage functions with tiny synthetic images. No TensorFlow, no training; CI runs them. |
| `registry.json` | The released model: `{ version, file, sha256, classes, threshold, metrics, trained_on, sources }`. `file` is relative to `ai-models/` (`/models` in disease-api). disease-api refuses a model file whose sha256 differs, and CI checks the match. |
| `../tea_leaf_model.keras` | Exported model. Input: float32 `(n, 224, 224, 3)`, RGB resized to 224x224 with PIL and divided by 255 (the same preprocessing as `apps/disease-api/app/main.py`). MobileNetV2's `[-1, 1]` scaling is a layer inside the model. Output: softmax over the classes below. |
| `../tea_class_names.txt` | One class id per line, in output order. |
| `../tea_class_names_vi.json` | Vietnamese label per class id; every entry has `needs_officer_review: true`. |

## Retrain

```sh
cd ai-models/tea
docker run --rm -v "$PWD:/tea" -w /tea python:3.12.15-slim-bookworm sh -c '
  pip install --no-cache-dir -r requirements.txt &&
  python -I train.py download && python -I train.py prepare &&
  python -I train.py train && python -I train.py evaluate --version tea-2026.12.0' &&
  cp .work/tea_leaf_model.keras .work/tea_class_names.txt .. && cp .work/registry.json registry.json
```

`evaluate` exits 1 with `BLOCKED: ...` and writes no `.work/registry.json` unless every gate passes:

- test accuracy at least 0.80;
- recall at least 0.70 for every target class in the model (`green_leafhopper`, `tea_thrips`, `red_spider_mite`,
  `blister_blight`, `helopeltis`);
- accuracy at least 0.75 on field photos held out of training: whole cooperatives, or whole households when there is only one cooperative (when field photos are in the model);
- a confidence threshold that reaches 0.90 precision on validation.

So the `cp` below never ships a failing model. After a pass, copy the model, the class names and the registry
together and commit them in one change: `cp .work/tea_leaf_model.keras .work/tea_class_names.txt ..` and
`cp .work/registry.json registry.json`. The registry `sha256` is the hash of that model file.

## Field photos (Vietnam)

Public datasets have no photos for four of the five targets. Cooperatives that opt in share officer-confirmed photos
through the platform's `GET /api/platform/disease-dataset` manifest (`platform_admin` only).

```sh
export DXOS_WEB_COOKIE='authjs.session-token=...'   # the platform_admin's browser session cookie; never commit it
python -I train.py fetch-field --manifest https://<host>/api/platform/disease-dataset --cookie-env DXOS_WEB_COOKIE
```

`--manifest` also takes a local JSON file, either one page `{ items }` or a list of pages. A page is `{ items: [{ report_id,
label_code, htx_code, household_key, confirmed_on, sha256, url }], next_cursor }`; `household_key` is the first 16 hex
characters of `sha256(htx_code + ":" + household_id)`, so households can be kept together without being identified.
Given a URL, `fetch-field` follows `next_cursor` (sent back as `?cursor=`, same session cookie) until it is `null` and
merges the pages. It downloads each page's photos before fetching the next page, so the 15 minute URLs are still valid.
Each photo goes to `.work/field/<label_code>/<report_id>.jpg` after its sha256 is checked against the
bytes downloaded; EXIF and GPS are removed by re-saving the pixels only. A second run downloads nothing new (a photo saved
before `household_key` existed only gets its key). The URLs of a saved manifest file are short-lived (15 minutes), so
run `fetch-field` right after saving it.

`prepare` then:

- merges the field photos with the public sets;
- leaves out a class with fewer than 150 field photos (the report lists it as `chưa đủ dữ liệu`; a class that also has
  public photos, like `helopeltis`, stays with those);
- adds a `not_tea_leaf` class, 300 generated images (noise, flat colours, gradients, random blocks), so a random image is
  no longer called `healthy`;
- groups every field photo by household (`field:<htx>:<household_key>`), on top of the near-duplicate grouping, so one
  household never crosses train, val and test;
- holds out whole units as the field test set, about 20% of the field photos: whole cooperatives when there are two or
  more (`field_split: "htx"`, "tách theo HTX"), whole households of that cooperative when there is exactly one
  (`field_split: "household"`, "tách theo hộ, 1 HTX"). The switch is automatic, and the mode is in `evaluate`'s printed
  summary, `.work/metrics.json` and `registry.json` metrics;
- holds a unit out only if every class in it keeps at least two groups for train and val. A class with fewer than 3
  groups (for a class with only field photos: fewer than 3 households) cannot be split, so `prepare` (and `train`,
  `evaluate` after it) exits 1 with `BLOCKED: lớp <class> chỉ có ảnh của N hộ, cần ít nhất 3 hộ ... (class <class> has
  photos from N households, needs at least 3)` and no registry.

`prepare` crops the bounding boxes of the Roboflow (YOLO) dataset, removes exact duplicates, keeps near-duplicates and
Roboflow's flipped copies in the same split group, drops classes with fewer than 100 images, and splits 70/15/15 per
class with seed `20261110`. `evaluate` writes `.work/metrics.json`: test accuracy and per-class precision, recall and
F1, the confidence threshold chosen on the validation split, and a leave-one-source-out check. Pass `--force` to redo a
step whose output already exists.

## Licences

- Code in this folder: MIT.
- JSON files (`datasets.json`, `registry.json`, `../tea_class_names_vi.json`) cannot carry a licence comment; they are MIT,
  `SPDX-FileCopyrightText: 2026 OpenTea Developers`.
- Training data: CC BY 4.0, credited in [`../ATTRIBUTION.md`](../ATTRIBUTION.md). No images are committed. Field photos
  stay in `.work/field/` (git-ignored) and are used only for this model.
- MobileNetV2 ImageNet weights: downloaded by Keras at training time, Apache License 2.0 (see `../ATTRIBUTION.md`).
