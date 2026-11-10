# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Train the tea leaf disease model from the CC BY 4.0 datasets in datasets.json.

Usage (inside python:3.12.15-slim-bookworm with requirements.txt installed):
    python train.py download | prepare | train | evaluate

Every step is idempotent and writes only to .work/ next to this file.
"""

import argparse
import hashlib
import io
import json
import sys
import urllib.request
import zipfile
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np
from PIL import Image

HERE = Path(__file__).resolve().parent
WORK = HERE / ".work"
DOWNLOADS = WORK / "downloads"
IMAGES = WORK / "images.npy"
MANIFEST = WORK / "manifest.json"
MODEL = WORK / "tea_leaf_model.keras"
CLASS_NAMES = WORK / "tea_class_names.txt"
METRICS = WORK / "metrics.json"

SEED = 20261110
IMAGE_SIZE = (224, 224)  # same as apps/disease-api/app/main.py
MIN_IMAGES_PER_CLASS = 100
SPLIT = {"train": 0.70, "val": 0.15, "test": 0.15}
BATCH = 32
HEAD_EPOCHS, HEAD_LR = 15, 1e-3
FINE_TUNE_EPOCHS, FINE_TUNE_LR, FINE_TUNE_LAYERS = 10, 5e-5, 30
PATIENCE = 3
THRESHOLD_FLOOR, THRESHOLD_PRECISION = 0.60, 0.90


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


def cmd_prepare(args):
    if MANIFEST.exists() and IMAGES.exists() and not args.force:
        print(f"{MANIFEST} exists; use --force to rebuild")
        return
    config = load_config()
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
    kept_classes = sorted(c for c in config["classes"] if mapped[c] >= MIN_IMAGES_PER_CLASS)
    dropped_classes = {c: mapped[c] for c in config["classes"] if c not in kept_classes}
    keep = [i for i in keep if records[i]["label"] in kept_classes]
    records = [records[i] for i in keep]
    pixels = [pixels[i] for i in keep]

    # Near-duplicates (same 8x8 average hash) and Roboflow copies share a group.
    uf = UnionFind(len(records))
    first = {}
    for i, rec in enumerate(records):
        for key in (rec["group"], average_hash(pixels[i])):
            if key in first:
                uf.union(i, first[key])
            else:
                first[key] = i
    groups = [uf.find(i) for i in range(len(records))]
    split = stratified_group_split([r["label"] for r in records], groups, np.random.default_rng(SEED))
    for rec, g, s in zip(records, groups, split):
        rec["group"], rec["split"] = g, s

    # Self-check: no group crosses splits, and every class is in every split.
    group_splits = defaultdict(set)
    for rec in records:
        group_splits[rec["group"]].add(rec["split"])
    assert all(len(s) == 1 for s in group_splits.values()), "a group crosses splits"
    for s in SPLIT:
        assert {r["label"] for r in records if r["split"] == s} == set(kept_classes), f"class missing from {s}"

    WORK.mkdir(parents=True, exist_ok=True)
    np.save(IMAGES, np.stack(pixels))
    summary = {
        "raw_label_counts": raw_counts,
        "exact_duplicates_removed": duplicates,
        "label_conflicts_removed": conflicts,
        "mapped_counts": dict(sorted(mapped.items())),
        "dropped_classes": dropped_classes,
        "classes": kept_classes,
        "counts": {
            s: dict(sorted(Counter(r["label"] for r in records if r["split"] == s).items())) for s in SPLIT
        },
        "counts_by_source": {
            src["id"]: dict(sorted(Counter(r["label"] for r in records if r["source"] == src["id"]).items()))
            for src in config["sources"]
        },
        "groups": len(group_splits),
        "largest_group": max(Counter(groups).values()),
    }
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


def cmd_evaluate(_args):
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
        "model_bytes": MODEL.stat().st_size,
    }
    METRICS.write_text(json.dumps(metrics, indent=1), encoding="utf-8")
    print(json.dumps({k: v for k, v in metrics.items() if k != "test"} | {"test": {k: v for k, v in test.items() if k != "confusion"}}, indent=1))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    for name, fn in (("download", cmd_download), ("prepare", cmd_prepare), ("train", cmd_train), ("evaluate", cmd_evaluate)):
        p = sub.add_parser(name)
        p.add_argument("--force", action="store_true", help="redo the step even if its output exists")
        p.set_defaults(fn=fn)
    args = parser.parse_args()
    args.fn(args)


if __name__ == "__main__":
    main()
