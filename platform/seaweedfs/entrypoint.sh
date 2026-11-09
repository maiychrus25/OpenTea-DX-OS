#!/bin/sh
# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
# Writes the S3 identity from MINIO_ACCESS_KEY/MINIO_SECRET_KEY, then starts SeaweedFS with S3 on 9000.
set -eu

die() { echo "seaweedfs: $*" >&2; exit 1; }
# An empty key or one starting with your_minio or change_me (any case) is a placeholder; the release override refuses those.
check() {
  [ "${DXOS_S3_REQUIRE_STRONG:-}" = "1" ] || return 0
  case "$(printf %s "$2" | tr 'A-Z' 'a-z')" in ""|your_minio*|change_me*) die "$1 is empty or a placeholder: set it in docker/.env.local";; esac
}
check MINIO_ACCESS_KEY "${MINIO_ACCESS_KEY:-}"
check MINIO_SECRET_KEY "${MINIO_SECRET_KEY:-}"

mkdir -p /etc/seaweedfs
cat > /etc/seaweedfs/s3.json <<JSON
{"identities":[{"name":"dxos","credentials":[{"accessKey":"${MINIO_ACCESS_KEY}","secretKey":"${MINIO_SECRET_KEY}"}],"actions":["Admin","Read","Write","List","Tagging"]}]}
JSON
# volume.max: each bucket (collection) pre-grows 7 volumes; the default cap of 8 fits only one bucket.
exec weed server -dir=/data -volume.max=100 -s3 -s3.port=9000 -s3.config=/etc/seaweedfs/s3.json
