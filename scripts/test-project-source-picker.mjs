import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const picker = await readFile(new URL('../src/project-source-picker.ts', import.meta.url), 'utf8');
const mainConfig = await readFile(new URL('../vite.main.config.ts', import.meta.url), 'utf8');
const preloadConfig = await readFile(new URL('../vite.preload.config.ts', import.meta.url), 'utf8');

for (const extension of ['mp4', 'm4v', 'mov', 'webm', 'mkv']) {
  assert.match(picker, new RegExp(`['\"]\\.?${extension}['\"]`, 'u'), `faltou suporte a ${extension}`);
}

assert.match(picker, /buttons:\s*\['Abrir vídeo', 'Abrir pasta', 'Cancelar'\]/u);
assert.match(picker, /copyFile\(sourceFile,/u, 'vídeo escolhido precisa ser copiado, não movido');
assert.match(picker, /imported-projects/u, 'importação direta precisa de projeto gerenciado');
assert.match(picker, /projects\.json/u, 'projeto importado precisa entrar nos recentes');
assert.match(picker, /ipcMain\.handle\('project:pick-source'/u, 'handler de seleção direta não registrado');

assert.match(mainConfig, /import '\.\/project-source-picker';/u, 'main precisa registrar o picker no build');
assert.match(preloadConfig, /project:pick-source/u, 'preload precisa chamar o picker');
assert.match(preloadConfig, /project:open-recent/u, 'preload precisa abrir o projeto gerenciado pelo fluxo normal');
assert.match(preloadConfig, /if \(!selected\?\.directory\) return null;/u, 'cancelamento precisa continuar seguro');

console.log('project source picker: ok');
