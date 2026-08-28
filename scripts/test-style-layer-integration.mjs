import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Git can materialize the checkout with CRLF on Windows. Normalize before
// locating the function body so this source-contract test behaves identically
// on Windows and Linux.
const source = readFileSync(path.join(root, 'src', 'main.ts'), 'utf8').replace(/\r\n?/gu, '\n');
const start = source.indexOf('async function writeEditData(');
const end = source.indexOf('\n}\n', start);
assert.ok(start >= 0 && end > start, 'writeEditData function body must be discoverable');
const body = source.slice(start, end + 3);

assert.match(source, /STYLE_LAYERS, mergeStyleLayers, type StyleLayer/u);
assert.match(body, /layers: readonly StyleLayer\[\] = STYLE_LAYERS/u);
assert.match(body, /mergeStyleLayers\(\{ previous, next: completeDocument, layers \}\)/u);
const soundtrack = body.indexOf('ensureSoundtrackFile');
const result = body.indexOf('return { splits: finalSplits.length');
assert.ok(soundtrack > 0 && result > soundtrack, 'soundtrack must execute before return');
assert.match(body, /finalSplits = Array\.isArray\(document\.splits\)/u);

const shared = readFileSync(path.join(root, 'src', 'shared.ts'), 'utf8').replace(/\r\n?/gu, '\n');
const preload = readFileSync(path.join(root, 'src', 'preload.ts'), 'utf8').replace(/\r\n?/gu, '\n');
const app = readFileSync(path.join(root, 'src', 'App.tsx'), 'utf8').replace(/\r\n?/gu, '\n');
assert.match(shared, /buildPhase2:[\s\S]{0,220}?layers\?: readonly StyleLayer\[\]/u, 'API renderer precisa aceitar camadas');
assert.match(preload, /buildPhase2: \(directory, style, layers\)[\s\S]{0,120}?\{ directory, style, layers \}/u, 'preload precisa propagar camadas');
assert.match(source, /async function buildPhase2\([\s\S]{0,220}?layers: readonly StyleLayer\[\] = STYLE_LAYERS/u, 'buildPhase2 preserva fallback de todas as camadas');
assert.match(source, /writeEditData\(publicDirectory, style,[\s\S]{0,220}?\}, layers\)/u, 'buildPhase2 precisa entregar camadas ao writeEditData');
assert.match(source, /requestedLayers[\s\S]{0,500}?STYLE_LAYERS[\s\S]{0,500}?buildPhase2\(requestedDirectory, input\.style, requestedLayers\)/u, 'IPC precisa validar e encaminhar camadas');
assert.match(app, /async function applyStyleSelection\(layer: StyleLayer\)[\s\S]{0,2200}?buildPhase2\(projectDirectory, escolhas, \[layer\]\)/u, 'renderer aplica somente a camada escolhida');
assert.match(app, /layer === 'efeitos' && escolhas\.elements\.musicAI/u, 'trilha so pode ser disparada pela camada de efeitos');
assert.match(app, /layer === 'edicao' && escolhas\.edit !== 'limpa'/u, 'texto e legenda nao podem acordar agente por causa do tipo de edicao');
assert.match(app, /onApply: \(layer: StyleLayer\) => void/u, 'workspace precisa expor aplicacao por camada');

console.log('test:style-layer-integration ok');
