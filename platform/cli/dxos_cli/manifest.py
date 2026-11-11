# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Manifest app.yaml: nạp, kiểm schema và các luật ngữ nghĩa (spec §4)."""
import json
import os
import re
from pathlib import Path

import yaml
from jsonschema import Draft202012Validator

OSI_LICENSES = frozenset({
    "MIT", "Apache-2.0", "BSD-2-Clause", "BSD-3-Clause", "ISC", "MPL-2.0", "EPL-2.0",
    "LGPL-3.0-only", "LGPL-3.0-or-later", "GPL-2.0-only", "GPL-3.0-only", "GPL-3.0-or-later",
    "AGPL-3.0-only", "AGPL-3.0-or-later",
})

_CORE_RE = re.compile(r"^>=(\d+)\.(\d+)\.(\d+)$")


class ManifestError(Exception):
    pass


def repo_root() -> Path:
    return Path(os.environ.get("DXOS_REPO_ROOT", os.getcwd()))


def schema_name(app_id: str) -> str:
    return "app_" + app_id.replace("-", "_")


def read_core_version(repo_root: Path) -> str:
    return json.loads((repo_root / "apps" / "web" / "package.json").read_text(encoding="utf-8"))["version"]


def load_manifest(app_dir: Path) -> dict:
    path = app_dir / "app.yaml"
    try:
        data = yaml.safe_load(path.read_text(encoding="utf-8"))
    except OSError as exc:
        raise ManifestError(f"Không đọc được {path}: {exc.strerror}") from exc
    except yaml.YAMLError as exc:
        raise ManifestError(f"{path} không phải YAML hợp lệ: {exc}") from exc
    if not isinstance(data, dict):
        raise ManifestError(f"{path} phải là một đối tượng YAML")
    return data


def _schema() -> dict:
    return json.loads((repo_root() / "platform" / "apps" / "manifest.schema.json").read_text(encoding="utf-8"))


def _version_tuple(text: str) -> tuple[int, ...]:
    return tuple(int(part) for part in re.match(r"\d+\.\d+\.\d+", text).group().split("."))


def _field(error) -> str:
    return ".".join(str(p) for p in error.absolute_path)


def _join(*parts: str) -> str:
    return ".".join(p for p in parts if p)


def _schema_message(error) -> str:
    field = _field(error)
    if error.validator == "additionalProperties":
        extra = sorted(k for k in error.instance if k not in error.schema.get("properties", {}))
        return f"Trường '{_join(field, extra[0])}' không được phép có trong manifest"
    if error.validator == "required":
        return f"Thiếu trường bắt buộc '{_join(field, error.message.split(chr(39))[1])}'"
    if error.validator == "propertyNames":
        return f"'{field}': đường dẫn '{error.instance}' không hợp lệ (chỉ gồm [a-z0-9/_-], không có '..' hay '//')"
    if error.validator == "enum":
        return f"'{field}': giá trị '{error.instance}' không hợp lệ, chỉ nhận {', '.join(map(str, error.validator_value))}"
    if error.validator == "pattern":
        if field == "runtime.image":
            return "'runtime.image': image phải ghim digest dạng <ref>@sha256:<64 ký tự hex>"
        return f"'{field}': giá trị '{error.instance}' sai định dạng (cần khớp {error.validator_value})"
    if error.validator == "oneOf":
        return f"'{field}': phải khai đúng một trong 'build' hoặc 'image'"
    if error.validator == "type":
        return f"'{field}': sai kiểu dữ liệu, cần {error.validator_value}"
    return f"'{field}': {error.message}"


def validate_manifest(data: dict, core_version: str, installed_ids: set[str]) -> list[str]:
    errors = [_schema_message(e) for e in sorted(
        Draft202012Validator(_schema()).iter_errors(data), key=lambda e: [str(p) for p in e.absolute_path])]

    app_id = data.get("id")
    if isinstance(app_id, str) and app_id in installed_ids:
        errors.append(f"'id': app '{app_id}' đã được cài")
    lic = data.get("license")
    if isinstance(lic, str) and lic not in OSI_LICENSES:
        errors.append(f"'license': giấy phép '{lic}' không thuộc danh sách OSI được chấp nhận")
    routes = data.get("routes")
    if isinstance(routes, dict) and isinstance(routes.get("public"), list) and isinstance(routes.get("protected"), dict):
        for prefix in sorted({p for p in routes["public"] if isinstance(p, str)} & set(routes["protected"])):
            errors.append(f"'routes': đường dẫn '{prefix}' không được vừa công khai vừa cần đăng nhập")
    requires = data.get("requires")
    core = requires.get("core") if isinstance(requires, dict) else None
    match = _CORE_RE.match(core) if isinstance(core, str) else None
    if match and _version_tuple(core_version) < tuple(int(g) for g in match.groups()):
        errors.append(f"'requires.core': app cần lõi {core} nhưng lõi hiện tại là {core_version}")
    return errors
