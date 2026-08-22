// Teste da PRÉVIA do trecho alterado.
//
// Medido no projeto real do aluno (91s, 1080x1920): 8,4 quadros/s mais 9,4s
// fixos. O vídeo inteiro leva ~5,6 min e um trecho de 3s leva ~20s — por isso
// a prévia existe.
//
// O risco aqui NÃO é ser lento, é ser rápido errado: classificar uma mudança
// global como local entrega um vídeo em que só um pedaço mudou e o resto
// ficou velho, parecendo pronto. Por isso a regra é lista BRANCA, e estes
// casos existem para travá-la.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = mkdtempSync(path.join(tmpdir(), 'edvid-preview-'));

try {
  execFileSync(process.execPath, [
    path.join(projectRoot, 'node_modules', 'typescript', 'bin', 'tsc'),
    path.join(projectRoot, 'src', 'phase2-preview.ts'),
    '--target', 'es2022', '--module', 'es2022', '--moduleResolution', 'bundler',
    '--skipLibCheck', '--outDir', outDir,
  ], { stdio: 'inherit' });
  const { previewFrames, previewPlan } = await import(
    pathToFileURL(path.join(outDir, 'phase2-preview.js')).href
  );

  // A edição real do aluno como ponto de partida.
  const base = () => ({
    width: 1080, height: 1920, fps: 30, durationSec: 91.067, editType: 'limpa',
    camera: { enabled: true, pushIn: 0.04 },
    hook: { enabled: true, lines: ['Falta menos de', '20 dias'] },
    captions: { enabled: true, style: 'karaoke', accent: '#ff5200' },
    soundtrack: { enabled: true, file: 'trilha.mp3', volume: 0.079 },
    splits: [{ kind: 'image', src: 'a.png', start: 4, end: 9, position: 'top' }],
    inserts: [], behind: [],
    animations: [{ start: 20, end: 24, kind: 'flash', label: 'Flash' }],
  });

  // --- 1. Mudança local: uma animação nova ---------------------------------
  const comAnimacao = base();
  comAnimacao.animations = [...comAnimacao.animations, { start: 40, end: 43, kind: 'script', label: 'Cartão' }];
  const plano = previewPlan(base(), comAnimacao);
  assert.equal(plano.kind, 'window', 'animação nova é mudança local');
  assert.ok(plano.start <= 40 && plano.start > 38, `janela começa antes da animação: ${plano.start}`);
  assert.ok(plano.end >= 43 && plano.end < 45, `janela termina depois: ${plano.end}`);

  // Apagar um item também deixa buraco a redesenhar.
  const semSplit = base();
  semSplit.splits = [];
  const planoRemocao = previewPlan(base(), semSplit);
  assert.equal(planoRemocao.kind, 'window');
  assert.ok(planoRemocao.start < 4 && planoRemocao.end > 9);

  // Mover um item cobre a posição velha E a nova — senão o lugar antigo fica
  // com a animação fantasma no vídeo mostrado.
  const movido = base();
  movido.animations = [{ start: 28, end: 32, kind: 'flash', label: 'Flash' }];
  const planoMovido = previewPlan(base(), movido);
  assert.equal(planoMovido.kind, 'window');
  assert.ok(planoMovido.start < 20 && planoMovido.end > 32, 'precisa cobrir de onde saiu até onde foi');

  // Mover para MUITO longe abre uma janela que não compensa: cai no inteiro.
  const longe = base();
  longe.animations = [{ start: 60, end: 64, kind: 'flash', label: 'Flash' }];
  assert.equal(previewPlan(base(), longe).kind, 'full', '45s de janela num vídeo de 91s não paga');

  // --- 2. Mudanças GLOBAIS: render inteiro, sem exceção --------------------
  // Cada uma destas muda TODO quadro do vídeo. Classificar como local seria o
  // defeito que arruína a confiança no preview.
  const globais = {
    'estilo de legenda': (d) => { d.captions.style = 'stacked'; },
    'cor de destaque': (d) => { d.captions.accent = '#00ff00'; },
    'zoom da câmera': (d) => { d.camera.pushIn = 0.08; },
    'headline': (d) => { d.hook.lines = ['Outro', 'texto']; },
    'trilha': (d) => { d.soundtrack.volume = 0.2; },
    'duração': (d) => { d.durationSec = 70; },
    'resolução': (d) => { d.width = 720; },
    'fps': (d) => { d.fps = 24; },
    'tipo de edição': (d) => { d.editType = 'split'; },
  };
  for (const [nome, mexer] of Object.entries(globais)) {
    const depois = base();
    mexer(depois);
    assert.equal(previewPlan(base(), depois).kind, 'full', `${nome} exige render inteiro`);
  }

  // Campo DESCONHECIDO (o agente inventa campo de vez em quando) força
  // inteiro: não dá para saber onde ele aparece no vídeo.
  const inventado = base();
  inventado.creatorInfographics = [{ start: 5, end: 8 }];
  assert.equal(previewPlan(base(), inventado).kind, 'full', 'campo desconhecido nunca vira prévia');

  // Item com tempo ilegível também.
  const semTempo = base();
  semTempo.animations = [...semTempo.animations, { kind: 'flash', label: 'sem tempo' }];
  assert.equal(previewPlan(base(), semTempo).kind, 'full');

  // --- 3. Quando a prévia não paga o custo ---------------------------------
  // Primeiro render: nada com que comparar.
  assert.equal(previewPlan(null, base()).kind, 'full');
  // Nada mudou: não há prévia a fazer.
  assert.equal(previewPlan(base(), base()).kind, 'full');
  // Trecho grande demais: o render inteiro chega quase junto.
  const enorme = base();
  enorme.animations = [...enorme.animations, { start: 2, end: 80, kind: 'shapes' }];
  assert.equal(previewPlan(base(), enorme).kind, 'full', 'trecho de 78s não é prévia');

  // --- 4. A janela em quadros ----------------------------------------------
  const quadros = previewFrames({ kind: 'window', start: 39.5, end: 43.5 }, 30, 2732);
  assert.equal(quadros.from, 1185);
  assert.equal(quadros.to, 1305);
  // Nunca passa do fim do vídeo nem começa antes do zero.
  assert.equal(previewFrames({ kind: 'window', start: 0, end: 3 }, 30, 2732).from, 0);
  assert.equal(previewFrames({ kind: 'window', start: 88, end: 95 }, 30, 2732).to, 2731);

  console.log('test:phase2-preview ok — trecho local vira prévia, mudança global e campo desconhecido forçam render inteiro.');
} finally {
  rmSync(outDir, { recursive: true, force: true });
}
