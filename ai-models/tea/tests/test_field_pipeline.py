# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Stage functions of train.py on tiny synthetic images; no TensorFlow is imported."""

import hashlib
import io
import json
import threading
from argparse import Namespace
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import parse_qs, urlparse

import numpy as np
import pytest
from PIL import Image

import train


def jpeg(colour, with_exif=False, size=(32, 24)):
    buffer = io.BytesIO()
    image = Image.new("RGB", size, colour)
    if with_exif:
        exif = Image.Exif()
        exif[0x010F] = "CameraMaker"
        exif[0x0132] = "2026:11:01 10:00:00"
        image.save(buffer, "JPEG", exif=exif)
    else:
        image.save(buffer, "JPEG")
    return buffer.getvalue()


def make_manifest(tmp_path, specs):
    """specs: (report_id, label, htx, colour). Files are served through file:// URLs."""
    manifest = tmp_path / "manifest.json"
    manifest.write_text(json.dumps({"items": make_items(tmp_path, specs)}), encoding="utf-8")
    return manifest


def make_items(tmp_path, specs):
    items = []
    for report_id, label, htx, colour in specs:
        data = jpeg(colour, with_exif=True)
        path = tmp_path / "remote" / f"{report_id}.jpg"
        path.parent.mkdir(exist_ok=True)
        path.write_bytes(data)
        items.append({"report_id": report_id, "label_code": label, "htx_code": htx, "household_key": f"hh{report_id}", "confirmed_on": "2026-11-20",
                      "sha256": hashlib.sha256(data).hexdigest(), "url": path.as_uri()})
    return items


def test_strip_exif_keeps_pixels_and_drops_metadata():
    original = jpeg((10, 200, 30), with_exif=True)
    assert len(Image.open(io.BytesIO(original)).getexif()) > 0
    cleaned = train.strip_exif(original)
    result = Image.open(io.BytesIO(cleaned))
    assert len(result.getexif()) == 0
    assert result.size == (32, 24)
    assert np.abs(np.asarray(result, dtype=int) - np.asarray(Image.open(io.BytesIO(original)), dtype=int)).max() < 8


def test_fetch_field_downloads_strips_and_is_idempotent(tmp_path):
    manifest = make_manifest(tmp_path, [("r1", "tea_thrips", "HTX1", (0, 120, 0)), ("r2", "healthy", "HTX2", (0, 90, 0))])
    root = tmp_path / "field"
    train.fetch_field(train.load_manifest(str(manifest), None), root=root)
    saved = root / "tea_thrips" / "r1.jpg"
    assert len(Image.open(io.BytesIO(saved.read_bytes())).getexif()) == 0
    assert json.loads((root / "manifest.json").read_text())["r2"]["htx_code"] == "HTX2"
    before = saved.stat().st_mtime_ns
    summary = train.fetch_field(train.load_manifest(str(manifest), None), root=root)
    assert summary == {"downloaded": 0, "skipped": 2}
    assert saved.stat().st_mtime_ns == before


def test_fetch_field_rejects_a_download_whose_sha256_differs(tmp_path):
    manifest = make_manifest(tmp_path, [("r1", "tea_thrips", "HTX1", (0, 120, 0))])
    (tmp_path / "remote" / "r1.jpg").write_bytes(jpeg((1, 2, 3)))  # tampered after the manifest was made
    root = tmp_path / "field"
    with pytest.raises(SystemExit, match="SHA-256 mismatch"):
        train.fetch_field(train.load_manifest(str(manifest), None), root=root)
    assert not (root / "tea_thrips" / "r1.jpg").exists()


@pytest.mark.parametrize("label", ["../evil", "Tea Thrips", ""])
def test_fetch_field_rejects_unsafe_labels(tmp_path, label):
    manifest = make_manifest(tmp_path, [("r1", label, "HTX1", (0, 120, 0))])
    with pytest.raises(SystemExit, match="unsafe"):
        train.fetch_field(train.load_manifest(str(manifest), None), root=tmp_path / "field")


def test_http_manifest_needs_a_session_cookie():
    with pytest.raises(SystemExit, match="DXOS_WEB_COOKIE"):
        train.load_manifest("https://example.invalid/manifest", None)


