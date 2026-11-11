# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
import argparse
import sys
from pathlib import Path

from dxos_cli.manifest import ManifestError, load_manifest, read_core_version, repo_root, validate_manifest


def cmd_validate(dirs: list[str]) -> int:
    core = read_core_version(repo_root())
    failed = False
    for raw in dirs:
        try:
            errors = validate_manifest(load_manifest(Path(raw)), core, set())
        except ManifestError as exc:
            errors = [str(exc)]
        for message in errors:
            print(f"{raw}: {message}", file=sys.stderr)
        failed = failed or bool(errors)
        if not errors:
            print(f"{raw}: hợp lệ")
    return 1 if failed else 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="dxos")
    sub = parser.add_subparsers(dest="command", required=True)
    validate = sub.add_parser("validate", help="Kiểm tra app.yaml của mini-app")
    validate.add_argument("dirs", nargs="+")
    args = parser.parse_args(argv)
    return cmd_validate(args.dirs)


if __name__ == "__main__":
    sys.exit(main())
