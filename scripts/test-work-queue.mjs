import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = mkdtempSync(path.join(tmpdir(), 'editai-work-queue-'));

try {
  execFileSync(process.execPath, [
    path.join(projectRoot, 'node_modules', 'typescript', 'bin', 'tsc'),
    path.join(projectRoot, 'src', 'work-queue.ts'),
    '--target', 'es2022', '--module', 'es2022', '--moduleResolution', 'bundler',
    '--skipLibCheck', '--outDir', outDir,
  ], { stdio: 'inherit' });

  const { FilaDeTrabalho } = await import(pathToFileURL(path.join(outDir, 'work-queue.js')).href);
  const passo = () => new Promise((resolve) => setTimeout(resolve, 12));
  let simultaneos = 0;
  let pico = 0;
  const tarefa = async () => {
    simultaneos += 1;
    pico = Math.max(pico, simultaneos);
    await passo();
    simultaneos -= 1;
  };

  const fila = new FilaDeTrabalho(1);
  await Promise.all(Array.from({ length: 4 }, () => fila.adicionar(tarefa)));
  assert.equal(pico, 1);
  assert.equal(fila.emAndamento, 0);
  assert.equal(fila.aguardando, 0);

  const fila3 = new FilaDeTrabalho(3);
  simultaneos = 0;
  pico = 0;
  await Promise.all(Array.from({ length: 9 }, () => fila3.adicionar(tarefa)));
  assert.equal(pico, 3);

  // Corrida de microtask: a vaga precisa ser transferida diretamente para a
  // próxima tarefa. A implementação antiga decrementava o contador antes de
  // acordar quem esperava, permitindo que uma chegada nesse intervalo furasse
  // a largura 1.
  let vivos = 0;
  let picoVivo = 0;
  const portoes = [];
  const tarefaComPortao = () => {
    vivos += 1;
    picoVivo = Math.max(picoVivo, vivos);
    return new Promise((resolver) => {
      portoes.push(() => { vivos -= 1; resolver(); });
    });
  };

  const fresta = new FilaDeTrabalho(1);
  const emVoo = [fresta.adicionar(tarefaComPortao), fresta.adicionar(tarefaComPortao)];
  await Promise.resolve();
  assert.equal(vivos, 1, 'só a primeira pode ter começado');
  const abrirProximo = () => portoes.shift()?.();
  abrirProximo();
  emVoo.push(Promise.resolve().then(() => fresta.adicionar(tarefaComPortao)));
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(picoVivo, 1, 'chegada na fresta não pode furar a largura');
  for (let volta = 0; volta < 12 && (vivos > 0 || portoes.length); volta += 1) {
    while (portoes.length) abrirProximo();
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  await Promise.all(emVoo);
  assert.equal(fresta.emAndamento, 0);
  assert.equal(fresta.aguardando, 0);

  const ordem = [];
  const fifo = new FilaDeTrabalho(1);
  await Promise.all(['a', 'b', 'c', 'd'].map((nome) => fifo.adicionar(async () => {
    await passo();
    ordem.push(nome);
  })));
  assert.deepEqual(ordem, ['a', 'b', 'c', 'd']);

  const comErro = new FilaDeTrabalho(1);
  const resultados = await Promise.allSettled([
    comErro.adicionar(async () => { await passo(); return 'ok1'; }),
    comErro.adicionar(async () => { await passo(); throw new Error('fonte corrompida'); }),
    comErro.adicionar(async () => { await passo(); return 'ok2'; }),
  ]);
  assert.deepEqual(resultados.map((r) => r.status), ['fulfilled', 'rejected', 'fulfilled']);
  assert.equal(resultados[2].value, 'ok2');
  assert.equal(comErro.emAndamento, 0);

  assert.equal(await new FilaDeTrabalho(0).adicionar(async () => 'roda'), 'roda');
  console.log('test:work-queue ok — limite, corrida, FIFO e liberação após erro validados.');
} finally {
  rmSync(outDir, { recursive: true, force: true });
}
