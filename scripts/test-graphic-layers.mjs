// Teste das CAMADAS DE GRAFICO (CustomGraphics pre-renderizado com alpha).
//
// O risco central e camada VELHA parecendo atual: o agente reescreve o
// grafico, a janela muda, e a previa toca o clipe antigo por cima do video —
// pior que faltar, porque parece certo. Por isso a impressao digital, a
// limpeza e a ordem "manifesto por ultimo" sao o que este teste trava.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = mkdtempSync(path.join(tmpdir(), 'edvid-layers-'));

try {
  execFileSync(process.execPath, [
    path.join(projectRoot, 'node_modules', 'typescript', 'bin', 'tsc'),
    path.join(projectRoot, 'src', 'graphic-layers.ts'),
    '--target', 'es2022', '--module', 'es2022', '--moduleResolution', 'bundler',
    '--skipLibCheck', '--outDir', outDir,
  ], { stdio: 'inherit' });
  const {
    layerConvertArgs, layerFrames, layerManifest, layerName, layerRenderArgs,
    layerWindows, layersFingerprint, layersNeeded,
  } = await import(pathToFileURL(path.join(outDir, 'graphic-layers.js')).href);

  // --- 1. Janelas: folga, recorte e mescla -----------------------------------
  // A animação real do projeto do aluno: 20–24s num vídeo de 91s.
  assert.deepEqual(layerWindows([{ start: 20, end: 24 }], 91), [{ start: 19.5, end: 24.5 }]);
  // Na borda do vídeo, a folga não vaza.
  assert.deepEqual(layerWindows([{ start: 0.2, end: 3 }], 91), [{ start: 0, end: 3.5 }]);
  assert.deepEqual(layerWindows([{ start: 89, end: 91 }], 91), [{ start: 88.5, end: 91 }]);
  // Duas animações coladas viram UMA camada: dois renders e dois arquivos
  // para um respiro de meio segundo é desperdício.
  assert.deepEqual(layerWindows([{ start: 10, end: 12 }, { start: 12.8, end: 14 }], 91),
    [{ start: 9.5, end: 14.5 }]);
  // Separadas de verdade continuam separadas.
  assert.equal(layerWindows([{ start: 10, end: 12 }, { start: 30, end: 32 }], 91).length, 2);
  // Lixo não vira janela: sem tempo, invertida, negativa, fora da lista.
  assert.deepEqual(layerWindows([{ kind: 'flash' }, { start: 8, end: 5 }, { start: -3, end: -1 }], 91), []);
  assert.deepEqual(layerWindows('nao é lista', 91), []);
  assert.deepEqual(layerWindows([{ start: 1, end: 2 }], 0), [], 'vídeo sem duração não tem camada');

  // --- 2. Nome estável em milissegundos --------------------------------------
  // Segundos quebrados (3,7333…) virariam nomes diferentes a cada arredondar.
  assert.equal(layerName({ start: 19.5, end: 24.5 }), 'grafico_19500_24500');
  assert.equal(layerName({ start: 3.7333333, end: 8.0666667 }), 'grafico_3733_8067');

  // --- 3. Impressão digital: muda quando importa, só quando importa ----------
  const w = [{ start: 19.5, end: 24.5 }];
  const base = layersFingerprint('codigo A', w, 30);
  assert.equal(layersFingerprint('codigo A', w, 30), base, 'mesma entrada, mesma impressão');
  assert.notEqual(layersFingerprint('codigo B', w, 30), base, 'código novo re-renderiza');
  assert.notEqual(layersFingerprint('codigo A', [{ start: 10, end: 14 }], 30), base, 'janela nova re-renderiza');
  assert.notEqual(layersFingerprint('codigo A', w, 24), base, 'fps novo re-renderiza');

  // --- 4. A decisão -----------------------------------------------------------
  const manifest = layerManifest('codigo A', [{ start: 20, end: 24 }], 91, 30);
  assert.equal(manifest.layers.length, 1);
  assert.equal(manifest.layers[0].name, 'grafico_19500_24500');
  // Template intocado: as animações declarativas a prévia desenha sozinha —
  // camada seria duplicata. E se havia camadas antigas, elas viram lixo.
  assert.equal(layersNeeded(true, manifest, null), 'skip');
  assert.equal(layersNeeded(true, manifest, manifest), 'clean');
  // Editado e sem manifesto guardado: renderiza.
  assert.equal(layersNeeded(false, manifest, null), 'render');
  // Nada mudou: não re-renderiza (é o que evita pagar 65 quadros/s à toa).
  assert.equal(layersNeeded(false, manifest, manifest), 'skip');
  // Código mudou: renderiza de novo.
  const editado = layerManifest('codigo B', [{ start: 20, end: 24 }], 91, 30);
  assert.equal(layersNeeded(false, editado, manifest), 'render');
  // Editado mas sem NENHUMA animação registrada: nada a renderizar, e camadas
  // antigas saem — o contrato é o mesmo do render, registrar é o que faz
  // aparecer.
  const vazio = layerManifest('codigo B', [], 91, 30);
  assert.equal(layersNeeded(false, vazio, manifest), 'clean');
  assert.equal(layersNeeded(false, vazio, null), 'skip');

  // --- 5. Quadros e comandos --------------------------------------------------
  assert.deepEqual(layerFrames({ start: 19.5, end: 24.5 }, 30, 2732), { from: 585, to: 735 });
  assert.deepEqual(layerFrames({ start: 0, end: 3 }, 30, 2732).from, 0);
  assert.equal(layerFrames({ start: 88.5, end: 95 }, 30, 2732).to, 2731, 'nunca passa do último quadro');

  const render = layerRenderArgs('/x/g.mov', 585, 735);
  assert.equal(render[1], 'Grafico', 'renderiza a composição da camada, não a Reels');
  assert.ok(render.includes('--frames=585-735'));
  // As três pernas do alpha no render: ProRes 4444 + pixel com alpha + PNG.
  // JPEG descarta o canal e o Remotion recusa a combinação (medido: é erro).
  assert.ok(render.includes('--prores-profile=4444'));
  assert.ok(render.includes('--pixel-format=yuva444p10le'));
  assert.ok(render.includes('--image-format=png'));

  const convert = layerConvertArgs('/x/g.mov', '/x/g.webm');
  assert.ok(convert.includes('libvpx-vp9'));
  assert.ok(convert.includes('yuva420p'), 'sem alpha o WebM vira quadrado preto na prévia');
  assert.ok(convert.includes('-an'), 'webm exigiria vorbis, que o build não tem; o som fica na composição');

  console.log('test:graphic-layers ok — janela com folga e mescla, impressão que re-dispara, camada velha nunca sobra.');
} finally {
  rmSync(outDir, { recursive: true, force: true });
}
