# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
import pytest

from custom_books import book_templates, fields as fl
from custom_books.fields import Field, parse_design, parse_settings, parse_values


def row(i, label="", type="text", key="", **extra):
    form = {f"label_{i}": label, f"type_{i}": type, f"key_{i}": key}
    for name, value in extra.items():
        form[f"{name}_{i}"] = value
    return form


def design(rows, existing=(), next_key=1, has_records=False):
    form = {}
    for r in rows:
        form.update(r)
    return parse_design(form, list(existing), next_key, has_records)


def test_new_rows_get_keys_and_blank_rows_are_skipped():
    fields, next_key, errors = design([row(1, "Ngày", "date"), row(2, ""), row(3, "Ghi chú", "long_text")])
    assert errors == {} and next_key == 3
    assert [(f.key, f.label, f.type) for f in fields] == [("f1", "Ngày", "date"), ("f2", "Ghi chú", "long_text")]


def test_label_limits():
    _, _, errors = design([row(1, "x" * 61), row(2, "   ", key="")])
    assert "label_1" in errors and "label_2" not in errors
    _, _, errors = design([row(1, "x" * 60)])
    assert errors == {}


def test_choice_options_two_to_twenty_each_up_to_sixty():
    ok = "\n".join(f"Mục {n}" for n in range(20))
    assert design([row(1, "Loại", "choice", options=ok)])[2] == {}
    for bad in ("Một", "\n".join(f"Mục {n}" for n in range(21)), "A\n" + "b" * 61, "A\na"):
        assert "options_1" in design([row(1, "Loại", "choice", options=bad)])[2]
    fields, _, _ = design([row(1, "Loại", "choice", options=" A \n\nB\r\n")])
    assert fields[0].options == ("A", "B")


def test_options_separated_by_semicolons_or_newlines():
    for raw in ("Sớm; Trưa ;Chiều", "Sớm\nTrưa\r\nChiều", " Sớm;;Trưa; Chiều; "):
        fields, _, errors = design([row(1, "Buổi", "choice", options=raw)])
        assert errors == {} and fields[0].options == ("Sớm", "Trưa", "Chiều"), raw
    # a newline-separated line is one option, so a ';' inside it is refused
    _, _, errors = design([row(1, "Buổi", "choice", options="Sớm\nTrưa; chiều")])
    assert "dấu chấm phẩy" in errors["options_1"]
    assert "options_1" in design([row(1, "Buổi", "choice", options="Chỉ một")])[2]
    assert fl.rows_of([Field("f1", "Buổi", "choice", options=("Sớm", "Trưa"))], 0)[0]["options"] == "Sớm; Trưa"


def test_unit_only_for_numbers_and_limited():
    fields, _, errors = design([row(1, "Ký", "number", unit="kg"), row(2, "Chữ", "text", unit="kg")])
    assert errors == {} and fields[0].unit == "kg" and fields[1].unit == ""
    assert "unit_1" in design([row(1, "Ký", "number", unit="x" * 21)])[2]


def test_summary_only_for_number_and_money():
    fields, _, _ = design([row(1, "A", "number", summary="on"), row(2, "B", "money", summary="on"),
                           row(3, "C", "text", summary="on")])
    assert [f.summary for f in fields] == [True, True, False]


def test_unknown_type_and_unknown_key_are_errors():
    assert "type_1" in design([row(1, "A", "formula")])[2]
    assert "label_1" in design([row(1, "A", key="f9")])[2]
    assert "label_1" in design([row(1, "A", key="f1; DROP")], existing=[Field("f1", "A", "text")])[2]


def test_limits_twenty_fields_six_in_list():
    many = [row(n, f"Ô {n}", "text") for n in range(1, 21)]
    assert design(many)[2] == {}
    assert "fields" in design(many + [row(21, "Ô 21")])[2]
    six = [row(n, f"Ô {n}", in_list="on") for n in range(1, 7)]
    assert design(six)[2] == {}
    assert "fields" in design(six + [row(7, "Ô 7", in_list="on")])[2]


def test_duplicate_labels_refused():
    assert "label_2" in design([row(1, "Ngày"), row(2, "ngày")])[2]


