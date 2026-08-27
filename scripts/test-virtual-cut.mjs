// Teste do CORTE VIRTUAL (0.38.0) — a edição inteira ao vivo.
//
// O contrato: remoções pendentes na timeline viram janelas sobre o cut.mp4
// atual e TODOS os dados da composição são remapeados para o tempo novo. O
// mesmo módulo roda na prévia (renderer) e na aplicação real dos cortes
// (main, remapPhase2DataAfterCut) — se a conta divergir, a prévia mente.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = mkdtempSync(path.join(tmpdir(), 'edvid-virtual-'));

try {
  execFileSync(process.execPath, [
    path.join(projectRoot, 'node_modules', 'typescript', 'bin', 'tsc'),
    path.join(projectRoot, 'src', 'virtual-cut.ts'),
    '--target', 'es2022', '--module', 'es2022', '--moduleResolution', 'bundler',
    '--skipLibCheck', '--outDir', outDir,
  ], { stdio: 'inherit' });
  const { mapOldTime, mapOldWindow, remapLiveData, virtualWindows } = await import(
    pathToFileURL(path.join(outDir, 'virtual-cut.js')).href
  );

  const fps = 30;
  // O corte aplicado: dois blocos, A(0..4s do fonte, cut 0..4) e B(10..16, cut 4..10).
  const applied = [
    { source: 'a.mov', start: 0, end: 4 },
    { source: 'a.mov', start: 10, end: 16 },
  ];

  // --- 1. Excluir o miolo do segundo bloco -----------------------------------
  // Pendente: A inteiro + B sem os 2s do meio (10..12 e 14..16).
  const windows = virtualWindows({
    pending: [
      { sourceId: 'a.mov', start: 0, end: 4 },
      { sourceId: 'a.mov', start: 10, end: 12 },
      { sourceId: 'a.mov', start: 14, end: 16 },
    ],
    applied, fps,
  });
  assert.ok(windows, 'remoção pura tem de virtualizar');
  // A(0..4)+B início(4..6) são contíguos no ARQUIVO → uma janela só.
  assert.equal(windows.length, 2, `esperava 2 janelas, veio ${JSON.stringify(windows)}`);
  assert.deepEqual(windows[0], { from: 0, srcStart: 0, dur: 6 });
  assert.deepEqual(windows[1], { from: 6, srcStart: 8, dur: 2 });

  // Instante removido do cut (7s, dentro do miolo excluído) não tem tempo novo.
  assert.equal(mapOldTime(windows, 7), null);
  assert.equal(mapOldTime(windows, 2), 2);
  assert.equal(mapOldTime(windows, 8.5), 6.5);
  // Janela velha atravessando a remoção vira DOIS pedaços.
  assert.deepEqual(mapOldWindow(windows, 5, 9), [
    { start: 5, end: 6 },
    { start: 6, end: 7 },
  ]);

  // --- 2. Conteúdo trazido de volta da fonte NÃO virtualiza ------------------
  assert.equal(virtualWindows({
    pending: [{ sourceId: 'a.mov', start: 0, end: 5 }],
    applied, fps,
  }), null, 'esticar o trim para fora do corte não tem de onde sair no cut.mp4');
  assert.equal(virtualWindows({
    pending: [{ sourceId: 'b.mov', start: 0, end: 2 }],
    applied, fps,
  }), null, 'fonte que não está no corte não virtualiza');

  // --- 3. Tesoura sem remoção = uma janela só (sem emenda à toa) -------------
  const soTesoura = virtualWindows({
    pending: [
      { sourceId: 'a.mov', start: 0, end: 2 },
      { sourceId: 'a.mov', start: 2, end: 4 },
      { sourceId: 'a.mov', start: 10, end: 16 },
    ],
    applied, fps,
  });
  assert.equal(soTesoura.length, 1, 'fatias contíguas no arquivo se fundem');
  assert.deepEqual(soTesoura[0], { from: 0, srcStart: 0, dur: 10 });

  // --- 4. remapLiveData: tudo no tempo novo ---------------------------------
  const data = {
    editData: {
      fps, durationSec: 10,
      camera: { enabled: true, zooms: [1, 1.2, 1], pushIn: 0.04, targetX: 0.5, targetY: 0.4 },
      splits: [{ kind: 'image', src: 'x.png', start: 5, end: 9, position: 'top' }],
      inserts: [], behind: [],
      animations: [{ start: 1, end: 2, kind: 'flash', label: 'Flash' }, { start: 6.5, end: 7.5, kind: 'flash', label: 'Flash' }],
      hook: { enabled: true, startSec: 0, endSec: 4, lines: ['Oi'] },
      captions: { enabled: true, style: 'karaoke', fontSize: 61 },
    },
    captions: [
      { text: 'antes', startMs: 1000, endMs: 1400 },
      { text: 'removida', startMs: 6500, endMs: 6900 },
      { text: 'depois', startMs: 8600, endMs: 9000 },
    ],
    // Cenas velhas: 0..4 (zoom 1), 4..7 (zoom 1.2), 7..10 (zoom 1).
    segments: { segments: [{ start: 0, dur: 4 }, { start: 4, dur: 3 }, { start: 7, dur: 3 }] },
    track: { points: Array.from({ length: 300 }, (_, i) => [i / 300, 0.4]) },
  };
  const out = remapLiveData(data, windows);
  assert.equal(out.editData.durationSec, 8, 'duração nova = soma das janelas');
  assert.deepEqual(out.editData.baseWindows, windows, 'o template recebe as janelas para fatiar o cut');
  // Palavra dentro da remoção morre; a de depois desloca 2s para trás.
  assert.deepEqual(out.captions.map((w) => w.text), ['antes', 'depois']);
  assert.equal(out.captions[1].startMs, 6600);
  // O split 5..9 atravessa a remoção (6..8 do cut): vira 5..6 e 6..7.
  assert.equal(out.editData.splits.length, 2, JSON.stringify(out.editData.splits));
  assert.deepEqual(out.editData.splits.map((s) => [s.start, s.end]), [[5, 6], [6, 7]]);
  // Flash de 6,5s caiu na remoção: some. O de 1s fica.
  assert.deepEqual(out.editData.animations.map((a) => a.start), [1]);
  // Cenas novas: 0..4 (zoom 1), 4..6 (zoom 1.2), 6..8 (zoom da cena velha 7..10 = 1).
  assert.deepEqual(out.segments.segments.map((s) => [s.start, s.dur]), [[0, 4], [4, 2], [6, 2]]);
  assert.deepEqual(out.editData.camera.zooms, [1, 1.2, 1], 'cada cena nova herda o zoom da cena velha que a contém');
  // Rastreio: 8s → 240 quadros, fatiados do velho (quadro novo 180 = velho 240).
  assert.equal(out.track.points.length, 240);
  assert.ok(Math.abs(out.track.points[180][0] - 240 / 300) < 1e-6, 'os olhos seguem o conteúdo, não o relógio');
  // A headline (0..4) não cruzou remoção: intacta.
  assert.equal(out.editData.hook.endSec, 4);

  console.log('test-virtual-cut: janelas, limite honesto, fusão de fatias e remapeamento completo — ok');
} finally {
  rmSync(outDir, { recursive: true, force: true });
}
