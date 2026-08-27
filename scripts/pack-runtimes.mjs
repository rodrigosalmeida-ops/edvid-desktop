// Gera o runtime pack sob demanda: um tar.gz de resources/runtimes/<plat>
// nomeado pela chave do manifest (sha256 de manifest.runtimes, 12 hex) e o
// arquivo .sha256 de integridade. A MESMA chave e computada pelo aplicativo
// em src/runtime.ts (runtimePackKey) — mudou la, mude aqui.
//
// Saida: out/runtime-packs/runtimes-<plat>-<arch>-<chave>.tar.gz (+ .sha256)
import { createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { finished } from 'node:stream/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const platformKey = `${process.platform}-${process.arch}`;
const runtimesDirectory = path.join(projectRoot, 'resources', 'runtimes', platformKey);
if (!(await stat(runtimesDirectory).catch(() => null))) {
  console.error(`resources/runtimes/${platformKey} nao existe. Rode os stage:* antes (npm run make ja faz).`);
  process.exit(1);
}

const manifest = JSON.parse(
  await readFile(path.join(projectRoot, 'resources', 'runtime-manifest.json'), 'utf8'),
);
const key = createHash('sha256')
  .update(JSON.stringify(manifest.runtimes))
  .digest('hex')
  .slice(0, 12);

const outDirectory = path.join(projectRoot, 'out', 'runtime-packs');
await mkdir(outDirectory, { recursive: true });
const packName = `runtimes-${platformKey}-${key}.tar.gz`;
const packPath = path.join(outDirectory, packName);

console.log(`Empacotando ${platformKey} (chave ${key})...`);
// IMPORTANTE: nao passe packPath para `tar -czf <arquivo>`. O bsdtar do
// Windows pode confundir IDs de arquivo em arvores enormes (PyTorch tem
// milhares de entradas) e marcar um arquivo-fonte legitimo como "archive
// itself", pulando-o silenciosamente. Foi assim que
// torch/ao/nn/sparse/quantized/utils.py ficou fora do runtime comercial e o
// WhisperX quebrou no E2E. Escrever o tar em stdout elimina completamente a
// comparacao do arquivo de saida contra as entradas da arvore.
await rm(packPath, { force: true });
const output = createWriteStream(packPath, { flags: 'wx' });
const child = spawn(
  'tar',
  ['-czf', '-', '-C', path.join(projectRoot, 'resources', 'runtimes'), platformKey],
  { stdio: ['ignore', 'pipe', 'inherit'] },
);
child.stdout.pipe(output);
try {
  const [exitCode] = await Promise.all([
    new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('close', resolve);
    }),
    finished(output),
  ]);
  if (exitCode !== 0) throw new Error(`tar terminou com exit ${exitCode ?? 'desconhecido'}`);
} catch (error) {
  child.kill();
  output.destroy();
  await rm(packPath, { force: true }).catch(() => {});
  throw error;
}

// Gate de integridade estrutural. O SHA-256 prova que o download nao mudou,
// mas nao prova que o arquivo foi criado completo. Quando o runtime contem
// WhisperX, confirme no proprio tar as duas entradas que detectam exatamente
// a corrupcao observada no Windows comercial antes de publicar o pack.
const criticalEntries = [
  `${platformKey}/python-whisperx/python/Lib/site-packages/whisperx/__init__.py`,
  `${platformKey}/python-whisperx/python/Lib/site-packages/torch/ao/nn/sparse/quantized/utils.py`,
];
for (const entry of criticalEntries) {
  const sourceEntry = path.join(runtimesDirectory, ...entry.slice(platformKey.length + 1).split('/'));
  if (!(await stat(sourceEntry).catch(() => null))) continue;
  const check = spawnSync('tar', ['-tzf', packPath, entry], { stdio: 'ignore' });
  if (check.status !== 0) {
    await rm(packPath, { force: true });
    throw new Error(`runtime pack incompleto: entrada critica ausente: ${entry}`);
  }
}

const digest = createHash('sha256');
await new Promise((resolve, reject) => {
  const stream = createReadStream(packPath);
  stream.on('data', (chunk) => digest.update(chunk));
  stream.on('end', resolve);
  stream.on('error', reject);
});
const sha = digest.digest('hex');
await writeFile(`${packPath}.sha256`, `${sha}  ${packName}\n`);

const info = await stat(packPath);
console.log(`ok: ${packName} (${Math.round(info.size / 1e6)} MB)`);
console.log(`sha256: ${sha}`);
