# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
import argparse
import os
import sys
import time
from pathlib import Path

import psycopg
import yaml

from dxos_cli import commands, store
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


def cmd_manifest_id(raw: str) -> int:
    """Print the id of a valid manifest (installed or not), for ./dxos; errors go to stderr."""
    try:
        data = load_manifest(Path(raw))
        errors = validate_manifest(data, read_core_version(repo_root()), set())
    except ManifestError as exc:
        errors = [str(exc)]
    for message in errors:
        print(f"{raw}: {message}", file=sys.stderr)
    if errors:
        return 1
    print(data["id"])
    return 0


def cmd_install(args) -> int:
    root = repo_root()
    try:
        if args.command == "prepare":
            print(f"Đã chuẩn bị {commands.prepare(root, Path(args.dir))}; chạy commit hoặc abort")
        elif args.command == "commit":
            commands.commit(root, args.id, not args.no_enable_all)
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


def cmd_store(args) -> int:
    """catalog-sync and the worker-* subcommands; stdout is one machine-readable line per result."""
    root = repo_root()
    try:
        with psycopg.connect(os.environ["DXOS_DB_URL"], autocommit=True) as conn:
            if args.command == "catalog-sync":
                for app_id in store.sync_catalog(conn, root / "miniapps", read_core_version(root)):
                    print(app_id)
            elif args.command == "worker-start":
                store.sync_catalog(conn, root / "miniapps", read_core_version(root))
                for job in store.fail_stale(conn):
                    # Only a half install is undone; a registered app's container serves other HTXs.
                    if job.action == "ENABLE" and not job.installed:
                        print(job.app_id)
            elif args.command == "worker-claim":
                deadline = time.monotonic() + args.wait
                while True:
                    store.heartbeat(conn)
                    if job := store.claim_known(conn):
                        print(f"{job.id}\t{job.action}\t{job.app_id}\t{job.htx_code}\t{int(job.installed)}")
                        break
                    if time.monotonic() >= deadline:
                        break
                    time.sleep(1)
            else:
                print(f"remaining={store.finish(conn, args.job_id, args.result == 'ok', args.message)}")
    except (LookupError, ManifestError, OSError, yaml.YAMLError, psycopg.Error) as exc:
        print(f"{args.command}: {exc}", file=sys.stderr)
        return 1
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="dxos")
    sub = parser.add_subparsers(dest="command", required=True)
    validate = sub.add_parser("validate", help="Kiểm tra app.yaml của mini-app")
    validate.add_argument("dirs", nargs="+")
    sub.add_parser("manifest-id", help="In id của manifest hợp lệ (dùng cho ./dxos)").add_argument("dir")
    sub.add_parser("gateway-sync", help="Ghép route của các app đã cài vào docker/runtime/gateway/apisix.yaml")
    sub.add_parser("prepare", help="Kiểm tra và chuẩn bị cài một mini-app (chưa đăng ký)").add_argument("dir")
    commit = sub.add_parser("commit", help="Đăng ký app đã chuẩn bị xong")
    commit.add_argument("id")
    commit.add_argument("--no-enable-all", action="store_true", help="Không bật app cho mọi HTX ('*')")
    sub.add_parser("catalog-sync", help="Đồng bộ miniapps/*/app.yaml vào kho ứng dụng")
    sub.add_parser("worker-start", help="Đồng bộ kho, đánh dấu lỗi yêu cầu dở; in id app cài dở")
    claim = sub.add_parser("worker-claim", help="Nhận yêu cầu cũ nhất; in một dòng hoặc không in gì")
    claim.add_argument("--wait", type=int, default=30, help="Số giây chờ yêu cầu")
    done = sub.add_parser("worker-finish", help="Đóng yêu cầu; in remaining=<số HTX còn bật>")
    done.add_argument("job_id")
    done.add_argument("result", choices=["ok", "fail"])
    done.add_argument("message", nargs="?")
    sub.add_parser("abort", help="Hoàn tác bản cài dở theo nhật ký").add_argument("id")
    remove = sub.add_parser("remove", help="Gỡ app; giữ dữ liệu trừ khi có --purge")
    remove.add_argument("id")
    remove.add_argument("--purge", action="store_true", help="Xoá cả schema, role và tệp env của app")
    sub.add_parser("list", help="Liệt kê app đã cài")
    args = parser.parse_args(argv)
    if args.command in ("prepare", "commit", "abort", "remove", "list"):
        return cmd_install(args)
    if args.command in ("catalog-sync", "worker-start", "worker-claim", "worker-finish"):
        return cmd_store(args)
    if args.command == "manifest-id":
        return cmd_manifest_id(args.dir)
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
