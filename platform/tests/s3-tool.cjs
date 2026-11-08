// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers
// Tiny S3 helper for smoke tests (same `minio` client as apps/web).
// Run: NODE_PATH=apps/web/node_modules node platform/tests/s3-tool.cjs put|exists|rm <bucket> <key> [file]
const { Client } = require('minio');

const client = new Client({
  endPoint: process.env.S3_HOST || 'localhost',
  port: 9000,
  useSSL: false,
  accessKey: process.env.MINIO_ACCESS_KEY || 'your_minio_access_key',
  secretKey: process.env.MINIO_SECRET_KEY || 'your_minio_secret_key',
});

const [cmd, bucket, key, file, dstKey] = process.argv.slice(2);

(async () => {
  if (cmd === 'put') {
    if (!(await client.bucketExists(bucket))) await client.makeBucket(bucket, 'us-east-1');
    await client.fPutObject(bucket, key, file);
  } else if (cmd === 'exists') {
    if (!(await client.bucketExists(bucket))) process.exit(1);
    try {
      await client.statObject(bucket, key);
    } catch (err) {
      if (err.code === 'NotFound' || err.code === 'NoSuchKey') process.exit(1);
      throw err;
    }
  } else if (cmd === 'rm') {
    await client.removeObject(bucket, key);
  } else if (cmd === 'copy-mismatch') {
    // exit 0 if the copy with a wrong match_etag was rejected, 1 if it (wrongly) succeeded
    const { CopyConditions } = require('minio');
    const cond = new CopyConditions();
    cond.setMatchETag('00000000000000000000000000000000');
    try {
      await client.copyObject(file, dstKey, `/${bucket}/${key}`, cond);
    } catch (err) {
      process.exit(0);
    }
    process.exit(1);
  } else {
    console.error('usage: put|exists|rm <bucket> <key> [file]');
    process.exit(2);
  }
})().catch((err) => {
  console.error(`s3-tool ${cmd} failed: ${err.message}`);
  process.exit(2);
});