def fill_field(root, counts, htx_codes=("HTX1", "HTX2", "HTX3"), households=None):
    """households: how many households each cooperative has per class (an int, or {label: int}); default one per photo."""
    meta = {}
    rng = np.random.default_rng(1)
    for label, count in counts.items():
        (root / label).mkdir(parents=True, exist_ok=True)
        for i in range(count):
            report_id = f"{label}-{i}"
            Image.fromarray(rng.integers(0, 255, (16, 16, 3), dtype=np.uint8)).save(root / label / f"{report_id}.jpg")
            htx = htx_codes[i % len(htx_codes)]
            count = households.get(label) if isinstance(households, dict) else households
            household = f"h{i}" if count is None else f"h{(i // len(htx_codes)) % count}"
            meta[report_id] = {"label_code": label, "htx_code": htx, "household_key": f"{htx}-{household}"}
    (root / "manifest.json").write_text(json.dumps(meta), encoding="utf-8")


def test_class_under_the_minimum_is_left_out_with_a_report_line(tmp_path):
    fill_field(tmp_path, {"tea_thrips": 5, "red_spider_mite": 4})
    records, pixels, insufficient = train.collect_field(["tea_thrips", "red_spider_mite"], root=tmp_path, minimum=5)
    assert {r["label"] for r in records} == {"tea_thrips"}
    assert len(pixels) == len(records) == 5
    assert insufficient == {"red_spider_mite": 4}
    assert train.insufficient_lines(insufficient, 5) == ["red_spider_mite: chưa đủ dữ liệu (4/5 ảnh thực địa)"]


def test_not_tea_leaf_has_a_fixed_count_and_is_reproducible():
    first_records, first_pixels = train.make_not_tea_leaf(40)
    second_records, second_pixels = train.make_not_tea_leaf(40)
    assert len(first_records) == len(first_pixels) == 40
    assert {r["label"] for r in first_records} == {"not_tea_leaf"}
    assert all(np.array_equal(a, b) for a, b in zip(first_pixels, second_pixels))
    assert train.NOT_TEA_LEAF_COUNT >= 150


def test_field_test_split_is_grouped_by_htx(tmp_path):
    classes = ["healthy", "tea_thrips", "not_tea_leaf"]
    fill_field(tmp_path, {"tea_thrips": 12, "healthy": 12}, htx_codes=("HTX1", "HTX2", "HTX3", "HTX4"))
    records, pixels, _ = train.collect_field(classes, root=tmp_path, minimum=5)
    synthetic_records, synthetic_pixels = train.make_not_tea_leaf(30)
    records, pixels, summary = train.build_dataset(records + synthetic_records, pixels + synthetic_pixels, classes, minimum=5)
    assert summary["field_test_htx"]
    assert (summary["field_split"], summary["field_split_label"]) == ("htx", "tách theo HTX")
    field = [r for r in records if r["source"] == "field"]
    held_out = set(summary["field_test_htx"])
    assert all(r["split"] == "test" for r in field if r["htx"] in held_out)
    assert not any(r["htx"] in held_out for r in field if r["split"] != "test")
    assert summary["classes"] == sorted(classes)
    assert_no_group_crosses_splits(records)


def assert_no_group_crosses_splits(records):
    for key in ("group", "household_key"):
        seen = {}
        for r in records:
            if key in r:
                seen.setdefault(r[key], set()).add(r["split"])
        assert all(len(v) == 1 for v in seen.values()), key


def build(tmp_path, counts, htx_codes, households, minimum=5):
    classes = ["healthy", "tea_thrips", "not_tea_leaf"]
    fill_field(tmp_path, counts, htx_codes=htx_codes, households=households)
    records, pixels, _ = train.collect_field(classes, root=tmp_path, minimum=minimum)
    synthetic_records, synthetic_pixels = train.make_not_tea_leaf(30)
    return train.build_dataset(records + synthetic_records, pixels + synthetic_pixels, classes, minimum=minimum)


def test_one_cooperative_holds_out_whole_households(tmp_path):
    records, _, summary = build(tmp_path, {"tea_thrips": 24, "healthy": 24}, ("HTX1",), 6)
    assert (summary["field_split"], summary["field_split_label"]) == ("household", "tách theo hộ, 1 HTX")
    assert summary["blocked"] == [] and summary["field_test_htx"] == []
    field = [r for r in records if r["source"] == "field"]
    test_households = {r["household_key"] for r in field if r["split"] == "test"}
    assert test_households and {r["household_key"] for r in field if r["split"] != "test"}.isdisjoint(test_households)
    held = {r["household_key"] for r in field if r.get("field_test")}
    assert held and held <= test_households and summary["field_test_households"] == len(held)
    for split in ("train", "val", "test"):
        assert {r["label"] for r in records if r["split"] == split} == {"healthy", "tea_thrips", "not_tea_leaf"}
    assert_no_group_crosses_splits(records)


