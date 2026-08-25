import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import {
  access,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const version = '7.1.5';
const target = 'win32-x64';
const archiveUrl = 'https://github.com/BtbN/FFmpeg-Builds/releases/download/autobuild-2026-06-30-13-34/ffmpeg-n7.1.5-1-g7d0e842004-win64-lgpl-shared-7.1.zip';
const archiveSha256 = '03a8003e245c08df4277d7b0adc50b93a97ddd4a3aaafea21943c4384df59895';
const wingetManifest = 'https://github.com/microsoft/winget-pkgs/blob/master/manifests/b/BtbN/FFmpeg/LGPL/Shared/7/1/7.1.5-20260630/BtbN.FFmpeg.LGPL.Shared.7.1.installer.yaml';
const cacheRoot = path.join(root, '.runtime-cache', 'ffmpeg-torchcodec', version);
const source = path.join(cacheRoot, 'source');
const sourceMetadataPath = path.join(cacheRoot, 'source-metadata.json');
const prefix = path.join(cacheRoot, 'build', target, 'install');
const binDirectory = path.join(prefix, 'bin');
const metadataPath = path.join(prefix, 'build-metadata.json');
const expectedDlls = [
  'avcodec-61.dll',
  'avdevice-61.dll',
  'avfilter-10.dll',
  'avformat-61.dll',
  'avutil-59.dll',
  'swresample-5.dll',
  'swscale-8.dll',
];

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function sha256(filePath) {
  const hash = createHash('sha256');
  await pipeline(createReadStream(filePath), hash);
  return hash.digest('hex');
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? root,
    env: options.env ?? process.env,
    encoding: 'utf8',
    stdio: options.capture ? 'pipe' : 'inherit',
    maxBuffer: 20 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = options.capture ? `\n${result.stdout}\n${result.stderr}` : '';
    throw new Error(`${command} exited with code ${result.status}.${detail}`);
  }
  return result.stdout ?? '';
}

async function findBin(rootDirectory) {
  const entries = await readdir(rootDirectory, { withFileTypes: true });
  const names = new Set(entries.filter((entry) => entry.isFile()).map((entry) => entry.name.toLowerCase()));
  if (expectedDlls.every((name) => names.has(name.toLowerCase()))) return rootDirectory;
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const found = await findBin(path.join(rootDirectory, entry.name));
    if (found) return found;
  }
  return null;
}

if (process.platform !== 'win32' || process.arch !== 'x64') {
  console.log(`[EDIT AI CI] prebuilt TorchCodec FFmpeg skipped on ${process.platform}-${process.arch}.`);
  process.exit(0);
}

// Preserve Edvid's provenance model: fetch the exact FFmpeg source and verify its
// official signature first. The prebuilt DLL archive is an optimization of the
// Windows build path, not a replacement for source/license provenance.
run(process.execPath, ['scripts/fetch-ffmpeg-source.mjs', version, 'ffmpeg-torchcodec']);
const sourceMetadata = JSON.parse(await readFile(sourceMetadataPath, 'utf8'));
if (!sourceMetadata.signatureVerified || sourceMetadata.version !== version) {
  throw new Error('[EDIT AI CI] signed FFmpeg source verification failed.');
}

