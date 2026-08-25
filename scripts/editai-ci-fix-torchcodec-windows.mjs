import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.join(root, 'scripts', 'build-ffmpeg-torchcodec.mjs');
let source = (await readFile(target, 'utf8')).replaceAll('\r\n', '\n');

function replaceRequired(before, after, label) {
  if (!source.includes(before)) {
    throw new Error(`[EDIT AI CI] Anchor missing: ${label}`);
  }
  source = source.replace(before, after);
}

replaceRequired(
  '  const winBuildRevision = 2;',
  '  const winBuildRevision = 3;',
  'Windows TorchCodec build revision',
);

replaceRequired(
  "  await mkdir(buildDirectory, { recursive: true });\n\n  const winConfigureFlags = [",
  "  await mkdir(buildDirectory, { recursive: true });\n  // Build from a verified source COPY. Out-of-tree FFmpeg configure writes an\n  // absolute MSYS /d/... source include into Makefile; a native/MinGW make can\n  // then fail to resolve it on hosted Windows runners. An in-tree build keeps\n  // SRC_PATH local while preserving the signed source tree untouched.\n  await cp(source, buildDirectory, { recursive: true });\n\n  const winConfigureFlags = [",
  'copy verified FFmpeg source into build tree',
);

replaceRequired(
  '    `"${posix(source)}/configure" ${winConfigureFlags.map((flag) => `"${flag}"`).join(\' \')}`,',
  '    `"./configure" ${winConfigureFlags.map((flag) => `"${flag}"`).join(\' \')}`,',
  'in-tree configure invocation',
);

replaceRequired(
  '  runBash(`make -j${jobs}`, buildDirectory);\n  runBash(\'make install\', buildDirectory);',
  '  runBash(`/usr/bin/make.exe -j${jobs}`, buildDirectory);\n  runBash(\'/usr/bin/make.exe install\', buildDirectory);',
  'MSYS2 make invocation',
);

await writeFile(target, source, 'utf8');
console.log('[EDIT AI CI] TorchCodec Windows build path patched for hosted runner.');
