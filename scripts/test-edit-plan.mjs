// Teste do plano que o APLICATIVO escreve sozinho na edição.
//
// O defeito que originou o módulo: escolher "Tela dividida" sem agente
// conectado gravava `splits: []` e o chat respondia "Estilos aplicados". A
// edição saía limpa e nada na interface dizia isso.
//
// O primeiro desenho adivinhava as janelas fatiando a fala, e em uso real
// entregou UMA janela num reel de 14s, caída entre dois blocos. Agora o CORTE
// manda: um espaço por tomada, para o aluno podar. Aqui ficam travadas as duas
// coisas que isso exige — o espaço acompanhando a borda do bloco, e a mídia já
// apontada viajando para a janela nova em vez de sumir no replanejamento.
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
  const { applySplitPlan, planCutFlashes, planSplits } = await import(
    pathToFileURL(path.join(outDir, 'edit-plan.js')).href
  );

  // --- 1. Uma janela por CORTE ---------------------------------------------
  // O caso real que derrubou o desenho anterior: reel de 14,02s, headline de
  // 4s, quatro blocos no corte. O plano por fatias entregou UMA janela, caída
  // entre dois blocos. Agora o corte manda: um espaço por tomada.
  const blocos = [
    { start: 0, dur: 4.2 },      // inteiro debaixo da headline
    { start: 4.2, dur: 6.3 },
    { start: 10.5, dur: 3.0 },
    { start: 13.5, dur: 0.52 },  // curto demais para a mídia aparecer
  ];
  const janelas = planSplits({
    segments: blocos, durationSec: 14.02, hookEndSec: 4, position: 'top', kind: 'image',
  });
  assert.equal(janelas.length, 2, 'os dois blocos aproveitáveis viram espaço');
  assert.deepEqual(
    janelas.map((j) => [j.start, j.end]),
    [[4.6, 10.5], [10.5, 13.5]],
    'cada espaço acompanha as bordas do bloco',
  );
  assert.ok(janelas.every((j) => j.src === ''), 'o espaço nasce VAZIO — quem preenche é o aluno ou a IA');
  assert.ok(janelas.every((j) => j.kind === 'image'), 'o kind acompanha a escolha do formulário');
  assert.ok(janelas.every((j) => j.position === 'top'), 'a posição vem do tipo de edição');

  // O bloco que só COMEÇA debaixo da headline entra aparado, não sumido.
  assert.equal(janelas[0].start, 4.6, 'o espaço começa depois da headline');

  // Blocos curtos não viram espaço em lugar nenhum: abaixo do mínimo o fade
  // come a mídia inteira e a divisa lê como falha de render.
  assert.deepEqual(
    planSplits({
      segments: [{ start: 0, dur: 1.2 }, { start: 1.2, dur: 1.4 }],
      durationSec: 3, hookEndSec: 0, position: 'top',
    }),
    [],
  );

  // Sem teto de quantidade: espaço vazio não gasta crédito, e o número de
  // blocos é a edição que o aluno já aprovou no corte limpo.
  const muitos = planSplits({
    segments: Array.from({ length: 12 }, (_, i) => ({ start: i * 5, dur: 5 })),
    durationSec: 60, hookEndSec: 0, position: 'bottom',
  });
  assert.equal(muitos.length, 12, 'doze cortes, doze espaços');
  assert.ok(muitos.every((j) => !('kind' in j)), 'origem "nenhum" não grava kind — o espaço não oferece IA');
  assert.ok(muitos.every((j) => j.position === 'bottom'));

  // Nada de janela passando do fim do vídeo, mesmo com bloco mal medido.
  const estourado = planSplits({
    segments: [{ start: 0, dur: 99 }], durationSec: 10, hookEndSec: 0, position: 'top',
  });
  assert.deepEqual(estourado.map((j) => j.end), [10]);

  assert.deepEqual(planSplits({ segments: [], durationSec: 30, hookEndSec: 0, position: 'top' }), []);
  assert.deepEqual(planSplits({ segments: blocos, durationSec: 0, hookEndSec: 0, position: 'top' }), []);

  // --- 2. Reaplicar REPLANEJA, e a mídia viaja junto -----------------------
  // A primeira versão preservava as janelas existentes, e isso saiu pela
  // culatra em uso real: uma janela mal posicionada de uma versão anterior
  // sobreviveu a todo "Salvar e aplicar" seguinte, e as correções do plano
  // nunca chegaram ao projeto do aluno.
  const jaExistem = [
    { src: 'imagens/a.png', kind: 'image', start: 6, end: 11, position: 'top',
      transform: { x: 0.1, scale: 1.2 } },
    { src: '', kind: 'image', start: 20, end: 25, position: 'top' },
  ];
  const virado = applySplitPlan({
    edit: 'split2', splitMedia: 'video', previous: jaExistem, planned: janelas,
  });
  assert.equal(virado.length, 2, 'o corte manda no tempo: sai o plano, não o que estava lá');
  assert.deepEqual(virado.map((j) => [j.start, j.end]), [[4.6, 10.5], [10.5, 13.5]]);
  assert.ok(virado.every((j) => j.position === 'bottom'), 'trocar o tipo de edição vira a montagem inteira');
  // O arquivo viaja para a janela que cobre o lugar dele (6–11 cai dentro de
  // 4,6–10,5), com o enquadramento manual junto.
  assert.equal(virado[0].src, 'imagens/a.png', 'o trabalho do aluno não pode sumir no replanejamento');
  assert.equal(virado[0].kind, 'image', 'espaço com arquivo mantém o kind do arquivo');
  assert.deepEqual(virado[0].transform, { x: 0.1, scale: 1.2 }, 'o pan ajustado à mão viaja junto');
  assert.equal(virado[1].src, '', 'a segunda janela nasce vazia');
  assert.equal(virado[1].kind, 'video', 'espaço vazio segue a escolha do formulário');

  // O casamento é pelo MAIOR ENCAIXE GLOBAL, não janela por janela. Medido na
  // bancada: percorrendo em ordem, a primeira janela abocanhava a imagem com
  // 0,63s de sobreposição e deixava vazia a janela seguinte, onde a mesma
  // imagem encaixava por 2,87s.
  const disputa = applySplitPlan({
    edit: 'split',
    splitMedia: 'imagem',
    previous: [{ src: 'imagens/cena.png', start: 9.5, end: 13, position: 'top' }],
    planned: [
      { src: '', start: 5.33, end: 10.13, position: 'top' },
      { src: '', start: 10.13, end: 13.73, position: 'top' },
    ],
  });
  assert.deepEqual(
    disputa.map((j) => j.src),
    ['', 'imagens/cena.png'],
    'a mídia fica na janela onde ela mais aparecia',
  );

  // Cada arquivo é herdado UMA vez: duas mídias no mesmo lugar não podem
  // acabar na mesma janela e sumir uma.
  const duas = applySplitPlan({
    edit: 'split',
    splitMedia: 'imagem',
    previous: [
      { src: 'imagens/a.png', start: 5, end: 9, position: 'top' },
      { src: 'imagens/b.png', start: 11, end: 13, position: 'top' },
    ],
    planned: janelas,
  });
  assert.deepEqual(duas.map((j) => j.src), ['imagens/a.png', 'imagens/b.png']);

  // Mídia que não encontra janela nenhuma NÃO SOME — o corte mudou embaixo
  // dela, e apagar calado seria perder trabalho.
  const orfa = applySplitPlan({
    edit: 'split',
    splitMedia: 'imagem',
    previous: [{ src: 'imagens/orfa.png', start: 40, end: 44, position: 'top' }],
    planned: janelas,
    durationSec: 60,
  });
  assert.equal(orfa.length, 3, 'a órfã entra além das janelas do plano');
  assert.deepEqual(orfa.map((j) => j.start), [4.6, 10.5, 40], 'e na ordem do tempo');

  // Sem plano nenhum (segments.json ilegível), o que existe FICA: replanejar
  // para o vazio apagaria a edição inteira por causa de um arquivo quebrado.
  const semPlano = applySplitPlan({
    edit: 'split', splitMedia: 'nenhum', previous: jaExistem, planned: [],
  });
  assert.equal(semPlano.length, 2);
  assert.ok(!('kind' in semPlano[1]), 'espaço vazio sem origem de IA não guarda kind');
  assert.equal(semPlano[0].kind, 'image', 'o arquivo já apontado continua sendo imagem');

  // Projeto novo: entra o plano puro.
  const doZero = applySplitPlan({
    edit: 'split', splitMedia: 'imagem', previous: [], planned: janelas,
  });
  assert.equal(doZero.length, janelas.length);
  assert.ok(doZero.every((j) => j.src === '' && j.kind === 'image'));

  // Corte refeito e mais curto: nada pode ficar depois do fim do vídeo —
  // invisível no palco e com o chip estourando a timeline.
  const encurtado = applySplitPlan({
    edit: 'split', splitMedia: 'imagem', previous: jaExistem, planned: [], durationSec: 9,
  });
  assert.equal(encurtado.length, 1, 'a janela que começa depois do fim desaparece');
  assert.equal(encurtado[0].end, 9, 'a janela que atravessa o fim é aparada');
  assert.deepEqual(
    applySplitPlan({ edit: 'split', splitMedia: 'imagem', previous: jaExistem, planned: [], durationSec: 7 }),
    [],
    'sobrando menos que o bloco mínimo, não sobra janela',
  );

  // "Limpa" apaga as janelas: o template não olha o editType, então deixá-las
  // gravadas faria a prévia contradizer o formulário.
  assert.deepEqual(
    applySplitPlan({ edit: 'limpa', splitMedia: 'imagem', previous: jaExistem, planned: janelas }),
    [],
    'edição limpa é uma afirmação sobre o resultado',
  );

  // --- 2b. Modo INTEIRO: uma faixa de ponta a ponta -------------------------
  // Sem agente (e na origem "nenhum"), pré-picotar por corte impunha um ritmo
  // que ninguém pediu. A faixa sai única e o aluno recorta com a tesoura.
  const inteira = planSplits({
    segments: blocos, durationSec: 20, hookEndSec: 4, position: 'top', mode: 'inteiro',
  });
  assert.equal(inteira.length, 1, 'o modo inteiro entrega UMA faixa');
  assert.deepEqual([inteira[0].start, inteira[0].end], [0, 20], 'de ponta a ponta, headline inclusa');
  assert.ok(!('kind' in inteira[0]), 'sem kind: os botões do palco vêm das contas conectadas');

  // Reaplicar estilos com faixa única NÃO achata o trabalho: se o aluno já
  // recortou (ou preencheu), o que existe fica.
  const recortadaPelaTesoura = [
    { src: '', start: 0, end: 7, position: 'top' },
    { src: 'imagens/a.png', kind: 'image', start: 7, end: 14, position: 'top' },
    { src: '', start: 14, end: 20, position: 'top' },
  ];
  const reaplicada = applySplitPlan({
    edit: 'split', splitMedia: 'nenhum', previous: recortadaPelaTesoura, planned: inteira, durationSec: 20,
  });
  assert.equal(reaplicada.length, 3, 'os recortes da tesoura sobrevivem ao Salvar e aplicar');
  assert.equal(reaplicada[1].src, 'imagens/a.png');

  // --- 3. Flashes de transição ---------------------------------------------
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