def test_keys_are_stable_and_never_reused():
    first, nxt, _ = design([row(1, "A"), row(2, "B")])
    assert [f.key for f in first] == ["f1", "f2"] and nxt == 3
    # remove f2, then add a new field: it must be f3, not f2
    second, nxt, errors = design([row(1, "A", key="f1"), row(2, "B", key="f2", remove="on"), row(3, "C")],
                                 existing=first, next_key=nxt)
    assert errors == {} and [f.key for f in second] == ["f1", "f3"] and nxt == 4


def test_order_and_label_change_keep_keys():
    first, nxt, _ = design([row(1, "A"), row(2, "B")])
    fields, _, _ = design([row(1, "A2", key="f1", order="20"), row(2, "B", key="f2", order="10")], first, nxt)
    assert [(f.key, f.label) for f in fields] == [("f2", "B"), ("f1", "A2")]


def test_type_is_locked_once_the_book_has_records():
    existing = [Field("f1", "Ký", "number")]
    _, _, errors = design([row(1, "Ký", "text", key="f1")], existing, 2, has_records=True)
    assert "type_1" in errors
    fields, _, errors = design([row(1, "Ký", "text", key="f1")], existing, 2, has_records=False)
    assert errors == {} and fields[0].type == "text"
    # same type is fine with records
    assert design([row(1, "Ký mới", "number", key="f1")], existing, 2, has_records=True)[2] == {}


def test_choice_options_cannot_lose_old_options_once_the_book_has_records():
    existing = [Field("f1", "Loại", "choice", options=("A", "B"))]
    assert "options_1" in design([row(1, "Loại", "choice", key="f1", options="A\nC")], existing, 2, True)[2]
    assert design([row(1, "Loại", "choice", key="f1", options="A\nB\nC")], existing, 2, True)[2] == {}


def test_removed_field_keeps_its_data_and_old_pages_do_not_delete_by_omission():
    existing = [Field("f1", "A", "text"), Field("f2", "B", "text")]
    fields, nxt, _ = design([row(1, "A", key="f1")], existing, 3)  # f2 not mentioned: stays
    assert [f.key for f in fields] == ["f1", "f2"]
    fields, nxt, _ = design([row(1, "A", key="f1"), row(2, "B", key="f2", remove="on")], existing, 3, has_records=True)
    assert [f.key for f in fields] == ["f1"] and nxt == 3  # data of f2 stays in the records; f2 is never issued again


def test_hostile_labels_are_text():
    label = "x'); DROP TABLE records;--"
    fields, _, errors = design([row(1, label), row(2, "<script>alert(1)</script>", "choice", options="<b>a</b>\n'b")])
    assert errors == {} and fields[0].label == label
    assert fields[1].label == "<script>alert(1)</script>" and fields[1].key == "f2"


def test_settings():
    values, errors = parse_settings({"name": " Sổ ", "description": "", "icon": "leaf", "officer_access": "all",
                                     "farmer_access": "own", "approval": "on"})
    assert errors == {} and values["name"] == "Sổ" and values["approval"] is True
    _, errors = parse_settings({"name": "", "description": "x" * 201, "icon": "rocket", "officer_access": "boss",
                                "farmer_access": ""})
    assert set(errors) == {"name", "description", "icon", "officer_access", "farmer_access"}


def test_level_for_roles():
    assert fl.level_for(("manager",), "none", "none") == "all"
    assert fl.level_for(("officer",), "view", "all") == "view"
    assert fl.level_for(("farmer",), "all", "own") == "own"
    assert fl.level_for(("farmer", "officer"), "view", "own") == "own"
    assert fl.level_for((), "all", "all") == "none"


# ---------- values ----------

HOUSEHOLDS = {"h1": "Nguyễn Văn An", "h2": "Lê Thị Hoa"}
ALL = [Field("f1", "Tên", "text"), Field("f2", "Ghi", "long_text"), Field("f3", "Ký", "number", unit="kg"),
       Field("f4", "Tiền", "money"), Field("f5", "Ngày", "date"), Field("f6", "Loại", "choice", options=("A", "B")),
       Field("f7", "Có", "yes_no"), Field("f8", "Hộ", "household")]


def values_of(form, fields=ALL, households=HOUSEHOLDS):
    return parse_values(fields, form, households)


def test_values_each_type():
    values, errors = values_of({"f1": " Lô 3 ", "f2": "dòng 1\ndòng 2", "f3": "12,5", "f4": "150.000", "f5": "2026-11-10",
                                "f6": "B", "f7": "on", "f8": "h1"})
    assert errors == {}
    assert values == {"f1": "Lô 3", "f2": "dòng 1\ndòng 2", "f3": "12.5", "f4": 150000, "f5": "2026-11-10", "f6": "B",
                      "f7": True, "f8": "h1"}


