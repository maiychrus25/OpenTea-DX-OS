# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
import pytest

from dxos_cli.manifest import ManifestError
from dxos_cli.__main__ import main
from dxos_cli.store_assets import MAX_BYTES, check_store_files, read_screenshot

PNG = b"\x89PNG\r\n\x1a\n" + b"\0" * 8
JPEG = b"\xff\xd8\xff\xe0" + b"\0" * 8
WEBP = b"RIFF\x00\x00\x00\x00WEBPVP8 " + b"\0" * 8


@pytest.fixture
def app(tmp_path):
    d = tmp_path / "app"
    (d / "shots").mkdir(parents=True)
    return d


@pytest.mark.parametrize("name,data,ctype", [("a.png", PNG, "image/png"), ("a.jpg", JPEG, "image/jpeg"),
                                             ("a.webp", WEBP, "image/webp")])
def test_accepts_png_webp_jpeg(app, name, data, ctype):
    (app / "shots" / name).write_bytes(data)
    assert read_screenshot(app, f"shots/{name}") == (ctype, data)


def test_screenshot_path_outside_the_app_is_refused(app, tmp_path):
    (tmp_path / "x.png").write_bytes(PNG)
    (app / "link.png").symlink_to(tmp_path / "x.png")
    for rel in ("../x.png", "link.png", str(tmp_path / "x.png")):
        with pytest.raises(ManifestError, match="ngoài"):
            read_screenshot(app, rel)


def test_missing_directory_and_oversize_are_refused(app):
    (app / "big.png").write_bytes(PNG + b"\0" * MAX_BYTES)
    for rel in ("nope.png", "shots", "big.png"):
        with pytest.raises(ManifestError, match=rel):
            read_screenshot(app, rel)
    (app / "edge.png").write_bytes(PNG + b"\0" * (MAX_BYTES - len(PNG)))
    assert read_screenshot(app, "edge.png")[0] == "image/png"


def test_a_non_image_file_is_skipped_by_sync_and_reported_by_validate(app):
    (app / "a.png").write_text("not an image")
    manifest = {"store": {"screenshots": [{"file": "a.png", "caption": "x"}]}}
    errors = check_store_files(app, manifest)
    assert len(errors) == 1 and "a.png" in errors[0]
    assert check_store_files(app, {}) == []


def test_validate_command_reports_a_bad_screenshot(root, capsys):
    app = root / "miniapps" / "tea-tour"
    (app / "a.png").write_text("not an image")
    with (app / "app.yaml").open("a") as f:
        f.write("store:\n  screenshots:\n    - { file: a.png, caption: x }\n")
    assert main(["validate", str(app)]) == 1
    assert "a.png" in capsys.readouterr().err
