# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Train the tea leaf disease model from the CC BY 4.0 datasets in datasets.json.

Usage (inside python:3.12.15-slim-bookworm with requirements.txt installed):
    python train.py download | prepare | train | evaluate
    python train.py fetch-field --manifest <url|file> --cookie-env DXOS_WEB_COOKIE

`fetch-field` pulls consented, officer-confirmed field photos (EXIF removed) into .work/field/<label>/; `prepare`
then merges them with the public datasets. `evaluate` writes .work/registry.json only when every gate passes.

Every step is idempotent and writes only to .work/ next to this file.
"""

import argparse
import hashlib
import io
import json
import os
import re
import shutil
import sys
import urllib.request
import zipfile
from collections import Counter, defaultdict
from datetime import date
from pathlib import Path

import numpy as np
from PIL import Image, ImageOps

HERE = Path(__file__).resolve().parent
WORK = HERE / ".work"
DOWNLOADS = WORK / "downloads"
IMAGES = WORK / "images.npy"
MANIFEST = WORK / "manifest.json"
MODEL = WORK / "tea_leaf_model.keras"
CLASS_NAMES = WORK / "tea_class_names.txt"
METRICS = WORK / "metrics.json"
REGISTRY = WORK / "registry.json"
FIELD = WORK / "field"

SEED = 20261110
IMAGE_SIZE = (224, 224)  # same as apps/disease-api/app/main.py
MIN_IMAGES_PER_CLASS = 100
SPLIT = {"train": 0.70, "val": 0.15, "test": 0.15}
BATCH = 32
HEAD_EPOCHS, HEAD_LR = 15, 1e-3
FINE_TUNE_EPOCHS, FINE_TUNE_LR, FINE_TUNE_LAYERS = 10, 5e-5, 30
PATIENCE = 3
THRESHOLD_FLOOR, THRESHOLD_PRECISION = 0.60, 0.90
ACCURACY_GATE = 0.80  # spec §4.3: below this test accuracy the model must not ship
RECALL_GATE = 0.70  # every target class present in the model
FIELD_ACCURACY_GATE = 0.75  # on field photos of cooperatives held out of training
MIN_FIELD_IMAGES_PER_CLASS = 150  # spec §8.7
FIELD_TEST_SHARE = 0.20  # about this share of field photos is held out, whole cooperatives at a time
NOT_TEA_LEAF_COUNT = 300  # fixed, so the class never swamps or vanishes from the split
NOT_TEA_LEAF = "not_tea_leaf"
TARGET_CLASSES = ["green_leafhopper", "tea_thrips", "red_spider_mite", "blister_blight", "helopeltis"]
SAFE_NAME = re.compile(r"^[A-Za-z0-9_-]{1,64}$")


def load_config():
    return json.loads((HERE / "datasets.json").read_text(encoding="utf-8"))


def archive_path(source):
    return DOWNLOADS / f"{source['id']}.zip"


def sha256_of(path):
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


# ── download ────────────────────────────────────────────────────────────────


def cmd_download(_args):
    DOWNLOADS.mkdir(parents=True, exist_ok=True)
    for source in load_config()["sources"]:
        target = archive_path(source)
        if not target.exists():
            print(f"downloading {source['id']} ({source['size']} bytes) from {source['url']}", flush=True)
            partial = target.with_suffix(".part")
            # Mendeley answers 403 to urllib's default User-Agent.
            request = urllib.request.Request(source["url"], headers={"User-Agent": "opentea-tea-train/1.0"})
            with urllib.request.urlopen(request) as response, open(partial, "wb") as handle:
                for chunk in iter(lambda: response.read(1 << 20), b""):
                    handle.write(chunk)
            partial.rename(target)
        actual = sha256_of(target)
        if actual != source["sha256"]:
            sys.exit(f"SHA-256 mismatch for {target}: expected {source['sha256']}, got {actual}. Delete it and retry.")
        print(f"ok {source['id']} sha256={actual}")


# ── fetch-field ─────────────────────────────────────────────────────────────


def strip_exif(data):
    """Re-save the pixels only (orientation applied first), so no EXIF, GPS or other metadata survives."""
    image = ImageOps.exif_transpose(Image.open(io.BytesIO(data))).convert("RGB")
    clean = Image.frombytes("RGB", image.size, image.tobytes())
    out = io.BytesIO()
    clean.save(out, "JPEG", quality=95)
    return out.getvalue()


def load_manifest(location, cookie):
    """The platform manifest `{ items: [...] }` from an https URL or a local file. The route takes a platform_admin
    session, as `./dxos para seed` does: the cookie is the Auth.js session cookie, sent as is."""
    if location.startswith(("http://", "https://")):
        if not cookie:
            sys.exit("--cookie-env names an unset variable (DXOS_WEB_COOKIE?); the manifest needs a platform_admin session cookie")
        request = urllib.request.Request(location, headers={"Cookie": cookie, "User-Agent": "opentea-tea-train/1.0"})
        with urllib.request.urlopen(request) as response:
            return json.loads(response.read())
    return json.loads(Path(location).read_text(encoding="utf-8"))


def fetch_field(manifest, root=FIELD):
    """Download every manifest photo into <root>/<label>/<report_id>.jpg. Idempotent: a photo already saved with the same sha256 is skipped."""
    root.mkdir(parents=True, exist_ok=True)
    meta_path = root / "manifest.json"
    meta = json.loads(meta_path.read_text(encoding="utf-8")) if meta_path.exists() else {}
    summary = {"downloaded": 0, "skipped": 0}
    try:
        for item in manifest["items"]:
            report_id, label = item["report_id"], item["label_code"]
            if not (SAFE_NAME.match(report_id) and SAFE_NAME.match(label)):
                sys.exit(f"unsafe report_id or label_code in manifest: {report_id!r}, {label!r}")
            target = root / label / f"{report_id}.jpg"
            known = meta.get(report_id)
            if known and known["sha256"] == item["sha256"] and known["label_code"] == label and target.exists():
                summary["skipped"] += 1
                continue
            # The URL is presigned: it takes no bearer token.
            request = urllib.request.Request(item["url"], headers={"User-Agent": "opentea-tea-train/1.0"})
            with urllib.request.urlopen(request) as response:
                data = response.read()
            if hashlib.sha256(data).hexdigest() != item["sha256"]:
                sys.exit(f"SHA-256 mismatch for report {report_id}: the download is not the photo the manifest names")
            if known and known["label_code"] != label:  # relabelled by an officer
                (root / known["label_code"] / f"{report_id}.jpg").unlink(missing_ok=True)
            target.parent.mkdir(exist_ok=True)
            target.write_bytes(strip_exif(data))
            meta[report_id] = {"label_code": label, "htx_code": item["htx_code"], "confirmed_on": item["confirmed_on"],
                               "sha256": item["sha256"]}
            summary["downloaded"] += 1
    finally:
        meta_path.write_text(json.dumps(meta, indent=1, sort_keys=True), encoding="utf-8")
    return summary


def cmd_fetch_field(args):
    print(fetch_field(load_manifest(args.manifest, os.environ.get(args.cookie_env))))


# ── prepare ─────────────────────────────────────────────────────────────────


def to_model_input(img):
    """Match the serving preprocessing: RGB, PIL resize to 224x224 (uint8 here, /255 at load)."""
    return np.asarray(img.convert("RGB").resize(IMAGE_SIZE), dtype=np.uint8)


def iter_folder_source(source, archive):
    root = source["root"]
    for name in archive.namelist():
        if not name.startswith(root) or not name.lower().endswith((".jpg", ".jpeg", ".png")):
            continue
        label = name[len(root):].split("/")[0]
        yield label, name, name, lambda n=name: to_model_input(Image.open(io.BytesIO(archive.read(n))))


def iter_yolo_source(source, archive):
    names = set(archive.namelist())
    for name in sorted(names):
        if "/images/" not in name or not name.lower().endswith(".jpg"):
            continue
        label_file = name.replace("/images/", "/labels/").rsplit(".", 1)[0] + ".txt"
        rows = [r.split() for r in archive.read(label_file).decode().splitlines() if r.strip()] if label_file in names else []
        # Roboflow exports flipped copies as <base>.rf.<hash>; group them so copies never cross splits.
        group = name.split("/")[-1].split(".rf.")[0]
        for index, row in enumerate(rows):
            cls, cx, cy, w, h = int(row[0]), *map(float, row[1:5])

            def crop(n=name, cx=cx, cy=cy, w=w, h=h):
                img = Image.open(io.BytesIO(archive.read(n))).convert("RGB")
                width, height = img.size
                box = (max(0, round((cx - w / 2) * width)), max(0, round((cy - h / 2) * height)),
                       min(width, round((cx + w / 2) * width)), min(height, round((cy + h / 2) * height)))
                return to_model_input(img.crop(box))

            yield source["yolo_names"][cls], f"{name}#{index}", group, crop


def average_hash(pixels):
    small = np.asarray(Image.fromarray(pixels).convert("L").resize((8, 8)), dtype=np.float32)
    return (small > small.mean()).tobytes()


class UnionFind:
    def __init__(self, n):
        self.parent = list(range(n))

    def find(self, i):
        while self.parent[i] != i:
            self.parent[i] = self.parent[self.parent[i]]
            i = self.parent[i]
        return i

    def union(self, a, b):
        self.parent[self.find(a)] = self.find(b)


def stratified_group_split(labels, groups, rng):
    """Assign whole groups to train/val/test so each class gets about 70/15/15 of its images."""
    members = defaultdict(list)
    for i, g in enumerate(groups):
        members[g].append(i)
    by_class = defaultdict(list)
    for g, idx in members.items():
        by_class[Counter(labels[i] for i in idx).most_common(1)[0][0]].append(g)
    split = [None] * len(labels)
    for cls in sorted(by_class):
        class_groups = sorted(by_class[cls])
        rng.shuffle(class_groups)
        total = sum(len(members[g]) for g in class_groups)
        filled = {"test": 0, "val": 0}
        for g in class_groups:
            name = next((s for s in ("test", "val") if filled[s] < SPLIT[s] * total), "train")
            if name != "train":
                filled[name] += len(members[g])
            for i in members[g]:
                split[i] = name
    return split


def insufficient_lines(insufficient, minimum):
    return [f"{cls}: chưa đủ dữ liệu ({n}/{minimum} ảnh thực địa)" for cls, n in sorted(insufficient.items())]


def collect_field(classes, root=FIELD, minimum=MIN_FIELD_IMAGES_PER_CLASS):
    """Field records and pixels. A class with fewer than `minimum` photos is left out and returned as {class: photos}."""
    meta_path = root / "manifest.json"
    meta = json.loads(meta_path.read_text(encoding="utf-8")) if meta_path.exists() else {}
    by_class = defaultdict(list)
    for report_id, entry in sorted(meta.items()):
        path = root / entry["label_code"] / f"{report_id}.jpg"
        if entry["label_code"] in classes and path.exists():
            by_class[entry["label_code"]].append((report_id, entry["htx_code"], path))
    insufficient = {c: len(by_class[c]) for c in classes if c != NOT_TEA_LEAF and len(by_class[c]) < minimum
                    and (c in TARGET_CLASSES or by_class[c])}
    records, pixels = [], []
    for cls in sorted(by_class):
        if cls in insufficient:
            continue
        for report_id, htx, path in by_class[cls]:
            records.append({"source": "field", "label": cls, "origin": report_id, "group": f"field:{report_id}", "htx": htx})
            with Image.open(path) as photo:
                pixels.append(to_model_input(photo))
    return records, pixels, insufficient


def make_not_tea_leaf(count=NOT_TEA_LEAF_COUNT):
    """Noise, flat colours, gradients and random blocks: images that are not a tea leaf. Same seed, same images."""
    rng = np.random.default_rng(SEED)
    height, width = IMAGE_SIZE
    records, pixels = [], []
    for i in range(count):
        kind = i % 4
        if kind == 0:
            image = rng.integers(0, 256, (height, width, 3), dtype=np.uint8)
        elif kind == 1:
            image = np.clip(rng.normal(rng.integers(40, 216), 40, (height, width, 3)), 0, 255).astype(np.uint8)
        elif kind == 2:
            ramp = np.linspace(rng.integers(0, 256, 3), rng.integers(0, 256, 3), width)
            image = np.broadcast_to(ramp, (height, width, 3)).astype(np.uint8)
        else:
            image = np.full((height, width, 3), rng.integers(0, 256, 3), dtype=np.uint8)
            for _ in range(int(rng.integers(3, 9))):
                y, x = int(rng.integers(0, height - 20)), int(rng.integers(0, width - 20))
                image[y:y + int(rng.integers(10, 80)), x:x + int(rng.integers(10, 80))] = rng.integers(0, 256, 3)
        records.append({"source": "synthetic", "label": NOT_TEA_LEAF, "origin": f"synthetic#{i}", "group": f"synthetic:{i}"})
        pixels.append(image)
    return records, pixels


def collect_public(config):
    raw_counts, records, pixels = {}, [], []
    for source in config["sources"]:
        archive = zipfile.ZipFile(archive_path(source))
        items = iter_yolo_source(source, archive) if source["format"] == "yolo" else iter_folder_source(source, archive)
        counts = Counter()
        for label, origin, group, load in items:
            counts[label] += 1
            if label not in source["labels"]:
                sys.exit(f"{source['id']}: unmapped label {label!r}; add it to datasets.json")
            cls = source["labels"][label]
            if cls is None:
                continue
            records.append({"source": source["id"], "label": cls, "origin": origin, "group": f"{source['id']}:{group}"})
            pixels.append(load())
        raw_counts[source["id"]] = dict(sorted(counts.items()))
        print(f"{source['id']}: {dict(counts)}", flush=True)
    return records, pixels, raw_counts


def pick_field_test_htx(records, rng):
    """Whole cooperatives held out as the field test set, until about FIELD_TEST_SHARE of field photos. One cooperative: none."""
    per_htx = Counter(r["htx"] for r in records if r["source"] == "field")
    if len(per_htx) < 2:
        return []
    order = sorted(per_htx)
    rng.shuffle(order)
    held, total = [], sum(per_htx.values())
    for htx in order[:-1]:  # at least one cooperative stays in training
        if sum(per_htx[h] for h in held) >= FIELD_TEST_SHARE * total:
            break
        held.append(htx)
    return sorted(held)


def build_dataset(records, pixels, class_ids, minimum=MIN_IMAGES_PER_CLASS):
    """Dedupe, drop thin classes, group near-duplicates and split. Returns (records, pixels, summary)."""
    # Drop exact duplicates (same pixels after resize); drop every copy when the copies disagree on the label.
    by_digest = defaultdict(list)
    for i, p in enumerate(pixels):
        by_digest[hashlib.sha1(p.tobytes()).hexdigest()].append(i)
    keep, duplicates, conflicts = [], 0, 0
    for idx in by_digest.values():
        if len({records[i]["label"] for i in idx}) > 1:
            conflicts += len(idx)
            continue
        duplicates += len(idx) - 1
        keep.append(idx[0])
    keep.sort()

    mapped = Counter(records[i]["label"] for i in keep)
    kept_classes = sorted(c for c in class_ids if mapped[c] >= minimum)
    dropped_classes = {c: mapped[c] for c in class_ids if c not in kept_classes}
    keep = [i for i in keep if records[i]["label"] in kept_classes]
    records = [records[i] for i in keep]
    pixels = [pixels[i] for i in keep]

    # Near-duplicates (same 8x8 average hash) and Roboflow copies share a group; synthetic images are unrelated.
    uf = UnionFind(len(records))
    first = {}
    for i, rec in enumerate(records):
        keys = (rec["group"],) if rec["source"] == "synthetic" else (rec["group"], average_hash(pixels[i]))
        for key in keys:
            if key in first:
                uf.union(i, first[key])
            else:
                first[key] = i
    groups = [uf.find(i) for i in range(len(records))]
    rng = np.random.default_rng(SEED)
    held_out = pick_field_test_htx(records, rng)
    held = [rec["source"] == "field" and rec["htx"] in held_out for rec in records]
    rest = [i for i in range(len(records)) if not held[i]]
    rest_split = stratified_group_split([records[i]["label"] for i in rest], [groups[i] for i in rest], rng)
    split = ["test"] * len(records)
    for i, s in zip(rest, rest_split):
        split[i] = s
    for i, rec in enumerate(records):
        rec["group"] = f"htx:{rec['htx']}" if held[i] else groups[i]
        rec["split"] = split[i]

    # Self-check: no group crosses splits, and every class is in every split.
    group_splits = defaultdict(set)
    for rec in records:
        group_splits[rec["group"]].add(rec["split"])
    assert all(len(s) == 1 for s in group_splits.values()), "a group crosses splits"
    for s in SPLIT:
        assert {r["label"] for r in records if r["split"] == s} == set(kept_classes), f"class missing from {s}"

    summary = {
        "exact_duplicates_removed": duplicates,
        "label_conflicts_removed": conflicts,
        "mapped_counts": dict(sorted(mapped.items())),
        "dropped_classes": dropped_classes,
        "classes": kept_classes,
        "counts": {
            s: dict(sorted(Counter(r["label"] for r in records if r["split"] == s).items())) for s in SPLIT
        },
        "counts_by_source": {
            src: dict(sorted(Counter(r["label"] for r in records if r["source"] == src).items()))
            for src in sorted({r["source"] for r in records})
        },
        "field_test_htx": held_out,
        "groups": len(group_splits),
        "largest_group": max(Counter(groups).values()),
    }
    return records, pixels, summary


def cmd_prepare(args):
    if MANIFEST.exists() and IMAGES.exists() and not args.force:
        print(f"{MANIFEST} exists; use --force to rebuild")
        return
    # A new split invalidates every model trained on the old one.
    MODEL.unlink(missing_ok=True)
    shutil.rmtree(WORK / "loso", ignore_errors=True)
    config = load_config()
    records, pixels, raw_counts = collect_public(config)
    field_records, field_pixels, insufficient = collect_field(config["classes"])
    synthetic_records, synthetic_pixels = make_not_tea_leaf()
    records, pixels, summary = build_dataset(records + field_records + synthetic_records,
                                             pixels + field_pixels + synthetic_pixels, config["classes"])
    summary = {"raw_label_counts": raw_counts, **summary, "field_insufficient": insufficient,
               "field_insufficient_lines": insufficient_lines(insufficient, MIN_FIELD_IMAGES_PER_CLASS)}
    WORK.mkdir(parents=True, exist_ok=True)
    np.save(IMAGES, np.stack(pixels))
    MANIFEST.write_text(json.dumps({**summary, "records": records}, indent=1, ensure_ascii=False), encoding="utf-8")
    print(json.dumps(summary, indent=1, ensure_ascii=False))


# ── train ───────────────────────────────────────────────────────────────────


def load_prepared():
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    classes = manifest["classes"]
    labels = np.array([classes.index(r["label"]) for r in manifest["records"]])
    return manifest, classes, np.load(IMAGES, mmap_mode="r"), labels


def build_model(num_classes):
    import keras

    inputs = keras.Input((*IMAGE_SIZE, 3), dtype="float32", name="image")
    # The serving code feeds RGB/255 in [0, 1]; MobileNetV2 expects [-1, 1].
    x = keras.layers.Rescaling(2.0, offset=-1.0, name="mobilenet_v2_preprocess")(inputs)
    base = keras.applications.MobileNetV2(input_shape=(*IMAGE_SIZE, 3), include_top=False, weights="imagenet", pooling="avg")
    base.trainable = False
    x = base(x, training=False)  # Keras 3 overrides this when the caller passes training=True; see fit()
    x = keras.layers.Dropout(0.2)(x)
    outputs = keras.layers.Dense(num_classes, activation="softmax", name="predictions")(x)
    return keras.Model(inputs, outputs, name="tea_leaf_model"), base


def make_batches(images, labels, idx, shuffle):
    """Batches read from the memory-mapped images, so the training set is never copied whole into RAM."""
    import keras

    class Batches(keras.utils.PyDataset):
        def __init__(self):
            super().__init__()
            self.idx = np.sort(idx)
            self.rng = np.random.default_rng(SEED)
            self.on_epoch_end()

        def __len__(self):
            return -(-len(self.idx) // BATCH)

        def __getitem__(self, i):
            batch = np.sort(self.idx[i * BATCH:(i + 1) * BATCH])
            return np.asarray(images[batch], dtype=np.float32) / 255.0, labels[batch]

        def on_epoch_end(self):
            if shuffle:
                self.rng.shuffle(self.idx)

    return Batches()


def fit(images, labels, train_idx, val_idx, num_classes):
    """Frozen MobileNetV2 head training, then a short fine-tune of the top layers. Returns (model, history)."""
    import keras

    keras.utils.set_random_seed(SEED)
    model, base = build_model(num_classes)
    # Augmentation lives in a training-only wrapper, so the exported model holds just preprocessing + network.
    inputs = keras.Input((*IMAGE_SIZE, 3), dtype="float32")
    x = keras.layers.RandomFlip("horizontal_and_vertical", seed=SEED)(inputs)
    x = keras.layers.RandomRotation(0.1, seed=SEED)(x)
    x = keras.layers.RandomZoom(0.1, seed=SEED)(x)
    trainer = keras.Model(inputs, model(x))
    train_data = make_batches(images, labels, train_idx, True)
    val_data = make_batches(images, labels, val_idx, False)
    counts = np.bincount(labels[train_idx], minlength=num_classes)
    class_weight = {c: len(train_idx) / (num_classes * n) for c, n in enumerate(counts) if n}
    history = {}

    def run(phase, lr, epochs):
        trainer.compile(optimizer=keras.optimizers.Adam(lr), loss="sparse_categorical_crossentropy", metrics=["accuracy"])
        stop = keras.callbacks.EarlyStopping(monitor="val_loss", patience=PATIENCE, restore_best_weights=True)
        h = trainer.fit(train_data, validation_data=val_data, epochs=epochs, class_weight=class_weight,
                        callbacks=[stop], verbose=2)
        history[phase] = {k: [float(v) for v in vals] for k, vals in h.history.items()}

    run("head", HEAD_LR, HEAD_EPOCHS)
    base.trainable = True
    for i, layer in enumerate(base.layers):
        # BatchNorm stays frozen: a frozen BN layer always runs in inference mode with the ImageNet statistics.
        layer.trainable = i >= len(base.layers) - FINE_TUNE_LAYERS and not isinstance(layer, keras.layers.BatchNormalization)
    run("fine_tune", FINE_TUNE_LR, FINE_TUNE_EPOCHS)
    return model, history  # never compiled itself, so the saved file carries no optimizer state


def cmd_train(args):
    if MODEL.exists() and not args.force:
        print(f"{MODEL} exists; use --force to retrain")
        return
    manifest, classes, images, labels = load_prepared()
    split = np.array([r["split"] for r in manifest["records"]])
    model, history = fit(images, labels, np.where(split == "train")[0], np.where(split == "val")[0], len(classes))
    model.save(MODEL)
    CLASS_NAMES.write_text("\n".join(classes) + "\n", encoding="utf-8")
    (WORK / "history.json").write_text(json.dumps(history, indent=1), encoding="utf-8")
    print(f"saved {MODEL} ({MODEL.stat().st_size} bytes)")


# ── evaluate ────────────────────────────────────────────────────────────────


def predict(model, images, idx):
    probs = [model.predict(np.asarray(images[idx[i:i + 64]], dtype=np.float32) / 255.0, verbose=0)
             for i in range(0, len(idx), 64)]
    return np.concatenate(probs)


def classification_report(y_true, y_pred, classes):
    confusion = np.zeros((len(classes), len(classes)), dtype=int)
    np.add.at(confusion, (y_true, y_pred), 1)
    per_class = {}
    for c, name in enumerate(classes):
        tp, predicted, actual = confusion[c, c], confusion[:, c].sum(), confusion[c].sum()
        precision = tp / predicted if predicted else 0.0
        recall = tp / actual if actual else 0.0
        f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
        per_class[name] = {"precision": round(float(precision), 4), "recall": round(float(recall), 4),
                           "f1": round(float(f1), 4), "support": int(actual)}
    return {"accuracy": round(float((y_true == y_pred).mean()), 4), "per_class": per_class,
            "confusion": confusion.tolist()}


def accepted_precision(probs, y_true, threshold):
    accepted = probs.max(axis=1) >= threshold
    correct = (probs.argmax(axis=1) == y_true) & accepted
    return (float(correct.sum() / accepted.sum()) if accepted.any() else 0.0), float(accepted.mean())


def pick_threshold(probs, y_true):
    """Lowest threshold >= the floor whose accepted predictions reach the target precision."""
    for t in np.round(np.arange(THRESHOLD_FLOOR, 1.0, 0.01), 2):
        precision, coverage = accepted_precision(probs, y_true, t)
        if precision >= THRESHOLD_PRECISION:
            return float(t), precision, coverage
    return None, None, None


def gate_failures(accuracy, per_class, field_accuracy, has_field_data, classes):
    """Why the model must not ship; empty when every gate passes. `per_class` maps class -> {recall, support}."""
    failures = []
    if accuracy < ACCURACY_GATE:
        failures.append(f"test accuracy {accuracy} < {ACCURACY_GATE}")
    for cls in TARGET_CLASSES:
        stats = per_class.get(cls)
        if cls in classes and stats and stats["support"] and stats["recall"] < RECALL_GATE:
            failures.append(f"recall of {cls} {stats['recall']} < {RECALL_GATE}")
    if has_field_data:
        if field_accuracy is None:
            failures.append("field photos are in the model but no cooperative was held out to measure them")
        elif field_accuracy < FIELD_ACCURACY_GATE:
            failures.append(f"field accuracy {field_accuracy} < {FIELD_ACCURACY_GATE}")
    return failures


def build_registry(version, model_path, classes, threshold, metrics, trained_on, sources):
    return {"version": version, "file": "tea_leaf_model.keras", "sha256": sha256_of(model_path), "classes": classes,
            "threshold": threshold, "metrics": metrics, "trained_on": trained_on, "sources": sources}


def conclude(failures, registry, path):
    """registry.json exists only for a model that passed every gate; otherwise print BLOCKED and exit 1."""
    path.unlink(missing_ok=True)
    if failures:
        sys.exit("BLOCKED: " + "; ".join(failures) + "; do not ship this model")
    path.write_text(json.dumps(registry, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"wrote {path}; copy it with the model to ai-models/tea/ (see README)")


def cmd_evaluate(args):
    import keras

    manifest, classes, images, labels = load_prepared()
    records = manifest["records"]
    split = np.array([r["split"] for r in records])
    source = np.array([r["source"] for r in records])
    model = keras.saving.load_model(MODEL)

    test_idx, val_idx = np.where(split == "test")[0], np.where(split == "val")[0]
    test_probs, val_probs = predict(model, images, test_idx), predict(model, images, val_idx)
    test = classification_report(labels[test_idx], test_probs.argmax(axis=1), classes)
    threshold, val_precision, val_coverage = pick_threshold(val_probs, labels[val_idx])
    test_at = accepted_precision(test_probs, labels[test_idx], threshold) if threshold else (None, None)
    print(f"test accuracy {test['accuracy']}; threshold {threshold}", flush=True)

    # Field accuracy: photos of cooperatives that never appear in training or validation.
    htx = np.array([r.get("htx", "") for r in records])
    field_idx = np.where((source == "field") & np.isin(htx, manifest.get("field_test_htx", [])))[0]
    has_field_data = bool((source == "field").any())
    field_accuracy = None
    if len(field_idx):
        field_accuracy = round(float((predict(model, images, field_idx).argmax(axis=1) == labels[field_idx]).mean()), 4)
    insufficient_lines_vi = manifest.get("field_insufficient_lines", [])
    for line in insufficient_lines_vi:
        print(line)

    # Leave one source out: train on the other sources' train/val splits, test on every image of the held-out one.
    loso = {}
    (WORK / "loso").mkdir(exist_ok=True)
    for held_out in sorted(set(source)):
        path = WORK / "loso" / f"without_{held_out}.keras"
        others = source != held_out
        if path.exists():
            loso_model = keras.saving.load_model(path)
        else:
            loso_model, _ = fit(images, labels, np.where(others & (split == "train"))[0],
                                np.where(others & (split == "val"))[0], len(classes))
            loso_model.save(path)
        idx = np.where(~others)[0]
        y_pred = predict(loso_model, images, idx).argmax(axis=1)
        seen = np.isin(labels[idx], np.unique(labels[others]))
        report = classification_report(labels[idx], y_pred, classes)
        loso[held_out] = {
            "images": int(len(idx)),
            "accuracy": report["accuracy"],
            "accuracy_on_classes_seen_in_training": round(float((labels[idx][seen] == y_pred[seen]).mean()), 4),
            "classes_not_in_training": sorted({classes[c] for c in labels[idx][~seen]}),
            "recall": {k: v["recall"] for k, v in report["per_class"].items() if v["support"]},
        }
        print(f"loso {held_out}: {loso[held_out]['accuracy']}", flush=True)

    metrics = {
        "classes": classes,
        "counts": manifest["counts"],
        "test": test,
        "threshold": {"value": threshold, "rule": f"lowest t >= {THRESHOLD_FLOOR} with precision >= {THRESHOLD_PRECISION} on val",
                      "val_precision": val_precision, "val_coverage": val_coverage,
                      "test_precision": test_at[0], "test_coverage": test_at[1]},
        "leave_one_source_out": loso,
        "field": {"accuracy": field_accuracy, "images": int(len(field_idx)), "test_htx": manifest.get("field_test_htx", []),
                  "insufficient": insufficient_lines_vi},
        "model_bytes": MODEL.stat().st_size,
    }
    METRICS.write_text(json.dumps(metrics, indent=1), encoding="utf-8")
    print(json.dumps({k: v for k, v in metrics.items() if k != "test"} | {"test": {k: v for k, v in test.items() if k != "confusion"}}, indent=1))
    failures = gate_failures(test["accuracy"], test["per_class"], field_accuracy, has_field_data, classes)
    if threshold is None:
        failures.append(f"no threshold >= {THRESHOLD_FLOOR} reaches {THRESHOLD_PRECISION} precision on val")
    registry_metrics = {"test_accuracy": test["accuracy"], "test_images": int(len(test_idx)),
                        "per_class": test["per_class"], "field_accuracy": field_accuracy}
    registry = build_registry(args.version or f"tea-{date.today():%Y.%m.%d}", MODEL, classes, threshold, registry_metrics,
                              f"{date.today():%Y-%m-%d}", sorted(set(source)))
    conclude(failures, registry, REGISTRY)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    for name, fn in (("download", cmd_download), ("prepare", cmd_prepare), ("train", cmd_train), ("evaluate", cmd_evaluate)):
        p = sub.add_parser(name)
        p.add_argument("--force", action="store_true", help="redo the step even if its output exists")
        if name == "evaluate":
            p.add_argument("--version", help="registry version, default tea-<today as YYYY.MM.DD>")
        p.set_defaults(fn=fn)
    p = sub.add_parser("fetch-field", help="download consented field photos into .work/field/")
    p.add_argument("--manifest", required=True, help="platform manifest URL (needs the session cookie) or a local JSON file")
    p.add_argument("--cookie-env", default="DXOS_WEB_COOKIE", help="environment variable that holds the platform_admin session cookie")
    p.set_defaults(fn=cmd_fetch_field)
    args = parser.parse_args()
    args.fn(args)


if __name__ == "__main__":
    main()
