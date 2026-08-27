#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runtimeBaseUrl = process.env.EDITAI_RUNTIME_PACK_BASE_URL?.trim().replace(/\/$/u, '');
const updateBaseUrl = process.env.EDITAI_UPDATE_BASE_URL?.trim().replace(/\/$/u, '');
const windowsUpdateBaseUrl = process.env.EDITAI_WINDOWS_UPDATE_BASE_URL?.trim().replace(/\/$/u, '');
if (!runtimeBaseUrl || !/^https:\/\//iu.test(runtimeBaseUrl)) {
  console.error('Defina EDITAI_RUNTIME_PACK_BASE_URL HTTPS (ex.: https://cdn.suaempresa.com/runtimes).');
  process.exit(1);
}
if (!updateBaseUrl || !/^https:\/\//iu.test(updateBaseUrl)) {
  console.error('Defina EDITAI_UPDATE_BASE_URL HTTPS (ex.: https://cdn.suaempresa.com).');
  process.exit(1);
}
const target = `${process.platform}-${process.arch}`;
const manifest = JSON.parse(await readFile(path.join(root, 'resources/runtime-manifest.json'), 'utf8'));
const key = createHash('sha256').update(JSON.stringify(manifest.runtimes)).digest('hex').slice(0, 12);
const file = `runtimes-${target}-${key}.tar.gz`;
const packPath = path.join(root, 'out', 'runtime-packs', file);
const shaPath = `${packPath}.sha256`;
const shaText = await readFile(shaPath, 'utf8').catch(() => '');
const sha256 = shaText.trim().split(/\s+/u)[0] ?? '';
if (!/^[a-f0-9]{64}$/iu.test(sha256)) {
  console.error(`${shaPath} ausente/inválido. Rode npm run pack:runtimes primeiro.`);
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
const actualDigest = await hashFile(packPath).catch(() => '');
if (actualDigest !== sha256.toLowerCase()) {
  console.error(`SHA-256 do runtime não confere: sidecar=${sha256} real=${actualDigest || 'indisponível'}`);
  process.exit(1);
}
const output = {
  schemaVersion: 1,
  runtimePackBaseUrl: runtimeBaseUrl,
  updateFeedUrl: `${updateBaseUrl}/feed.json`,
  windowsUpdateBaseUrl: windowsUpdateBaseUrl || `${updateBaseUrl}/win32`,
  runtimePacks: { [target]: { key, file, sha256: sha256.toLowerCase() } },
};
await writeFile(path.join(root, 'resources/editai-distribution.json'), `${JSON.stringify(output, null, 2)}\n`);
console.log(`[EDIT AI] runtime: ${runtimeBaseUrl}/${file}`);
console.log(`[EDIT AI] update feed: ${output.updateFeedUrl}`);
console.log(`[EDIT AI] update Windows: ${output.windowsUpdateBaseUrl}`);
console.log(`[EDIT AI] sha256 embutido: ${sha256}`);