def test_two_cooperatives_hold_out_whole_cooperatives_even_with_households(tmp_path):
    records, _, summary = build(tmp_path, {"tea_thrips": 24, "healthy": 24}, ("HTX1", "HTX2"), 6)
    assert summary["field_split"] == "htx" and summary["field_split_label"] == "tách theo HTX"
    held = set(summary["field_test_htx"])
    assert len(held) == 1
    assert {r["htx"] for r in records if r.get("field_test")} == held
    assert_no_group_crosses_splits(records)


def test_a_field_only_class_in_two_households_is_blocked_not_asserted(tmp_path):
    _, _, summary = build(tmp_path, {"tea_thrips": 10, "healthy": 24}, ("HTX1",), {"tea_thrips": 2, "healthy": 6})
    assert summary["blocked"] == [
        "lớp tea_thrips chỉ có ảnh của 2 hộ, cần ít nhất 3 hộ để tách train/val/test "
        "(class tea_thrips has photos from 2 households, needs at least 3)"]


def test_three_households_are_enough_for_a_field_only_class(tmp_path):
    records, _, summary = build(tmp_path, {"tea_thrips": 12, "healthy": 24}, ("HTX1",), {"tea_thrips": 3, "healthy": 6})
    assert summary["blocked"] == []
    for split in ("train", "val", "test"):
        assert "tea_thrips" in {r["label"] for r in records if r["split"] == split}
    assert_no_group_crosses_splits(records)


def test_prepare_and_the_steps_after_it_end_blocked_without_a_registry(tmp_path, monkeypatch):
    work = tmp_path / "work"
    work.mkdir()
    for name, value in {"WORK": work, "MANIFEST": work / "manifest.json", "IMAGES": work / "images.npy",
                        "MODEL": work / "model.keras", "REGISTRY": work / "registry.json"}.items():
        monkeypatch.setattr(train, name, value)
    (work / "registry.json").write_text("stale")
    field_dir = tmp_path / "field"
    fill_field(field_dir, {"tea_thrips": 100}, htx_codes=("HTX1",), households=2)
    monkeypatch.setattr(train, "collect_public", lambda config: ([], [], {}))
    records, pixels, insufficient = train.collect_field(["tea_thrips"], root=field_dir, minimum=5)
    monkeypatch.setattr(train, "collect_field", lambda classes: (records, pixels, insufficient))

    with pytest.raises(SystemExit, match="BLOCKED: lớp tea_thrips chỉ có ảnh của 2 hộ") as blocked:
        train.cmd_prepare(Namespace(force=True))
    assert blocked.value.code != 0
    assert not (work / "registry.json").exists() and not (work / "images.npy").exists()
    (work / "registry.json").write_text("stale")
    with pytest.raises(SystemExit, match="BLOCKED: lớp tea_thrips"):  # train and evaluate read the same marker
        train.load_prepared()
    assert not (work / "registry.json").exists()


