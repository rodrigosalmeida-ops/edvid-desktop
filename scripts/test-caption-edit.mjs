import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = mkdtempSync(path.join(tmpdir(), 'editai-legenda-'));

try {
  execFileSync(process.execPath, [
    path.join(projectRoot, 'node_modules', 'typescript', 'bin', 'tsc'),
    path.join(projectRoot, 'src', 'caption-edit.ts'),
    '--target', 'es2022', '--module', 'es2022', '--moduleResolution', 'bundler',
    '--skipLibCheck', '--outDir', outDir,
  ], { stdio: 'inherit' });

  const { textoEditavel, palavrasDoTexto, aplicarTexto, quantasMudaram } =
    await import(pathToFileURL(path.join(outDir, 'caption-edit.js')).href);

  const original = [
    { text: 'A', startMs: 77, endMs: 97, timestampMs: 87, confidence: null },
    { text: 'GoPro', startMs: 137, endMs: 397, timestampMs: 267, confidence: null },
    { text: 'finalmente', startMs: 437, endMs: 918, timestampMs: 677, confidence: null },
    { text: 'voltou', startMs: 958, endMs: 1300, timestampMs: 1129, confidence: null },
    { text: 'pro', startMs: 1340, endMs: 1500, timestampMs: 1420, confidence: null },
    { text: 'ils.', startMs: 1540, endMs: 1900, timestampMs: 1720, confidence: null },
    { text: 'Vamos', startMs: 2000, endMs: 2300, timestampMs: 2150, confidence: null },
    { text: 'ver.', startMs: 2340, endMs: 2700, timestampMs: 2520, confidence: null },
  ];

  const texto = textoEditavel(original);
  assert.equal(texto, 'A GoPro finalmente voltou pro ils.\nVamos ver.');
  assert.deepEqual(palavrasDoTexto('  A  GoPro\n finalmente '), ['A', 'GoPro', 'finalmente']);

  const corrigido = aplicarTexto(original, 'A GoPro finalmente voltou PRO ILS.\nVamos ver.');
  assert.equal(corrigido.length, original.length);
  assert.deepEqual(corrigido.map((p) => p.text), ['A', 'GoPro', 'finalmente', 'voltou', 'PRO', 'ILS.', 'Vamos', 'ver.']);
  for (let i = 0; i < original.length; i += 1) {
    assert.equal(corrigido[i].startMs, original[i].startMs);
    assert.equal(corrigido[i].endMs, original[i].endMs);
  }
  assert.equal(corrigido[0], original[0]);
  assert.equal(corrigido[7], original[7]);

  const comMais = aplicarTexto(original, 'A GoPro finalmente voltou pro jogo com ils. Vamos ver.');
  assert.equal(comMais[0].startMs, 77);
  assert.equal(comMais.at(-1).startMs, 2340);
  const trecho = comMais.slice(4, 8);
  assert.equal(trecho[0].startMs, 1340);
  assert.equal(trecho.at(-1).endMs, 1900);
  for (let i = 1; i < trecho.length; i += 1) {
    assert.ok(trecho[i].startMs >= trecho[i - 1].endMs - 1);
    assert.ok(trecho[i].endMs > trecho[i].startMs);
  }

  const comMenos = aplicarTexto(original, 'A GoPro voltou pro ils. Vamos ver.');
  assert.equal(comMenos[2].startMs, 958);
  assert.deepEqual(aplicarTexto(original, '   '), []);
  assert.deepEqual(aplicarTexto([], 'qualquer coisa'), []);

  const duasPontas = aplicarTexto(original, 'A GOPRO finalmente voltou pro ils. VAMOS ver.');
  for (const i of [0, 2, 3, 4, 5, 7]) assert.equal(duasPontas[i], original[i]);
  assert.equal(duasPontas[1].startMs, original[1].startMs);
  assert.equal(duasPontas[6].startMs, original[6].startMs);

  const duasInsercoes = aplicarTexto(original, 'Olha: A GoPro finalmente voltou pro ils. Vamos ver mesmo.');
  for (const palavra of ['finalmente', 'voltou', 'pro', 'ils.']) {
    const antes = original.find((p) => p.text === palavra);
    const depois = duasInsercoes.find((p) => p.text === palavra);
    assert.equal(depois, antes);
  }

  for (const lista of [duasPontas, duasInsercoes, comMais, comMenos]) {
    for (let i = 1; i < lista.length; i += 1) {
      assert.ok(Number(lista[i].startMs) >= Number(lista[i - 1].startMs));
    }
  }

  assert.equal(quantasMudaram(original, corrigido), 2);
  assert.equal(quantasMudaram(original, original), 0);
  console.log('test:caption-edit ok — EDIT AI preserva timing das palavras intactas e reajusta apenas o trecho alterado.');
} finally {
  rmSync(outDir, { recursive: true, force: true });
}
