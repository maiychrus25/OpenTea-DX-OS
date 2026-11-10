// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

/** MINIO_ENDPOINT as `host` or `host:port` (docker/.env.local.example uses `minio:9000`); the port defaults to 9000. */
export function minioEndpoint(value = process.env.MINIO_ENDPOINT || 'minio'): { host: string; port: number } {
  const [host, port] = value.split(':')
  return { host, port: Number(port) || 9000 }
}
