#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Render the repository's Markdown documents as the documentation pages of the project site.

Usage:  python3 scripts/build-docs.py <site-output-dir>
        python3 scripts/build-docs.py --selftest

The source documents are never copied: each page is rendered from the file in the repository,
links between documents are rewritten to the generated pages, and images are copied into
docs-assets/. Needs the Markdown package (Python-Markdown 3.7, BSD-3-Clause), see DEPENDENCIES.md.
"""
import json
import os
import posixpath
import re
import shutil
import sys
from html import escape

import markdown

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GITHUB = "https://github.com/maiychrus25/OpenTea-DX-OS"
BRANCH = "main"
IMAGE_EXT = (".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg")

# slug -> page definition. kind: file (whole file), sections (H2 prefixes of a file), author (site/docs-src).
PAGES = {
    "install": dict(title="Cài đặt và chạy từ mã nguồn", group="Bắt đầu", kind="sections", source="README.md",
                    prefixes=["## 🚀 Bắt đầu Nhanh", "## 🔨 Biên dịch", "## 🧪 Kiểm thử"],
                    desc="Chạy stack bằng Docker, biên dịch web app và chạy kiểm thử."),
    "architecture": dict(title="Kiến trúc ba tầng", group="Bắt đầu", kind="sections", source="README.md",
                         prefixes=["## 🧭 Kiến trúc", "## 🧱 Tier 1", "## 🌱 Tier 2", "## 🧩 Tier 3"],
                         desc="Lõi dùng chung, ứng dụng cho HTX và mini-app."),
    "miniapp-guide": dict(title="Viết mini-app", group="Nhà phát triển", kind="file", source="docs/miniapps.md",
                          desc="Manifest app.yaml, đăng nhập, giao diện, database, bảo mật và lệnh ./dxos."),
    "api-contract": dict(title="Hợp đồng API", group="Nhà phát triển", kind="file", source="docs/api-contract.md",
                         desc="Các endpoint của web app."),
    "database-schema": dict(title="Cơ sở dữ liệu", group="Nhà phát triển", kind="file", source="docs/database-schema.md",
                            desc="Cấu trúc dữ liệu PostgreSQL."),
    "dev-setup": dict(title="Thiết lập môi trường phát triển", group="Nhà phát triển", kind="file", source="docs/dev-setup.md",
                      desc="Các bước dựng môi trường để phát triển."),
    "testing": dict(title="Chiến lược kiểm thử", group="Nhà phát triển", kind="file", source="docs/testing-strategy.md",
                    desc="Công cụ và cách kiểm thử."),
    "project-context": dict(title="Ngữ cảnh dự án và thuật ngữ", group="Nhà phát triển", kind="file", source="docs/project-context.md",
                            desc="Công nghệ, thuật ngữ nghiệp vụ và các luật cốt lõi."),
    "adr": dict(title="Quyết định kiến trúc (ADR)", group="Nhà phát triển", kind="index",
                desc="Các quyết định kiến trúc đã được ghi lại."),
    "adr-0001": dict(title="ADR 0001: n8n làm công cụ quy trình", group="Nhà phát triển", kind="file",
                     source="docs/adr/0001-n8n-workflow-engine.md", parent="adr", desc="Vì sao n8n được chọn làm công cụ quy trình dữ liệu."),
    "adr-0002": dict(title="ADR 0002: kiến trúc mini-app", group="Nhà phát triển", kind="file",
                     source="docs/adr/0002-miniapp-architecture.md", parent="adr", desc="Vì sao mini-app chạy như container riêng."),
    "app-hub-mobile": dict(title="Hub mobile (Flutter)", group="Ứng dụng", kind="file", source="apps/hub-mobile/README.md",
                           desc="Ứng dụng di động của HTX (chưa phát hành)."),
    "app-staff-desktop": dict(title="Tea Staff Manager (máy tính)", group="Ứng dụng", kind="file", source="apps/staff-desktop/README.md",
                              desc="Quản lý nhân sự, chấm công và lương trên Windows."),
    "app-staff-mobile": dict(title="Tea Work (Android)", group="Ứng dụng", kind="file", source="apps/staff-mobile/README.md",
                             desc="Ứng dụng nhận việc và chấm công cho nhân viên."),
    "app-leaf-purchase": dict(title="Thu mua búp tươi", group="Ứng dụng", kind="file", source="miniapps/leaf-purchase/README.md",
                              desc="Phiếu cân, kỳ thanh toán và giá thu mua."),
    "app-tea-shop": dict(title="Cửa hàng chè", group="Ứng dụng", kind="file", source="miniapps/tea-shop/README.md",
                         desc="Đơn hàng và sản phẩm, có trang đặt hàng công khai."),
    "app-farm-supply": dict(title="Vật tư mua chung", group="Ứng dụng", kind="file", source="miniapps/farm-supply/README.md",
                            desc="Đợt đăng ký vật tư và thanh toán theo hộ."),
    "app-tea-tour": dict(title="Đặt tour đồi chè", group="Ứng dụng", kind="file", source="miniapps/tea-tour/README.md",
                         desc="Tour, lượt đặt chỗ và danh sách đoàn."),
    "app-custom-books": dict(title="Sổ tự tạo", group="Ứng dụng", kind="file", source="miniapps/custom-books/README.md",
                             desc="Sổ ghi chép do HTX tự thiết kế, không cần lập trình."),
    "app-htx-dashboard": dict(title="Bảng điều hành HTX", group="Ứng dụng", kind="file", source="miniapps/htx-dashboard/README.md",
                              desc="Bảng điều hành chỉ đọc cho trưởng HTX."),
    "app-hello": dict(title="Ứng dụng mẫu hello", group="Ứng dụng", kind="file", source="miniapps/hello/README.md",
                      desc="Ứng dụng mẫu tối giản để bắt đầu viết mini-app."),
    "design": dict(title="Hệ thống thiết kế", group="Thiết kế và vận hành", kind="file", source="DESIGN.md",
                   desc="Token màu, chữ, khoảng cách và quy tắc giao diện."),
    "rules": dict(title="Quy tắc và giới hạn", group="Thiết kế và vận hành", kind="file", source="docs/rules-and-limits.md",
                  desc="Ràng buộc nghiệp vụ và tiêu chuẩn mã nguồn."),
    "changelog": dict(title="Nhật ký thay đổi", group="Phát hành", kind="file", source="CHANGELOG.md",
                      desc="Những gì mỗi bản phát hành đã thêm, sửa và giới hạn."),
    "dependencies": dict(title="Thư viện và giấy phép", group="Phát hành", kind="file", source="DEPENDENCIES.md",
                         desc="Thư viện bên thứ ba, giấy phép và công cụ build."),
    "license": dict(title="Giấy phép MIT", group="Phát hành", kind="text", source="LICENSE",
                    desc="Giấy phép MIT của dự án."),
}
GROUP_ORDER = ["Bắt đầu", "Nhà phát triển", "Ứng dụng", "Thiết kế và vận hành", "Phát hành"]
START = dict(title="Bắt đầu đọc tài liệu", desc="Đọc gì trước, theo vai trò của bạn.")

SPDX_LINE = re.compile(r"^\s*(<!--\s*)?#?\s*SPDX-[A-Za-z-]+:.*$", re.M)
HTML_COMMENT = re.compile(r"<!--.*?-->", re.S)
LINK_MD = re.compile(r"(!?\[[^\]]*\]\()([^)\s]+)((?:\s+\"[^\"]*\")?\))")
ATTR_HTML = re.compile(r"""(\s(?:href|src)=)(["'])([^"']+)\2""")
ALERTS = {"NOTE": "Ghi chú.", "TIP": "Mẹo.", "IMPORTANT": "Quan trọng.", "WARNING": "Cảnh báo.", "CAUTION": "Thận trọng."}


def strip_frontmatter(text):
    """Front matter of DESIGN.md becomes a YAML block; other files are unchanged."""
    if text.startswith("---\n"):
        end = text.find("\n---\n", 4)
        if end != -1:
            body = text[end + 5:]
            front = text[4:end]
            front = SPDX_LINE.sub("", front).strip("\n")
            return "```yaml\n" + front + "\n```\n\n" + body
    return text


def read_source(repo_path):
    with open(os.path.join(REPO, repo_path), encoding="utf-8") as f:
        return f.read()


def sections_of(text, prefixes):
    """Keep the H2 blocks whose heading starts with one of the prefixes (order of the source)."""
    out, keep = [], False
    for line in text.split("\n"):
        if line.startswith("## "):
            keep = any(line.startswith(p) for p in prefixes)
        if keep:
            out.append(line)
    return "\n".join(out) + "\n"


def drop_first_h1(text):
    lines = text.split("\n")
    for i, line in enumerate(lines):
        if line.startswith("# "):
            return "\n".join(lines[:i] + lines[i + 1:]), line[2:].strip()
        if line.strip():
            break
    return text, None


LIST_ITEM = re.compile(r"^\s*([-*+]|\d+\.)\s")


def fix_lists(text):
    """A list that follows a paragraph line needs a blank line before it (outside code fences)."""
    out, prev, fence = [], "", False
    for line in text.split("\n"):
        if line.lstrip().startswith("```"):
            fence = not fence
        elif not fence and LIST_ITEM.match(line) and prev.strip() and not LIST_ITEM.match(prev) and not prev.startswith(" "):
            out.append("")
        out.append(line)
        prev = line
    return "\n".join(out)


def clean(text):
    text = HTML_COMMENT.sub("", text)
    text = SPDX_LINE.sub("", text)
    text = fix_lists(text)
    for kind, label in ALERTS.items():
        text = re.sub(r"^> \[!%s\]\s*$" % kind, "> **%s**" % label, text, flags=re.M)
    return text


class Links:
    """Resolve a link written in a repository document (or in a site author file) to its target."""

    def __init__(self, page_out_dir, slug_to_out, assets):
        self.page_dir = page_out_dir  # e.g. "docs/install"
        self.slug_to_out = slug_to_out  # slug -> out path of its index.html
        self.assets = assets  # set of repo paths copied to docs-assets/

    def relative(self, out_path):
        target = posixpath.dirname(out_path) if out_path.endswith("index.html") else out_path
        rel = posixpath.relpath(target or ".", self.page_dir)
        return rel + "/" if out_path.endswith("index.html") and not rel.endswith("/") else rel

    def root(self):
        return posixpath.relpath(".", self.page_dir) + "/"

    def resolve(self, href, src_dir, src_repo_path=None):
        if re.match(r"^(https?:|mailto:|#)", href) or not href:
            return href
        path, _, anchor = href.partition("#")
        frag = "#" + anchor if anchor else ""
        if path.startswith("slug:"):
            slug = path[5:]
            return self.relative(self.slug_to_out[slug]) + frag
        if path == "":
            return href
        repo_target = posixpath.normpath(posixpath.join(src_dir, path))
        if repo_target.startswith("../") or os.path.isabs(repo_target):
            return GITHUB + "/blob/" + BRANCH + "/" + repo_target + frag
        full = os.path.join(REPO, repo_target)
        if os.path.isdir(full):
            readme = posixpath.join(repo_target, "README.md")
            for slug, page in PAGES.items():
                if page.get("source") == readme and slug in self.slug_to_out:
                    return self.relative(self.slug_to_out[slug]) + frag
            return GITHUB + "/tree/" + BRANCH + "/" + repo_target + frag
        if repo_target.lower().endswith(IMAGE_EXT):
            self.assets.add(repo_target)
            return posixpath.relpath("docs-assets/" + repo_target, self.page_dir) + frag
        for slug, page in PAGES.items():
            if page.get("source") == repo_target and slug in self.slug_to_out and page.get("kind") != "index":
                return self.relative(self.slug_to_out[slug]) + frag
        return GITHUB + "/blob/" + BRANCH + "/" + repo_target + frag


def rewrite_links(text, src_dir, links, src_repo_path=None):
    def md_sub(m):
        return m.group(1) + links.resolve(m.group(2), src_dir, src_repo_path) + m.group(3)

    def html_sub(m):
        return m.group(1) + m.group(2) + links.resolve(m.group(3), src_dir, src_repo_path) + m.group(2)

    text = LINK_MD.sub(md_sub, text)
    text = ATTR_HTML.sub(html_sub, text)
    return text


def render_markdown(text):
    md = markdown.Markdown(extensions=["tables", "fenced_code", "toc", "sane_lists"],
                           extension_configs={"toc": {"permalink": False, "toc_depth": "2-3"}})
    html = md.convert(text)
    return html, md.toc_tokens


def decorate(html):
    """Wrap tables and code blocks, add heading anchors and copy buttons (shown by JavaScript only)."""
    html = re.sub(r"<table>", '<div class="table-wrap" tabindex="0"><table>', html)
    html = re.sub(r"</table>", "</table></div>", html)
    html = re.sub(r"<pre>(.*?)</pre>", lambda m: '<div class="codebox"><pre>' + m.group(1) + '</pre><button class="copy" type="button" hidden>Sao chép</button></div>', html, flags=re.S)
    html = re.sub(r'<h([23]) id="([^"]+)">(.*?)</h\1>',
                  lambda m: '<h%s id="%s">%s<a class="anchor" href="#%s" aria-label="Liên kết tới mục này">#</a></h%s>' % (m.group(1), m.group(2), m.group(3), m.group(2), m.group(1)), html, flags=re.S)
    return html


def toc_html(tokens):
    if not tokens:
        return ""
    items = []
    for t in tokens:
        items.append('<li class="lvl%d"><a href="#%s">%s</a></li>' % (t["level"], t["id"], escape(re.sub(r"<[^>]+>", "", t["name"]))))
        items.append("".join(toc_html_child(c) for c in t.get("children", [])))
    return '<nav class="toc" aria-label="Mục trong trang"><p class="toc-title">Trên trang này</p><ul>%s</ul></nav>' % "".join(items)


def toc_html_child(t):
    out = '<li class="lvl%d"><a href="#%s">%s</a></li>' % (t["level"], t["id"], escape(re.sub(r"<[^>]+>", "", t["name"])))
    return out + "".join(toc_html_child(c) for c in t.get("children", []))


def plain_text(html):
    text = re.sub(r"<pre.*?</pre>", " ", html, flags=re.S)
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text[:4000]


def sidebar(current_slug, lang, root, slug_to_out):
    if lang == "en":
        return ""
    parts = ['<nav class="side-nav" aria-label="Tài liệu"><p class="side-title"><a href="%sdocs/">Tài liệu</a></p>' % root]
    for group in GROUP_ORDER:
        items = []
        if group == "Bắt đầu":
            cur = ' aria-current="page"' if current_slug == "start" else ""
            items.append('<li><a href="%sdocs/"%s>%s</a></li>' % (root, cur, escape(START["title"])))
        for slug, page in PAGES.items():
            if page["group"] != group or page.get("parent"):
                continue
            cur = ' aria-current="page"' if current_slug == slug else ""
            items.append('<li><a href="%s%s"%s>%s</a></li>' % (root, relpath_from_root(slug_to_out[slug]), cur, escape(page["title"])))
            for child, cp in PAGES.items():
                if cp.get("parent") == slug:
                    cur = ' aria-current="page"' if current_slug == child else ""
                    items.append('<li class="sub"><a href="%s%s"%s>%s</a></li>' % (root, relpath_from_root(slug_to_out[child]), cur, escape(cp["title"])))
        parts.append('<p class="side-group">%s</p><ul>%s</ul>' % (escape(group), "".join(items)))
    parts.append("</nav>")
    return "".join(parts)


def relpath_from_root(out_path):
    d = posixpath.dirname(out_path)
    return d + "/" if out_path.endswith("index.html") else out_path


def header_html(root, lang):
    other = ("%sen/docs/" % root) if lang == "vi" else ("%sdocs/" % root.replace("../", "../", 1))
    return """<a class="skip-link" href="#main">%(skip)s</a>
<header class="site-header" data-header>
  <div class="wrap bar">
    <a class="brand" href="%(root)s" aria-label="OpenTea DX-OS">
      <img src="%(root)smedia/icon-192.png" width="34" height="34" alt="">
      <span>OpenTea DX-OS</span>
    </a>
    <input class="nav-toggle" type="checkbox" id="nav-toggle" aria-label="%(navlabel)s">
    <nav class="nav-links" aria-label="Điều hướng chính">
      <a href="%(root)s#why">%(why)s</a>
      <a href="%(root)s#story">%(story)s</a>
      <a href="%(root)s#tiers">%(tiers)s</a>
      <a href="%(root)s#features">%(features)s</a>
      <a href="%(root)sdocs/" aria-current="page">%(docs)s</a>
      <a href="%(root)s#open-source">%(source)s</a>
      <a href="%(root)s#status">%(status)s</a>
    </nav>
    <div class="header-tools">
      <label class="nav-btn" for="nav-toggle">%(navbtn)s</label>
      <a class="tool" href="%(lang_href)s" lang="%(other_lang)s" hreflang="%(other_lang)s">%(lang_label)s</a>
      <button class="tool" type="button" id="theme-toggle" hidden>%(theme)s</button>
      <a class="tool tool-gh" href="%(github)s">GitHub</a>
    </div>
  </div>
</header>""" % dict(
        skip="Bỏ qua và đi tới nội dung" if lang == "vi" else "Skip to content",
        navlabel="Mở mục điều hướng" if lang == "vi" else "Open the navigation menu",
        navbtn="Mục" if lang == "vi" else "Menu",
        root=root, why="Vì sao" if lang == "vi" else "Why", story="Một ngày" if lang == "vi" else "A day",
        tiers="Ba tầng" if lang == "vi" else "Three tiers", features="Tính năng" if lang == "vi" else "Features",
        docs="Tài liệu" if lang == "vi" else "Docs", docscur="page", status="Tình trạng" if lang == "vi" else "Status",
        source="Mã nguồn" if lang == "vi" else "Source",
        lang_href=other, other_lang="en" if lang == "vi" else "vi",
        lang_label="English" if lang == "vi" else "Tiếng Việt",
        theme="Giao diện: hệ thống" if lang == "vi" else "Theme: system", github=GITHUB)


def footer_html(root, lang):
    text = "Phát triển bởi OpenTea Developers. Giấy phép MIT." if lang == "vi" else "Developed by OpenTea Developers. MIT licence."
    return """<footer class="site-footer"><div class="wrap">
  <div><a class="brand" href="%(root)s"><img src="%(root)smedia/icon-192.png" width="30" height="30" alt=""><span>OpenTea DX-OS</span></a>
  <p style="margin-top:8px">%(text)s</p></div>
  <nav aria-label="Liên kết chân trang">
    <a href="%(github)s">GitHub</a><a href="%(github)s/releases">Releases</a><a href="%(github)s/issues">Issues</a><a href="%(github)s/blob/main/LICENSE">LICENSE</a>
  </nav>
</div></footer>""" % dict(root=root, text=text, github=GITHUB)


def page_html(lang, slug, title, desc, body, toc, edit_url, prev_next, sidebar_html, page_dir, root, slug_to_out, source_label):
    crumbs = '<a href="%sdocs/">%s</a>' % (root, "Tài liệu" if lang == "vi" else "Docs")
    if slug != "start":
        crumbs += ' <span aria-hidden="true">/</span> ' + escape(title)
    pn = ""
    if prev_next:
        pn = '<nav class="prev-next" aria-label="Trang trước và sau">%s%s</nav>' % (
            ('<a class="prev" href="%s%s"><span>%s</span>%s</a>' % (root, prev_next[0][1], "Trước" if lang == "vi" else "Previous", escape(prev_next[0][0]))) if prev_next[0] else "<span></span>",
            ('<a class="next" href="%s%s"><span>%s</span>%s</a>' % (root, prev_next[1][1], "Tiếp" if lang == "vi" else "Next", escape(prev_next[1][0]))) if prev_next[1] else "<span></span>")
    return """<!doctype html>
<html lang="%(lang)s">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>%(title)s · OpenTea DX-OS</title>
<meta name="description" content="%(desc)s">
<link rel="canonical" href="https://maiychrus25.github.io/OpenTea-DX-OS/%(canon)s">
<meta property="og:title" content="%(title)s · OpenTea DX-OS">
<meta property="og:description" content="%(desc)s">
<meta property="og:image" content="https://maiychrus25.github.io/OpenTea-DX-OS/og-image.png">
<link rel="icon" type="image/png" sizes="512x512" href="%(root)smedia/icon-512.png">
<link rel="stylesheet" href="%(root)sassets/site.css">
<link rel="stylesheet" href="%(root)sassets/docs.css">
<script>(function(){try{var t=localStorage.getItem("opentea-theme");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t);}catch(e){}})();</script>
</head>
<body class="docs-page" data-root="%(root)s">
%(header)s
<div class="docs-shell">
  <div class="wrap docs-grid">
    <aside class="docs-side">
      <details class="side-mobile"><summary>Các mục tài liệu</summary>%(sidebar)s</details>
      <div class="side-desktop">%(sidebar)s</div>
      <div class="side-search" hidden>
        <label for="doc-search" class="side-title">Tìm trong tài liệu</label>
        <input id="doc-search" type="search" autocomplete="off" placeholder="Tìm từ khoá">
        <ul id="doc-results" class="results" aria-live="polite"></ul>
      </div>
    </aside>
    <main id="main" class="doc-main">
      <nav class="crumbs" aria-label="Đường dẫn">%(crumbs)s</nav>
      <header class="doc-head">
        <h1>%(title)s</h1>
        <p class="doc-desc">%(desc)s</p>
        <p class="doc-meta"><a href="%(edit)s">%(edit_label)s</a> · %(source_label)s</p>
      </header>
      <article class="prose">%(body)s</article>
      %(pn)s
    </main>
    <aside class="doc-toc">%(toc)s</aside>
  </div>
</div>
%(footer)s
<script src="%(root)sassets/site.js" defer></script>
<script src="%(root)sassets/docs.js" defer></script>
</body>
</html>
""" % dict(lang=lang, title=escape(title), desc=escape(desc), canon=slug_to_out.get(slug, "docs/"), root=root,
           header=header_html(root, lang), sidebar=sidebar_html, crumbs=crumbs, body=body, toc=toc,
           edit=edit_url, edit_label="Sửa trang này trên GitHub" if lang == "vi" else "Edit this page on GitHub",
           source_label=source_label, pn=pn, footer=footer_html(root, lang))


def build(out_dir, lang_checks=False):
    out_dir = os.path.abspath(out_dir)
    slug_to_out = {"start": "docs/index.html"}
    for slug in PAGES:
        slug_to_out[slug] = "docs/%s/index.html" % slug
    order = [s for g in GROUP_ORDER for s in PAGES if PAGES[s]["group"] == g and not PAGES[s].get("parent")]
    flat = []
    for slug in ["start"] + order:
        flat.append(slug)
        for child, cp in PAGES.items():
            if cp.get("parent") == slug:
                flat.append(child)
    pages_written = []
    assets = set()

    def write(out_rel, html):
        path = os.path.join(out_dir, out_rel)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            f.write(html)
        pages_written.append(out_rel)

    search = []
    for slug in flat:
        if slug == "start":
            out_rel = "docs/index.html"
            text = drop_first_h1(read_author("site/docs-src/start.md"))[0]
            src_dir, edit = "site/docs-src", GITHUB + "/blob/" + BRANCH + "/site/docs-src/start.md"
            title, desc, group, source_label = START["title"], START["desc"], "Bắt đầu", "Trang tổng quan của tài liệu"
            prev_next_slugs = None
        elif slug == "adr":
            out_rel = slug_to_out[slug]
            text = adr_index_text()
            src_dir, edit = "docs", GITHUB + "/tree/" + BRANCH + "/docs/adr"
            title, desc, group = PAGES[slug]["title"], PAGES[slug]["desc"], PAGES[slug]["group"]
            source_label = "Tổng hợp từ docs/adr/"
        else:
            page = PAGES[slug]
            out_rel = slug_to_out[slug]
            title, desc, group = page["title"], page["desc"], page["group"]
            if page["kind"] == "sections":
                text = sections_of(read_source(page["source"]), page["prefixes"])
                src_dir = posixpath.dirname(page["source"])
                source_label = "Trích từ " + page["source"]
                text = clean(text)
            elif page["kind"] == "text":
                text = "```text\n" + read_source(page["source"]) + "```\n"
                src_dir = ""
                source_label = "Nguồn: " + page["source"]
            else:
                raw = read_source(page["source"])
                raw = strip_frontmatter(raw)
                raw, h1 = drop_first_h1(clean(raw))
                if h1 and page["kind"] == "file":
                    title = title if title else h1
                text = raw
                src_dir = posixpath.dirname(page["source"])
                source_label = "Nguồn: " + page["source"]
            edit = GITHUB + "/blob/" + BRANCH + "/" + page.get("source", "")
        if slug.startswith("app-") or slug.startswith("adr-"):
            pass
        page_dir = posixpath.dirname(out_rel)
        links = Links(page_dir, slug_to_out, assets)
        text = rewrite_links(text, src_dir, links)
        body_html, toc_tokens = render_markdown(text)
        body_html = decorate(body_html)
        prev_next = None
        i = flat.index(slug)
        before = flat[i - 1] if i > 0 else None
        after = flat[i + 1] if i + 1 < len(flat) else None
        if slug != "start" or True:
            def info(s):
                if s is None:
                    return None
                t = START["title"] if s == "start" else PAGES[s]["title"]
                return (t, relpath_from_root(slug_to_out[s]))
            prev_next = (info(before), info(after))
        root = links.root()
        html = page_html("vi", slug, title, desc, body_html, toc_html(toc_tokens), edit, prev_next,
                         sidebar(slug, "vi", root, slug_to_out), page_dir, root, slug_to_out, source_label)
        write(out_rel, html)
        search.append({"title": title, "url": relpath_from_root(out_rel), "text": plain_text(body_html)})
    # English start page: lists the same documents, marks the Vietnamese-only ones
    en_html = build_en_start(slug_to_out, flat)
    write("en/docs/index.html", en_html)
    # copy referenced images
    for repo_path in sorted(assets):
        dst = os.path.join(out_dir, "docs-assets", repo_path)
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        shutil.copyfile(os.path.join(REPO, repo_path), dst)
    with open(os.path.join(out_dir, "docs", "search-index.json"), "w", encoding="utf-8") as f:
        json.dump(sorted(search, key=lambda s: s["url"]), f, ensure_ascii=False, sort_keys=True, indent=0)
    return pages_written, sorted(assets)


def read_author(rel):
    with open(os.path.join(REPO, rel), encoding="utf-8") as f:
        return f.read()


def adr_index_text():
    lines = ["Các quyết định kiến trúc được ghi lại trong thư mục `docs/adr/`:", ""]
    for slug in ["adr-0001", "adr-0002"]:
        p = PAGES[slug]
        lines.append("- [%s](slug:%s)" % (p["title"], slug))
    return "\n".join(lines) + "\n"


def build_en_start(slug_to_out, flat):
    text = drop_first_h1(read_author("site/docs-src/start-en.md"))[0]
    links = Links("en/docs", slug_to_out, set())
    text = rewrite_links(text, "site/docs-src", links)
    body_html, toc_tokens = render_markdown(text)
    body_html = decorate(body_html)
    root = links.root()
    return page_html("en", "start", "Documentation", "Where to start, by audience.", body_html, toc_html(toc_tokens),
                     GITHUB + "/blob/" + BRANCH + "/site/docs-src/start-en.md", None, "", "en/docs", root,
                     {"start": "en/docs/index.html"}, "Source: site/docs-src/start-en.md")


def selftest():
    """Link rewriting rules the generator relies on (run with --selftest)."""
    slug_to_out = {"start": "docs/index.html", "miniapp-guide": "docs/miniapp-guide/index.html",
                   "app-tea-tour": "docs/app-tea-tour/index.html", "adr-0002": "docs/adr-0002/index.html"}
    links = Links("docs/install", slug_to_out, set())
    cases = [
        ("./docs/miniapps.md#section-2", "", "../miniapp-guide/#section-2"),
        ("./adr/0002-miniapp-architecture.md", "docs", "../adr-0002/"),
        ("../miniapps/tea-tour/", "docs", "../app-tea-tour/"),
        ("../platform/apps/manifest.schema.json", "docs", GITHUB + "/blob/main/platform/apps/manifest.schema.json"),
        ("https://example.com/x", "", "https://example.com/x"),
        ("#local", "", "#local"),
        ("slug:start", "", "../"),
        ("../miniapps/leaf-purchase/store/manager-period.png", "docs",
         "../../docs-assets/miniapps/leaf-purchase/store/manager-period.png"),
    ]
    for href, src_dir, want in cases:
        got = links.resolve(href, src_dir, None)
        assert got == want, (href, got, want)
    assert "miniapps/leaf-purchase/store/manager-period.png" in links.assets
    assert clean("<!-- SPDX-License-Identifier: MIT -->\nBody") == "\nBody"
    assert "SPDX" not in clean("# SPDX-License-Identifier: MIT\n# Title")
    print("selftest ok")


def main(argv):
    if argv[1:2] == ["--selftest"]:
        selftest()
        return 0
    if len(argv) != 2:
        print(__doc__)
        return 2
    pages, assets = build(argv[1])
    print("docs: %d pages, %d images copied" % (len(pages), len(assets)))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
