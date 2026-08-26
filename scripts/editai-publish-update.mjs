#!/usr/bin/env node
import { createReadStream } from 'node:fs';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { S3Client } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';

if (process.platform !== 'win32') {
  console.error('V1.0 publica atualização Squirrel apenas a partir do Windows.');
  process.exit(1);
}
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const accountId = process.env.EDITAI_R2_ACCOUNT_ID?.trim();
const accessKeyId = process.env.EDITAI_R2_ACCESS_KEY_ID?.trim();
const secretAccessKey = process.env.EDITAI_R2_SECRET_ACCESS_KEY?.trim();
const bucket = process.env.EDITAI_R2_BUCKET?.trim();
const baseUrl = process.env.EDITAI_UPDATE_BASE_URL?.trim().replace(/\/$/u, '');
if (!accountId || !accessKeyId || !secretAccessKey || !bucket || !baseUrl || !/^https:\/\//iu.test(baseUrl)) {
  console.error('Preencha EDITAI_R2_ACCOUNT_ID, EDITAI_R2_ACCESS_KEY_ID, EDITAI_R2_SECRET_ACCESS_KEY, EDITAI_R2_BUCKET e EDITAI_UPDATE_BASE_URL.');
  process.exit(1);
}
const version = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8')).version;
const dir = path.join(root, 'out', 'make', 'squirrel.windows', 'x64');
const entries = await readdir(dir).catch(() => null);
if (!entries) { console.error('Artefatos Squirrel ausentes. Rode o build release antes.'); process.exit(1); }
const releases = entries.find((name) => name === 'RELEASES');
const nupkgs = entries.filter((name) => name.endsWith('.nupkg'));
const setup = entries.find((name) => name.toLowerCase().endsWith('.exe'));
if (!releases || !nupkgs.length || !setup) { console.error(`Artefatos incompletos: ${entries.join(', ')}`); process.exit(1); }
const s3 = new S3Client({ region: 'auto', endpoint: `https://${accountId}.r2.cloudflarestorage.com`, credentials: { accessKeyId, secretAccessKey } });
async function put(key, file, type, cacheControl) {
  const size = (await stat(file)).size;
  console.log(`[EDIT AI] upload ${key} (${Math.round(size/1e6)} MB)`);
  await new Upload({ client: s3, params: { Bucket: bucket, Key: key, Body: createReadStream(file), ContentType: type, CacheControl: cacheControl }, partSize: 100*1024*1024, queueSize: 3 }).done();
}
for (const nupkg of nupkgs) await put(`win32/${nupkg}`, path.join(dir,nupkg), 'application/octet-stream', 'public, max-age=31536000, immutable');
await put('win32/RELEASES', path.join(dir,releases), 'application/octet-stream', 'no-cache, no-store, must-revalidate');
const setupPath = path.join(dir,setup);
await put(`EDIT-AI-Setup-${version}.exe`, setupPath, 'application/vnd.microsoft.portable-executable', 'public, max-age=31536000, immutable');
await put('EDIT-AI-Setup.exe', setupPath, 'application/vnd.microsoft.portable-executable', 'no-cache, no-store, must-revalidate');
console.log(`[EDIT AI] update feed Windows: ${baseUrl}/win32/RELEASES`);
console.log(`[EDIT AI] instalador estável: ${baseUrl}/EDIT-AI-Setup.exe`);