def serve_pages(pages, seen):
    """A local manifest server: ?cursor=<key> answers pages[key]; the first request has no cursor."""
    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            seen.append((self.path, self.headers.get("Cookie")))
            cursor = parse_qs(urlparse(self.path).query).get("cursor", [""])[0]
            body = json.dumps(pages[cursor]).encode()
            self.send_response(200)
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, *args):
            pass

    server = HTTPServer(("127.0.0.1", 0), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server


def test_fetch_field_follows_next_cursor_with_the_cookie_and_merges_pages(tmp_path):
    items = make_items(tmp_path, [("r1", "tea_thrips", "HTX1", (0, 120, 0)), ("r2", "tea_thrips", "HTX1", (0, 90, 0)),
                                  ("r3", "healthy", "HTX1", (0, 60, 0))])
    pages = {"": {"items": items[:2], "next_cursor": "c1"}, "c1": {"items": items[2:], "next_cursor": None}}
    seen = []
    server = serve_pages(pages, seen)
    try:
        url = f"http://127.0.0.1:{server.server_port}/api/platform/disease-dataset?htx=HTX1"
        summary = train.fetch_field(train.load_manifest(url, "session=abc"), root=tmp_path / "field")
    finally:
        server.shutdown()
        server.server_close()
    assert summary == {"downloaded": 3, "skipped": 0}
    assert [path for path, _ in seen] == ["/api/platform/disease-dataset?htx=HTX1", "/api/platform/disease-dataset?htx=HTX1&cursor=c1"]
    assert {cookie for _, cookie in seen} == {"session=abc"}
    meta = json.loads((tmp_path / "field" / "manifest.json").read_text())
    assert set(meta) == {"r1", "r2", "r3"} and meta["r3"]["household_key"] == "hhr3"


def test_a_saved_manifest_file_may_be_one_page_or_a_list_of_pages(tmp_path):
    items = make_items(tmp_path, [("r1", "tea_thrips", "HTX1", (0, 120, 0)), ("r2", "healthy", "HTX1", (0, 90, 0))])
    saved = tmp_path / "pages.json"
    saved.write_text(json.dumps([{"items": items[:1], "next_cursor": "c1"}, {"items": items[1:], "next_cursor": None}]))
    assert train.fetch_field(train.load_manifest(str(saved), None), root=tmp_path / "a") == {"downloaded": 2, "skipped": 0}
    saved.write_text(json.dumps({"items": items, "next_cursor": None}))
    assert train.fetch_field(train.load_manifest(str(saved), None), root=tmp_path / "b") == {"downloaded": 2, "skipped": 0}


def test_collect_field_groups_by_cooperative_and_household_key(tmp_path):
    fill_field(tmp_path, {"tea_thrips": 6}, htx_codes=("HTX1",), households=2)
    records, _, _ = train.collect_field(["tea_thrips"], root=tmp_path, minimum=1)
    assert {r["group"] for r in records} == {"field:HTX1:HTX1-h0", "field:HTX1:HTX1-h1"}
    (tmp_path / "tea_thrips" / "r.jpg").write_bytes(jpeg((1, 2, 3)))
    (tmp_path / "manifest.json").write_text(json.dumps({"r": {"label_code": "tea_thrips", "htx_code": "HTX1"}}))
    with pytest.raises(SystemExit, match="household_key"):
        train.collect_field(["tea_thrips"], root=tmp_path, minimum=1)


def test_gates_pass_and_fail():
    per_class = {"tea_thrips": {"recall": 0.75, "support": 20}, "healthy": {"recall": 0.9, "support": 50}}
    assert train.gate_failures(0.85, per_class, 0.8, True, ["tea_thrips", "healthy"]) == []
    assert any("accuracy" in f for f in train.gate_failures(0.79, per_class, 0.8, True, ["healthy"]))
    low_recall = {**per_class, "tea_thrips": {"recall": 0.69, "support": 20}}
    assert any("tea_thrips" in f for f in train.gate_failures(0.9, low_recall, 0.8, True, ["tea_thrips"]))
    assert any("field" in f for f in train.gate_failures(0.9, per_class, 0.74, True, ["tea_thrips"]))
    # A target class that is not in the model is not gated; with no field data the field gate does not apply.
    assert train.gate_failures(0.9, {"healthy": per_class["healthy"]}, None, False, ["healthy"]) == []
    # Field photos were used but no HTX was held out to measure them.
    assert any("field" in f for f in train.gate_failures(0.9, per_class, None, True, ["tea_thrips"]))


def test_registry_is_written_only_on_pass(tmp_path):
    model = tmp_path / "model.keras"
    model.write_bytes(b"model bytes")
    path = tmp_path / "registry.json"
    registry = train.build_registry("tea-test", model, ["healthy"], 0.6, {"test_accuracy": 0.9}, "2026-11-28", ["field"])
    assert registry["sha256"] == hashlib.sha256(b"model bytes").hexdigest()
    assert registry["file"] == "tea_leaf_model.keras"
    assert set(registry) == {"version", "file", "sha256", "classes", "threshold", "metrics", "trained_on", "sources"}
    path.write_text("stale")
    with pytest.raises(SystemExit, match="BLOCKED") as blocked:
        train.conclude(["test accuracy 0.5 < 0.8"], registry, path)
    assert blocked.value.code != 0
    assert not path.exists()
    train.conclude([], registry, path)
    assert json.loads(path.read_text())["version"] == "tea-test"
