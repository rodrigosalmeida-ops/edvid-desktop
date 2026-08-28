import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
assert.match(app, /useState<StyleLayer>\('efeitos'\)/u);
assert.match(app, /style-layer-tabs[\s\S]{0,1000}?STYLE_LAYER_LABEL\[layer\]/u);
assert.match(app, /onApply\(activeLayer\)/u);
assert.match(css, /\.style-layer-hidden\s*\{\s*display:\s*none/u);
console.log('style tabs parity: ok');