const temporaryDirectory = await mkdtemp(path.join(tmpdir(), 'editai-ffmpeg-shared-'));
try {
  const archivePath = path.join(temporaryDirectory, 'ffmpeg-lgpl-shared-7.1.zip');
  const extractRoot = path.join(temporaryDirectory, 'extract');
  console.log(`[EDIT AI CI] downloading BtbN LGPL shared FFmpeg ${version}...`);
  const response = await fetch(archiveUrl, { redirect: 'follow' });
  if (!response.ok || !response.body) {
    throw new Error(`[EDIT AI CI] FFmpeg archive download failed: HTTP ${response.status}`);
  }
  await pipeline(Readable.fromWeb(response.body), createWriteStream(archivePath));
  const actualArchiveSha256 = await sha256(archivePath);
  if (actualArchiveSha256 !== archiveSha256) {
    throw new Error(
      `[EDIT AI CI] FFmpeg archive SHA-256 mismatch: expected ${archiveSha256}, got ${actualArchiveSha256}`,
    );
  }

  await mkdir(extractRoot, { recursive: true });
  run(
    'powershell.exe',
    [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      `Expand-Archive -LiteralPath '${archivePath.replaceAll("'", "''")}' -DestinationPath '${extractRoot.replaceAll("'", "''")}' -Force`,
    ],
  );

  const sharedBin = await findBin(extractRoot);
  if (!sharedBin) {
    throw new Error('[EDIT AI CI] expected FFmpeg 7 shared DLLs were not found in the verified archive.');
  }

  await rm(prefix, { recursive: true, force: true });
  await mkdir(binDirectory, { recursive: true });
  const entries = await readdir(sharedBin, { withFileTypes: true });
  const copiedDlls = [];
  for (const entry of entries) {
    if (!entry.isFile() || !/\.dll$/iu.test(entry.name)) continue;
    const from = path.join(sharedBin, entry.name);
    const to = path.join(binDirectory, entry.name);
    await cp(from, to);
    copiedDlls.push({
      name: entry.name,
      sha256: await sha256(to),
      bytes: (await stat(to)).size,
    });
  }
  for (const required of expectedDlls) {
    if (!copiedDlls.some((entry) => entry.name.toLowerCase() === required.toLowerCase())) {
      throw new Error(`[EDIT AI CI] required TorchCodec DLL missing: ${required}`);
    }
  }

  const licenseDirectory = path.join(prefix, 'licenses');
  await mkdir(licenseDirectory, { recursive: true });
  for (const license of ['LICENSE.md', 'COPYING.LGPLv2.1', 'COPYING.LGPLv3']) {
    await cp(path.join(source, license), path.join(licenseDirectory, license));
  }
  await writeFile(
    path.join(licenseDirectory, 'BTBN-PREBUILT-NOTICE.txt'),
    [
      'EDIT AI Windows TorchCodec FFmpeg runtime',
      '',
      `FFmpeg version: ${version}`,
      'Binary distribution: BtbN FFmpeg-Builds, Windows x64, LGPL shared 7.1 branch',
      `Archive: ${archiveUrl}`,
      `Archive SHA-256: ${archiveSha256}`,
      `Winget provenance manifest: ${wingetManifest}`,
      `Corresponding signed FFmpeg source: ${sourceMetadata.archiveUrl}`,
      `Source SHA-256: ${sourceMetadata.sha256}`,
      `Source signing fingerprint: ${sourceMetadata.signingFingerprint}`,
      '',
      'The FFmpeg license texts are included alongside this notice.',
      '',
    ].join('\n'),
    'utf8',
  );

  const libraries = Object.fromEntries(
    copiedDlls
      .filter((entry) => expectedDlls.some((name) => name.toLowerCase() === entry.name.toLowerCase()))
      .map((entry) => [entry.name, { sha256: entry.sha256, bytes: entry.bytes }]),
  );
  await writeFile(
    metadataPath,
    `${JSON.stringify(
      {
        target,
        version,
        winBuildRevision: 2,
        purpose: 'TorchCodec shared-library ABI compatibility',
        license: 'LGPL-2.1-or-later',
        distribution: 'BtbN LGPL shared Windows x64 prebuilt',
        archiveUrl,
        archiveSha256,
        wingetManifest,
        sourceUrl: sourceMetadata.archiveUrl,
        sourceSha256: sourceMetadata.sha256,
        signatureFingerprint: sourceMetadata.signingFingerprint,
        installedFiles: copiedDlls.map((entry) => entry.name).sort(),
        libraries,
        builtAt: new Date().toISOString(),
      },
      null,
      2,
    )}\n`,
    'utf8',
  );

  console.log(
    `[EDIT AI CI] verified prebuilt FFmpeg ${version} shared runtime staged (${copiedDlls.length} DLLs).`,
  );
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true });
}
