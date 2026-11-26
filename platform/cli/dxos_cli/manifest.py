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


def _covers(prefix: str, path: str) -> bool:
    return (path.rstrip("/") + "/").startswith(prefix.rstrip("/") + "/")


def _field_errors(where: str, name: str, spec: dict) -> list[str]:
    """Keywords the schema allows but only for some types, and the bounds that contradict each other."""
    kind, out = spec.get("type"), []
    for keyword, types in (("minLength", ("string",)), ("maxLength", ("string",)),
                           ("minimum", ("integer", "number")), ("maximum", ("integer", "number"))):
        if keyword in spec and kind not in types:
            out.append(f"'{where}.{name}': từ khoá '{keyword}' không dùng được với kiểu '{kind}'")
    if kind == "boolean" and "enum" in spec:
        out.append(f"'{where}.{name}': từ khoá 'enum' không dùng được với kiểu 'boolean'")
    for value in spec.get("enum", []):
        ok = (isinstance(value, str) if kind == "string"
              else isinstance(value, int) and not isinstance(value, bool) if kind == "integer"
              else isinstance(value, (int, float)) and not isinstance(value, bool))
        if not ok:
            out.append(f"'{where}.{name}.enum': giá trị {value!r} không đúng kiểu '{kind}'")
    for low, high in (("minimum", "maximum"), ("minLength", "maxLength")):
        if low in spec and high in spec and spec[low] > spec[high]:
            out.append(f"'{where}.{name}': '{low}' lớn hơn '{high}'")
    return out


def _agent_errors(data: dict, routes: dict) -> list[str]:
    agent = data.get("agent")
    actions = agent.get("actions") if isinstance(agent, dict) else None
    if not isinstance(actions, list):
        return []
    out = []
    if data.get("generated") is True and actions:
        out.append("'generated': app do AI sinh ra không được khai 'agent.actions'")
    protected = routes.get("protected") if isinstance(routes.get("protected"), dict) else {}
    public = [p for p in routes.get("public", []) if isinstance(p, str)] if isinstance(routes.get("public"), list) else []
    paths = [("agent.suggestions", agent.get("suggestions"))] + [
        (f"agent.actions.{n}.path", a.get("path")) for n, a in enumerate(actions) if isinstance(a, dict)]
    for where, path in paths:
        if not isinstance(path, str) or not path.startswith("/"):
            continue
        if not any(_covers(p, path) for p in protected if isinstance(p, str)):
            out.append(f"'{where}': đường dẫn '{path}' phải nằm dưới một tiền tố cần đăng nhập trong 'routes.protected'")
        if any(_covers(p, path) for p in public):
            out.append(f"'{where}': đường dẫn '{path}' không được nằm dưới một đường dẫn công khai")
    for key, label in (("name", "tên"), ("path", "đường dẫn")):
        seen = set()
        for action in (a for a in actions if isinstance(a, dict)):
            value = action.get(key)
            if value in seen:
                out.append(f"'agent.actions': {label} '{value}' bị khai hai lần")
            seen.add(value)
    for n, action in enumerate(a for a in actions if isinstance(a, dict)):
        payload = action.get("payload")
        props = payload.get("properties") if isinstance(payload, dict) else None
        if not isinstance(props, dict):
            continue
        where = f"agent.actions.{n}.payload"
        for name in (payload.get("required") if isinstance(payload.get("required"), list) else []):
            if name not in props:
                out.append(f"'{where}.required': '{name}' không có trong 'properties'")
        for name, spec in props.items():
            if isinstance(spec, dict):
                out += _field_errors(f"{where}.properties", name, spec)
    return out


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
        public = {p for p in routes["public"] if isinstance(p, str)}
        for prefix in sorted(public & set(routes["protected"])):
            errors.append(f"'routes': đường dẫn '{prefix}' không được vừa công khai vừa cần đăng nhập")
        # The web proxy calls a path public when it starts with a public prefix, so it would never send a token here.
        for prefix, parent in sorted((p, q) for p in routes["protected"] for q in public if p != q and p.startswith(q)):
            errors.append(f"'routes': đường dẫn cần đăng nhập '{prefix}' nằm dưới đường dẫn công khai '{parent}', "
                          "web sẽ không gửi token nên không vào được")
    feed = data.get("feed")
    if isinstance(feed, str) and feed.startswith("/"):
        protected = routes.get("protected") if isinstance(routes, dict) else None
        covered = feed.rstrip("/") + "/"
        if not isinstance(protected, dict) or not any(
                isinstance(p, str) and covered.startswith(p.rstrip("/") + "/") for p in protected):
            errors.append(f"'feed': đường dẫn '{feed}' phải nằm dưới một tiền tố cần đăng nhập trong 'routes.protected'")
    if isinstance(routes, dict):
        errors += _agent_errors(data, routes)
    requires = data.get("requires")
    core = requires.get("core") if isinstance(requires, dict) else None
    match = _CORE_RE.match(core) if isinstance(core, str) else None
    if match and _version_tuple(core_version) < tuple(int(g) for g in match.groups()):
        errors.append(f"'requires.core': app cần lõi {core} nhưng lõi hiện tại là {core_version}")
    return errors
