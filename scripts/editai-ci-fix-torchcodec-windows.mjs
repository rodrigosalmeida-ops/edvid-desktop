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
  '  const winBuildRevision = 4;',
  'Windows TorchCodec build revision',
);

replaceRequired(
  "  await mkdir(buildDirectory, { recursive: true });\n\n  const winConfigureFlags = [",
  "  await mkdir(buildDirectory, { recursive: true });\n  // Build from a verified source COPY. Out-of-tree FFmpeg configure writes an\n  // absolute MSYS /d/... source include into Makefile; the hosted Windows\n  // runner can then fail to resolve it. An in-tree build keeps SRC_PATH local\n  // while preserving the signed source tree untouched.\n  await cp(source, buildDirectory, { recursive: true });\n\n  const winConfigureFlags = [",
  'copy verified FFmpeg source into build tree',
);

replaceRequired(
  '    `"${posix(source)}/configure" ${winConfigureFlags.map((flag) => `"${flag}"`).join(\' \')}`,',
  '    `"./configure" ${winConfigureFlags.map((flag) => `"${flag}"`).join(\' \')}`,',
  'in-tree configure invocation',
);

replaceRequired(
  "    '--disable-network',\n    // Sem isso as DLLs dependem de libgcc_s_seh-1.dll do mingw e o\n",
  "    '--disable-network',\n    // TorchCodec/WhisperX needs the shared FFmpeg ABI plus decode/demux support,\n    // not every encoder/muxer/filter shipped by FFmpeg. Keeping every component\n    // enabled makes Windows makedef receive a command line larger than the native\n    // CreateProcess limit while generating avcodec-61.def. Bound the component\n    // set to common creator-media formats used for transcription and preview.\n    '--disable-encoders',\n    '--disable-muxers',\n    '--disable-filters',\n    '--disable-devices',\n    '--disable-bsfs',\n    '--disable-decoders',\n    '--disable-demuxers',\n    '--disable-parsers',\n    '--enable-decoder=aac',\n    '--enable-decoder=alac',\n    '--enable-decoder=mp3',\n    '--enable-decoder=flac',\n    '--enable-decoder=opus',\n    '--enable-decoder=vorbis',\n    '--enable-decoder=ac3',\n    '--enable-decoder=eac3',\n    '--enable-decoder=pcm_alaw',\n    '--enable-decoder=pcm_mulaw',\n    '--enable-decoder=pcm_f32le',\n    '--enable-decoder=pcm_f64le',\n    '--enable-decoder=pcm_s16le',\n    '--enable-decoder=pcm_s24le',\n    '--enable-decoder=pcm_s32le',\n    '--enable-decoder=pcm_u8',\n    '--enable-decoder=h264',\n    '--enable-decoder=hevc',\n    '--enable-decoder=mpeg4',\n    '--enable-decoder=mjpeg',\n    '--enable-decoder=vp8',\n    '--enable-decoder=vp9',\n    '--enable-decoder=av1',\n    '--enable-demuxer=mov',\n    '--enable-demuxer=matroska',\n    '--enable-demuxer=wav',\n    '--enable-demuxer=mp3',\n    '--enable-demuxer=flac',\n    '--enable-demuxer=ogg',\n    '--enable-demuxer=aac',\n    '--enable-demuxer=mpegts',\n    '--enable-demuxer=mpegps',\n    '--enable-demuxer=avi',\n    '--enable-demuxer=flv',\n    '--enable-demuxer=caf',\n    '--enable-demuxer=aiff',\n    '--enable-parser=aac',\n    '--enable-parser=ac3',\n    '--enable-parser=flac',\n    '--enable-parser=mpegaudio',\n    '--enable-parser=opus',\n    '--enable-parser=vorbis',\n    '--enable-parser=h264',\n    '--enable-parser=hevc',\n    '--enable-parser=mpeg4video',\n    '--enable-parser=mjpeg',\n    '--enable-parser=av1',\n    '--enable-parser=vp8',\n    '--enable-parser=vp9',\n    // Sem isso as DLLs dependem de libgcc_s_seh-1.dll do mingw e o\n",
  'bounded TorchCodec FFmpeg component set',
);

// Keep the original `make` resolution. It already exists on windows-latest;
// the earlier failure came from the out-of-tree /d/... source path, not from
// the make executable itself.

await writeFile(target, source, 'utf8');
console.log('[EDIT AI CI] TorchCodec Windows build path/component set patched for hosted runner.');
