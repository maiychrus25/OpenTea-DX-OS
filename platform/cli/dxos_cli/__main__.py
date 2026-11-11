# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
import argparse
import sys
from pathlib import Path

import psycopg
import yaml

from dxos_cli import commands
from dxos_cli.gateway import GatewayError, sync_gateway
from dxos_cli.manifest import ManifestError, load_manifest, read_core_version, repo_root, validate_manifest
from dxos_cli.steps import InstallError


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


def cmd_install(args) -> int:
    root = repo_root()
    try:
        if args.command == "prepare":
            print(f"Đã chuẩn bị {commands.prepare(root, Path(args.dir))}; chạy commit hoặc abort")
        elif args.command == "commit":
            commands.commit(root, args.id)
            print(f"Đã đăng ký {args.id}")
        elif args.command == "abort":
            commands.abort(root, args.id)
            print(f"Đã hoàn tác bản cài dở của {args.id}")
        elif args.command == "remove":
            commands.remove(root, args.id, args.purge)
            print(f"Đã gỡ {args.id}" + (" và xoá dữ liệu" if args.purge else ""))
        else:
            print("\n".join(commands.list_lines()) or "Chưa cài app nào")
    except (InstallError, ManifestError, GatewayError, OSError, yaml.YAMLError, psycopg.Error) as exc:
        print(f"{args.command}: {exc}", file=sys.stderr)
        return 1
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="dxos")
    sub = parser.add_subparsers(dest="command", required=True)
    validate = sub.add_parser("validate", help="Kiểm tra app.yaml của mini-app")
    validate.add_argument("dirs", nargs="+")
    sub.add_parser("gateway-sync", help="Ghép route của các app đã cài vào docker/runtime/gateway/apisix.yaml")
    sub.add_parser("prepare", help="Kiểm tra và chuẩn bị cài một mini-app (chưa đăng ký)").add_argument("dir")
    sub.add_parser("commit", help="Đăng ký app đã chuẩn bị xong").add_argument("id")
    sub.add_parser("abort", help="Hoàn tác bản cài dở theo nhật ký").add_argument("id")
    remove = sub.add_parser("remove", help="Gỡ app; giữ dữ liệu trừ khi có --purge")
    remove.add_argument("id")
    remove.add_argument("--purge", action="store_true", help="Xoá cả schema, role và tệp env của app")
    sub.add_parser("list", help="Liệt kê app đã cài")
    args = parser.parse_args(argv)
    if args.command in ("prepare", "commit", "abort", "remove", "list"):
        return cmd_install(args)
    if args.command == "gateway-sync":
        try:
            sync_gateway(repo_root())
        except (GatewayError, OSError, yaml.YAMLError) as exc:
            print(f"gateway-sync: {exc}", file=sys.stderr)
            return 1
        print("Đã ghi docker/runtime/gateway/apisix.yaml")
        return 0
    return cmd_validate(args.dirs)


if __name__ == "__main__":
    sys.exit(main())
