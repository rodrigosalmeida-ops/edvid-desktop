import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = mkdtempSync(path.join(tmpdir(), 'editai-style-layers-'));

try {
  execFileSync(process.execPath, [
    path.join(projectRoot, 'node_modules', 'typescript', 'bin', 'tsc'),
    path.join(projectRoot, 'src', 'style-layers.ts'),
    '--target', 'es2022', '--module', 'es2022', '--moduleResolution', 'bundler',
    '--skipLibCheck', '--outDir', outDir,
  ], { stdio: 'inherit' });

  const { STYLE_LAYERS, mergeStyleLayers } = await import(
    pathToFileURL(path.join(outDir, 'style-layers.js')).href
  );

  const previous = {
    width: 1080, height: 1920, fps: 30, durationSec: 60,
    editType: 'split',
    splits: [{ kind: 'video', src: 'imagens/a.mp4', start: 0, end: 4.8, position: 'top' }],
    camera: { enabled: true, zooms: [1, 1.14] },
    hook: { enabled: false, endSec: 4, style: 'realce', accent: '#ff5200', lines: [] },
    captions: { enabled: true, style: 'karaoke', accent: '#ff5200', fontSize: 61 },
    inserts: [{ src: 'b.png', start: 10, dur: 3 }],
    behind: [],
    animations: [{ kind: 'flash', start: 4.8 }, { kind: 'script', start: 20, label: 'sob medida' }],
    soundtrack: { enabled: false, file: 'trilha.mp3', volume: 0.2 },
  };

  const next = {
    ...previous,
    editType: 'limpa',
    splits: [],
    hook: { enabled: true, endSec: 4, style: 'outline', accent: '#00b5b7', lines: ['OLHA', 'ISSO'] },
    captions: { enabled: true, style: 'karaoke', accent: '#00b5b7', fontSize: 61 },
    animations: [{ kind: 'script', start: 20, label: 'sob medida' }],
    camera: { enabled: false, zooms: [1] },
  };

  const textOnly = mergeStyleLayers({ previous, next, layers: ['texto'] });
  assert.deepEqual(textOnly.splits, previous.splits, 'applying text must preserve existing split layout');
  assert.equal(textOnly.editType, 'split');
  assert.equal(textOnly.hook.style, 'outline');
  assert.deepEqual(textOnly.camera, previous.camera);
  assert.deepEqual(textOnly.animations, previous.animations);
  assert.equal(textOnly.captions.style, 'karaoke');
  assert.equal(textOnly.hook.accent, '#00b5b7');
  assert.equal(textOnly.captions.accent, '#00b5b7');

  const captionsOnly = mergeStyleLayers({ previous, next, layers: ['legendas'] });
  assert.equal(captionsOnly.hook.accent, '#00b5b7');
  assert.equal(captionsOnly.hook.style, 'realce');
  assert.equal(captionsOnly.hook.enabled, false);

  const effectsOnly = mergeStyleLayers({ previous, next, layers: ['efeitos'] });
  assert.deepEqual(effectsOnly.camera, next.camera);
  assert.deepEqual(effectsOnly.animations, next.animations);
  assert.deepEqual(effectsOnly.splits, previous.splits);

  const editOnly = mergeStyleLayers({ previous, next, layers: ['edicao'] });
  assert.deepEqual(editOnly.splits, next.splits);
  assert.equal(editOnly.editType, 'limpa');
  assert.deepEqual(editOnly.animations, next.animations, 'geometry changes must carry recalculated flashes');
  assert.equal(editOnly.hook.style, 'realce');
  assert.equal(editOnly.captions.accent, '#ff5200');

  assert.deepEqual(mergeStyleLayers({ previous, next, layers: STYLE_LAYERS }), next);

  const mediaFacts = mergeStyleLayers({
    previous,
    next: { ...next, width: 1920, height: 1080, durationSec: 42, inserts: [] },
    layers: ['legendas'],
  });
  assert.equal(mediaFacts.width, 1920);
  assert.equal(mediaFacts.height, 1080);
  assert.equal(mediaFacts.durationSec, 42);
  assert.deepEqual(mediaFacts.inserts, []);

  console.log('test:style-layers ok - isolated style application preserves unrelated edit-data.');
} finally {
  rmSync(outDir, { recursive: true, force: true });
}