def test_values_empty_optional_left_out_and_yes_no_false():
    values, errors = values_of({})
    assert errors == {} and values == {"f7": False}


def test_values_required_and_limits():
    req = [Field("f1", "Tên", "text", required=True), Field("f2", "Ký", "number", required=True)]
    assert set(values_of({"f1": " ", "f2": ""}, req)[1]) == {"f1", "f2"}
    assert "f1" in values_of({"f1": "x" * 201}, req)[1]
    assert "f2" in values_of({"f2": ""}, req)[1]
    assert "f2" not in values_of({"f1": "a", "f2": "0"}, req)[1]


@pytest.mark.parametrize("raw", ["abc", "1,2345", "-3", "1e3", "12,", "1.2.3", "٣"])
def test_number_bad_input(raw):
    assert "f3" in values_of({"f3": raw})[1]


@pytest.mark.parametrize("raw,stored", [("12,5", "12.5"), ("12.5", "12.5"), ("8", "8"), ("0,250", "0.25"), ("1000", "1000")])
def test_number_vietnamese_decimals(raw, stored):
    assert values_of({"f3": raw})[0]["f3"] == stored


@pytest.mark.parametrize("raw", ["1,5", "9.00", "-1", "12 000", "1.5.0", "abc"])
def test_money_bad_input(raw):
    assert "f4" in values_of({"f4": raw})[1]


def test_bad_date_choice_household():
    assert "f5" in values_of({"f5": "2026-02-30"})[1]
    assert "f5" in values_of({"f5": "10/11/2026"})[1]
    assert "f6" in values_of({"f6": "C"})[1]
    assert "f8" in values_of({"f8": "h9"})[1]
    assert "f8" in values_of({"f8": "h1"}, households=None)[1]


def test_display():
    assert fl.display(ALL[2], "12.5", {}) == "12,5 kg"
    assert fl.display(ALL[3], 150000, {}) == "150.000 ₫"
    assert fl.display(ALL[4], "2026-11-10", {}) == "10/11/2026"
    assert fl.display(ALL[6], True, {}) == "Có" and fl.display(ALL[6], False, {}) == "Không"
    assert fl.display(ALL[7], "h1", HOUSEHOLDS) == "Nguyễn Văn An"
    assert fl.display(ALL[7], "gone", HOUSEHOLDS) != "gone"
    assert fl.display(ALL[2], "not a number", {}) == "not a number"
    assert fl.display(ALL[0], None, {}) == ""


def test_every_template_is_a_valid_design():
    assert set(book_templates.TEMPLATES) == {"picking", "spraying", "fertilising", "cashbook", "meeting", "handover",
                                             "pest", "visitors"}
    for t in book_templates.TEMPLATES.values():
        assert 4 <= len(t.fields) <= 8 and any(f.type == "date" for f in t.fields), t.key
        assert t.icon in fl.ICONS and t.officer_access in fl.ACCESS_LEVELS and t.farmer_access in fl.ACCESS_LEVELS
        assert [f.key for f in t.fields] == [f"f{n}" for n in range(1, len(t.fields) + 1)]
        form = {"name": t.name, "description": t.description, "icon": t.icon, "officer_access": t.officer_access,
                "farmer_access": t.farmer_access}
        assert parse_settings(form)[1] == {}
        rows = fl.rows_of(t.fields, 0)
        posted = {}
        for r in rows:
            posted.update({f"key_{r['i']}": r["key"], f"label_{r['i']}": r["label"], f"type_{r['i']}": r["type"],
                           f"options_{r['i']}": r["options"], f"unit_{r['i']}": r["unit"], f"order_{r['i']}": r["order"]})
            for flag in ("required", "in_list", "summary"):
                if r[flag]:
                    posted[f"{flag}_{r['i']}"] = "on"
        fields, _, errors = parse_design(posted, t.fields, t.next_key, False)
        assert errors == {} and fields == list(t.fields), t.key
    assert book_templates.TEMPLATES["picking"].officer_access == "all"
    assert book_templates.TEMPLATES["picking"].farmer_access == "own" and book_templates.TEMPLATES["picking"].approval
