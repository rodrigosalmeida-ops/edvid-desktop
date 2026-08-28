import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const app=readFileSync('src/App.tsx','utf8');
const main=readFileSync('src/main.ts','utf8');
const preload=readFileSync('src/preload.ts','utf8');
const shared=readFileSync('src/shared.ts','utf8');

// 0.47: Aplicar não pode montar o lote a partir de uma fotografia velha das
// marcações. Primeiro espera as escritas de prompt em voo, depois relê a ref
// viva e só então separa as marcações prontas entre mídia e correções.
assert.match(app,/Promise\.allSettled\(emVoo\)/u);
assert.match(app,/correctionsRef\.current/u);
assert.match(app,/const prontas = atuais\.filter\(\(item\) => !item\.escrevendo\)/u);
assert.match(app,/prontas\.filter\(ehMarcacaoDeMidia\)/u);
assert.match(app,/applyMarkedMedia\(/u);
assert.match(main,/type MarcacaoDeMidia =/u);
assert.match(main,/async function abrirTelaDividida\(/u);
assert.match(main,/async function applyMarkedMedia\(/u);
const body=main.slice(main.indexOf('async function applyMarkedMedia('),main.indexOf('// O aluno DESCREVE a faixa',main.indexOf('async function applyMarkedMedia(')));
assert.ok(body.indexOf('writeFile(requestsFile') < body.indexOf('fulfillVideoRequests'), 'fila deve ser escrita antes do fulfill');
assert.match(body,/erros\[index\]/u);
assert.match(main,/preview:apply-marked-media/u);
assert.match(preload,/applyMarkedMedia/u);
assert.match(shared,/applyMarkedMedia/u);
assert.doesNotMatch(app,/generateAtMark\(/u);
console.log('test:marked-media-batch ok — espera prompts em voo, relê marcações vivas, enfileira antes do fulfill e preserva falhas parciais.');
