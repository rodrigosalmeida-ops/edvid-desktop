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
console.log('test:style-layer-integration ok');
