// Publica um release OTA no bucket R2: envia o ZIP da versao corrente e o
// feed.json apontando para ele. Roda depois de "npm run make:signed".
//
// Upload pelo protocolo S3 do R2 (multipart): o wrangler limita objetos a
// 300 MiB e o ZIP do Edvid passa de 800 MB. As credenciais S3 sao derivadas
// do proprio API token, como documenta o R2: o Access Key ID e o id do token
// (obtido em /user/tokens/verify) e o Secret e o SHA-256 do valor do token.
//
// Credenciais vem do ambiente (signing.env via npm run publish:update):
//   EDVID_CF_ACCOUNT_ID   conta Cloudflare
//   EDVID_CF_API_TOKEN    token com permissao R2 Edit
//   EDVID_R2_BUCKET       nome do bucket
//   EDVID_UPDATE_BASE_URL URL publica do bucket (r2.dev ou dominio proprio)
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { S3Client } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const accountId = process.env.EDVID_CF_ACCOUNT_ID?.trim();
const apiToken = process.env.EDVID_CF_API_TOKEN?.trim();
const bucket = process.env.EDVID_R2_BUCKET?.trim();
const baseUrl = process.env.EDVID_UPDATE_BASE_URL?.trim()?.replace(/\/$/, '');

if (!accountId || !apiToken || !bucket || !baseUrl) {
  console.error('Preencha EDVID_CF_ACCOUNT_ID, EDVID_CF_API_TOKEN, EDVID_R2_BUCKET e EDVID_UPDATE_BASE_URL no signing.env.');
  process.exit(1);
}

// Sem argumento publica a versao do package.json; com argumento, a indicada
// (util quando o package ja avancou para a proxima release).
const version =
  process.argv[2]?.trim() ||
  JSON.parse(await readFile(path.join(projectRoot, 'package.json'), 'utf8')).version;

// A publicacao e da PLATAFORMA que fez o make: no macOS sobe o ZIP + feed.json
// (Squirrel.Mac, serverType json); no Windows sobe RELEASES + .nupkg + Setup
// sob win32/ (Squirrel.Windows le a pasta) e o instalador com nome estavel.
const isWindowsRelease = process.platform === 'win32';

const zipName = `Edvid-darwin-arm64-${version}.zip`;
const zipPath = path.join(projectRoot, 'out', 'make', 'zip', 'darwin', 'arm64', zipName);
let zipInfo = null;
let windowsFiles = null;
if (isWindowsRelease) {
  const squirrelDirectory = path.join(projectRoot, 'out', 'make', 'squirrel.windows', 'x64');
  const entries = await readdir(squirrelDirectory).catch(() => null);
  if (!entries) {
    console.error('Artefatos Squirrel nao encontrados em out/make/squirrel.windows/x64. Rode "npm run make" antes.');
    process.exit(1);
  }
  const releasesName = entries.find((name) => name === 'RELEASES');
  const nupkgs = entries.filter((name) => name.endsWith('.nupkg'));
  const setupExe = entries.find((name) => name.endsWith('.exe'));
  if (!releasesName || nupkgs.length === 0 || !setupExe) {
    console.error(`Artefatos Squirrel incompletos (${entries.join(', ')}).`);
    process.exit(1);
  }
  windowsFiles = { squirrelDirectory, releasesName, nupkgs, setupExe };
} else {
  zipInfo = await stat(zipPath).catch(() => null);
  if (!zipInfo) {
    console.error(`ZIP da versao ${version} nao encontrado. Rode "npm run make:signed" antes.`);
    process.exit(1);
  }
}

// Access Key ID = id do token (verify); Secret = SHA-256 do valor do token.
// A Cloudflare tem DOIS tipos de token e cada um valida num endereco:
// token de usuario (My Profile > API Tokens) responde em /user/tokens/verify,
// e token da CONTA (Manage Account > API Tokens) so responde em
// /accounts/<id>/tokens/verify. Verificar so o primeiro fazia um token de
// conta perfeitamente valido ser recusado com "Invalid API Token" — meia hora
// de investigacao no meio de um release, com a credencial certa na mao.
const verificar = (url) => fetch(url, { headers: { Authorization: `Bearer ${apiToken}` } });
let verify = await verificar('https://api.cloudflare.com/client/v4/user/tokens/verify');
let verifyBody = await verify.json().catch(() => null);
if (!verifyBody?.result?.id) {
  verify = await verificar(`https://api.cloudflare.com/client/v4/accounts/${accountId}/tokens/verify`);
  verifyBody = await verify.json().catch(() => null);
}
const tokenId = verifyBody?.result?.id;
if (!verify.ok || !tokenId) {
  // "verify falhou" nao dizia NADA: o token pode ter expirado, sido revogado
  // ou perdido a permissao de R2, e cada caso tem uma acao diferente. A
  // Cloudflare devolve o motivo — imprimir o motivo dela custa nada e evita
  // meia hora de adivinhacao no meio de um release.
  const motivo = (verifyBody?.errors ?? [])
    .map((erro) => `${erro?.code ?? '?'}: ${erro?.message ?? 'sem mensagem'}`)
    .join(' | ') || `HTTP ${verify.status}`;
  console.error(`Token do Cloudflare recusado — ${motivo}`);
  console.error('Crie um token novo em dash.cloudflare.com > Manage Account > API Tokens,');
  console.error('com permissao "R2 > Edit" na conta, e atualize EDVID_CF_API_TOKEN no signing.env.');
  console.error('O build assinado e notarizado ja esta pronto em out/make: e so repetir o publish.');
  process.exit(1);
}
const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: tokenId,
    secretAccessKey: createHash('sha256').update(apiToken).digest('hex'),
  },
});

