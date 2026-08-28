import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../src/project-import-name.ts', import.meta.url), 'utf8');
const executable = source
  .replace(/export function /gu, 'function ')
  .concat('\n;globalThis.__helpers = { cleanProjectName, safeDirectoryPart };');

const context = vm.createContext({});
new vm.Script(executable, { filename: 'project-import-name.ts' }).runInContext(context);
const { cleanProjectName, safeDirectoryPart } = context.__helpers;

assert.equal(cleanProjectName('  Meu: vídeo?  '), 'Meu vídeo');
assert.equal(cleanProjectName('A/B\\C'), 'A B C');
assert.equal(safeDirectoryPart('Vídeo de férias.'), 'Video de ferias');
assert.equal(safeDirectoryPart('CON'), 'video');
assert.equal(safeDirectoryPart('prn.txt'), 'video');
assert.equal(safeDirectoryPart('COM1'), 'video');
assert.equal(safeDirectoryPart('lpt9.log'), 'video');
assert.equal(safeDirectoryPart('COM10'), 'COM10');
assert.equal(safeDirectoryPart('projeto normal'), 'projeto normal');
assert.equal(safeDirectoryPart('...   '), 'video');

console.log('project import names: ok');
