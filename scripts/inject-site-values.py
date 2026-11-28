#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Write release values into the built landing pages (run by scripts/build-site.sh).

The committed pages carry placeholders such as <span data-inject="version">vX.Y.Z</span>.
This script replaces them with values read from the repository:

  version   apps/web/package.json, field "version"                 -> v1.13.0
  latest    newest released "## [X.Y.Z] - YYYY-MM-DD" in CHANGELOG.md -> v1.13.0 · 2026-11-22
  releases  number of "## [X.Y.Z]" version headings in CHANGELOG.md  -> 14
  apps      number of advertised mini-apps: directories in miniapps/ that contain
            app.yaml, minus FROZEN_APPS                                  -> 4

Usage: python3 scripts/inject-site-values.py <site-output-dir>
"""
import json
import os
import re
import sys

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PAGES = ["index.html", os.path.join("en", "index.html")]

# Apps kept in the repo but not advertised on the site (v1.24.0): leaf-purchase, farm-supply and
# htx-dashboard are frozen, and hub-mobile is the mobile client rather than a mini-app. Their
# app.yaml files stay as they are; only the count leaves them out.
FROZEN_APPS = {"leaf-purchase", "farm-supply", "htx-dashboard", "hub-mobile"}


def read_values():
    with open(os.path.join(REPO, "apps", "web", "package.json"), encoding="utf-8") as f:
        version = json.load(f)["version"]
    with open(os.path.join(REPO, "CHANGELOG.md"), encoding="utf-8") as f:
        changelog = f.read()
    headings = re.findall(r"^## \[(\d+\.\d+\.\d+)\]", changelog, re.M)
    latest = re.search(r"^## \[(\d+\.\d+\.\d+)\] - (\d{4}-\d{2}-\d{2})", changelog, re.M)
    if not latest:
        raise SystemExit("CHANGELOG.md has no released section")
    apps = sum(1 for d in sorted(os.listdir(os.path.join(REPO, "miniapps")))
               if d not in FROZEN_APPS and os.path.isfile(os.path.join(REPO, "miniapps", d, "app.yaml")))
    return {
        "version": "v" + version,
        "latest": "v%s · %s" % (latest.group(1), latest.group(2)),
        "releases": str(len(headings)),
        "apps": str(apps),
    }


def inject(html, key, value):
    pattern = re.compile(r'(<(\w+)\b[^>]*\bdata-inject="%s"[^>]*>)(.*?)(</\2>)' % re.escape(key), re.S)
    found = [0]

    def sub(m):
        found[0] += 1
        opening = m.group(1)
        if key in ("apps", "releases"):
            opening = re.sub(r'data-count="[^"]*"', 'data-count="%s"' % value, opening)
        return opening + value + m.group(4)

    html = pattern.sub(sub, html)
    return html, found[0]


def main(out_dir):
    values = read_values()
    total = {}
    for rel in PAGES:
        path = os.path.join(out_dir, rel)
        with open(path, encoding="utf-8") as f:
            html = f.read()
        for key, value in values.items():
            html, n = inject(html, key, value)
            total[key] = total.get(key, 0) + n
        if "vX.Y.Z" in html or 'data-count="N"' in html:
            raise SystemExit("placeholder left in " + rel)
        with open(path, "w", encoding="utf-8") as f:
            f.write(html)
    print("injected:", ", ".join("%s=%s (%d)" % (k, values[k], total.get(k, 0)) for k in sorted(values)))


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(__doc__)
        sys.exit(2)
    main(sys.argv[1])