async function putObject(key, filePath, contentType, size) {
  console.log(`Enviando ${key} (${Math.round(size / 1e6)} MB)...`);
  const upload = new Upload({
    client: s3,
    params: {
      Bucket: bucket,
      Key: key,
      Body: createReadStream(filePath),
      ContentType: contentType,
    },
    partSize: 100 * 1024 * 1024,
    queueSize: 3,
  });
  let lastPct = -10;
  upload.on('httpUploadProgress', (progress) => {
    if (!progress.loaded || !size) return;
    const pct = Math.floor((progress.loaded / size) * 100);
    if (pct >= lastPct + 10) {
      lastPct = pct;
      console.log(`  ${key}: ${pct}%`);
    }
  });
  await upload.done();
}

if (isWindowsRelease) {
  const { squirrelDirectory, releasesName, nupkgs, setupExe } = windowsFiles;
  // Os .nupkg primeiro: o RELEASES novo so pode apontar para pacotes ja
  // disponiveis (Squirrel.Windows le win32/RELEASES e baixa dali).
  for (const nupkg of nupkgs) {
    const nupkgPath = path.join(squirrelDirectory, nupkg);
    await putObject(`win32/${nupkg}`, nupkgPath, 'application/octet-stream', (await stat(nupkgPath)).size);
  }
  const releasesPath = path.join(squirrelDirectory, releasesName);
  await putObject('win32/RELEASES', releasesPath, 'application/octet-stream', (await stat(releasesPath)).size);
  // Instalador para alunos novos: versao arquivada + nome ESTAVEL para o
  // link de download da Creator Factory.
  const setupPath = path.join(squirrelDirectory, setupExe);
  const setupSize = (await stat(setupPath)).size;
  await putObject(`win32/Edvid-Setup-${version}.exe`, setupPath, 'application/octet-stream', setupSize);
  await putObject('EdvidSetup.exe', setupPath, 'application/octet-stream', setupSize);

  console.log(`\nRelease Windows ${version} publicado.`);
  console.log(`Atualizacao: ${baseUrl}/win32/RELEASES`);
  console.log(`Instalador: ${baseUrl}/EdvidSetup.exe`);
} else {
  const feed = {
    currentRelease: version,
    releases: [
      {
        version,
        updateTo: {
          version,
          name: version,
          url: `${baseUrl}/${zipName}`,
          pub_date: new Date().toISOString(),
        },
      },
    ],
  };
  const feedPath = path.join(projectRoot, 'out', 'make', 'zip', 'darwin', 'arm64', 'feed.json');
  await writeFile(feedPath, `${JSON.stringify(feed, null, 2)}\n`);

  // O ZIP primeiro: o feed novo so pode apontar para um arquivo ja disponivel.
  await putObject(zipName, zipPath, 'application/zip', zipInfo.size);
  const feedInfo = await stat(feedPath);
  await putObject('feed.json', feedPath, 'application/json', feedInfo.size);

  // Instalador para alunos novos: versao arquivada + nome ESTAVEL para a
  // pagina de download da Creator Factory (par do EdvidSetup.exe do Windows).
  const dmgName = `Edvid-${version}-arm64.dmg`;
  const dmgPath = path.join(projectRoot, 'out', 'make', dmgName);
  const dmgInfo = await stat(dmgPath).catch(() => null);
  if (!dmgInfo) {
    console.error(`DMG da versao ${version} nao encontrado em out/make. Rode "npm run make:signed" antes.`);
    process.exit(1);
  }
  await putObject(dmgName, dmgPath, 'application/x-apple-diskimage', dmgInfo.size);
  await putObject('Edvid.dmg', dmgPath, 'application/x-apple-diskimage', dmgInfo.size);

  console.log(`\nRelease ${version} publicado.`);
  console.log(`Feed: ${baseUrl}/feed.json`);
  console.log(`Instalador: ${baseUrl}/Edvid.dmg`);
}
