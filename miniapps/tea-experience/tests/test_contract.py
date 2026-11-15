# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Contract with the core: every column the refresh asks for must exist in the core's Prisma schema, and the
manager role must be allowed to read it in Hasura. The query is data (core_client.ROOTS), so this test reads it.
A field the core does not have fails here, before any refresh reaches a real Hasura."""
import re
from pathlib import Path

import pytest
import yaml

from tea_experience import core_client

APP_DIR = Path(__file__).resolve().parents[1]
REPO = APP_DIR.parents[1]
SCHEMA = REPO / "apps/web/prisma/schema.prisma"
TABLE_PERMISSIONS = REPO / "platform/hasura/metadata/databases/default/tables"
SCALARS = {"String", "Int", "Float", "Boolean", "DateTime", "Json", "Decimal", "BigInt"}
MODEL = re.compile(r"^model (\w+) \{(.*?)^\}", re.S | re.M)
FIELD = re.compile(r"^\s{2}(\w+)\s+(\w+)(\[\])?\??")


def parse_models() -> dict[str, dict]:
    """Table name (the @@map name) -> {field: 'scalar' | 'relation' | 'enum'} of its model."""
    text = SCHEMA.read_text(encoding="utf-8")
    enums = set(re.findall(r"^enum (\w+) \{", text, re.M))
    models = {}
    for model_name, body in MODEL.findall(text):
        table = re.search(r'@@map\("([^"]+)"\)', body)
        fields = {}
        for line in body.splitlines():
            match = FIELD.match(line)
            if not match or line.lstrip().startswith("//"):
                continue
            name, kind = match.group(1), match.group(2)
            if kind in SCALARS:
                fields[name] = "scalar"
            elif kind in enums:
                fields[name] = "enum"
            else:
                fields[name] = "relation"
        models[table.group(1) if table else model_name] = fields
    return models


MODELS = parse_models()


def test_the_schema_file_is_where_the_contract_says():
    assert SCHEMA.is_file(), "apps/web/prisma/schema.prisma is the source of the column names"
    assert {"htx_profiles", "households", "parcels", "parcel_crop_cycles"} <= set(MODELS)


def test_the_query_asks_only_for_roots_the_core_has():
    assert {table for table, _, _ in core_client.ROOTS} <= set(MODELS)


@pytest.mark.parametrize("table, args, fields", core_client.ROOTS, ids=[r[0] for r in core_client.ROOTS])
def test_every_selected_field_is_a_scalar_of_its_model(table, args, fields):
    model = MODELS[table]
    for field in fields:
        assert field in model, f"{table}.{field} is not a field of the core model"
        assert model[field] in ("scalar", "enum"), f"{table}.{field} is a relation, not a column"


@pytest.mark.parametrize("table, args, fields", core_client.ROOTS, ids=[r[0] for r in core_client.ROOTS])
def test_every_filter_key_is_a_column(table, args, fields):
    where = args.get("where", {})
    for column in where:
        assert MODELS[table].get(column) in ("scalar", "enum"), f"{table} has no column {column} to filter by"


def test_the_query_text_has_no_aggregates_and_no_stale_names():
    text = core_client.QUERY
    assert "_aggregate" not in text  # manager has no allow_aggregations on households
    for stale in ("province", "district", "commune", "primary_crop", "certification", "is_active", "crop "):
        assert stale not in text, stale


def test_the_member_count_relation_is_the_households_root_not_a_relation_field():
    # Members are counted by the app from the ids it receives; the relation field on htx_profiles is not selected.
    assert ("households", {}, ("id",)) in core_client.ROOTS
    assert "households {" in core_client.QUERY and "htx_profiles" in core_client.QUERY


@pytest.mark.parametrize("table", sorted({r[0] for r in core_client.ROOTS}))
def test_the_manager_role_may_read_the_selected_columns(table):
    """The metadata of the core's manager role: columns '*', or a list that includes every field we select."""
    path = TABLE_PERMISSIONS / f"public_{table}.yaml"
    assert path.is_file(), f"no Hasura table metadata for {table}"
    meta = yaml.safe_load(path.read_text(encoding="utf-8"))
    manager = [p for p in meta.get("select_permissions", []) if p.get("role") == "manager"]
    assert manager, f"role manager has no select permission on {table}"
    columns = manager[0]["permission"]["columns"]
    wanted = next(fields for name, _, fields in core_client.ROOTS if name == table)
    if columns != "*":
        assert set(wanted) <= set(columns), f"manager cannot read {set(wanted) - set(columns)} on {table}"
