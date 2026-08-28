import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const main = readFileSync('src/main.ts', 'utf8');
const shared = readFileSync('src/shared.ts', 'utf8');

assert.match(main, /from '.\/media-request'/u, 'main wires the pure media request contract');
assert.match(main, /parseMediaRequests\([\s\S]{0,220}?'video'/u, 'video queue accepts prompt + timeline window');
assert.match(main, /parseMediaRequests\([\s\S]{0,220}?'imagem'/u, 'image queue accepts prompt + timeline window');
assert.match(main, /async function placeGeneratedMedia\(/u, 'main owns one generated-media placement writer');
assert.match(main, /request\.janela[\s\S]{0,200}?placeGeneratedMedia\(projectDirectory, request, 'clipes'\)/u, 'video requests with windows are placed automatically');
assert.match(main, /request\.janela[\s\S]{0,200}?placeGeneratedMedia\(projectDirectory, request, 'imagens'\)/u, 'image requests with windows are placed automatically');
assert.match(main, /placement\.fullscreen[\s\S]{0,100}?fullscreen: true/u, 'full-frame placement survives into edit-data');
assert.match(main, /type: 'workspace-refresh'/u, 'automatic placement refreshes live workspace');
assert.match(shared, /placed\?: number/u, 'generation state exposes placement count');
assert.match(shared, /kind\?: 'imagem' \| 'video'/u, 'generation state identifies image versus video');

console.log('test:auto-media-placement ok');
