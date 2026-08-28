import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = mkdtempSync(path.join(tmpdir(), 'editai-visao-'));

try {
  execFileSync(process.execPath, [
    path.join(projectRoot, 'node_modules', 'typescript', 'bin', 'tsc'),
    path.join(projectRoot, 'src', 'media-vision.ts'),
    '--target', 'es2022', '--module', 'es2022', '--moduleResolution', 'bundler',
    '--skipLibCheck', '--outDir', outDir,
  ], { stdio: 'inherit' });
  const {
    frameArgs, precisaDescrever, VISION_MODEL, visionDescription,
    visionFingerprint, visionPrompt, visionRequestBody,
  } = await import(pathToFileURL(path.join(outDir, 'media-vision.js')).href);

  const corpo = visionRequestBody({ base64: 'AAAA', mime: 'image/jpeg', ehVideo: true });
  assert.deepEqual(corpo.reasoning, { enabled: false }, 'raciocínio precisa ficar desligado');
  assert.equal(corpo.model, VISION_MODEL);
  assert.ok(corpo.max_tokens > 0 && corpo.max_tokens <= 200);
  const partes = corpo.messages[0].content;
  assert.equal(partes[0].type, 'text');
  assert.match(partes[1].image_url.url, /^data:image\/jpeg;base64,AAAA$/u);

  assert.equal(
    visionDescription({ choices: [{ message: { content: '  "A man edits video."\n extra ' } }] }),
    'A man edits video.',
  );
  assert.equal(visionDescription({ choices: [{ message: { content: '' } }] }), null);
  assert.equal(visionDescription({}), null);
  assert.equal(visionDescription(null), null);

  const fp = visionFingerprint(1234, 99.7);
  assert.equal(fp, '1234:100');
  const jaTem = [{ arquivo: 'assets/a.mp4', descricao: 'x', fingerprint: fp }];
  assert.equal(precisaDescrever('assets/a.mp4', fp, jaTem), false);
  assert.equal(precisaDescrever('assets/a.mp4', '1234:200', jaTem), true);
  assert.equal(precisaDescrever('assets/b.mp4', fp, jaTem), true);

  const video = frameArgs({ entrada: 'a.mp4', saida: 'q.jpg', emSegundos: 3.5 });
  assert.equal(video[video.indexOf('-ss') + 1], '3.50');
  assert.ok(video.indexOf('-ss') < video.indexOf('-i'));
  assert.equal(video[video.indexOf('-frames:v') + 1], '1');
  assert.match(video[video.indexOf('-vf') + 1], /scale=512:-2/u);
  const imagem = frameArgs({ entrada: 'a.png', saida: 'q.jpg', emSegundos: null });
  assert.ok(!imagem.includes('-ss'));

  assert.match(visionPrompt(true), /ONE short English sentence/u);
  assert.match(visionPrompt(true), /video frame/u);
  assert.match(visionPrompt(false), /image/u);
  assert.match(visionPrompt(true), /No preamble/u);

  execFileSync(process.execPath, [
    path.join(projectRoot, 'node_modules', 'typescript', 'bin', 'tsc'),
    path.join(projectRoot, 'src', 'codec-support.ts'),
    path.join(projectRoot, 'src', 'remotion-ffmpeg.ts'),
    '--target', 'es2022', '--module', 'es2022', '--moduleResolution', 'bundler',
    '--skipLibCheck', '--outDir', outDir,
  ], { stdio: 'inherit' });
  const { precisaDeOutroFfmpeg, avisoDeCodecSemLeitor } =
    await import(pathToFileURL(path.join(outDir, 'codec-support.js')).href);
  const { remotionFfmpegCandidate } =
    await import(pathToFileURL(path.join(outDir, 'remotion-ffmpeg.js')).href);

  assert.equal(precisaDeOutroFfmpeg('av1'), true);
  assert.equal(precisaDeOutroFfmpeg('AV1'), true);
  for (const codec of ['h264', 'hevc', 'vp9', 'prores', 'mpeg4', '']) {
    assert.equal(precisaDeOutroFfmpeg(codec), false, `${codec || '(vazio)'} não deve desviar`);
  }
  assert.equal(precisaDeOutroFfmpeg(null), false);
  const aviso = avisoDeCodecSemLeitor('zoom.mp4', 'av1');
  assert.ok(aviso.includes('zoom.mp4') && aviso.includes('AV1'));
  assert.match(aviso, /motor de render do EDIT AI/u);

  const win = remotionFfmpegCandidate('C:\\EDIT-AI\\runtime\\remotion', 'win32', 'x64');
  assert.match(win.command.replaceAll('\\', '/'), /@remotion\/compositor-win32-x64\/ffmpeg\.exe$/u);
  assert.deepEqual(win.env, {}, 'Windows resolve DLLs ao lado do executável');

  const mac = remotionFfmpegCandidate('/tmp/remotion', 'darwin', 'arm64');
  assert.match(mac.command, /@remotion\/compositor-darwin-arm64\/ffmpeg$/u);
  assert.equal(mac.env.DYLD_LIBRARY_PATH, mac.libraryDirectory);

  const linux = remotionFfmpegCandidate('/tmp/remotion', 'linux', 'x64');
  assert.match(linux.command, /@remotion\/compositor-linux-x64\/ffmpeg$/u);
  assert.equal(linux.env.LD_LIBRARY_PATH, linux.libraryDirectory);

  console.log('test:media-vision ok — visão, cache, AV1 e runtime Remotion classificados.');
} finally {
  rmSync(outDir, { recursive: true, force: true });
}
