// Teste das REGRAS DO PEDIDO DE MIDIA — o que o EDIT AI deriva para o agente não
// precisar escrever.
//
// O que estas regras compram, medido em uso real: oito clipes gerados e pagos
// que nunca entraram na edição porque o agente escreveu a colocação no array
// errado, e um clipe cujo prompt foi cru para o modelo. Cada campo derivado
// aqui é um campo que o agente não tem mais como errar.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = mkdtempSync(path.join(tmpdir(), 'editai-pedido-'));

try {
  execFileSync(process.execPath, [
    path.join(projectRoot, 'node_modules', 'typescript', 'bin', 'tsc'),
    path.join(projectRoot, 'src', 'media-request.ts'),
    path.join(projectRoot, 'src', 'image-format.ts'),
    '--target', 'es2022', '--module', 'es2022', '--moduleResolution', 'bundler',
    '--skipLibCheck', '--outDir', outDir,
  ], { stdio: 'inherit' });
  const emitido = path.join(outDir, 'media-request.js');
  writeFileSync(emitido, readFileSync(emitido, 'utf8').replace("'./image-format'", "'./image-format.js'"));
  const { arquivoDoPrompt, colocacaoPara, parseMediaRequests } = await import(pathToFileURL(emitido).href);

  // --- 1. O CONTRATO DE TRÊS CAMPOS -----------------------------------------
  const [pedido] = parseMediaRequests(
    [{ prompt: 'Overwhelmed creator at a messy desk', inicio: 35.4, fim: 40.5 }], 'video',
  );
  assert.ok(pedido, 'prompt + início + fim é pedido válido');
  assert.equal(pedido.segundos, 5.1, 'a duração sai da janela, não do agente');
  assert.deepEqual(pedido.janela, { inicio: 35.4, fim: 40.5 });
  assert.equal(pedido.arquivo, 'overwhelmed-creator-at-a-messy-desk.mp4', 'o nome sai do prompt');

  // Nome derivado é ESTÁVEL: pedir o mesmo clipe duas vezes acha o arquivo no
  // disco e não gasta crédito de novo.
  const [denovo] = parseMediaRequests(
    [{ prompt: 'Overwhelmed creator at a messy desk', inicio: 10, fim: 14 }], 'video',
  );
  assert.equal(denovo.arquivo, pedido.arquivo, 'mesmo prompt, mesmo nome');

  // --- 2. O QUE O AGENTE AINDA PODE MANDAR ----------------------------------
  // Pedido antigo (arquivo + segundos, sem janela) continua funcionando: é o
  // caminho em que a colocação ainda é do agente.
  const [antigo] = parseMediaRequests(
    [{ arquivo: 'broll.mp4', prompt: 'x', uso: 'tela-dividida', segundos: 7 }], 'video',
  );
  assert.equal(antigo.arquivo, 'broll.mp4', 'nome declarado tem precedência');
  assert.equal(antigo.segundos, 7);
  assert.equal(antigo.janela, null, 'sem janela, o EDIT AI não coloca sozinho');
  assert.equal(antigo.uso, 'tela-dividida');
  // "proporcao" era o nome antigo de "uso".
  assert.equal(parseMediaRequests([{ prompt: 'x', proporcao: '16:9' }], 'imagem')[0].uso, 'paisagem');
  // start/end valem tanto quanto inicio/fim: o edit-data fala em inglês.
  assert.deepEqual(
    parseMediaRequests([{ prompt: 'x', start: 2, end: 6 }], 'imagem')[0].janela,
    { inicio: 2, fim: 6 },
  );

  // --- 3. O QUE NÃO VIRA PEDIDO ---------------------------------------------
  assert.equal(parseMediaRequests([{ inicio: 1, fim: 5 }], 'video').length, 0, 'sem prompt não há pedido');
  assert.equal(
    parseMediaRequests([{ prompt: 'x', inicio: 5, fim: 5.2 }], 'video')[0].janela, null,
    'janela curta demais é engano de digitação, não pedido',
  );
  assert.equal(parseMediaRequests('nada', 'video').length, 0);
  // Nada de sair da pasta pelo nome do arquivo.
  assert.equal(
    parseMediaRequests([{ prompt: 'x', arquivo: '../../etc/passwd' }], 'imagem')[0].arquivo,
    'passwd.png',
  );
  // Extensão sempre coerente com o tipo.
  assert.equal(parseMediaRequests([{ prompt: 'x', arquivo: 'cena' }], 'video')[0].arquivo, 'cena.mp4');
  assert.equal(arquivoDoPrompt('Ação à noite: câmera lenta', 'imagem'), 'acao-a-noite-camera-lenta.png');

  // --- 4. ONDE A MÍDIA ENTRA ------------------------------------------------
  // O padrão é TELA CHEIA: com janela vinda de uma marcação, o pedido é
  // "cobre este trecho". Foi a vaga que faltava e que fez o agente inventar
  // um campo em animations.
  const cheia = colocacaoPara(pedido, 'clipes', []);
  assert.equal(cheia.tipo, 'insert');
  assert.equal(cheia.fullscreen, true);
  assert.equal(cheia.src, 'clipes/overwhelmed-creator-at-a-messy-desk.mp4');
  assert.equal(cheia.kind, 'video');
  assert.equal(cheia.start, 35.4);

  // Pedido de FAIXA encaixa no split daquele tempo.
  const [faixa] = parseMediaRequests(
    [{ prompt: 'y', inicio: 12, fim: 14, uso: 'tela-dividida' }], 'imagem',
  );
  const splits = [{ start: 4, end: 9 }, { start: 11.5, end: 15 }];
  const naFaixa = colocacaoPara(faixa, 'imagens', splits);
  assert.equal(naFaixa.tipo, 'faixa');
  assert.equal(naFaixa.index, 1, 'o split que cobre a janela');
  assert.equal(naFaixa.kind, 'image');
  // Faixa pedida SEM split naquele tempo vira cartão, nunca tela cheia: mídia
  // enquadrada para faixa esticada no quadro inteiro sai deformada.
  const semSplit = colocacaoPara(faixa, 'imagens', [{ start: 40, end: 44 }]);
  assert.equal(semSplit.tipo, 'insert');
  assert.equal(semSplit.fullscreen, false);

  // Sem janela não há colocação — a decisão volta para o agente.
  assert.equal(colocacaoPara(antigo, 'clipes', splits), null);

  console.log('test:media-request ok — o agente escreve prompt e janela; nome, duração, uso e colocação são do EDIT AI.');
} finally {
  rmSync(outDir, { recursive: true, force: true });
}
