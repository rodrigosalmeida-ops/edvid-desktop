import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = mkdtempSync(path.join(tmpdir(), 'editai-caption-sync-build-'));
const project = mkdtempSync(path.join(tmpdir(), 'editai-caption-project-'));

try {
  execFileSync(process.execPath, [
    path.join(root, 'node_modules', 'typescript', 'bin', 'tsc'),
    path.join(root, 'src', 'caption-edit.ts'),
    path.join(root, 'src', 'caption-sync.ts'),
    '--target', 'es2022', '--module', 'es2022', '--moduleResolution', 'bundler',
    '--esModuleInterop', '--skipLibCheck', '--outDir', out,
  ], { stdio: 'inherit' });

  const mod = await import(pathToFileURL(path.join(out, 'caption-sync.js')).href);
  const paths = mod.captionSyncPaths(project);
  mkdirSync(path.dirname(paths.captions), { recursive: true });
  writeFileSync(paths.captions, JSON.stringify([
    { text: 'A', startMs: 100, endMs: 180, timestampMs: 140, confidence: 0.9 },
    { text: 'gopro', startMs: 200, endMs: 450, timestampMs: 325, confidence: 0.8 },
    { text: 'chegou.', startMs: 500, endMs: 900, timestampMs: 700, confidence: 0.95 },
  ], null, 2));

  const before = await mod.readEditableCaptionText(project);
  assert.equal(before.texto, 'A gopro chegou.');
  assert.equal(before.palavras, 3);

  const result = await mod.writeSynchronizedCaptionText(project, 'A GoPro chegou.');
  assert.equal(result.palavras, 3);

  const captions = JSON.parse(readFileSync(paths.captions, 'utf8'));
  const cut = JSON.parse(readFileSync(paths.cut, 'utf8'));
  const cues = JSON.parse(readFileSync(paths.cues, 'utf8'));

  assert.deepEqual(captions.map((p) => p.text), ['A', 'GoPro', 'chegou.']);
  assert.deepEqual(cut.words.map((p) => p.text), ['A', 'GoPro', 'chegou.']);
  assert.deepEqual(cues.map((p) => p.text), ['A', 'GoPro', 'chegou.']);
  assert.equal(captions[1].startMs, 200, 'troca 1:1 preserva o timing do WhisperX');
  assert.equal(captions[1].endMs, 450);
  assert.equal(captions[1].confidence, 0.8, 'campos extras do WhisperX sobrevivem');

  console.log('test:caption-sync ok — captions, cut e cues permanecem sincronizados.');
} finally {
  rmSync(out, { recursive: true, force: true });
  rmSync(project, { recursive: true, force: true });
}
