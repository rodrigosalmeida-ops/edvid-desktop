import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildSync } from 'esbuild';
const root=process.cwd();
const template=readFileSync(path.join(root,'resources','remotion-template','src','Main.tsx'),'utf8');
assert.match(template,/fullscreen\?: boolean/u,'Insert exposes fullscreen flag');
assert.match(template,/const InsertFullscreen/u,'template has fullscreen renderer');
assert.match(template,/it\.fullscreen[\s\S]{0,240}?<InsertFullscreen/u,'inserts route fullscreen media to fullscreen renderer');
const temp=mkdtempSync(path.join(os.tmpdir(),'editai-broll-'));
try {
  const out=path.join(temp,'edit-data-edits.mjs');
  buildSync({entryPoints:[path.join(root,'src','edit-data-edits.ts')],bundle:true,platform:'node',format:'esm',outfile:out});
  const {normalizeGeneratedMedia}=await import(`${pathToFileURL(out).href}?v=${Date.now()}`);
  assert.equal(typeof normalizeGeneratedMedia,'function');
  const data={durationSec:90,inserts:[],animations:[{start:35.4,end:40.5,kind:'custom',src:'clipes/broll.mp4'}]};
  const fixed=normalizeGeneratedMedia(data);
  assert.deepEqual(fixed.moved,['clipes/broll.mp4']);
  assert.equal(fixed.data.animations.length,0);
  assert.equal(fixed.data.inserts[0].fullscreen,true);
  assert.equal(fixed.data.inserts[0].kind,'video');
} finally { rmSync(temp,{recursive:true,force:true}); }
console.log('test:fullscreen-broll ok');
