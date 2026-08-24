// Teste do plano que o APLICATIVO escreve sozinho na edição.
//
// O defeito que originou o módulo: escolher "Tela dividida" sem agente
// conectado gravava `splits: []` e o chat respondia "Estilos aplicados". A
// edição saía limpa e nada na interface dizia isso. Aqui as janelas nascem da
// própria fala, e o teste trava as propriedades que fazem elas serem
// editáveis de verdade — fronteira de frase, respiro entre uma e outra, e
// nunca em cima da headline nem do fim do vídeo.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = mkdtempSync(path.join(tmpdir(), 'edvid-edit-plan-'));

try {
  execFileSync(process.execPath, [
    path.join(projectRoot, 'node_modules', 'typescript', 'bin', 'tsc'),
    path.join(projectRoot, 'src', 'edit-plan.ts'),
    '--target', 'es2022', '--module', 'es2022', '--moduleResolution', 'bundler',
    '--skipLibCheck', '--outDir', outDir,
  ], { stdio: 'inherit' });
  const { applySplitPlan, phrasesFrom, planCutFlashes, planSplits, splitCount } = await import(
    pathToFileURL(path.join(outDir, 'edit-plan.js')).href
  );

  // --- 1. Quantas janelas ---------------------------------------------------
  // Uma a cada 18s, entre 2 e 6. Mais conservador que o zoom (uma a cada 12s)
  // porque cada janela destas pode virar um clipe pago.
  assert.equal(splitCount(10), 2, 'vídeo curto ainda merece duas janelas');
  assert.equal(splitCount(30), 2);
  assert.equal(splitCount(60), 3);
  assert.equal(splitCount(95), 5);
  assert.equal(splitCount(600), 6, 'o teto existe para não torrar crédito');

  // --- 2. Frases pelo silêncio ---------------------------------------------
  // Dentro de uma frase as palavras encostam; a respirada passa de 0,42s.
  const fala = (pares) => pares.map(([s, e], i) => ({ text: `p${i}`, startMs: s * 1000, endMs: e * 1000 }));
  const frases = phrasesFrom(fala([[0, 0.4], [0.45, 0.9], [1.6, 2.0], [2.05, 2.4]]));
  assert.equal(frases.length, 2, 'a pausa de 0,7s separa duas frases');
  assert.deepEqual(frases[0], { start: 0, end: 0.9 });
  assert.deepEqual(frases[1], { start: 1.6, end: 2.4 });

  // Fala corrida sem respirada não pode virar uma frase única de 20s: a janela
  // inteira caberia dentro dela e o plano perderia toda a granularidade.
  const corrida = phrasesFrom(fala(
    Array.from({ length: 40 }, (_, i) => [i * 0.5, i * 0.5 + 0.45]),
  ));
  assert.ok(corrida.length > 1, 'fala corrida tem de quebrar mesmo sem pausa');
  assert.ok(corrida.every((f) => f.end - f.start <= 8.0001), 'nenhuma frase passa do teto');

  // --- 3. As janelas de tela dividida --------------------------------------
  // Fala sintética de 95s no mesmo formato do captions.json da Fase 2: frases
  // de ~2,2s com respirada de 0,6s entre elas.
  const roteiro = [];
  for (let t = 0.5; t < 94; t += 2.8) {
    for (let w = 0; w < 5; w += 1) {
      roteiro.push({ text: `w${w}`, startMs: (t + w * 0.44) * 1000, endMs: (t + w * 0.44 + 0.4) * 1000 });
    }
  }
  const janelas = planSplits({
    captions: roteiro, durationSec: 95, hookEndSec: 4, position: 'top', kind: 'image',
  });

  assert.equal(janelas.length, 5, 'um vídeo de 95s pede cinco janelas');
  assert.ok(janelas.every((j) => j.src === ''), 'a janela nasce VAZIA — quem preenche é o aluno ou a IA');
  assert.ok(janelas.every((j) => j.kind === 'image'), 'o kind acompanha a escolha do formulário');
  assert.ok(janelas.every((j) => j.position === 'top'), 'a posição vem do tipo de edição');

  // Nunca por baixo da headline, nunca em cima do fim.
  assert.ok(janelas[0].start >= 4.6, `a primeira janela respeita a headline (${janelas[0].start})`);
  assert.ok(janelas.every((j) => j.end <= 94), 'nenhuma janela invade o último segundo');

  // Duração dentro da faixa utilizável.
  for (const j of janelas) {
    const dur = j.end - j.start;
    assert.ok(dur >= 2.4 && dur <= 8.0001, `janela de ${dur.toFixed(2)}s fora da faixa`);
  }

  // Respiro entre uma e outra: sem isto o apresentador nunca volta a tela
  // cheia e a divisa lê como erro de render, não como intenção.
  for (let i = 1; i < janelas.length; i += 1) {
    const folga = janelas[i].start - janelas[i - 1].end;
    assert.ok(folga >= 3, `folga de ${folga.toFixed(2)}s entre as janelas ${i - 1} e ${i}`);
  }

  // Fronteira de FRASE, nunca no meio de uma palavra.
  const inicios = new Set(phrasesFrom(roteiro).map((f) => Math.round(f.start * 1000)));
  const fins = new Set(phrasesFrom(roteiro).map((f) => Math.round(f.end * 1000)));
  for (const j of janelas) {
    assert.ok(inicios.has(Math.round(j.start * 1000)), `janela começa fora de frase: ${j.start}`);
    assert.ok(fins.has(Math.round(j.end * 1000)), `janela termina fora de frase: ${j.end}`);
  }

  // Distribuição: o primeiro rascunho era guloso e empilhava tudo nos
  // primeiros 20s. A última janela tem de estar na segunda metade do vídeo.
  assert.ok(janelas[janelas.length - 1].start > 47.5, 'as janelas têm de cobrir o vídeo inteiro');

  // --- 4. Casos que não rendem plano ---------------------------------------
  assert.deepEqual(
    planSplits({ captions: roteiro, durationSec: 5, hookEndSec: 4, position: 'top' }),
    [],
    'sem espaço útil depois da headline, não há tela dividida',
  );
  const semKind = planSplits({ captions: roteiro, durationSec: 60, hookEndSec: 0, position: 'bottom' });
  assert.ok(semKind.length > 0);
  assert.ok(semKind.every((j) => !('kind' in j)), 'origem "nenhum" não grava kind — o espaço não oferece IA');
  assert.ok(semKind.every((j) => j.position === 'bottom'));

  // Sem transcrição o plano ainda existe: b-roll sobre silêncio é legítimo.
  const mudo = planSplits({ captions: [], durationSec: 60, hookEndSec: 4, position: 'top' });
  assert.equal(mudo.length, 3, 'vídeo sem fala ainda recebe as janelas por fatias iguais');
  assert.ok(mudo.every((j) => j.end - j.start >= 2.4));
  for (let i = 1; i < mudo.length; i += 1) {
    assert.ok(mudo[i].start - mudo[i - 1].end >= 3, 'o respiro vale também sem fala');
  }

  // --- 5. O plano encontrando o que já existe ------------------------------
  // Reaplicar estilos não pode apagar trabalho, mas também não pode ignorar o
  // formulário. As janelas mandam no tempo; o formulário manda no layout.
  const jaExistem = [
    { src: 'imagens/a.png', kind: 'image', start: 6, end: 11, position: 'top' },
    { src: '', kind: 'image', start: 20, end: 25, position: 'top' },
  ];
  const virado = applySplitPlan({
    edit: 'split2', splitMedia: 'video', previous: jaExistem, planned: janelas,
  });
  assert.equal(virado.length, 2, 'as janelas existentes mandam no tempo');
  assert.equal(virado[0].start, 6, 'nenhuma janela foi replanejada');
  assert.ok(virado.every((j) => j.position === 'bottom'), 'trocar o tipo de edição vira a montagem inteira');
  assert.equal(virado[0].kind, 'image', 'espaço com arquivo mantém o kind do arquivo');
  assert.equal(virado[0].src, 'imagens/a.png', 'e mantém o arquivo');
  assert.equal(virado[1].kind, 'video', 'espaço vazio segue a nova escolha do formulário');

  // "Nenhum" tira o kind do espaço vazio: sem ele o botão de gerar não aparece.
  const semIa = applySplitPlan({
    edit: 'split', splitMedia: 'nenhum', previous: jaExistem, planned: [],
  });
  assert.ok(!('kind' in semIa[1]), 'espaço vazio sem origem de IA não guarda kind');
  assert.equal(semIa[0].kind, 'image', 'o arquivo já apontado continua sendo imagem');

  // Projeto novo: entra o plano.
  const doZero = applySplitPlan({
    edit: 'split', splitMedia: 'imagem', previous: [], planned: janelas,
  });
  assert.equal(doZero.length, janelas.length);
  assert.ok(doZero.every((j) => j.src === '' && j.kind === 'image'));

  // Corte refeito e mais curto: as janelas do corte antigo não podem ficar
  // depois do fim do vídeo — invisíveis no palco e com o chip estourando a
  // timeline. A que atravessa o fim é cortada; a que ficou toda fora, sai.
  const encurtado = applySplitPlan({
    edit: 'split', splitMedia: 'imagem', previous: jaExistem, planned: [], durationSec: 9,
  });
  assert.equal(encurtado.length, 1, 'a janela que começa depois do fim desaparece');
  assert.equal(encurtado[0].end, 9, 'a janela que atravessa o fim é aparada');
  assert.deepEqual(
    applySplitPlan({ edit: 'split', splitMedia: 'imagem', previous: jaExistem, planned: [], durationSec: 7 }),
    [],
    'sobrando menos que a janela mínima, não sobra janela',
  );

  // "Limpa" apaga as janelas: o template não olha o editType, então deixá-las
  // gravadas faria a prévia contradizer o formulário.
  assert.deepEqual(
    applySplitPlan({ edit: 'limpa', splitMedia: 'imagem', previous: jaExistem, planned: janelas }),
    [],
    'edição limpa é uma afirmação sobre o resultado',
  );

  // --- 6. Flashes de transição ---------------------------------------------
  const segments = [
    { start: 0, dur: 3 }, { start: 3, dur: 2.5 }, { start: 5.5, dur: 0.6 },
    { start: 6.1, dur: 4 }, { start: 10.1, dur: 5 },
  ];
  const flashes = planCutFlashes({ segments, durationSec: 20 });
  assert.ok(flashes.every((f) => f.start > 0), 'não há troca no primeiro quadro: o vídeo está abrindo');
  assert.ok(flashes.every((f) => f.kind === 'flash' && f.label === 'Flash'));
  assert.ok(flashes.every((f) => f.end > f.start), 'o chip precisa de largura para ser clicado e apagado');
  for (let i = 1; i < flashes.length; i += 1) {
    assert.ok(flashes[i].start - flashes[i - 1].start >= 1.2, 'estrobo não é estilo, é desconforto');
  }
  // A junção de 5,5s está a 0,6s da de 6,1s: uma das duas cai.
  assert.deepEqual(flashes.map((f) => f.start), [3, 5.5, 10.1]);

  // A entrada de uma tela dividida também é troca visual.
  const comSplit = planCutFlashes({
    segments: [{ start: 0, dur: 20 }], splits: [{ start: 8 }, { start: 8.4 }], durationSec: 20,
  });
  assert.deepEqual(comSplit.map((f) => f.start), [8], 'a divisa conta, e a segunda cai pela folga');
  // A junção de 5,5s some quando o vídeo acaba em 5,7s: clarão em cima do fim
  // não tem para onde resolver.
  assert.deepEqual(planCutFlashes({ segments, durationSec: 5.7 }).map((f) => f.start), [3],
    'nada de clarão em cima do fim');

  console.log('test-edit-plan: ok');
} finally {
  rmSync(outDir, { recursive: true, force: true });
}
