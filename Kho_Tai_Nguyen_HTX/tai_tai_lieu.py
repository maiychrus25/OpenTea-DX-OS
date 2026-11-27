#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Tải bản gốc các tài liệu có "tai": true trong nguon.json vào _goc/ (không commit) và ghi lại kết quả."""
import hashlib, json, pathlib, subprocess

root = pathlib.Path(__file__).parent
out = root / "_goc"
(out / "text").mkdir(parents=True, exist_ok=True)
# PDFKit có sẵn trên macOS; máy khác bỏ qua bước trích chữ.
JXA = 'ObjC.import("PDFKit");function run(a){var d=$.PDFDocument.alloc.initWithURL($.NSURL.fileURLWithPath(a[0]));return d.isNil()?"":ObjC.unwrap(d.string)||""}'

report = []
for item in json.loads((root / "nguon.json").read_text(encoding="utf-8")):
    if not item["tai"]:
        continue
    row = {"id": item["id"]}
    try:
        # curl dùng kho chứng chỉ của máy; một số trang .gov.vn thiếu chứng chỉ trung gian đối với Python.
        data = subprocess.run(["curl", "-sSL", "--fail", "-m", "180", "-A", "Mozilla/5.0", item["url"]], capture_output=True, check=True).stdout
        # Có máy chủ chèn vài byte trước phần đầu PDF.
        start = data.find(b"%PDF", 0, 1024)
        data = data[start:] if start > 0 else data
        if not data.startswith(b"%PDF"):
            raise ValueError("không phải PDF")
        pdf = out / f'{item["id"]}.pdf'
        pdf.write_bytes(data)
        row.update(kb=len(data) // 1024, sha256=hashlib.sha256(data).hexdigest())
        try:
            text = subprocess.run(["osascript", "-l", "JavaScript", "-e", JXA, str(pdf)], capture_output=True, text=True, timeout=120).stdout
        except (OSError, subprocess.TimeoutExpired):
            text = ""
        (out / "text" / f'{item["id"]}.txt').write_text(text, encoding="utf-8")
        row["so_chu"] = len(text.split())
    except Exception as error:
        row["loi"] = str(error)[:120]
    report.append(row)
    print(row)
(out / "ket_qua_tai.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
