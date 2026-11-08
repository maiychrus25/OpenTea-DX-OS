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
  console.log('ok presigned PUT/GET');

  // Same call shapes as minio-document.adapter.ts / minio-storage.adapter.ts.
  const readStream = (stream) =>
    new Promise((resolve, reject) => {
      const chunks = [];
      stream.on('data', (c) => chunks.push(Buffer.from(c)));
      stream.on('end', () => resolve(Buffer.concat(chunks).toString()));
      stream.on('error', reject);
    });
  const folderKey = 'probe-folder/note.txt';
  const buf = Buffer.from(BODY, 'utf-8');

  await step('putObject with metadata', () =>
    client.putObject(BUCKET, folderKey, buf, buf.length, {
      'Content-Type': 'text/plain',
      'X-Amz-Meta-Probe': 'dxos',
    }),
  );
  const stat = await step('statObject', () => client.statObject(BUCKET, folderKey));
  if (stat.metaData['content-type'] !== 'text/plain' || stat.metaData['probe'] !== 'dxos') {
    console.error(`FAIL step "metadata round-trip": ${JSON.stringify(stat.metaData)}`);
    process.exit(1);
  }
  console.log('ok putObject metadata round-trip');

  const got = await step('getObject', async () => readStream(await client.getObject(BUCKET, folderKey)));
  if (got !== BODY) {
    console.error(`FAIL step "getObject": got '${got}'`);
    process.exit(1);
  }
  console.log('ok getObject');

  // listObjectsV2(bucket, prefix, recursive=false): folder at root, file under prefix.
  const listed = (prefix) =>
    new Promise((resolve, reject) => {
      const items = [];
      const s = client.listObjectsV2(BUCKET, prefix, false);
      s.on('data', (o) => items.push(o));
      s.on('end', () => resolve(items));
      s.on('error', reject);
    });
  const root = await step('listObjectsV2 root', () => listed(''));
  if (!root.some((o) => o.prefix === 'probe-folder/')) {
    console.error(`FAIL step "listObjectsV2 root": no pseudo-folder in ${JSON.stringify(root)}`);
    process.exit(1);
  }
  const inFolder = await step('listObjectsV2 prefix', () => listed('probe-folder/'));
  if (!inFolder.some((o) => o.name === folderKey && o.size === buf.length)) {
    console.error(`FAIL step "listObjectsV2 prefix": ${JSON.stringify(inFolder)}`);
    process.exit(1);
  }
  console.log('ok listObjectsV2');

  const dispUrl = await step('presignedGetObject reqParams', () =>
    client.presignedGetObject(BUCKET, folderKey, 60, {
      'response-content-disposition': 'attachment; filename="probe.txt"',
    }),
  );
  const dispRes = await step('GET with content-disposition', async () => {
    const res = await fetch(dispUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return { body: await res.text(), cd: res.headers.get('content-disposition') || '' };
  });
  if (dispRes.body !== BODY || !dispRes.cd.includes('probe.txt')) {
    console.error(`FAIL step "content-disposition": body='${dispRes.body}' header='${dispRes.cd}'`);
    process.exit(1);
  }
  console.log('ok presignedGetObject response-content-disposition');
  console.log('s3 ok');
})();
