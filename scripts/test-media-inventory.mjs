import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = mkdtempSync(path.join(tmpdir(), 'editai-media-inventory-build-'));
const projectDir = mkdtempSync(path.join(tmpdir(), 'editai-media-inventory-project-'));

try {
  execFileSync(process.execPath, [
    path.join(projectRoot, 'node_modules', 'typescript', 'bin', 'tsc'),
    path.join(projectRoot, 'src', 'media-inventory.ts'),
    '--target', 'es2022', '--module', 'es2022', '--moduleResolution', 'bundler',
    '--skipLibCheck', '--outDir', outDir,
  ], { stdio: 'inherit' });

  const {
    buildProjectMediaInventory,
    inventoryMediaKind,
    isInventoryInputPath,
    writeProjectMediaInventory,
  } = await import(pathToFileURL(path.join(outDir, 'media-inventory.js')).href);

  assert.equal(inventoryMediaKind('foto.WEBP'), 'image');
  assert.equal(inventoryMediaKind('cena.MOV'), 'video');
  assert.equal(inventoryMediaKind('nota.txt'), null);
  assert.equal(isInventoryInputPath('assets/foto.png'), true);
  assert.equal(isInventoryInputPath('edit/clipes/cena.mp4'), true);
  assert.equal(isInventoryInputPath('gravacoes/fonte.mp4'), false);

  mkdirSync(path.join(projectDir, 'assets'), { recursive: true });
  mkdirSync(path.join(projectDir, 'edit', 'clipes'), { recursive: true });
  mkdirSync(path.join(projectDir, 'edit', 'imagens'), { recursive: true });
  mkdirSync(path.join(projectDir, 'gravacoes'), { recursive: true });
  mkdirSync(path.join(projectDir, '.git'), { recursive: true });

  writeFileSync(path.join(projectDir, 'assets', 'produto.webp'), Buffer.alloc(17, 1));
  writeFileSync(path.join(projectDir, 'edit', 'clipes', 'cidade.mp4'), Buffer.alloc(23, 2));
  writeFileSync(path.join(projectDir, 'edit', 'imagens', 'preco.PNG'), Buffer.alloc(31, 3));
  writeFileSync(path.join(projectDir, 'gravacoes', 'fonte.mp4'), Buffer.alloc(41, 4));
  writeFileSync(path.join(projectDir, '.git', 'ignorar.png'), Buffer.alloc(11, 5));
  writeFileSync(path.join(projectDir, 'assets', 'nota.txt'), 'fora');

  const inventory = await buildProjectMediaInventory(projectDir);
  assert.deepEqual(inventory.items.map((item) => item.arquivo), [
    'assets/produto.webp',
    'edit/clipes/cidade.mp4',
    'edit/imagens/preco.PNG',
  ]);
  assert.deepEqual(inventory.items.map((item) => item.tipo), ['image', 'video', 'image']);
  assert.ok(inventory.items.every((item) => /^\d+:\d+$/u.test(item.fingerprint)));

  await writeProjectMediaInventory(projectDir);
  const persisted = JSON.parse(readFileSync(path.join(projectDir, 'edit', 'insumos.json'), 'utf8'));
  assert.equal(persisted.version, 1);
  assert.equal(persisted.items.length, 3);
  assert.ok(persisted.items.some((item) => item.arquivo === 'assets/produto.webp' && item.tipo === 'image'));
  assert.ok(!persisted.items.some((item) => item.arquivo.includes('gravacoes/fonte.mp4')));

  console.log('test:media-inventory ok — imagens e vídeos de insumo entram; fontes e arquivos alheios ficam fora.');
} finally {
  rmSync(outDir, { recursive: true, force: true });
  rmSync(projectDir, { recursive: true, force: true });
}
