import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = mkdtempSync(path.join(tmpdir(), 'editai-playback-speed-'));

try {
  execFileSync(process.execPath, [
    path.join(root, 'node_modules', 'typescript', 'bin', 'tsc'),
    path.join(root, 'src', 'playback-speed.ts'),
    '--target', 'es2022',
    '--module', 'es2022',
    '--moduleResolution', 'bundler',
    '--skipLibCheck',
    '--outDir', out,
  ], { stdio: 'inherit' });

  const {
    REVIEW_SPEEDS,
    isReviewSpeed,
    normalizeReviewSpeed,
    playbackRateForReview,
    applyPlaybackRate,
  } = await import(pathToFileURL(path.join(out, 'playback-speed.js')).href);

  assert.deepEqual(REVIEW_SPEEDS, [0.25, 0.5, 1, 1.5, 2, 3, 4]);
  assert.equal(isReviewSpeed(0.25), true);
  assert.equal(isReviewSpeed(4), true);
  assert.equal(isReviewSpeed(0.75), false);

  assert.equal(normalizeReviewSpeed(undefined), 1);
  assert.equal(normalizeReviewSpeed(0.4), 0.5);
  assert.equal(normalizeReviewSpeed(1.7), 1.5);
  assert.equal(normalizeReviewSpeed(3.7), 4);

  assert.equal(playbackRateForReview(1, 2), 2);
  assert.equal(playbackRateForReview(0.5, 2), 1, 'revisão multiplica a velocidade criativa do segmento');
  assert.equal(playbackRateForReview(Number.NaN, 0.5), 0.5);

  const media = { playbackRate: 1, defaultPlaybackRate: 1 };
  const rate = applyPlaybackRate(media, 0.5, 4);
  assert.equal(rate, 2);
  assert.equal(media.playbackRate, 2);
  assert.equal(media.defaultPlaybackRate, 2, 'defaultPlaybackRate protege a taxa quando src muda');

  console.log('test:playback-speed ok — revisão 0,25x–4x é separada do tempo do conteúdo e sobrevive à troca de src.');
} finally {
  rmSync(out, { recursive: true, force: true });
}
