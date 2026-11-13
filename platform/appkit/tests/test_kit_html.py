# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
import sys
from html.parser import HTMLParser
from pathlib import Path

import jinja2

HERE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(HERE))

import appkit  # noqa: E402

env = jinja2.Environment(loader=jinja2.FileSystemLoader(HERE), autoescape=True, undefined=jinja2.StrictUndefined)
env.globals.update(href=lambda path, theme="", **p: "/apps/demo" + path, prefix="/apps/demo", appkit=appkit)


def render(source: str, **context) -> str:
    return env.from_string('{% import "kit.html" as kit %}' + source).render(**context)


class Tags(HTMLParser):
    def __init__(self, html: str):
        super().__init__()
        self.found: list[tuple[str, dict]] = []
        self.feed(html)

    def has(self, tag: str, **attrs) -> bool:
        return any(t == tag and all(a.get(k) == v for k, v in attrs.items()) for t, a in self.found)

    def count(self, tag: str) -> int:
        return sum(1 for t, _ in self.found if t == tag)

    def handle_starttag(self, tag, attrs):
        self.found.append((tag, dict(attrs)))


def test_app_header():
    html = render('{% call kit.app_header("Đơn hàng", "HTX Tân Cương") %}<a href="/x">Thêm</a>{% endcall %}')
    t = Tags(html)
    assert t.has("header", **{"class": "app-header"}) and t.count("h1") == 1
    assert "HTX Tân Cương" in html and 'href="/x"' in html
    assert "<p" not in render('{% call kit.app_header("T") %}{% endcall %}')


def test_tabs():
    html = render('{{ kit.tabs(items, "b") }}', items=[("a", "Tổng quan", "/a"), ("b", "Đơn", "/b")])
    t = Tags(html)
    assert t.has("nav", **{"class": "tabs", "aria-label": "Điều hướng trong ứng dụng"})
    assert t.has("a", href="/b", **{"aria-current": "page"})
    assert not t.has("a", href="/a", **{"aria-current": "page"})


def test_stats():
    html = render("{{ kit.stats(items) }}", items=[{"label": "Đơn", "value": "12", "hint": "tuần này"}, {"label": "Khách", "value": "3"}])
    t = Tags(html)
    assert t.has("ul", **{"class": "stats"}) and t.count("li") == 2
    assert "tuần này" in html and "Khách" in html


def test_chart():
    rows = appkit.chart_rows([("Búp tươi", 80), ("Chè khô", 20)])
    html = render('{{ kit.chart("Sản lượng", rows, "kg") }}', rows=rows)
    t = Tags(html)
    assert t.has("figure", **{"class": "chart"}) and t.has("rect", width="100%") and t.has("rect", width="25%")
    assert "Búp tươi" in html and "kg" in html and "style=" not in html


def test_pagination():
    page = appkit.page_of("2", 87)
    html = render('{{ kit.pagination(page, "/p1", None) }}', page=page)
    t = Tags(html)
    assert t.has("nav", **{"class": "pagination", "aria-label": "Phân trang"})
    assert "Trang 2/4 · 87 dòng" in html and t.has("a", href="/p1") and t.count("a") == 1
    assert render("{{ kit.pagination(page, None, None) }}", page=appkit.page_of(None, 0)).strip() == ""


def test_empty_and_field_error():
    t = Tags(render('{{ kit.empty("Chưa có đơn.", "Thêm", "/new") }}'))
    assert t.has("p", **{"class": "empty"}) and t.has("a", href="/new")
    assert Tags(render('{{ kit.empty("Chưa có đơn.") }}')).count("a") == 0
    html = render('{{ kit.field_error(errors, "qty") }}', errors={"qty": "Cần là số."})
    assert Tags(html).has("span", **{"class": "field-error", "role": "alert"}) and "Cần là số." in html
    assert render('{{ kit.field_error(errors, "qty") }}', errors={}).strip() == ""


def test_steps():
    html = render('{{ kit.steps(["Mới", "Đã giao", "Xong"], 1) }}')
    t = Tags(html)
    assert t.has("ol", **{"class": "steps"})
    assert t.has("li", **{"data-state": "done"}) and t.has("li", **{"aria-current": "step"})
    assert t.count("li") == 3


def test_links():
    t = Tags(render('{{ kit.export_link("/e.csv") }}{{ kit.print_link("/p", "In") }}'))
    assert t.has("a", href="/e.csv", **{"class": "button secondary"})
    assert t.has("a", href="/p", target="_top", **{"class": "button secondary"})
    assert "Tải CSV" in render('{{ kit.export_link("/e.csv") }}')


def test_print_bar():
    html = render('{{ kit.print_bar("/back") }}')
    assert Tags(html).has("p", **{"class": "no-print"}) and Tags(html).has("a", href="/back")
    assert "Dùng lệnh In của trình duyệt (Ctrl+P) để in trang này." in html and "Quay lại ứng dụng" in html


def test_showcase_renders_without_style_or_script():
    html = env.get_template("showcase.html").render(theme="")
    assert "style=" not in html and "<script" not in html.lower()
    for marker in ("app-header", "tabs", "stats", "chart", "pagination", "empty", "field-error", "steps", "toolbar",
                   "cards", "disclosure", "actions", "print-sheet", "no-print", "print-only", "pill warn", "pill neutral",
                   "pill danger", "signature", 'type="checkbox"'):
        assert marker in html, marker
