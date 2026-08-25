// Teste da MANIPULACAO DIRETA (0.28.0): as mutacoes que o mouse produz.
//
// O risco real aqui nao e o arrasto errar por um pixel — e um arrasto
// gravar um edit-data INVALIDO que o render engole calado: janela de fim
// antes do comeco, divisa fora do quadro, item de behind com `dur` trocado
// por `end` (o template leria NaN). Cada caso destes ja seria um video
// quebrado parecendo pronto.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = mkdtempSync(path.join(tmpdir(), 'edvid-edits-'));

try {
  execFileSync(process.execPath, [
    path.join(projectRoot, 'node_modules', 'typescript', 'bin', 'tsc'),
    path.join(projectRoot, 'src', 'edit-data-edits.ts'),
    '--target', 'es2022', '--module', 'es2022', '--moduleResolution', 'bundler',
    '--skipLibCheck', '--outDir', outDir,
  ], { stdio: 'inherit' });
  const { activeSplitIndexAt, applyEditOperation, applyEditOperations } = await import(
    pathToFileURL(path.join(outDir, 'edit-data-edits.js')).href
  );

  const base = () => ({
    durationSec: 90,
    splits: [{ kind: 'image', src: 'a.png', start: 4, end: 9, position: 'top' }],
    inserts: [{ src: 'b.png', start: 20, end: 24 }],
    behind: [{ kind: 'image', src: 'c.png', matte: 'm.mov', start: 30, dur: 5 }],
    animations: [{ start: 40, end: 43, kind: 'flash', label: 'Flash' }],
    hook: { enabled: true, lines: ['x'] },
  });

  // --- 1. Divisa -------------------------------------------------------------
  const divisa = applyEditOperation(base(), { op: 'set-divider', index: 0, divider: 0.52 });
  assert.ok(divisa.ok && divisa.changed);
  assert.equal(divisa.data.splits[0].divider, 0.52);
  // Os campos vizinhos do split não podem sumir no caminho.
  assert.equal(divisa.data.splits[0].src, 'a.png');
  assert.equal(divisa.data.splits[0].position, 'top');
  // Fora do quadro trava nos limites do template (0.15–0.85).
  assert.equal(applyEditOperation(base(), { op: 'set-divider', index: 0, divider: 0.02 }).data.splits[0].divider, 0.15);
  assert.equal(applyEditOperation(base(), { op: 'set-divider', index: 0, divider: 1.4 }).data.splits[0].divider, 0.85);
  // Índice fantasma e valor ilegível são recusa, não gravação.
  assert.equal(applyEditOperation(base(), { op: 'set-divider', index: 3, divider: 0.5 }).ok, false);
  assert.equal(applyEditOperation(base(), { op: 'set-divider', index: 0, divider: NaN }).ok, false);
  // Mesmo valor: nada muda, e o chamador sabe que não precisa gravar.
  const igual = applyEditOperation(divisa.data, { op: 'set-divider', index: 0, divider: 0.52 });
  assert.ok(igual.ok && !igual.changed);

  // --- 2. Mover preserva a duração ------------------------------------------
  const movido = applyEditOperation(base(), { op: 'move', kind: 'inserts', index: 0, start: 50 });
  assert.ok(movido.ok && movido.changed);
  assert.deepEqual([movido.data.inserts[0].start, movido.data.inserts[0].end], [50, 54]);
  // Arrastar além do fim do vídeo encosta no fim sem encolher.
  const noFim = applyEditOperation(base(), { op: 'move', kind: 'inserts', index: 0, start: 88 });
  assert.deepEqual([noFim.data.inserts[0].start, noFim.data.inserts[0].end], [86, 90]);
  // Antes do zero encosta no zero.
  const noZero = applyEditOperation(base(), { op: 'move', kind: 'inserts', index: 0, start: -3 });
  assert.deepEqual([noZero.data.inserts[0].start, noZero.data.inserts[0].end], [0, 4]);

  // behind usa {start, dur} e TEM de continuar usando: o template lê dur.
  const behindMovido = applyEditOperation(base(), { op: 'move', kind: 'behind', index: 0, start: 60 });
  assert.equal(behindMovido.data.behind[0].start, 60);
  assert.equal(behindMovido.data.behind[0].dur, 5);
  assert.ok(!('end' in behindMovido.data.behind[0]), 'behind não pode ganhar um campo end');
  // E o matte continua junto — sem ele a camada não renderiza.
  assert.equal(behindMovido.data.behind[0].matte, 'm.mov');

  // --- 3. Redimensionar ------------------------------------------------------
  const encolhido = applyEditOperation(base(), { op: 'resize', kind: 'animations', index: 0, edge: 'end', time: 41 });
  assert.deepEqual([encolhido.data.animations[0].start, encolhido.data.animations[0].end], [40, 41]);
  // O fim nunca cruza o começo: para no mínimo de 0,2s.
  const cruzado = applyEditOperation(base(), { op: 'resize', kind: 'animations', index: 0, edge: 'end', time: 39 });
  assert.deepEqual([cruzado.data.animations[0].start, cruzado.data.animations[0].end], [40, 40.2]);
  const comecoCruzado = applyEditOperation(base(), { op: 'resize', kind: 'animations', index: 0, edge: 'start', time: 44 });
  assert.deepEqual([comecoCruzado.data.animations[0].start, comecoCruzado.data.animations[0].end], [42.8, 43]);
  // O fim não passa da duração do vídeo.
  assert.equal(applyEditOperation(base(), { op: 'resize', kind: 'splits', index: 0, edge: 'end', time: 200 }).data.splits[0].end, 90);
  // behind redimensionado grava dur, nunca end.
  const behindMaior = applyEditOperation(base(), { op: 'resize', kind: 'behind', index: 0, edge: 'end', time: 38 });
  assert.equal(behindMaior.data.behind[0].dur, 8);
  assert.ok(!('end' in behindMaior.data.behind[0]));

  // --- 4. Lote é atômico -----------------------------------------------------
  const lote = applyEditOperations(base(), [
    { op: 'set-divider', index: 0, divider: 0.45 },
    { op: 'move', kind: 'animations', index: 0, start: 60 },
  ]);
  assert.ok(lote.ok && lote.changed);
  assert.equal(lote.data.splits[0].divider, 0.45);
  assert.equal(lote.data.animations[0].start, 60);
  // Uma operação inválida derruba o lote inteiro — nada meio-gravado.
  const loteRuim = applyEditOperations(base(), [
    { op: 'set-divider', index: 0, divider: 0.45 },
    { op: 'move', kind: 'inserts', index: 9, start: 10 },
  ]);
  assert.equal(loteRuim.ok, false);

  // O original NUNCA é mutado: quem chama pode manter o objeto anterior para
  // o desfazer otimista da interface.
  const original = base();
  applyEditOperation(original, { op: 'set-divider', index: 0, divider: 0.7 });
  assert.equal(original.splits[0].divider, undefined);

  // --- 5. Transformação do gizmo ---------------------------------------------
  const girado = applyEditOperation(base(), { op: 'set-transform', kind: 'splits', index: 0, transform: { rotation: 15, scale: 1.3 } });
  assert.ok(girado.ok && girado.changed);
  assert.deepEqual(girado.data.splits[0].transform, { rotation: 15, scale: 1.3 });
  // Parcial: mexer só no x preserva o resto.
  const deslocado = applyEditOperation(girado.data, { op: 'set-transform', kind: 'splits', index: 0, transform: { x: 0.1 } });
  assert.deepEqual(deslocado.data.splits[0].transform, { rotation: 15, scale: 1.3, x: 0.1 });
  // Limites: escala e deslocamento travam; rotação normaliza (370° == 10°).
  assert.equal(applyEditOperation(base(), { op: 'set-transform', kind: 'inserts', index: 0, transform: { scale: 99 } }).data.inserts[0].transform.scale, 5);
  assert.equal(applyEditOperation(base(), { op: 'set-transform', kind: 'inserts', index: 0, transform: { x: -7 } }).data.inserts[0].transform.x, -1);
  assert.equal(applyEditOperation(base(), { op: 'set-transform', kind: 'inserts', index: 0, transform: { rotation: 370 } }).data.inserts[0].transform.rotation, 10);
  assert.equal(applyEditOperation(base(), { op: 'set-transform', kind: 'inserts', index: 0, transform: { rotation: -270 } }).data.inserts[0].transform.rotation, 90);
  // Voltar à identidade LIMPA o campo — edit-data sem lixo, render idêntico
  // ao de antes do gizmo existir.
  const zerado = applyEditOperation(girado.data, { op: 'set-transform', kind: 'splits', index: 0, transform: { rotation: 0, scale: 1 } });
  assert.ok(zerado.ok && zerado.changed);
  assert.ok(!('transform' in zerado.data.splits[0]), 'identidade não deixa campo para trás');
  // NaN é recusa.
  assert.equal(applyEditOperation(base(), { op: 'set-transform', kind: 'splits', index: 0, transform: { scale: NaN } }).ok, false);

  // --- 5b. Apontar arquivo num espaço vazio ----------------------------------
  const vazio = { durationSec: 90, splits: [{ kind: 'image', src: '', start: 4, end: 9 }] };
  const apontado = applyEditOperation(vazio, { op: 'set-split-src', index: 0, src: 'imagens/minha.png', kind: 'image' });
  assert.ok(apontado.ok && apontado.changed);
  assert.equal(apontado.data.splits[0].src, 'imagens/minha.png');
  const clipe = applyEditOperation(vazio, { op: 'set-split-src', index: 0, src: 'clipes/meu.mp4', kind: 'video' });
  assert.equal(clipe.data.splits[0].kind, 'video');
  // Fora da pasta do projeto morre aqui, não no render.
  for (const ruim of ['/etc/passwd', '../fora.png', 'file:///x.png', '']) {
    assert.equal(applyEditOperation(vazio, { op: 'set-split-src', index: 0, src: ruim, kind: 'image' }).ok, false, `src "${ruim}" tem de ser recusado`);
  }

  // --- 5c. Legenda e headline: tunáveis, não transform livre ----------------
  // Elas têm motor de layout próprio (a legenda se centra na divisa; a
  // headline se reparte em duas linhas). O gizmo mexe no que o template já
  // respeita — altura e corpo —, nunca em x/y livres.
  const comTexto = () => ({
    ...base(), height: 1920,
    captions: { enabled: true, fontSize: 61, paddingBottom: 420 },
    hook: { enabled: true, text: 'Olha isso', paddingTop: 330 },
  });
  const legenda = applyEditOperation(comTexto(), { op: 'set-caption-layout', paddingBottom: 600, fontSize: 74 });
  assert.deepEqual([legenda.data.captions.paddingBottom, legenda.data.captions.fontSize], [600, 74]);
  // Fora do quadro trava dentro da margem segura.
  assert.equal(applyEditOperation(comTexto(), { op: 'set-caption-layout', paddingBottom: 5000 }).data.captions.paddingBottom, Math.round(1920 * 0.85));
  assert.equal(applyEditOperation(comTexto(), { op: 'set-caption-layout', fontSize: 999 }).data.captions.fontSize, 160);
  // O `enabled` e os campos vizinhos não podem sumir num ajuste parcial.
  assert.equal(legenda.data.captions.enabled, true);

  const headline = applyEditOperation(comTexto(), { op: 'set-headline-layout', maxFontPx: 44 });
  assert.equal(headline.data.hook.maxFontPx, 44);
  // fontSizePx é tamanho FIXO e desmonta o auto-ajuste em duas linhas: sai.
  const comFixo = { ...comTexto(), hook: { enabled: true, text: 'x', fontSizePx: 66 } };
  assert.ok(!('fontSizePx' in applyEditOperation(comFixo, { op: 'set-headline-layout', maxFontPx: 40 }).data.hook));

  // Texto editado no preview: `text` vence `lines`, então lines é limpo para
  // não haver duas verdades sobre a mesma headline.
  const escrito = applyEditOperation({ ...comTexto(), hook: { enabled: true, lines: ['velho', 'texto'] } }, { op: 'set-headline-text', text: '  Novo   texto  aqui ' });
  assert.equal(escrito.data.hook.text, 'Novo texto aqui');
  assert.deepEqual(escrito.data.hook.lines, []);

  // Apagar: item de lista some; legenda/headline viram enabled:false, que é
  // reversível e é o que o template entende.
  const semAnimacao = applyEditOperation(base(), { op: 'remove', kind: 'animations', index: 0 });
  assert.equal(semAnimacao.data.animations.length, 0);
  const semLegenda = applyEditOperation(comTexto(), { op: 'disable', kind: 'captions' });
  assert.equal(semLegenda.data.captions.enabled, false);
  assert.equal(semLegenda.data.captions.fontSize, 61, 'desligar não apaga o ajuste');
  assert.equal(applyEditOperation(base(), { op: 'remove', kind: 'animations', index: 9 }).ok, false);

  // --- 5d. Apagar é reversível e não perde o conteúdo ------------------------
  const comTextoCheio = { ...comTexto(), hook: { enabled: true, text: 'Minha headline', paddingTop: 330, maxFontPx: 48 } };
  const semHeadline = applyEditOperation(comTextoCheio, { op: 'disable', kind: 'hook' });
  assert.equal(semHeadline.data.hook.enabled, false);
  assert.equal(semHeadline.data.hook.text, 'Minha headline', 'o texto sobrevive ao apagar');
  assert.equal(semHeadline.data.hook.maxFontPx, 48, 'o ajuste de corpo sobrevive');
  // Apagar de novo não muda nada — o chamador sabe que não precisa gravar.
  assert.equal(applyEditOperation(semHeadline.data, { op: 'disable', kind: 'hook' }).changed, false);

  // --- 5e. Tesoura no elemento selecionado ----------------------------------
  // Recortar com um elemento selecionado parte SO ele: uma mídia vira duas
  // mídias, com o mesmo arquivo e a janela repartida na agulha.
  const cortado = applyEditOperation(base(), { op: 'split-at', kind: 'splits', index: 0, time: 6.5 });
  assert.ok(cortado.ok && cortado.changed);
  assert.equal(cortado.data.splits.length, 2, 'uma mídia recortada vira duas');
  assert.deepEqual(
    cortado.data.splits.map((s) => [s.start, s.end]),
    [[4, 6.5], [6.5, 9]],
    'as duas metades encostam exatamente na agulha',
  );
  assert.ok(cortado.data.splits.every((s) => s.src === 'a.png' && s.kind === 'image' && s.position === 'top'),
    'as duas metades herdam arquivo, tipo e layout');
  // behind guarda {start, dur}: o recorte respeita o formato do próprio item.
  const cortadoBehind = applyEditOperation(base(), { op: 'split-at', kind: 'behind', index: 0, time: 32 });
  assert.ok(cortadoBehind.ok);
  assert.deepEqual(
    cortadoBehind.data.behind.map((b) => [b.start, b.dur]),
    [[30, 2], [32, 3]],
    'behind continua em {start, dur} depois do corte',
  );
  // Fora da janela (ou colado na ponta) a tesoura não corta este item.
  for (const t of [3, 4.05, 8.99, 20]) {
    const fora = applyEditOperation(base(), { op: 'split-at', kind: 'splits', index: 0, time: t });
    assert.ok(!fora.ok, `a tesoura não devia cortar em ${t}`);
  }

  // --- 5f. Trim da legenda e da headline ------------------------------------
  // As duas faixas não tinham janela no arquivo: a legenda valia o vídeo
  // inteiro e a headline sempre começava no quadro 0. O campo nasce no
  // primeiro arrasto da ponta.
  const janelaLegenda = applyEditOperation(base(), { op: 'set-caption-window', start: 3, end: 40 });
  assert.ok(janelaLegenda.ok && janelaLegenda.changed);
  assert.deepEqual(
    [janelaLegenda.data.captions.startSec, janelaLegenda.data.captions.endSec],
    [3, 40],
  );
  // Arrastar só uma ponta preserva a outra.
  const soFim = applyEditOperations(janelaLegenda.data, [{ op: 'set-caption-window', end: 30 }]);
  assert.ok(soFim.ok);
  assert.deepEqual([soFim.data.captions.startSec, soFim.data.captions.endSec], [3, 30]);
  // A headline mantém o resto do objeto (texto, estilo, enabled).
  const janelaTexto = applyEditOperation(base(), { op: 'set-headline-window', start: 1, end: 5 });
  assert.ok(janelaTexto.ok);
  assert.equal(janelaTexto.data.hook.enabled, true, 'o trim não pode desligar a headline');
  assert.deepEqual(janelaTexto.data.hook.lines, ['x'], 'nem perder o texto');
  assert.deepEqual([janelaTexto.data.hook.startSec, janelaTexto.data.hook.endSec], [1, 5]);
  // Janela invertida ou curta demais não passa.
  assert.ok(!applyEditOperation(base(), { op: 'set-caption-window', start: 10, end: 10.05 }).ok);

  // --- 5g. Todo movimento cai em QUADRO -------------------------------------
  // A timeline mede em segundos fracionários; o template converte para quadro
  // com Math.round. Sem arredondar aqui, duas pontas que o aluno encostou na
  // tela gravam números diferentes e nunca encostam de verdade.
  const emQuadro = applyEditOperations(
    base(),
    [{ op: 'move', kind: 'splits', index: 0, start: 4.4831 }],
    { fps: 30 },
  );
  assert.ok(emQuadro.ok);
  assert.equal(emQuadro.data.splits[0].start, 4.467, '4,4831s cai no quadro 134 (4,4667s)');
  assert.equal(emQuadro.data.splits[0].end, 9.467, 'e a duração é preservada');
  const trimQuadro = applyEditOperations(
    base(),
    [{ op: 'resize', kind: 'splits', index: 0, edge: 'end', time: 8.008 }],
    { fps: 30 },
  );
  assert.ok(trimQuadro.ok);
  assert.equal(trimQuadro.data.splits[0].end, 8, '8,008s cai no quadro 240 — exatamente 8s');
  // Sem fps declarado, o próprio arquivo responde.
  const comFpsNoArquivo = applyEditOperations(
    { ...base(), fps: 30 },
    [{ op: 'split-at', kind: 'splits', index: 0, time: 6.51 }],
  );
  assert.ok(comFpsNoArquivo.ok);
  assert.equal(comFpsNoArquivo.data.splits[0].end, 6.5, 'o fps do edit-data vale quando ninguém passa outro');

  // --- 6. Split ativo no instante -------------------------------------------
  assert.equal(activeSplitIndexAt(base(), 5), 0);
  assert.equal(activeSplitIndexAt(base(), 15), -1);
  assert.equal(activeSplitIndexAt(base(), 9), -1, 'o fim da janela é exclusivo');
  assert.equal(activeSplitIndexAt({}, 5), -1);

  console.log('test:edit-data-edits ok — mover preserva duração, behind mantém dur, lote é atômico e nada inválido chega ao disco.');
} finally {
  rmSync(outDir, { recursive: true, force: true });
}
