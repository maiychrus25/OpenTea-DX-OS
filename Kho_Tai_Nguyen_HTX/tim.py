#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Thử tra kho như chatbot sẽ làm: python3 tim.py "câu hỏi" (chạy xuat_du_lieu.py trước)."""
import json, math, pathlib, re, sys
from collections import Counter

rows = [json.loads(l) for l in (pathlib.Path(__file__).parent / "xuat/doan.jsonl").open(encoding="utf-8")]

def terms(text):
    words = re.findall(r"\w+", text.lower())
    return words + [a + " " + b for a, b in zip(words, words[1:])]  # tiếng Việt: giữ cả cụm hai âm tiết

# Tiêu đề và mục nói rõ đoạn viết về gì nên tính nặng hơn.
docs = [Counter(terms(f'{r["tieu_de"]} {r["muc"]} ' * 3 + r["noi_dung"])) for r in rows]
seen = Counter(t for d in docs for t in d)
avg = sum(sum(d.values()) for d in docs) / len(docs)

def score(query, doc):
    size = sum(doc.values())
    return sum(math.log(1 + (len(docs) - seen[t] + 0.5) / (seen[t] + 0.5)) * doc[t] * 2.2 / (doc[t] + 1.2 * (0.25 + 0.75 * size / avg))
               for t in terms(query) if t in doc)

query = " ".join(sys.argv[1:]) or sys.exit('Dùng: python3 tim.py "câu hỏi"')
# Ghi chú đã biên tập được ưu tiên hơn toàn văn thô.
ranked = sorted(range(len(rows)), key=lambda i: -score(query, docs[i]) * (1.4 if rows[i]["loai"] == "ghi_chu" else 1))
for i in ranked[:3]:
    r = rows[i]
    print(f'\n▶ {r["tieu_de"]} — {r["muc"]}\n  ({r["tep"]})\n  ' + r["noi_dung"][:400].replace("\n", "\n  "))
