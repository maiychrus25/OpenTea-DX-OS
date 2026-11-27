# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""M13: the book.create agent action (app.yaml agent block): a draft book from a template, made as the approving manager."""
from pathlib import Path

import pytest
import yaml
from conftest import acting, add_book, bearer
from fastapi.testclient import TestClient

from custom_books import book_templates, main, store
from custom_books.fields import MAX_BOOKS

CREATE = "/agent/actions/book-create"
TEMPLATES = ("cashbook", "meeting", "handover", "visitors", "blank")


@pytest.fixture
def client(db):
    with TestClient(main.app, root_path=main.PREFIX, raise_server_exceptions=False, follow_redirects=False) as c:
        yield c


def manifest() -> dict:
    return yaml.safe_load((Path(__file__).parents[1] / "app.yaml").read_text(encoding="utf-8"))


def test_the_manifest_declares_one_low_risk_action_for_every_template():
    action, = manifest()["agent"]["actions"]
    assert (action["name"], action["risk"], action["money"], action["approver_roles"]) == ("book.create", "low", False, ["manager"])
    assert action["path"] == CREATE
    schema = action["payload"]
    assert set(schema["properties"]["template"]["enum"]) == set(TEMPLATES) == {*book_templates.TEMPLATES, "blank"}
    assert (schema["required"], schema["additionalProperties"]) == (["template", "name_vi"], False)
    assert (schema["properties"]["name_vi"]["maxLength"], schema["properties"]["description_vi"]["maxLength"]) == (80, 200)


@pytest.mark.parametrize("key", TEMPLATES)
def test_every_template_makes_a_named_draft_book(client, db, key):
    response = client.post(CREATE, headers=acting(sub="kc-approver"), json={"template": key, "name_vi": "Sổ kho phân"})
    assert response.status_code == 200
    book_id = response.json()["book_id"]
    row = db.execute("SELECT name, status, created_by, htx_code, jsonb_array_length(fields) FROM books WHERE id = %s", (book_id,)).fetchone()
    expected = len((book_templates.BLANK if key == "blank" else book_templates.TEMPLATES[key]).fields)
    assert row == ("Sổ kho phân", "DRAFT", "kc-approver", "TC", expected)
    assert response.json()["design_path"] == f"/manager/apps/custom-books/books/{book_id}/design"


def test_the_description_is_the_templates_unless_given(client, db):
    first = client.post(CREATE, headers=acting(), json={"template": "meeting", "name_vi": "A"}).json()["book_id"]
    second = client.post(CREATE, headers=acting(), json={"template": "meeting", "name_vi": "B", "description_vi": "Mô tả riêng"}).json()["book_id"]
    descriptions = {str(i): d for i, d in db.execute("SELECT id, description FROM books").fetchall()}
    assert descriptions[first] == book_templates.TEMPLATES["meeting"].description
    assert descriptions[second] == "Mô tả riêng"


def test_the_book_belongs_to_the_approvers_cooperative(client, db):
    client.post(CREATE, headers=acting(htx="LB"), json={"template": "blank", "name_vi": "Sổ LB"})
    assert db.execute("SELECT htx_code FROM books").fetchall() == [("LB",)]


@pytest.mark.parametrize("body", [
    {"template": "nope", "name_vi": "A"},
    {"template": "meeting"},
    {"name_vi": "A"},
    {"template": "meeting", "name_vi": ""},
    {"template": "meeting", "name_vi": "   "},
    {"template": "meeting", "name_vi": "x" * 81},
    {"template": "meeting", "name_vi": "A", "description_vi": "x" * 201},
    {"template": "meeting", "name_vi": "A", "description_vi": 5},
    {"template": "meeting", "name_vi": 5},
    {"template": ["meeting"], "name_vi": "A"},
    {"template": "meeting", "name_vi": "A", "extra": 1},
])
def test_bad_payloads_are_refused_with_a_message_and_create_nothing(client, db, body):
    response = client.post(CREATE, headers=acting(), json=body)
    assert response.status_code == 400 and response.json()["message_vi"]
    assert db.execute("SELECT count(*) FROM books").fetchone()[0] == 0


@pytest.mark.parametrize("raw", [b"", b"[]", b"not json"])
def test_a_body_that_is_not_an_object_is_refused_as_json(client, db, raw):
    response = client.post(CREATE, headers={**acting(), "content-type": "application/json"}, content=raw)
    assert response.status_code == 400 and response.json()["message_vi"]


def test_the_book_limit_answers_409_with_a_message(client, db):
    for i in range(MAX_BOOKS):
        add_book(db, name=f"Sổ {i}")
    response = client.post(CREATE, headers=acting(), json={"template": "blank", "name_vi": "Thừa"})
    assert response.status_code == 409 and str(MAX_BOOKS) in response.json()["message_vi"]
    assert db.execute("SELECT count(*) FROM books").fetchone()[0] == MAX_BOOKS


def test_only_a_manager_may_call_it(client, db):
    body = {"template": "blank", "name_vi": "A"}
    assert client.post(CREATE, json=body).status_code == 401
    assert client.post(CREATE, headers=bearer(roles=("farmer",)), json=body).status_code == 403
    assert client.post(CREATE, headers=acting(role="officer"), json=body).status_code == 403
    forged = {"X-DXOS-Acting-Sub": "x", "X-DXOS-Acting-Role": "manager", "X-DXOS-Acting-Htx": "TC"}
    assert client.post(CREATE, headers={**bearer(roles=("farmer",)), **forged}, json=body).status_code == 403  # headers next to a user's token change nothing
    assert db.execute("SELECT count(*) FROM books").fetchone()[0] == 0


def test_suggestions_are_empty_and_need_the_agent_token(client):
    assert manifest()["agent"]["suggestions"] == "/agent/suggestions"
    agent = bearer(sub="kc-agent", roles=("agent",), name="")
    assert client.get("/agent/suggestions", headers=agent).json() == {"suggestions": []}
    assert client.get("/agent/suggestions").status_code == 401
    assert client.get("/agent/suggestions", headers=bearer()).status_code == 403


def test_errors_on_the_action_path_are_json_not_pages(client):
    response = client.post(CREATE, json={})
    assert response.headers["content-type"].startswith("application/json") and response.json()["message_vi"]


def test_existing_designer_still_creates_a_template_book_with_its_own_name(client, db):
    response = client.post("/books", headers=bearer(), data={"template": "meeting"})
    assert response.status_code == 303
    assert db.execute("SELECT name FROM books").fetchone()[0] == book_templates.TEMPLATES["meeting"].name
    assert store.create_book(db, "TC", "u", "blank") is not None
