#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Xuất kho thành dạng phần mềm đọc được.

xuat/bang.json   : các bảng trong 3_Resources/Du_lieu (cho web)
xuat/doan.jsonl  : ghi chú và toàn văn cắt thành đoạn kèm nguồn (cho chatbot), không commit
Đoạn có tên thuốc, hoạt chất bị loại: theo quy tắc của kho, AI không tự nêu thuốc.
"""
import csv, json, pathlib, re

root = pathlib.Path(__file__).parent
out = root / "xuat"
out.mkdir(exist_ok=True)

# Bảng
tables = {}
for path in sorted((root / "3_Resources/Du_lieu").glob("*.csv")):
    with path.open(encoding="utf-8-sig", newline="") as f:
        tables[path.stem] = list(csv.DictReader(f))
(out / "bang.json").write_text(json.dumps(tables, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")

# Đoạn
DRUG = re.compile(
    r"\d\s?(?:SL|SC|EC|WP|WG|WDG|SG|SP|GR)\b|abamectin|emamectin|azadirachtin|chlorothalonil|propineb|imibenconazole|"
    r"kasugamycin|cypermethrin|imidacloprid|chlorfenapyr|fipronil|acetamiprid|difenoconazole|glyphosate|dinotefuran|"
    r"thiacloprid|quinalphos|pymetrozine|metalaxyl|tebufenozide|pyriproxyfen|tricylazole|etofenprox|buprofezin", re.I)
SKIP = {"thuoc-tham-khao-cho-can-bo.md"}
LIMIT = 300  # số từ tối đa một đoạn

catalog = {x["id"]: x for x in json.loads((root / "nguon.json").read_text(encoding="utf-8"))}

def pieces(text):
    """Cắt theo tiêu đề, rồi theo đoạn văn để mỗi mảnh không quá LIMIT từ."""
    heading, buf = "", []
    def flush():
        words = 0
        part = []
        for line in buf:
            n = len(line.split())
            if part and words + n > LIMIT:
                yield heading, "\n".join(part)
                part, words = [], 0
            part.append(line)
            words += n
        if part:
            yield heading, "\n".join(part)
    for line in text.split("\n"):
        if re.match(r"^#{1,4} |^Điều \d+[a-zđ]?\.", line):
            yield from flush()
            heading, buf = line.lstrip("# ").strip(), []
        elif line.strip() and not line.startswith("```"):
            buf.append(line.rstrip())
    yield from flush()

rows, dropped = [], 0
for path in sorted(root.rglob("*.md")):
    rel = path.relative_to(root).as_posix()
    if rel.startswith(("_goc/", "xuat/")) or path.name in SKIP or path.name == "README.md":
        continue
    text = re.sub(r"<!--.*?-->", "", path.read_text(encoding="utf-8"), flags=re.S)
    full = "Van_ban_goc" in path.parts
    source = catalog.get(path.stem) if full else None
    title = next((l[2:].strip() for l in text.split("\n") if l.startswith("# ")), path.stem)
    links = sorted(set(re.findall(r"https?://[^\s)`\]]+", text)))
    for i, (heading, body) in enumerate(pieces(text)):
        if len(body.split()) < 8:
            continue
        if DRUG.search(heading + " " + body):
            dropped += 1
            continue
        rows.append({
            "id": f"{rel}#{i}", "tep": rel, "tieu_de": title, "muc": heading,
            "loai": "toan_van" if full else "ghi_chu",
            "nhan_dang_chu": "nhận dạng từ bản scan" in text,
            "nguon": [source["url"]] if source else links[:5],
            "noi_dung": body,
        })
with (out / "doan.jsonl").open("w", encoding="utf-8") as f:
    for row in rows:
        f.write(json.dumps(row, ensure_ascii=False) + "\n")
assert not any(DRUG.search(r["noi_dung"]) for r in rows)
print(f"{len(tables)} bảng, {sum(map(len, tables.values()))} dòng; {len(rows)} đoạn ({dropped} đoạn có tên thuốc đã loại)")
