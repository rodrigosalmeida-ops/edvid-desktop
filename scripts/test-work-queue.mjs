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
  console.log('test:work-queue ok — limite, FIFO e liberação após erro validados.');
} finally {
  rmSync(outDir, { recursive: true, force: true });
}
