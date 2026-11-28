#!/usr/bin/env python3
# Copyright (c) 2026 OpenTea Developers
# Licensed under the MIT License. See LICENSE file in the project root for full license information.
"""Fail when docs/database-schema.md and apps/web/prisma/schema.prisma disagree.

Compares table names (@@map) and column names (field name or @map) of every Prisma
model with the table sections of the doc: a heading `### `table`` (or `####`) followed
by a table whose first cell lists the columns. Relation-only fields are not columns.
The raw-SQL `platform` sections of the doc are bullet lists and are not checked.

Usage: check-schema-doc.py [schema.prisma] [database-schema.md]
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SCHEMA = ROOT / "apps/web/prisma/schema.prisma"
DOC = ROOT / "docs/database-schema.md"


def parse_schema(text):
    """Return {table: [column, ...]} for every model in a Prisma schema."""
    blocks = re.findall(r"^model\s+(\w+)\s*\{(.*?)^\}", text, re.M | re.S)
    models = {name for name, _ in blocks}
    tables = {}
    for name, body in blocks:
        table, cols = name, []
        for line in body.splitlines():
            line = line.split("//")[0].strip()
            if not line:
                continue
            m = re.match(r'@@map\("([^"]+)"\)', line)
            if m:
                table = m.group(1)
                continue
            m = re.match(r"(\w+)\s+(\w+)(\[\]|\?)?(\s.*)?$", line)
            if not m or line.startswith("@@"):
                continue
            field, ftype, attrs = m.group(1), m.group(2), m.group(4) or ""
            if ftype in models:  # relation field, not a column
                continue
            col = re.search(r'@map\("([^"]+)"\)', attrs)
            cols.append(col.group(1) if col else field)
        tables[table] = cols
    return tables


def parse_doc(text):
    """Return {table: set(columns)} from the table sections of the doc."""
    tables, current, in_code = {}, None, False
    for line in text.splitlines():
        if line.startswith("```"):
            in_code = not in_code
        if in_code:
            continue
        head = re.match(r"^#{2,4}\s+(.*)$", line)
        if head:
            m = re.match(r"`(\w+)`", head.group(1))
            current = m.group(1) if m else None
            if current:
                tables.setdefault(current, set())
            continue
        if current and line.startswith("|"):
            first = line.split("|")[1].strip()
            if first in ("Column",) or set(first) <= {"-", " "}:
                continue
            for part in first.split(","):
                part = part.strip().strip("`")
                if re.fullmatch(r"[a-z][a-z0-9_]*", part):
                    tables[current].add(part)
    return tables


def compare(schema_tables, doc_tables):
    errors = []
    for table, cols in sorted(schema_tables.items()):
        if table not in doc_tables:
            errors.append(f"table in schema, missing from doc: {table}")
            continue
        for col in cols:
            if col not in doc_tables[table]:
                errors.append(f"column in schema, missing from doc: {table}.{col}")
        for col in sorted(doc_tables[table] - set(cols)):
            errors.append(f"column in doc, absent from schema: {table}.{col}")
    # A heading with no column rows (for example a `platform` note) is not a table section.
    for table, cols in sorted(doc_tables.items()):
        if table not in schema_tables and cols:
            errors.append(f"table in doc, absent from schema: {table}")
    return errors


def main(argv):
    schema = Path(argv[1]) if len(argv) > 1 else SCHEMA
    doc = Path(argv[2]) if len(argv) > 2 else DOC
    errors = compare(parse_schema(schema.read_text(encoding="utf-8")), parse_doc(doc.read_text(encoding="utf-8")))
    for e in errors:
        print(e)
    if errors:
        print(f"check-schema-doc: {len(errors)} mismatch(es) between {schema.name} and {doc.name}")
        return 1
    print("check-schema-doc: schema and doc agree")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
