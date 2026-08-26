#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { S3Client, HeadObjectCommand } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const accountId = process.env.EDITAI_R2_ACCOUNT_ID?.trim();
const accessKeyId = process.env.EDITAI_R2_ACCESS_KEY_ID?.trim();
const secretAccessKey = process.env.EDITAI_R2_SECRET_ACCESS_KEY?.trim();
const bucket = process.env.EDITAI_R2_BUCKET?.trim();
const baseUrl = process.env.EDITAI_RUNTIME_PACK_BASE_URL?.trim().replace(/\/$/u, '');
if (!accountId || !accessKeyId || !secretAccessKey || !bucket || !baseUrl || !/^https:\/\//iu.test(baseUrl)) {
  console.error('Preencha EDITAI_R2_ACCOUNT_ID, EDITAI_R2_ACCESS_KEY_ID, EDITAI_R2_SECRET_ACCESS_KEY, EDITAI_R2_BUCKET e EDITAI_RUNTIME_PACK_BASE_URL.');
  process.exit(1);
}
const target = `${process.platform}-${process.arch}`;
const manifest = JSON.parse(await readFile(path.join(root, 'resources/runtime-manifest.json'), 'utf8'));
const key = createHash('sha256').update(JSON.stringify(manifest.runtimes)).digest('hex').slice(0, 12);
const file = `runtimes-${target}-${key}.tar.gz`;
const packPath = path.join(root, 'out', 'runtime-packs', file);
const shaPath = `${packPath}.sha256`;
const [packInfo, shaInfo] = await Promise.all([stat(packPath), stat(shaPath)]);
const expectedDigest = (await readFile(shaPath, 'utf8')).trim().split(/\s+/u)[0] ?? '';
if (!/^[a-f0-9]{64}$/iu.test(expectedDigest)) {
  console.error('Sidecar SHA-256 inválido.');
  process.exit(1);
}
async function hashFile(filename) {
  const hash = createHash('sha256');
  await new Promise((resolve, reject) => {
    const stream = createReadStream(filename);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', resolve);
  });
  return hash.digest('hex');
}
const actualDigest = await hashFile(packPath);
if (actualDigest !== expectedDigest.toLowerCase()) {
  console.error(`Runtime recusado: SHA-256 real ${actualDigest} difere do sidecar ${expectedDigest}.`);
  process.exit(1);
}
const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId, secretAccessKey },
});
async function upload(keyName, filePath, contentType, size) {
  const exists = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: keyName })).then(() => true).catch(() => false);
  if (exists) { console.log(`[EDIT AI] já existe: ${keyName}`); return; }
  console.log(`[EDIT AI] enviando ${keyName} (${Math.round(size / 1e6)} MB)`);
  await new Upload({ client: s3, params: { Bucket: bucket, Key: keyName, Body: createReadStream(filePath), ContentType: contentType, CacheControl: 'public, max-age=31536000, immutable' }, partSize: 100 * 1024 * 1024, queueSize: 3 }).done();
}
await upload(`runtimes/${file}`, packPath, 'application/gzip', packInfo.size);
await upload(`runtimes/${file}.sha256`, shaPath, 'text/plain', shaInfo.size);
console.log(`[EDIT AI] publicado: ${baseUrl}/${file}`);
