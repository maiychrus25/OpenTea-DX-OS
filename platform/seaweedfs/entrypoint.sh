#!/bin/sh
# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
# Writes the S3 identity from MINIO_ACCESS_KEY/MINIO_SECRET_KEY, then starts SeaweedFS with S3 on 9000.
set -eu
mkdir -p /etc/seaweedfs
cat > /etc/seaweedfs/s3.json <<JSON
{"identities":[{"name":"dxos","credentials":[{"accessKey":"${MINIO_ACCESS_KEY}","secretKey":"${MINIO_SECRET_KEY}"}],"actions":["Admin","Read","Write","List","Tagging"]}]}
JSON
# volume.max: each bucket (collection) pre-grows 7 volumes; the default cap of 8 fits only one bucket.
exec weed server -dir=/data -volume.max=100 -s3 -s3.port=9000 -s3.config=/etc/seaweedfs/s3.json
