// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers
// S3 compatibility probe using the same `minio` client as apps/web.
// Run: NODE_PATH=apps/web/node_modules node platform/tests/s3-compat.cjs
const { Client } = require('minio');

const BUCKET = 'dxos-smoke';
const KEY = 'probe.txt';
const BODY = 'hello-dxos';

const client = new Client({
  endPoint: process.env.S3_HOST || 'localhost',
  port: 9000,
  useSSL: false,
  accessKey: process.env.MINIO_ACCESS_KEY || 'your_minio_access_key',
  secretKey: process.env.MINIO_SECRET_KEY || 'your_minio_secret_key',
});

async function step(name, fn) {
  try {
    return await fn();
  } catch (err) {
    console.error(`FAIL step "${name}": ${err.message}`);
    process.exit(1);
  }
}

(async () => {
  await step('makeBucket', async () => {
    if (!(await client.bucketExists(BUCKET))) await client.makeBucket(BUCKET, 'us-east-1');
  });
  const putUrl = await step('presignedPutObject', () => client.presignedPutObject(BUCKET, KEY, 60));
  await step('PUT', async () => {
    const res = await fetch(putUrl, { method: 'PUT', body: BODY });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  });
  const getUrl = await step('presignedGetObject', () => client.presignedGetObject(BUCKET, KEY, 60));
  const text = await step('GET', async () => {
    const res = await fetch(getUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.text();
  });
  if (text !== BODY) {
    console.error(`FAIL step "compare": got '${text}'`);
    process.exit(1);
  }
  console.log('s3 ok');
})();
