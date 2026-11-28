# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Pins scripts/check-schema-doc.py: green on the repo, red on a doc that drifts from the schema."""
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
SCRIPT = REPO / "scripts" / "check-schema-doc.py"

SCHEMA = """
model Lot {
  id       String  @id
  lot_code String  @unique
  owner    Owner   @relation(fields: [owner_id], references: [id])
  owner_id String
  @@map("lots")
}
model Owner {
  id String @id
  @@map("owners")
}
"""
DOC_OK = """
### `lots`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | TEXT | PK | |
| lot_code | TEXT | UNIQUE | |
| owner_id | TEXT | FK | |

### `owners`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | TEXT | PK | |
"""


def run(*args):
    return subprocess.run([sys.executable, str(SCRIPT), *map(str, args)], capture_output=True, text=True)


def pair(tmp_path, doc):
    (tmp_path / "schema.prisma").write_text(SCHEMA, encoding="utf-8")
    (tmp_path / "doc.md").write_text(doc, encoding="utf-8")
    return tmp_path / "schema.prisma", tmp_path / "doc.md"


def test_repo_doc_matches_schema():
    result = run()
    assert result.returncode == 0, result.stdout


def test_synthetic_pair_agrees(tmp_path):
    assert run(*pair(tmp_path, DOC_OK)).returncode == 0


def test_missing_table_and_column_fail(tmp_path):
    doc = DOC_OK.replace("| owner_id | TEXT | FK | |\n", "").split("### `owners`")[0]
    result = run(*pair(tmp_path, doc))
    assert result.returncode == 1
    assert "lots.owner_id" in result.stdout and "owners" in result.stdout


def test_stale_column_and_table_fail(tmp_path):
    doc = DOC_OK + "| ghost | TEXT | | |\n\n### `users`\n| Column | Type |\n|---|---|\n| id | UUID |\n"
    result = run(*pair(tmp_path, doc))
    assert result.returncode == 1
    assert "owners.ghost" in result.stdout and "users" in result.stdout
